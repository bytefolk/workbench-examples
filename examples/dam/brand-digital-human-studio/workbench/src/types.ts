export type Page = "assets" | "create" | "tasks" | "outputs";
export type AssetKind = "character" | "product" | "scene" | "voice";
export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  image: string;
  tags: string[];
  description: string;
  code: string;
  updated: string;
  position?: string;
  favorite?: boolean;
  uploaded?: boolean;
  soulId?: string;
  soulStatus?: string;
  referenceImages?: string[];
  clonedVoiceId?: string;
  clonedVoiceModel?: string;
  voiceStatus?: string;
  audioUrl?: string;
  audioDuration?: number;
}
export interface Shot {
  id: string;
  title: string;
  description: string;
  narration: string;
}
export interface Draft {
  title: string;
  prompt: string;
  characterId: string;
  productId: string;
  sceneId: string;
  voiceId: string;
  ratio: "16:9" | "9:16";
  duration: number;
  mood: string;
  shots: Shot[];
  mode?: "demo" | "higgsfield" | "xiaoyunque" | "wan" | "speech";
  speechText?: string;
  speechAudioId?: string;
  wanFrameAssetId?: string;
  wanShotType?: "single" | "multi";
  xyqResolution?: string;
  modelId?: string;
  resolution?: "480p" | "720p" | "1080p";
  generateAudio?: boolean;
}
export type TaskStatus =
  | "queued"
  | "generating"
  | "completed"
  | "failed"
  | "canceled";
export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  startedAt: number;
  createdAt: number;
  draft: Draft;
  assets: Asset[];
  error?: string;
  approved: boolean;
  favorite: boolean;
  provider?: "higgsfield" | "xiaoyunque" | "wan" | "speech";
  remoteRequestId?: string;
  resultUrl?: string;
  providerStatus?: string;
  canCancel?: boolean;
}
export interface StudioState {
  version: 1;
  assets: Asset[];
  tasks: Task[];
  draft: Draft;
}
export const kindLabels: Record<AssetKind, string> = {
  character: "数字人物",
  product: "商品素材",
  scene: "场景素材",
  voice: "声音素材",
};
export const statusLabels: Record<TaskStatus, string> = {
  queued: "排队中",
  generating: "生成中",
  completed: "已完成",
  failed: "生成失败",
  canceled: "已取消",
};
