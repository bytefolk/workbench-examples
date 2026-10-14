import type { GenerationConfig, Provider } from "./types";

export interface ProviderAdapter {
  generate(
    config: GenerationConfig,
    now: number,
  ): { externalId: string; startedAt: number };
  getTask(
    externalId: string,
    startedAt: number,
    config: GenerationConfig,
    now: number,
  ): {
    status: "queued" | "generating" | "succeeded" | "failed";
    progress: number;
    reason?: string;
  };
  cancelTask(externalId: string): { cancelled: boolean };
  getCapabilities(): string[];
}
export class MockProvider implements ProviderAdapter {
  generate(_config: GenerationConfig, now: number) {
    return { externalId: `mock-${crypto.randomUUID()}`, startedAt: now };
  }
  getTask(_id: string, started: number, config: GenerationConfig, now: number) {
    const elapsed = now - started;
    if (elapsed < 1800) return { status: "queued" as const, progress: 0 };
    if (elapsed < 11000)
      return {
        status: "generating" as const,
        progress: Math.min(97, Math.max(4, Math.round((elapsed - 1800) / 92))),
      };
    if (config.outcome === "failure")
      return {
        status: "failed" as const,
        progress: 100,
        reason:
          "Mock 演示失败：模型渠道返回生成超时。原配置已保留，可复制后重新发起。",
      };
    return { status: "succeeded" as const, progress: 100 };
  }
  cancelTask(_id: string) {
    return { cancelled: true };
  }
  getCapabilities() {
    return [
      "商品试戴（模拟）",
      "生活方式独白（模拟）",
      "剧情独角戏（模拟）",
      "种草短片（模拟）",
    ];
  }
}
const mock = new MockProvider();
export function getAdapter(provider: Provider): ProviderAdapter {
  if (!provider.enabled) throw new Error("该模型渠道已停用。");
  if (!provider.configured)
    throw new Error("该渠道尚未配置，请选择可用的 Mock 渠道。");
  if (provider.mode !== "mock") throw new Error("该渠道尚未接入真实 API。");
  return mock;
}
export const mockAdapter = mock;
