export type Role = "creator" | "assetManager" | "reviewer" | "admin";
export type CharacterStatus =
  | "draft"
  | "incomplete"
  | "available"
  | "disabled"
  | "expired";
export type TaskStatus =
  | "draft"
  | "confirming"
  | "queued"
  | "generating"
  | "review"
  | "completed"
  | "failed"
  | "cancelled";
export type Scope = "social" | "internal" | "campaign";
export type AssetType =
  | "image"
  | "video"
  | "audio"
  | "voice"
  | "action"
  | "expression"
  | "script"
  | "license";
export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  source: string;
  version: string;
  licenseStatus: "valid" | "pending" | "expired";
  createdBy: string;
  createdAt: string;
  note: string;
}
export interface Character {
  id: string;
  name: string;
  subtitle: string;
  profile: string;
  tags: string[];
  ownerId: string;
  status: CharacterStatus;
  scope: Scope[];
  visibleTo: Role[];
  currentVersionId: string;
  portrait: number;
}
export interface CharacterVersion {
  id: string;
  characterId: string;
  version: number;
  changeNote: string;
  createdBy: string;
  createdAt: string;
  assets: Asset[];
  licenseStatus: "valid" | "pending" | "expired";
  validUntil: string;
  scope: Scope[];
  name: string;
  profile: string;
}
export interface GenerationConfig {
  characterId: string;
  providerId: string;
  script: string;
  scene: string;
  emotion: string;
  action: string;
  product: string;
  purpose: string;
  duration: number;
  ratio: "9:16" | "16:9" | "1:1";
  language: string;
  voice: string;
  scope: Scope;
  outcome: "success" | "failure";
}
export interface GenerationRequest {
  id: string;
  rawPrompt: string;
  parsedRequirement: GenerationConfig;
  createdBy: Role;
  createdAt: string;
}
export interface TaskEvent {
  status: TaskStatus;
  at: string;
  actor: string;
  reason: string;
}
export interface GenerationTask {
  id: string;
  title: string;
  requestId: string;
  createdBy: Role;
  createdAt: string;
  characterVersionId: string;
  config: GenerationConfig;
  assetSnapshot: Asset[];
  providerSnapshot: string;
  status: TaskStatus;
  estimatedCost: number | null;
  startedAt?: number;
  externalId?: string;
  failureReason?: string;
  events: TaskEvent[];
}
export interface GenerationResult {
  id: string;
  taskId: string;
  title: string;
  duration: number;
  resolution: string;
  genre: string;
  tags: string[];
  version: number;
  reviewStatus: "pending" | "approved" | "rejected";
  createdAt: string;
}
export interface Review {
  id: string;
  resultId: string;
  reviewerId: Role;
  decision: "approved" | "rejected";
  comment: string;
  createdAt: string;
}
export interface Provider {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  enabled: boolean;
  configured: boolean;
  mode: "mock" | "unconnected";
  rate: number | null;
  websiteUrl?: string;
  documentationUrl?: string;
}
export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: string;
  after: string;
  createdAt: string;
}
export interface Database {
  schemaVersion: 1;
  characters: Character[];
  versions: CharacterVersion[];
  requests: GenerationRequest[];
  tasks: GenerationTask[];
  results: GenerationResult[];
  reviews: Review[];
  providers: Provider[];
  audit: AuditLog[];
  requireReview: boolean;
}
export const roleNames: Record<Role, string> = {
  creator: "内容创作者",
  assetManager: "资产管理员",
  reviewer: "审核人",
  admin: "系统管理员",
};
export const statusNames: Record<TaskStatus | CharacterStatus, string> = {
  draft: "草稿",
  confirming: "待确认",
  queued: "排队中",
  generating: "生成中",
  review: "待审核",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  incomplete: "待补充",
  available: "可用",
  disabled: "已停用",
  expired: "授权过期",
};
export const scopeNames: Record<Scope, string> = {
  social: "品牌社交媒体",
  internal: "企业内部",
  campaign: "商业广告",
};
export const assetTypeNames: Record<AssetType, string> = {
  image: "形象照片",
  video: "基础视频",
  audio: "音频样本",
  voice: "声线",
  action: "动作样本",
  expression: "表情样本",
  script: "脚本",
  license: "授权文件",
};
export const can = (
  role: Role,
  action: "create" | "manage" | "review" | "settings",
) =>
  role === "admin" ||
  (action === "create" && role === "creator") ||
  (action === "manage" && role === "assetManager") ||
  (action === "review" && role === "reviewer");
