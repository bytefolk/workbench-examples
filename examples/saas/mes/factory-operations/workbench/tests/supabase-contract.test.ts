import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServices } from "../src/data/supabase";
import type { ReportInput } from "../src/data/contracts";
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

describe("Supabase 申领保存确认", () => {
  const workspaceId = "workspace-1";
  const input: ReportInput = {
    kind: "broken_needle",
    contractNumber: "QA-CONTRACT",
    materialNumber: "QA-NEEDLE",
    station: "合成测试工位",
    reason: "合成测试：更换断针",
    quantity: 1,
    assetIds: ["asset-1"],
  };
  const asset = {
    id: "asset-1",
    workspace_id: workspaceId,
    name: "现场照片.png",
    media_type: "image/png",
    size: 4,
    storage_path: `${workspaceId}/user-1/asset-1.png`,
    created_at: "2026-10-15T00:00:00Z",
    sha256: "a".repeat(64),
  };
  const row = {
    id: "report-1",
    workspace_id: workspaceId,
    kind: input.kind,
    contract_number: input.contractNumber,
    material_number: input.materialNumber,
    station: input.station,
    reason: input.reason,
    quantity: input.quantity,
    asset_ids: input.assetIds,
    status: "submitted",
    fragments_recovered: false,
    version: 1,
    created_by: "user-1",
    created_at: "2026-10-15T00:00:00Z",
    updated_at: "2026-10-15T00:00:00Z",
    provenance: { contentOrigin: "user-imported" },
  };
  function setup(
    range: ReturnType<typeof vi.fn>,
    rpc: ReturnType<typeof vi.fn>,
  ) {
    const query = {
      select: () => query,
      order: () => query,
      eq: () => query,
      range,
    };
    vi.mocked(createClient).mockReturnValue({
      from: vi.fn().mockReturnValue(query),
      rpc,
    } as never);
    return createSupabaseServices(
      "https://example.supabase.co",
      "sb_publishable_example",
    );
  }

  it("附件预读失败时不写申领，避免落库后假失败", async () => {
    const range = vi.fn().mockResolvedValue({
      data: null,
      count: null,
      error: { message: "资产读取暂时失败" },
    });
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    const services = setup(range, rpc);

    await expect(
      services.operations.createReport(workspaceId, {
        ...input,
        kind: "consumable",
        assetIds: [],
      }),
    ).rejects.toThrow("资产读取暂时失败");

    expect(range).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("写入成功后不再读资产，网络中断仍返回已保存单据及照片", async () => {
    const calls: string[] = [];
    const range = vi.fn().mockImplementation(async () => {
      calls.push("read-assets");
      return { data: [asset], count: 1, error: null };
    });
    const rpc = vi.fn().mockImplementation(async () => {
      calls.push("create-report");
      range.mockRejectedValue(new Error("写入后网络中断"));
      return { data: row, error: null };
    });
    const services = setup(range, rpc);

    const saved = await services.operations.createReport(workspaceId, input);

    expect(saved).toMatchObject({
      id: row.id,
      status: "submitted",
      assets: [{ id: asset.id, name: asset.name, sha256: asset.sha256 }],
    });
    expect(calls).toEqual(["read-assets", "create-report"]);
    expect(range).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledExactlyOnceWith("fo_create_report", {
      p_workspace: workspaceId,
      p_input: input,
    });
  });

  it("断针引用的资产不是照片时仍在写入前拒绝", async () => {
    const range = vi.fn().mockResolvedValue({
      data: [{ ...asset, name: "说明.pdf", media_type: "application/pdf" }],
      count: 1,
      error: null,
    });
    const rpc = vi.fn();
    const services = setup(range, rpc);

    await expect(
      services.operations.createReport(workspaceId, input),
    ).rejects.toThrow("断针上报至少需要一张照片");

    expect(range).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });
});
