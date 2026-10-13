import { defaultConfig } from "./seed";
import { getAdapter, mockAdapter } from "./provider";
import {
  can,
  roleNames,
  type Asset,
  type Character,
  type CharacterVersion,
  type Database,
  type GenerationConfig,
  type GenerationTask,
  type Role,
  type TaskStatus,
} from "./types";

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const iso = (now = Date.now()) => new Date(now).toISOString();
const clone = (db: Database): Database => structuredClone(db);
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function audit(
  db: Database,
  role: string,
  action: string,
  targetType: string,
  targetId: string,
  before = "",
  after = "",
  now = Date.now(),
) {
  db.audit.unshift({
    id: uid("audit"),
    actorId: role,
    action,
    targetType,
    targetId,
    before,
    after,
    createdAt: iso(now),
  });
}
export function versionOf(
  db: Database,
  character: Character,
): CharacterVersion {
  return db.versions.find((v) => v.id === character.currentVersionId)!;
}
export function visibleCharacters(db: Database, role: Role) {
  return db.characters.filter((c) => c.visibleTo.includes(role));
}
export function visibleTasks(db: Database, role: Role) {
  return db.tasks.filter((t) => role !== "creator" || t.createdBy === role);
}
export function completeness(version: CharacterVersion) {
  const all = [
    "image",
    "video",
    "audio",
    "voice",
    "action",
    "expression",
    "script",
    "license",
  ];
  return Math.round(
    (all.filter((type) => version.assets.some((a) => a.type === type)).length /
      all.length) *
      100,
  );
}
export function characterIssues(
  character: Character,
  version: CharacterVersion,
  scope = "social",
  now = Date.now(),
): string[] {
  const reasons: string[] = [];
  if (character.status === "disabled") reasons.push("人物已停用");
  if (character.status === "draft") reasons.push("人物仍为草稿");
  if (version.licenseStatus !== "valid")
    reasons.push(
      version.licenseStatus === "expired"
        ? "人物授权已过期"
        : "人物授权尚未确认",
    );
  if (!version.validUntil) reasons.push("缺少授权有效期");
  else if (
    !/^\d{4}-\d{2}-\d{2}$/.test(version.validUntil) ||
    !Number.isFinite(new Date(`${version.validUntil}T23:59:59+08:00`).getTime())
  )
    reasons.push("授权有效期格式无效");
  else if (new Date(`${version.validUntil}T23:59:59+08:00`).getTime() < now)
    reasons.push("授权有效期已结束");
  if (!version.scope.includes(scope as never))
    reasons.push("授权未覆盖所选使用范围");
  const required = ["image", "video", "audio", "voice", "license"];
  const labels: Record<string, string> = {
    image: "形象照片",
    video: "基础视频",
    audio: "音频样本",
    voice: "声线",
    license: "授权文件",
  };
  for (const type of required)
    if (
      !version.assets.some(
        (a) => a.type === type && a.licenseStatus === "valid",
      )
    )
      reasons.push(`缺少有效${labels[type]}`);
  return reasons;
}
export function displayCharacterStatus(c: Character, v: CharacterVersion) {
  if (["draft", "disabled"].includes(c.status)) return c.status;
  if (
    v.licenseStatus === "expired" ||
    (v.validUntil &&
      new Date(`${v.validUntil}T23:59:59+08:00`).getTime() < Date.now())
  )
    return "expired" as const;
  return characterIssues(c, v).length
    ? ("incomplete" as const)
    : ("available" as const);
}
export function configIssues(
  db: Database,
  config: GenerationConfig,
  role: Role,
): string[] {
  const issues: string[] = [];
  if (!can(role, "create"))
    issues.push("当前角色不能提交生成任务，请切换内容创作者或系统管理员");
  const character = db.characters.find((c) => c.id === config.characterId);
  if (!character || !character.visibleTo.includes(role))
    issues.push("请选择权限范围内的人物");
  else
    issues.push(
      ...characterIssues(character, versionOf(db, character), config.scope),
    );
  if (!config.script.trim()) issues.push("请填写视频脚本");
  if (!config.product.trim()) issues.push("请填写商品或内容主题");
  if (!config.scene.trim() || !config.emotion.trim() || !config.action.trim())
    issues.push("请补全场景、情绪和动作");
  if (!config.voice.trim() || !config.language.trim())
    issues.push("请补全声线和语言");
  if (
    !Number.isFinite(config.duration) ||
    config.duration < 5 ||
    config.duration > 120
  )
    issues.push("演示时长支持 5–120 秒");
  const provider = db.providers.find((p) => p.id === config.providerId);
  if (!provider) issues.push("请选择模型渠道");
  else {
    try {
      getAdapter(provider);
    } catch (e) {
      issues.push((e as Error).message);
    }
  }
  return issues;
}
const transitions: Record<TaskStatus, TaskStatus[]> = {
  draft: ["confirming", "cancelled"],
  confirming: ["queued", "cancelled"],
  queued: ["generating", "cancelled"],
  generating: ["review", "failed"],
  review: ["completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};
export function transition(
  task: GenerationTask,
  status: TaskStatus,
  actor: string,
  reason: string,
  now = Date.now(),
) {
  ensure(
    transitions[task.status].includes(status),
    `不能从 ${task.status} 变更为 ${status}`,
  );
  task.status = status;
  task.events.push({ status, at: iso(now), actor, reason });
}
export function parsePrompt(db: Database, prompt: string, role: Role) {
  ensure(prompt.trim().length >= 4, "请写下至少 4 个字的内容需求。");
  const available = visibleCharacters(db, role);
  const matched = available.find(
    (c) =>
      prompt.toLowerCase().includes(c.name.toLowerCase()) ||
      prompt.includes(c.subtitle),
  );
  const recommended =
    matched ||
    available.find(
      (c) => displayCharacterStatus(c, versionOf(db, c)) === "available",
    ) ||
    available[0];
  const notes: string[] = [];
  if (!matched) notes.push("需求未明确人物身份，已推荐可用人物；请人工确认。");
  const duration = prompt.match(/(\d+)\s*秒/);
  if (!duration) notes.push("未明确时长，暂建议 30 秒，可修改。");
  const ratio = /横屏|16[:：]9/.test(prompt)
    ? "16:9"
    : /方形|1[:：]1/.test(prompt)
      ? "1:1"
      : "9:16";
  if (!/竖屏|横屏|方形|\d[:：]\d/.test(prompt))
    notes.push("未明确画幅，暂建议竖屏，可修改。");
  const product = /帽/.test(prompt)
    ? "秋季羊毛帽"
    : /围巾/.test(prompt)
      ? "秋季羊毛围巾"
      : /服饰|穿搭/.test(prompt)
        ? "秋季服饰系列"
        : "";
  if (!product) notes.push("未识别商品或主题，请补充商品字段。");
  const purpose = /剧情|独角戏/.test(prompt)
    ? "剧情独角戏"
    : /独白|生活方式/.test(prompt)
      ? "生活方式独白"
      : /种草/.test(prompt)
        ? "种草短片"
        : "商品试戴";
  const config: GenerationConfig = {
    ...defaultConfig,
    characterId: recommended?.id || "",
    duration: duration ? Number(duration[1]) : 30,
    ratio,
    product,
    purpose,
    emotion: /活泼|轻快/.test(prompt)
      ? "轻快自然"
      : /温柔|克制/.test(prompt)
        ? "温柔克制"
        : "自然从容",
    scene: /街|城市/.test(prompt)
      ? "城市街角 · 秋日午后"
      : /户外|公园/.test(prompt)
        ? "秋日公园 · 林间步道"
        : defaultConfig.scene,
    action: /试戴|帽/.test(prompt)
      ? "轻触帽檐 · 侧身展示"
      : "自然独白 · 轻微手势",
    script: product
      ? `秋天，总让人想慢下来。\n${product}，是给日常的一点温柔。\n让质感陪伴每一次出发，把喜欢的样子留给自己。`
      : "",
    voice: recommended ? `${recommended.subtitle} · 温柔女声` : "",
  };
  return {
    config,
    notes,
    reason: matched
      ? `需求提到「${matched.subtitle}」，与人物标签和内容用途匹配。`
      : "优先推荐权限范围内素材齐全、授权有效的人物。",
    character: recommended,
  };
}
export function createDraft(
  db: Database,
  role: Role,
  prompt: string,
  config: GenerationConfig,
  title?: string,
): [Database, string] {
  ensure(can(role, "create"), "当前角色不能创建任务。");
  const next = clone(db),
    requestId = uid("request"),
    id = uid("TASK"),
    now = Date.now();
  const character = next.characters.find(
    (c) => c.id === config.characterId && c.visibleTo.includes(role),
  );
  ensure(character, "请选择可查看的人物。");
  const v = versionOf(next, character);
  next.requests.push({
    id: requestId,
    rawPrompt: prompt,
    parsedRequirement: structuredClone(config),
    createdBy: role,
    createdAt: iso(now),
  });
  next.tasks.unshift({
    id,
    title:
      title || `${config.product || "品牌内容"} · ${config.duration} 秒短片`,
    requestId,
    createdBy: role,
    createdAt: iso(now),
    characterVersionId: v.id,
    config: structuredClone(config),
    assetSnapshot: structuredClone(v.assets),
    providerSnapshot:
      next.providers.find((p) => p.id === config.providerId)?.name || "",
    status: "draft",
    estimatedCost:
      next.providers.find((p) => p.id === config.providerId)?.rate != null
        ? next.providers.find((p) => p.id === config.providerId)!.rate! *
          config.duration
        : null,
    events: [
      {
        status: "draft",
        at: iso(now),
        actor: roleNames[role],
        reason: "保存可编辑生成草稿",
      },
    ],
  });
  audit(next, roleNames[role], "创建任务草稿", "task", id, "", "draft");
  return [next, id];
}
export function submitTask(db: Database, role: Role, id: string): Database {
  const next = clone(db),
    task = next.tasks.find((t) => t.id === id);
  ensure(
    task && (role === "admin" || task.createdBy === role),
    "没有权限操作此任务。",
  );
  const issues = configIssues(next, task.config, role);
  ensure(!issues.length, issues.join("；"));
  ensure(task.status === "draft", "只能提交草稿，历史记录不可覆盖。");
  const character = next.characters.find(
    (c) => c.id === task.config.characterId,
  )!;
  const v = versionOf(next, character);
  task.characterVersionId = v.id;
  task.assetSnapshot = structuredClone(v.assets);
  const provider = next.providers.find((p) => p.id === task.config.providerId)!;
  task.providerSnapshot = provider.name;
  task.estimatedCost =
    provider.rate === null ? null : provider.rate * task.config.duration;
  transition(
    task,
    "confirming",
    roleNames[role],
    "人工确认当前人物版本、素材、授权和 Mock 估算",
  );
  Object.assign(task, getAdapter(provider).generate(task.config, Date.now()));
  transition(task, "queued", roleNames[role], "已提交至 Mock Provider");
  audit(next, roleNames[role], "提交模拟生成", "task", id, "draft", "queued");
  return next;
}
export function updateDraft(
  db: Database,
  role: Role,
  id: string,
  prompt: string,
  config: GenerationConfig,
): Database {
  ensure(can(role, "create"), "当前角色不能编辑任务。");
  const next = clone(db),
    task = next.tasks.find((t) => t.id === id);
  ensure(
    task &&
      task.status === "draft" &&
      (role === "admin" || task.createdBy === role),
    "只能编辑本人草稿。",
  );
  task.config = structuredClone(config);
  task.title = `${config.product || "品牌内容"} · ${config.duration} 秒短片`;
  const request = next.requests.find((r) => r.id === task.requestId)!;
  request.rawPrompt = prompt;
  request.parsedRequirement = structuredClone(config);
  audit(next, roleNames[role], "编辑任务草稿", "task", id, "draft", "draft");
  return next;
}
export function tickTasks(db: Database, now = Date.now()): Database {
  if (!db.tasks.some((t) => ["queued", "generating"].includes(t.status)))
    return db;
  const next = clone(db);
  let changed = false;
  for (const task of next.tasks) {
    if (
      !["queued", "generating"].includes(task.status) ||
      task.startedAt === undefined
    )
      continue;
    const polled = mockAdapter.getTask(
      task.externalId || "",
      task.startedAt,
      task.config,
      now,
    );
    if (polled.status === "queued") continue;
    if (task.status === "queued") {
      transition(task, "generating", "Persona Mock", "开始模拟生成", now);
      changed = true;
      audit(
        next,
        "Persona Mock",
        "任务状态变更",
        "task",
        task.id,
        "queued",
        "generating",
        now,
      );
    }
    if (polled.status === "failed") {
      transition(task, "failed", "Persona Mock", polled.reason!, now);
      task.failureReason = polled.reason;
      changed = true;
      audit(
        next,
        "Persona Mock",
        "模拟生成失败",
        "task",
        task.id,
        "generating",
        "failed",
        now,
      );
    } else if (polled.status === "succeeded") {
      transition(task, "review", "Persona Mock", "模拟完成，等待人工审核", now);
      changed = true;
      next.results.unshift({
        id: uid("result"),
        taskId: task.id,
        title: task.title,
        duration: task.config.duration,
        resolution:
          task.config.ratio === "9:16"
            ? "1080 × 1920"
            : task.config.ratio === "16:9"
              ? "1920 × 1080"
              : "1080 × 1080",
        genre: task.config.purpose || "商品试戴",
        tags: [task.config.product, task.config.emotion],
        version: next.results.filter((r) => r.title === task.title).length + 1,
        reviewStatus: "pending",
        createdAt: iso(now),
      });
      audit(
        next,
        "Persona Mock",
        "生成结果待审核",
        "task",
        task.id,
        "generating",
        "review",
        now,
      );
      if (!next.requireReview) {
        transition(
          task,
          "completed",
          "系统规则",
          "单级审核已关闭，自动归档 Mock 占位结果",
          now,
        );
        next.results[0].reviewStatus = "approved";
        audit(
          next,
          "系统规则",
          "自动归档",
          "task",
          task.id,
          "review",
          "completed",
          now,
        );
      }
    }
  }
  return changed ? next : db;
}
export function reviewResult(
  db: Database,
  role: Role,
  resultId: string,
  approved: boolean,
  comment: string,
): Database {
  ensure(can(role, "review"), "当前角色没有审核权限。");
  ensure(comment.trim(), "请填写审核意见。");
  const next = clone(db),
    result = next.results.find((r) => r.id === resultId);
  ensure(result && result.reviewStatus === "pending", "该结果已审核或不存在。");
  const task = next.tasks.find((t) => t.id === result.taskId)!;
  transition(task, approved ? "completed" : "failed", roleNames[role], comment);
  result.reviewStatus = approved ? "approved" : "rejected";
  if (!approved) task.failureReason = `审核退回：${comment}`;
  next.reviews.unshift({
    id: uid("review"),
    resultId,
    reviewerId: role,
    decision: result.reviewStatus,
    comment: comment.trim(),
    createdAt: iso(),
  });
  audit(
    next,
    roleNames[role],
    approved ? "审核通过并归档" : "审核驳回",
    "result",
    resultId,
    "pending",
    result.reviewStatus,
  );
  return next;
}
export function cancelTask(db: Database, role: Role, id: string): Database {
  const next = clone(db),
    task = next.tasks.find((t) => t.id === id);
  ensure(
    task &&
      can(role, "create") &&
      (role === "admin" || task.createdBy === role),
    "没有权限取消此任务。",
  );
  ensure(
    ["draft", "confirming", "queued"].includes(task.status),
    "任务已经开始，无法取消。",
  );
  if (task.externalId) mockAdapter.cancelTask(task.externalId);
  const before = task.status;
  transition(task, "cancelled", roleNames[role], "用户取消尚未开始的任务");
  audit(next, roleNames[role], "取消任务", "task", id, before, "cancelled");
  return next;
}
export function saveCharacter(
  db: Database,
  role: Role,
  input: Omit<Character, "id" | "currentVersionId">,
  license: {
    licenseStatus: CharacterVersion["licenseStatus"];
    validUntil: string;
  },
  id?: string,
  assets?: Asset[],
): Database {
  ensure(can(role, "manage"), "当前角色不能维护人物资产。");
  ensure(input.name.trim() && input.ownerId.trim(), "请填写人物名称和负责人。");
  const next = clone(db),
    existing = next.characters.find((c) => c.id === id),
    characterId = existing?.id || uid("character");
  const previous = existing ? versionOf(next, existing) : undefined;
  const version: CharacterVersion = {
    id: uid("version"),
    characterId,
    name: input.name,
    profile: input.profile,
    version: (previous?.version || 0) + 1,
    changeNote: existing ? "更新人物信息、授权或素材" : "创建人物档案",
    createdBy: roleNames[role],
    createdAt: iso(),
    assets: structuredClone(assets || previous?.assets || []),
    ...license,
    scope: [...input.scope],
  };
  const character = { ...input, id: characterId, currentVersionId: version.id };
  if (character.status === "available")
    ensure(
      !characterIssues(character, version).length,
      "缺少关键素材或有效授权，不能标记为可用。",
    );
  if (existing) next.characters[next.characters.indexOf(existing)] = character;
  else next.characters.unshift(character);
  next.versions.unshift(version);
  audit(
    next,
    roleNames[role],
    existing ? "更新人物与授权版本" : "新增人物",
    "character",
    characterId,
    previous
      ? `v${previous.version} · ${previous.scope.join(",")} · ${previous.licenseStatus}`
      : "",
    `v${version.version} · ${version.scope.join(",")} · ${version.licenseStatus} · ${character.status}`,
  );
  return next;
}
export function updateAssets(
  db: Database,
  role: Role,
  id: string,
  assets: Asset[],
) {
  const c = db.characters.find((x) => x.id === id);
  ensure(c, "人物不存在。");
  const v = versionOf(db, c);
  const input = {
    ...c,
    status: c.status === "available" ? ("incomplete" as const) : c.status,
  };
  const next = saveCharacter(
    db,
    role,
    input,
    { licenseStatus: v.licenseStatus, validUntil: v.validUntil },
    id,
    assets,
  );
  const updated = next.characters.find((x) => x.id === id)!;
  if (
    !characterIssues(updated, versionOf(next, updated)).length &&
    updated.status === "incomplete"
  )
    updated.status = "available";
  audit(
    next,
    roleNames[role],
    assets.length < v.assets.length ? "删除素材引用" : "登记素材元数据",
    "character",
    id,
    `${v.assets.length} 份素材`,
    `${assets.length} 份素材`,
  );
  return next;
}
export function toggleCharacter(db: Database, role: Role, id: string) {
  const c = db.characters.find((x) => x.id === id);
  ensure(c, "人物不存在。");
  const v = versionOf(db, c);
  const status =
    c.status === "disabled"
      ? characterIssues({ ...c, status: "incomplete" }, v).length
        ? "incomplete"
        : "available"
      : "disabled";
  return saveCharacter(
    db,
    role,
    { ...c, status },
    { licenseStatus: v.licenseStatus, validUntil: v.validUntil },
    id,
  );
}
export function configureProvider(db: Database, role: Role, id: string) {
  ensure(can(role, "settings"), "只有系统管理员可以修改模型配置。");
  const next = clone(db),
    provider = next.providers.find((p) => p.id === id);
  ensure(provider, "模型不存在。");
  const before = provider.enabled;
  provider.enabled = !provider.enabled;
  audit(
    next,
    roleNames[role],
    "修改模型配置",
    "provider",
    id,
    `enabled=${before}`,
    `enabled=${provider.enabled}`,
  );
  return next;
}
