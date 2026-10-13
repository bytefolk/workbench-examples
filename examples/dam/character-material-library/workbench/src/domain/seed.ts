import type {
  Asset,
  AssetType,
  Database,
  GenerationConfig,
  TaskStatus,
} from "./types";
import { xiaoyunqueProvider } from "./catalog";
export const demoPrompt =
  "用品牌主理人生成 30 秒秋季帽子试戴短片，温柔克制，竖屏";
export const defaultConfig: GenerationConfig = {
  characterId: "founder",
  providerId: "mock",
  script:
    "秋天的第一顶帽子，不必太用力。\n柔软的羊毛，刚刚好的帽檐，陪你走过城市，也走进自己的节奏。\n把喜欢的样子，戴进日常。",
  scene: "秋日暖光 · 品牌工作室",
  emotion: "温柔克制",
  action: "轻触帽檐 · 侧身展示",
  product: "秋季羊毛帽",
  purpose: "商品试戴",
  duration: 30,
  ratio: "9:16",
  language: "普通话",
  voice: "主理人 · 温柔女声",
  scope: "social",
  outcome: "success",
};
const types: AssetType[] = [
  "image",
  "video",
  "audio",
  "voice",
  "action",
  "expression",
  "script",
  "license",
];
const names = [
  "形象照片 · 正面与侧面",
  "基础视频 · 自然光半身",
  "音频样本 · 日常独白",
  "声线 · 温柔女声",
  "动作样本 · 轻触帽檐",
  "表情样本 · 自然微笑",
  "品牌故事 · 脚本",
  "形象与声音授权 · 示例",
];
function assets(id: string, partial = false, expired = false): Asset[] {
  return types
    .filter((t) => !partial || !["voice", "license", "expression"].includes(t))
    .map((type, i) => ({
      id: `${id}-asset-${type}`,
      type,
      name: names[types.indexOf(type)],
      source: "Demo 原创示例 · 仅元数据",
      version: "1.0",
      licenseStatus: expired ? "expired" : "valid",
      createdBy: "资产管理员（演示）",
      createdAt: `2026-10-0${i + 1}T03:20:00.000Z`,
      note: "示意资料，未上传客户真人素材；照片以 AI 原创图演示。",
    }));
}
export function createSeed(now = Date.now()): Database {
  const data: Database = {
    schemaVersion: 1,
    requireReview: true,
    characters: [
      {
        id: "founder",
        name: "林知秋",
        subtitle: "品牌主理人",
        profile:
          "从一顶帽子开始，讲述关于质感、独立与日常的品牌故事。表达自然、温柔、有分寸。",
        tags: ["品牌主理人", "温柔知性", "商品试戴"],
        ownerId: "陈楠",
        status: "available",
        scope: ["social", "internal"],
        visibleTo: ["creator", "assetManager", "reviewer", "admin"],
        currentVersionId: "founder-v2",
        portrait: 0,
      },
      {
        id: "lifestyle",
        name: "周予安",
        subtitle: "生活方式女性",
        profile: "成熟、自信的都市生活方式形象，适合生活独白、穿搭与日常故事。",
        tags: ["成熟优雅", "生活方式", "自然表达"],
        ownerId: "许知",
        status: "incomplete",
        scope: ["social", "internal"],
        visibleTo: ["creator", "assetManager", "reviewer", "admin"],
        currentVersionId: "lifestyle-v1",
        portrait: 1,
      },
      {
        id: "virtual",
        name: "Echo",
        subtitle: "虚拟品牌模特",
        profile:
          "原创虚拟时尚人物，干净利落的形象，适合系列产品展示与品牌视觉。",
        tags: ["虚拟形象", "时尚表现", "产品展示"],
        ownerId: "陈楠",
        status: "expired",
        scope: ["social"],
        visibleTo: ["creator", "assetManager", "reviewer", "admin"],
        currentVersionId: "virtual-v1",
        portrait: 2,
      },
    ],
    versions: [
      {
        id: "founder-v1",
        characterId: "founder",
        name: "林知秋",
        profile: "品牌主理人 · 初始版本",
        version: 1,
        changeNote: "创建人物档案与基础素材",
        createdBy: "资产管理员",
        createdAt: "2026-09-20T02:00:00Z",
        assets: assets("founder-old"),
        licenseStatus: "valid",
        validUntil: "2027-10-01",
        scope: ["social", "internal"],
      },
      {
        id: "founder-v2",
        characterId: "founder",
        name: "林知秋",
        profile: "品牌主理人 · 温柔克制",
        version: 2,
        changeNote: "更新秋季形象照片与动作样本",
        createdBy: "资产管理员",
        createdAt: "2026-10-08T02:00:00Z",
        assets: assets("founder"),
        licenseStatus: "valid",
        validUntil: "2027-10-01",
        scope: ["social", "internal"],
      },
      {
        id: "lifestyle-v1",
        characterId: "lifestyle",
        name: "周予安",
        profile: "成熟生活方式女性",
        version: 1,
        changeNote: "登记基础形象，声线与授权待补充",
        createdBy: "资产管理员",
        createdAt: "2026-10-09T02:00:00Z",
        assets: assets("lifestyle", true),
        licenseStatus: "pending",
        validUntil: "",
        scope: ["social", "internal"],
      },
      {
        id: "virtual-v1",
        characterId: "virtual",
        name: "Echo",
        profile: "原创虚拟品牌模特",
        version: 1,
        changeNote: "虚拟品牌模特初始版本",
        createdBy: "资产管理员",
        createdAt: "2026-09-01T02:00:00Z",
        assets: assets("virtual", false, true),
        licenseStatus: "expired",
        validUntil: "2026-10-01",
        scope: ["social"],
      },
    ],
    requests: [],
    tasks: [],
    results: [],
    reviews: [],
    providers: [
      {
        id: "mock",
        name: "Persona Mock",
        description: "本地模拟 · 11 秒演示生成流程",
        capabilities: [
          "商品试戴（模拟）",
          "生活方式独白（模拟）",
          "剧情独角戏（模拟）",
          "种草短片（模拟）",
        ],
        enabled: true,
        configured: true,
        mode: "mock",
        rate: 0.08,
      },
      structuredClone(xiaoyunqueProvider),
      {
        id: "disabled",
        name: "实验渠道 · 已停用",
        description: "预留适配器，当前停用",
        capabilities: ["待供应商验证"],
        enabled: false,
        configured: false,
        mode: "unconnected",
        rate: null,
      },
    ],
    audit: [
      {
        id: "audit-seed",
        actorId: "系统（演示）",
        action: "初始化示例工作台",
        targetType: "workspace",
        targetId: "demo",
        before: "",
        after: "3 个人物 / 6 个任务 / 4 个占位结果",
        createdAt: "2026-10-13T01:00:00Z",
      },
    ],
  };
  const titles = [
    "秋日第一顶帽子",
    "把日常过成喜欢的样子",
    "一顶帽子的独角戏",
    "秋季新品 · 轻盈出发",
    "周末的城市漫游",
    "羊毛帽 · 三种搭配",
  ];
  const states: TaskStatus[] = [
    "completed",
    "completed",
    "review",
    "failed",
    "generating",
    "queued",
  ];
  const genres = ["商品试戴", "生活方式独白", "剧情独角戏", "种草短片"];
  states.forEach((status, i) => {
    const id = `TASK-${String(i + 1).padStart(3, "0")}`;
    const createdAt = `2026-10-${String(12 - Math.floor(i / 2)).padStart(2, "0")}T0${2 + i}:30:00Z`;
    const config = {
      ...defaultConfig,
      purpose: genres[i] || "商品试戴",
      scene: i === 1 ? "城市街角 · 午后咖啡馆" : defaultConfig.scene,
      duration: i === 1 ? 45 : 30,
    };
    const requestId = `request-seed-${i}`;
    data.requests.push({
      id: requestId,
      rawPrompt: `用品牌主理人生成${config.duration}秒${titles[i]}，温柔克制，竖屏`,
      parsedRequirement: config,
      createdBy: "creator",
      createdAt,
    });
    const v = data.versions[i < 2 ? 0 : 1];
    const events = [
      {
        status: "draft" as const,
        at: createdAt,
        actor: "内容创作者",
        reason: "保存生成配置",
      },
      {
        status: "confirming" as const,
        at: createdAt,
        actor: "内容创作者",
        reason: "确认人物版本与素材",
      },
      {
        status: "queued" as const,
        at: createdAt,
        actor: "内容创作者",
        reason: "提交至 Persona Mock",
      },
    ];
    if (status !== "queued")
      events.push({
        status: "generating" as never,
        at: createdAt,
        actor: "Persona Mock",
        reason: "开始模拟生成",
      });
    if (["completed", "review", "failed"].includes(status))
      events.push({
        status: "review" as never,
        at: createdAt,
        actor: "Persona Mock",
        reason: "模拟结果进入人工审核",
      });
    if (status === "completed" || status === "failed")
      events.push({
        status: status as never,
        at: createdAt,
        actor: "审核人",
        reason: status === "completed" ? "审核通过" : "审核退回：脚本需要调整",
      });
    data.tasks.push({
      id,
      title: titles[i],
      requestId,
      createdBy: i === 5 ? "admin" : "creator",
      createdAt,
      characterVersionId: v.id,
      config,
      assetSnapshot: structuredClone(v.assets),
      providerSnapshot: "Persona Mock",
      status,
      estimatedCost: config.duration * 0.08,
      failureReason:
        status === "failed"
          ? "审核退回：请减少脚本中的产品形容词，再次确认品牌表达。"
          : undefined,
      startedAt: i >= 4 ? now + (i === 5 ? 2000 : -2000) : undefined,
      externalId: i >= 4 ? `mock-seed-${i}` : undefined,
      events,
    });
    if (i < 4) {
      const reviewStatus =
        i < 2
          ? ("approved" as const)
          : i === 2
            ? ("pending" as const)
            : ("rejected" as const);
      data.results.push({
        id: `result-seed-${i}`,
        taskId: id,
        title: titles[i],
        duration: config.duration,
        resolution: "1080 × 1920",
        genre: genres[i],
        tags: ["秋季系列", genres[i]],
        version: 1,
        reviewStatus,
        createdAt,
      });
      if (reviewStatus !== "pending")
        data.reviews.push({
          id: `review-seed-${i}`,
          resultId: `result-seed-${i}`,
          reviewerId: "reviewer",
          decision: reviewStatus,
          comment:
            reviewStatus === "approved"
              ? "品牌表达自然，配置确认通过。示例占位结果。"
              : "请减少产品形容词，重新整理脚本。",
          createdAt,
        });
    }
  });
  return data;
}
