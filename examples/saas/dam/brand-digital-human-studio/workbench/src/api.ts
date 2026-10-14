import type { Asset, AssetKind } from "./types";
import { rankAssets } from "../shared/matching.mjs";
// Catalog builds never forward requests to this or another demo's API.
export const PUBLIC_DEMO =
  import.meta.env.VITE_PUBLIC_DEMO === "true" ||
  location.pathname.startsWith(
    "/examples/saas/dam/brand-digital-human-studio/workbench/dist/",
  );
export interface ProviderConfig {
  catalogOnly?: boolean;
  configured: boolean;
  enabled: boolean;
  llmConfigured: boolean;
  models: {
    id: string;
    label: string;
    minDuration: number;
    maxDuration: number;
  }[];
}
export interface MatchResult {
  method: "rules" | "qwen";
  intent: {
    character: string;
    product: string;
    scene: string;
    action: string;
    mood: string;
  };
  groups: {
    kind: AssetKind;
    candidates: { id: string; score: number; reason: string }[];
    needsConfirmation: boolean;
  }[];
  warnings: string[];
}
export interface RemoteGeneration {
  requestId: string;
  modelId?: string;
  protocol?: "dashscope" | "gateway";
  remoteTaskId?: string;
  status: string;
  video?: string;
  images?: string[];
  canCancel: boolean;
  error?: string;
  providerStatus?: string;
  duration?: number;
}
export interface XyqStatus {
  installed: boolean;
  loggedIn: boolean;
  enabled: boolean;
  balance?: string | null;
  models: { key: string; name: string }[];
}
export interface WanConfig {
  configured: boolean;
  enabled: boolean;
  source: "page" | "environment" | "none";
  protocol: "dashscope" | "gateway";
  baseUrl: string;
  gatewayModelId: string;
  workspaceId: string;
  region: "cn-beijing";
  model: string;
  credentialVerified: false;
}
export interface SeedanceConfig {
  configured: boolean;
  enabled: boolean;
  source: "page" | "environment" | "none";
  baseUrl: string;
  model: string;
  credentialVerified: false;
}
export const providerApiRoot = (provider?: string) =>
  provider === "seedance"
    ? "/api/seedance"
    : provider === "speech"
      ? "/api/speech"
      : provider === "wan"
        ? "/api/wan"
        : provider === "xiaoyunque"
          ? "/api/xyq"
          : "/api";
export interface SpeechSample {
  id: string;
  name: string;
  duration: number;
  size: number;
  audioUrl: string;
  createdAt: number;
}
export interface SpeechVoice {
  id: string;
  name: string;
  characterId: string;
  sampleId: string;
  status: "processing" | "pending" | "completed" | "failed";
  remoteVoiceId?: string;
  model: string;
  error?: string;
  createdAt: number;
}
export interface SpeechAudio {
  id: string;
  voiceId: string;
  characterId: string;
  text: string;
  status: "processing" | "completed" | "failed";
  duration?: number;
  audioUrl?: string;
  error?: string;
  canLipSync: boolean;
  canRecover: boolean;
  createdAt: number;
}
export interface SpeechLibrary {
  samples: SpeechSample[];
  voices: SpeechVoice[];
  utterances: SpeechAudio[];
  bindings: Record<string, string>;
}
export interface XyqModel {
  key: string;
  name?: string;
  duration?: { min?: number; max?: number; step?: number; options?: number[] };
  ratio?: { options?: string[] };
  resolution?: { options?: string[] };
  creation_modes?: { key: string; enabled?: boolean }[];
  material_limits?: { image_total_limit?: number };
  warnings?: string[];
}
export interface SoulResponse {
  id: string;
  status: string;
  name?: string;
  version?: string;
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (PUBLIC_DEMO) {
    if (body === undefined && path === "/api/config")
      return {
        configured: false,
        enabled: false,
        llmConfigured: false,
        models: [],
        catalogOnly: true,
      } as T;
    if (body === undefined && path === "/api/wan/config")
      return {
        configured: false,
        enabled: false,
        source: "none",
        workspaceId: "",
        region: "cn-beijing",
        model: "wan2.6-i2v-flash",
        credentialVerified: false,
      } as T;
    if (body === undefined && path === "/api/seedance/config")
      return {
        configured: false,
        enabled: false,
        source: "none",
        baseUrl: "",
        model: "doubao-seedance-2-0-fast-260128",
        credentialVerified: false,
      } as T;
    if (body === undefined && path === "/api/speech/library")
      return { samples: [], voices: [], utterances: [], bindings: {} } as T;
    if (body === undefined && path === "/api/xyq/status")
      return {
        installed: false,
        loggedIn: false,
        enabled: false,
        models: [],
      } as T;
    if (path === "/api/assets/match" && body && typeof body === "object") {
      const input = body as { prompt: string; assets: Asset[] };
      return rulesFallback(input.prompt, input.assets) as T;
    }
    throw new Error(
      "公开演示仅支持模拟流程，不连接真实 API，也不接收或保存 API Key。请在本机完整版配置和验证模型。",
    );
  }
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Studio-Client": "1" },
    credentials: "same-origin",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(
      data?.error || "本地接口代理未启动，请使用 npm run dev 启动完整 Demo。",
    );
  return data as T;
}
export function rulesFallback(prompt: string, assets: Asset[]): MatchResult {
  return rankAssets(prompt, assets) as MatchResult;
}
export async function matchAssets(
  prompt: string,
  assets: Asset[],
): Promise<MatchResult> {
  return api<MatchResult>("/api/assets/match", {
    prompt,
    assets: assets.map(
      ({ id, name, kind, tags, description, code, updated }) => ({
        id,
        name,
        kind,
        tags,
        description,
        code,
        updated,
      }),
    ),
  });
}
