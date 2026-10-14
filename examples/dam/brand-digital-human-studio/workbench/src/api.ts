import type { Asset, AssetKind } from "./types";
import { rankAssets } from "../shared/matching.mjs";
export interface ProviderConfig {
  configured: boolean;
  enabled: boolean;
  llmConfigured: boolean;
  catalogOnly?: boolean;
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
  status: string;
  video?: string;
  images?: string[];
  canCancel: boolean;
  error?: string;
}
export interface SoulResponse {
  id: string;
  status: string;
  name?: string;
  version?: string;
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  // The repository catalog is a static server. It must never forward credentials
  // or accidentally target another case's API. Live tests run on the standalone
  // Vite + local proxy entry documented in the case README.
  if (
    location.pathname.startsWith(
      "/examples/dam/brand-digital-human-studio/workbench/dist/",
    )
  ) {
    if (path === "/api/config")
      return {
        configured: false,
        enabled: false,
        llmConfigured: false,
        catalogOnly: true,
        models: [],
      } as T;
    if (path === "/api/assets/match") {
      const input = body as { prompt: string; assets: Asset[] };
      return rulesFallback(input.prompt, input.assets) as T;
    }
    throw new Error(
      "目录入口仅运行模拟流程。真实验证请按案例说明启动独立工作台和本机代理。",
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
