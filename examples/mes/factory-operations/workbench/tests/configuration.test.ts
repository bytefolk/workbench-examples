import { describe, expect, it } from "vitest";
import {
  composeDataServices,
  createConfiguredProvider,
  validateConfiguration,
} from "../src/data";
import { createHttpServices } from "../src/data/http";
const jwt = (role: string) =>
  `header.${btoa(JSON.stringify({ role }))}.signature`;
describe("数据源配置", () => {
  it("拒绝远端明文HTTP、URL凭据和secret/service-role密钥", () => {
    expect(() =>
      validateConfiguration({
        provider: "http",
        apiBaseUrl: "http://company.example.test",
      }),
    ).toThrow("HTTPS");
    expect(() =>
      validateConfiguration({
        provider: "http",
        apiBaseUrl: "https://user:pass@company.example.test",
      }),
    ).toThrow("账号");
    for (const key of ["sb_secret_example", jwt("service_role"), "unknown"])
      expect(() =>
        validateConfiguration({
          provider: "supabase",
          supabaseUrl: "https://example.supabase.co",
          supabasePublishableKey: key,
        }),
      ).toThrow();
  });
  it("接受localhost或同源网关和公开anon key", () => {
    for (const apiBaseUrl of [
      "http://localhost:3000/api",
      "/api/v1",
      "https://company.example.test/api",
    ])
      expect(() =>
        validateConfiguration({ provider: "http", apiBaseUrl }),
      ).not.toThrow();
    expect(() =>
      validateConfiguration({
        provider: "supabase",
        supabaseUrl: "https://example.supabase.co",
        supabasePublishableKey: jwt("anon"),
      }),
    ).not.toThrow();
  });
  it("无配置显示明确问题，并允许独立组合身份/业务/资产端口", () => {
    const configured = createConfiguredProvider({ provider: "http" });
    expect(configured.provider).toBeNull();
    expect(configured.configurationIssue).toContain("API");
    const one = createHttpServices("/one"),
      two = createHttpServices("/two");
    const composed = composeDataServices(
      {
        identity: one.identity,
        operations: one.operations,
        assets: two.assets,
      },
      "enterprise",
    );
    expect(composed.identity).toBe(one.identity);
    expect(composed.assets).toBe(two.assets);
    expect(composed.provider).toBe("enterprise");
  });
});
