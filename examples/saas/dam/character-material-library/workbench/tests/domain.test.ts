import { describe, expect, it } from "vitest";
import { createSeed, defaultConfig, demoPrompt } from "../src/domain/seed";
import {
  cancelTask,
  characterIssues,
  configIssues,
  createDraft,
  parsePrompt,
  reviewResult,
  saveCharacter,
  submitTask,
  tickTasks,
  toggleCharacter,
  transition,
  updateAssets,
  versionOf,
  visibleCharacters,
  visibleTasks,
  configureProvider,
} from "../src/domain/model";
import { can } from "../src/domain/types";
import { getAdapter } from "../src/domain/provider";
import {
  upgradeProviderCatalog,
  xiaoyunqueProvider,
} from "../src/domain/catalog";

describe("PRD acceptance: authorization, immutable provenance and generation lifecycle", () => {
  it("seeds three characters, three channels, six tasks and four linked results", () => {
    const db = createSeed();
    expect(db.characters).toHaveLength(3);
    expect(db.providers).toHaveLength(3);
    expect(db.tasks).toHaveLength(6);
    expect(db.results).toHaveLength(4);
    for (const task of db.tasks) {
      expect(db.versions.some((v) => v.id === task.characterVersionId)).toBe(
        true,
      );
      expect(db.requests.some((r) => r.id === task.requestId)).toBe(true);
    }
  });
  it("parses the seven-step demo prompt with editable requirements and a reason", () => {
    const r = parsePrompt(createSeed(), demoPrompt, "creator");
    expect(r.config.characterId).toBe("founder");
    expect(r.config.duration).toBe(30);
    expect(r.config.ratio).toBe("9:16");
    expect(r.config.emotion).toBe("温柔克制");
    expect(r.config.purpose).toBe("商品试戴");
    expect(r.reason).toContain("品牌主理人");
  });
  it("reports omitted identity, duration, format and product instead of claiming certainty", () => {
    const r = parsePrompt(createSeed(), "做一个生活方式视频", "creator");
    expect(r.notes.length).toBe(4);
    expect(r.config.product).toBe("");
  });
  it("blocks missing voice/license, expired authorization, unsupported scope and invalid duration", () => {
    const db = createSeed();
    expect(
      configIssues(
        db,
        { ...defaultConfig, characterId: "lifestyle" },
        "creator",
      ).join(),
    ).toContain("声线");
    expect(
      configIssues(
        db,
        { ...defaultConfig, characterId: "virtual" },
        "creator",
      ).join(),
    ).toContain("过期");
    expect(
      configIssues(
        db,
        { ...defaultConfig, scope: "campaign" },
        "creator",
      ).join(),
    ).toContain("范围");
    expect(
      configIssues(db, { ...defaultConfig, duration: 0 }, "creator").join(),
    ).toContain("时长");
  });
  it("enforces the four roles and hidden characters at the service layer", () => {
    const db = createSeed();
    db.characters[0].visibleTo = ["admin"];
    expect(visibleCharacters(db, "creator")).toHaveLength(2);
    expect(configIssues(db, defaultConfig, "creator").join()).toContain("权限");
    expect(can("creator", "manage")).toBe(false);
    expect(can("assetManager", "create")).toBe(false);
    expect(can("reviewer", "review")).toBe(true);
    expect(visibleTasks(db, "creator")).toHaveLength(5);
    expect(visibleTasks(db, "reviewer")).toHaveLength(6);
    expect(() =>
      createDraft(db, "reviewer", demoPrompt, defaultConfig),
    ).toThrow("不能创建");
    expect(() => configureProvider(db, "creator", "mock")).toThrow(
      "系统管理员",
    );
  });
  it("runs draft → confirming → queue → generation → review → archive, preserving provenance", () => {
    const [draft, id] = createDraft(createSeed(), "creator", demoPrompt, {
      ...defaultConfig,
      duration: 45,
      script: "人工修改的脚本",
    });
    const submitted = submitTask(draft, "creator", id),
      task = submitted.tasks.find((t) => t.id === id)!;
    expect(task.events.map((e) => e.status)).toEqual([
      "draft",
      "confirming",
      "queued",
    ]);
    expect(task.config.script).toBe("人工修改的脚本");
    const generated = tickTasks(submitted, task.startedAt! + 12000),
      result = generated.results.find((r) => r.taskId === id)!;
    expect(generated.tasks.find((t) => t.id === id)!.status).toBe("review");
    expect(() =>
      reviewResult(generated, "creator", result.id, true, "通过"),
    ).toThrow("审核权限");
    expect(() =>
      reviewResult(generated, "reviewer", result.id, true, ""),
    ).toThrow("审核意见");
    const archived = reviewResult(
      generated,
      "reviewer",
      result.id,
      true,
      "品牌脚本与参数已确认",
    );
    expect(archived.tasks.find((t) => t.id === id)!.status).toBe("completed");
    expect(archived.results.find((r) => r.id === result.id)!.reviewStatus).toBe(
      "approved",
    );
    expect(archived.reviews[0].resultId).toBe(result.id);
    expect(archived.audit.some((a) => a.action === "审核通过并归档")).toBe(
      true,
    );
  });
  it("retains historical snapshots when assets are removed, and rechecks current version on submission", () => {
    const db = createSeed(),
      [draft, id] = createDraft(db, "creator", demoPrompt, defaultConfig),
      snapshot = structuredClone(draft.tasks[0].assetSnapshot);
    const c = draft.characters[0],
      updated = updateAssets(
        draft,
        "assetManager",
        c.id,
        versionOf(draft, c).assets.filter((a) => a.type !== "license"),
      );
    expect(updated.versions.length).toBe(db.versions.length + 1);
    expect(updated.tasks[0].assetSnapshot).toEqual(snapshot);
    expect(() => submitTask(updated, "creator", id)).toThrow("授权文件");
    expect(updated.characters[0].status).toBe("incomplete");
  });
  it("rechecks disabled characters and channels after the draft was saved", () => {
    const [draft, id] = createDraft(
      createSeed(),
      "creator",
      demoPrompt,
      defaultConfig,
    );
    expect(() =>
      submitTask(
        toggleCharacter(draft, "assetManager", "founder"),
        "creator",
        id,
      ),
    ).toThrow("停用");
    expect(() =>
      submitTask(configureProvider(draft, "admin", "mock"), "creator", id),
    ).toThrow("停用");
  });
  it("fails once and retains the original task when retrying via a new draft", () => {
    const [draft, id] = createDraft(createSeed(), "creator", demoPrompt, {
      ...defaultConfig,
      outcome: "failure",
    });
    const queued = submitTask(draft, "creator", id),
      started = queued.tasks[0].startedAt!;
    const failed = tickTasks(queued, started + 12000);
    expect(failed.tasks[0].status).toBe("failed");
    expect(failed.tasks[0].failureReason).toContain("Mock");
    const later = tickTasks(failed, started + 24000);
    expect(later.tasks.find((t) => t.id === id)!.events).toEqual(
      failed.tasks[0].events,
    );
    const [retry, newId] = createDraft(failed, "creator", demoPrompt, {
      ...failed.tasks[0].config,
      outcome: "success",
    });
    expect(newId).not.toBe(id);
    expect(retry.tasks.find((t) => t.id === id)!.status).toBe("failed");
  });
  it("rejects review with a reason and preserves the result record", () => {
    const db = createSeed(),
      result = db.results.find((r) => r.reviewStatus === "pending")!;
    const next = reviewResult(
      db,
      "reviewer",
      result.id,
      false,
      "品牌语气需要修改",
    );
    expect(
      next.tasks.find((t) => t.id === result.taskId)!.failureReason,
    ).toContain("品牌语气");
    expect(next.results.find((r) => r.id === result.id)!.reviewStatus).toBe(
      "rejected",
    );
  });
  it("cancels unstarted tasks only and never advances cancelled jobs", () => {
    const [draft, id] = createDraft(
        createSeed(),
        "creator",
        demoPrompt,
        defaultConfig,
      ),
      queued = submitTask(draft, "creator", id);
    const cancelled = cancelTask(queued, "creator", id),
      next = tickTasks(cancelled, Date.now() + 100000);
    expect(next.tasks.find((t) => t.id === id)!.status).toBe("cancelled");
    const started = tickTasks(queued, queued.tasks[0].startedAt! + 3000);
    expect(() => cancelTask(started, "creator", id)).toThrow("已经开始");
  });
  it("does not allow incomplete new characters to be marked usable", () => {
    const db = createSeed(),
      input = {
        ...db.characters[0],
        name: "新人物",
        status: "available" as const,
      };
    expect(() =>
      saveCharacter(db, "assetManager", input, {
        licenseStatus: "valid",
        validUntil: "2027-10-01",
      }),
    ).toThrow("关键素材");
    const next = saveCharacter(
      db,
      "assetManager",
      { ...input, status: "draft" },
      { licenseStatus: "pending", validUntil: "" },
    );
    expect(next.characters[0].status).toBe("draft");
  });
  it("requires a valid adapter rather than calling unconfigured or disabled providers", () => {
    const db = createSeed();
    expect(getAdapter(db.providers[0]).getCapabilities().length).toBe(4);
    expect(() => getAdapter(db.providers[1])).toThrow("尚未配置");
    expect(() => getAdapter(db.providers[2])).toThrow("已停用");
  });
  it("never treats an unknown authorization date as zero or as valid", () => {
    const db = createSeed(),
      c = db.characters[0],
      v = { ...versionOf(db, c), validUntil: "" };
    expect(characterIssues(c, v)).toContain("缺少授权有效期");
    expect(characterIssues(c, { ...v, validUntil: "bad-date" })).toContain(
      "授权有效期格式无效",
    );
  });
  it("retains unknown provider prices as null, including saved drafts", () => {
    const db = createSeed();
    expect(db.providers[1].rate).toBeNull();
    const [draft] = createDraft(db, "creator", demoPrompt, {
      ...defaultConfig,
      providerId: "awaiting",
    });
    expect(draft.tasks[0].estimatedCost).toBeNull();
  });
  it("updates the saved provider catalog without resetting drafts, history or the channel switch", () => {
    const [db] = createDraft(createSeed(), "creator", demoPrompt, {
      ...defaultConfig,
      providerId: "awaiting",
    });
    db.providers[1] = {
      ...db.providers[1],
      name: "视频 API · 待接入",
      description: "旧说明",
      enabled: false,
      configured: true,
      documentationUrl: undefined,
    };
    const next = upgradeProviderCatalog(db);
    expect(next.providers[1].name).toBe(xiaoyunqueProvider.name);
    expect(next.providers[1].enabled).toBe(false);
    expect(next.providers[1].configured).toBe(false);
    expect(next.providers[1].mode).toBe("unconnected");
    expect(next.providers[1].rate).toBeNull();
    expect(next.tasks).toEqual(db.tasks);
    expect(next.versions).toEqual(db.versions);
    expect(next.reviews).toEqual(db.reviews);
    expect(next.audit[0].action).toBe("补充客户生成平台");
    expect(upgradeProviderCatalog(next)).toBe(next);
  });
  it("official documentation does not enable live model calls", () => {
    const db = createSeed(),
      provider = db.providers.find((p) => p.id === "awaiting")!;
    expect(provider.documentationUrl).toContain("docs.volcengine.com");
    expect(provider.name).toContain("小云雀");
    expect(() => getAdapter(provider)).toThrow("尚未配置");
  });
});
