import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServices } from "../src/data/supabase";
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
describe("Supabase 业务冲突", () => {
  it("PT409立即显示刷新提示，禁用SDK自动重试，并对所有网络请求设置超时", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PT409", message: "version conflict" },
    });
    vi.mocked(createClient).mockReturnValue({ rpc } as never);
    const services = createSupabaseServices(
      "https://example.supabase.co",
      "sb_publishable_example",
    );
    await expect(
      services.operations.transitionReport({
        reportId: "report-1",
        expectedVersion: 1,
        status: "approved",
        note: "批准",
        requestId: "request-1",
      }),
    ).rejects.toThrow("记录已更新，请刷新");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_example",
      expect.objectContaining({
        db: { retry: false },
        global: { fetch: expect.any(Function) },
      }),
    );
  });
});
