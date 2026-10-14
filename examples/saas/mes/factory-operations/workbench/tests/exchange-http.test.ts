import { describe, expect, it, vi } from "vitest";
import { ApiError, createHttpServices } from "../src/data/http";
import type {
  ImportCommit,
  ImportPreview,
  ImportResult,
  DatasetState,
} from "../src/data/exchange-contracts";
import { makeSnapshot, workspaceId } from "./fixtures/exchange";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const commit: ImportCommit = {
  planId: "90000000-0000-4000-8000-000000000001",
  expectedRevision: "17",
  requestId: "90000000-0000-4000-8000-000000000002",
};
const result: ImportResult = {
  revision: "18",
  contentOrigin: "mixed",
  counts: [],
};

describe("台账 HTTP 交换契约", () => {
  it("预览把重复键原文交给服务端，保留表/行/字段错误而不在客户端重写包", async () => {
    const packageText = JSON.stringify(makeSnapshot()).replace(
      '"quantity":1',
      '"quantity":1,"quantity":2',
    );
    const preview: ImportPreview = {
      planId: null,
      expectedRevision: "17",
      sourceWorkspaceId: workspaceId,
      targetWorkspaceId: workspaceId,
      sourceLabel: "合成来源",
      targetLabel: "合成目标",
      counts: [],
      warnings: [],
      canCommit: false,
      issues: [
        {
          table: "reports",
          row: 1,
          field: "/data/quantity",
          code: "duplicate-key",
          message: "重复字段",
        },
      ],
    };
    const fetcher = vi.fn().mockResolvedValue(json(preview));
    const exchange = createHttpServices(
      "/api/v1/",
      fetcher as typeof fetch,
    ).exchange!;
    const input = {
      packageText,
      mode: "replace" as const,
      replaceScope: ["factory", "reports"] as const,
    };
    const response = await exchange.previewImport("space/1", {
      ...input,
      replaceScope: [...input.replaceScope],
    });
    expect(response).toEqual(preview);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      "/api/v1/workspaces/space%2F1/ledger/preview",
    );
    const options = fetcher.mock.calls[0][1] as RequestInit;
    expect(options).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "FactoryOperations",
      },
    });
    expect(JSON.parse(options.body as string)).toEqual(input);
    expect(JSON.parse(options.body as string).packageText).toContain(
      '"quantity":1,"quantity":2',
    );
  });

  it("来源与一致快照使用独立 GET 接口，完整保留流程和资产清单", async () => {
    const snapshot = makeSnapshot();
    const source: DatasetState = {
      workspaceId,
      label: "合成车间",
      revision: "17",
      contentOrigin: "mixed",
      storage: "shared",
      recognitionModes: ["mock"],
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(source))
      .mockResolvedValueOnce(json(snapshot));
    const exchange = createHttpServices(
      "/api/v1",
      fetcher as typeof fetch,
    ).exchange!;
    expect(await exchange.getDatasetState(workspaceId)).toEqual(source);
    expect(await exchange.exportSnapshot(workspaceId)).toEqual(snapshot);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `/api/v1/workspaces/${workspaceId}/ledger/source`,
      `/api/v1/workspaces/${workspaceId}/ledger/export`,
    ]);
    for (const [, options] of fetcher.mock.calls) {
      expect(options).toMatchObject({ method: "GET", credentials: "include" });
      expect(options.body).toBeUndefined();
    }
  });

  it("显式重试沿用相同请求 ID 和计划，不在客户端生成第二次提交身份", async () => {
    const fetcher = vi.fn().mockImplementation(async () => json(result));
    const exchange = createHttpServices(
      "/api/v1",
      fetcher as typeof fetch,
    ).exchange!;
    expect(await exchange.commitImport(workspaceId, commit)).toEqual(result);
    expect(await exchange.commitImport(workspaceId, commit)).toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toBe(`/api/v1/workspaces/${workspaceId}/ledger/commit`);
      expect(options).toMatchObject({
        method: "POST",
        body: JSON.stringify(commit),
        headers: { "Idempotency-Key": commit.requestId },
      });
    }
  });

  it.each([403, 409, 503])(
    "提交返回 %s 时保留失败且不自动重试",
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(json({ message: "合成拒绝" }, status));
      const exchange = createHttpServices(
        "/api/v1",
        fetcher as typeof fetch,
      ).exchange!;
      await expect(
        exchange.commitImport(workspaceId, commit),
      ).rejects.toMatchObject({
        name: "ApiError",
        status,
        message: "合成拒绝",
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("网络中断不返回虚假成功、不自动重新提交，调用者可沿用请求 ID 再确认", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("合成网络中断"));
    const exchange = createHttpServices(
      "/api/v1",
      fetcher as typeof fetch,
    ).exchange!;
    await expect(exchange.commitImport(workspaceId, commit)).rejects.toThrow(
      "合成网络中断",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("交换接口的 401 清空身份并拒绝提交", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}, 401));
    const services = createHttpServices("/api/v1", fetcher as typeof fetch);
    const listener = vi.fn();
    services.identity.onChange(listener);
    await expect(
      services.exchange!.commitImport(workspaceId, commit),
    ).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(null);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
