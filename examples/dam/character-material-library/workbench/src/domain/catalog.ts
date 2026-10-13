import type { Database, Provider } from "./types";

// Retain the original ID so saved drafts and historical request references stay valid.
export const xiaoyunqueProvider: Provider = {
  id: "awaiting",
  name: "小云雀 · 短剧/漫剧",
  description: "客户在用平台 · 官方 API 文档已查证，账号与素材复用待验证",
  capabilities: [
    "剧本解析（官方文档）",
    "图片生成（官方文档）",
    "分镜视频生成（官方文档）",
    "单集视频合成（官方文档）",
  ],
  enabled: true,
  configured: false,
  mode: "unconnected",
  rate: null,
  websiteUrl: "https://xyq.jianying.com/",
  documentationUrl:
    "https://docs.volcengine.com/docs/JimengAI/little-skylark-short-drama-agent-full-process-call-example?lang=zh",
};

export function upgradeProviderCatalog(db: Database): Database {
  const old = db.providers.find((p) => p.id === xiaoyunqueProvider.id);
  if (
    !old ||
    (old.name === xiaoyunqueProvider.name &&
      old.description === xiaoyunqueProvider.description &&
      old.documentationUrl === xiaoyunqueProvider.documentationUrl)
  )
    return db;
  const next = structuredClone(db);
  next.providers = next.providers.map((p) =>
    p.id === xiaoyunqueProvider.id
      ? { ...structuredClone(xiaoyunqueProvider), enabled: p.enabled }
      : p,
  );
  next.audit.unshift({
    id: `audit-${crypto.randomUUID()}`,
    actorId: "系统资料更新",
    action: "补充客户生成平台",
    targetType: "provider",
    targetId: old.id,
    before: old.name,
    after: `${xiaoyunqueProvider.name} · 未接入`,
    createdAt: new Date().toISOString(),
  });
  return next;
}
