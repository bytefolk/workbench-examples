import type { DataConfiguration, DataServices } from "./contracts";
import { createHttpServices } from "./http";
import { createSupabaseServices } from "./supabase";

export const configurationStorageKey = "factory-operations-provider-config";
export function composeDataServices(
  ports: Pick<DataServices, "identity" | "operations" | "assets"> &
    Partial<Pick<DataServices, "exchange">>,
  provider = "custom",
): DataServices {
  return { ...ports, provider };
}
const registry = new Map<
  string,
  (configuration: DataConfiguration) => DataServices
>([
  [
    "supabase",
    (configuration) =>
      createSupabaseServices(
        configuration.supabaseUrl!,
        configuration.supabasePublishableKey!,
      ),
  ],
  ["http", (configuration) => createHttpServices(configuration.apiBaseUrl!)],
]);
/** 新部署可注册自身适配器，或组合不同实现的三个端口。 */
export function registerDataProvider(
  name: string,
  factory: (configuration: DataConfiguration) => DataServices,
): void {
  if (!name.trim() || registry.has(name))
    throw new Error("数据提供方名称为空或已经注册。");
  registry.set(name, factory);
}
function validateUrl(
  value: string | undefined,
  label: string,
  relative = false,
): void {
  if (!value?.trim()) throw new Error(`请填写${label}。`);
  if (relative && value.startsWith("/") && !value.startsWith("//")) {
    if (value.includes("?") || value.includes("#") || value.includes("\\"))
      throw new Error(`${label}不能包含查询参数或片段。`);
    return;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label}格式无效。`);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(local && url.protocol === "http:"))
  )
    throw new Error(
      `${label}须使用 HTTPS；仅本机地址支持 HTTP，且不能含账号、查询参数或片段。`,
    );
}
export function validateConfiguration(configuration: DataConfiguration): void {
  if (!registry.has(configuration.provider))
    throw new Error("尚未注册此数据提供方。");
  if (configuration.provider === "http") {
    validateUrl(configuration.apiBaseUrl, "企业 API 地址", true);
    return;
  }
  if (configuration.provider !== "supabase") return;
  validateUrl(configuration.supabaseUrl, "Supabase 项目地址");
  const key = configuration.supabasePublishableKey?.trim();
  if (!key || key.startsWith("sb_secret_"))
    throw new Error(
      "请填写可公开的 publishable key，不能使用 secret 或 service_role 密钥。",
    );
  if (key.startsWith("sb_publishable_")) return;
  try {
    const payload = JSON.parse(
      atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (payload.role === "anon") return;
  } catch {
    /* 兼容公开 anon JWT，其余密钥全部拒绝。 */
  }
  throw new Error(
    "仅接受 publishable key 或公开 anon key，不能使用 service_role 密钥。",
  );
}
export function createConfiguredProvider(configuration?: DataConfiguration): {
  provider: DataServices | null;
  configurationIssue: string | null;
  providerId: string;
} {
  let providerId = "supabase";
  try {
    const env =
      (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
        .env || {};
    let resolved = configuration;
    if (!resolved && typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(configurationStorageKey);
      if (saved) resolved = JSON.parse(saved) as DataConfiguration;
    }
    resolved ??= {
      provider: env.VITE_DATA_PROVIDER || "supabase",
      supabaseUrl: env.VITE_SUPABASE_URL,
      supabasePublishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      apiBaseUrl: env.VITE_API_BASE_URL,
    };
    providerId = resolved.provider;
    validateConfiguration(resolved);
    return {
      provider: registry.get(providerId)!(resolved),
      configurationIssue: null,
      providerId,
    };
  } catch (error) {
    return {
      provider: null,
      configurationIssue:
        error instanceof Error ? error.message : "数据源配置无效。",
      providerId,
    };
  }
}
export type { DataConfiguration, DataServices } from "./contracts";
