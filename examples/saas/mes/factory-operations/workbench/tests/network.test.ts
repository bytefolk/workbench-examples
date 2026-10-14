import { describe, expect, it, vi } from "vitest";
import { createTimeoutFetch } from "../src/data/network";
function pendingFetch() {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init!.signal!;
        if (signal.aborted) reject(signal.reason);
        else
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
      }),
  );
}
describe("网络边界", () => {
  it("超时会中断底层请求且不会重试写入", async () => {
    const fetcher = pendingFetch(),
      request = createTimeoutFetch(fetcher, 15);
    await expect(
      request("https://example.test/report", { method: "POST", body: "{}" }),
    ).rejects.toThrow("超时");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("同时保留Request及RequestInit的取消信号", async () => {
    for (const cancelRequest of [true, false]) {
      const first = new AbortController(),
        second = new AbortController(),
        fetcher = pendingFetch();
      const request = new Request("https://example.test/report", {
        signal: first.signal,
      });
      const result = createTimeoutFetch(fetcher)(request, {
        signal: second.signal,
      });
      const assertion = expect(result).rejects.toThrow("取消");
      (cancelRequest ? first : second).abort(new Error("调用方取消"));
      await assertion;
      expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    }
  });
  it("已经取消的请求不会丢失取消原因", async () => {
    const controller = new AbortController();
    controller.abort(new Error("已取消"));
    await expect(
      createTimeoutFetch(pendingFetch())("https://example.test", {
        signal: controller.signal,
      }),
    ).rejects.toThrow("已取消");
  });
});
