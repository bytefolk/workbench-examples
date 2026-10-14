import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServices } from "../src/data/supabase";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  user: vi.fn(),
  from: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  signed: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: mocks.rpc,
    auth: { getUser: mocks.user },
    from: mocks.from,
    storage: {
      from: () => ({
        upload: mocks.upload,
        remove: mocks.remove,
        createSignedUrl: mocks.signed,
        download: mocks.download,
      }),
    },
  }),
}));
const workspaceId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const assetId = "10000000-0000-4000-8000-000000000003";
const bytes = new Uint8Array([137, 80, 78, 71]);
// 独立计算的固定字节摘要，避免用被测 WebCrypto 路径生成预期值。
const sha256 =
  "0f4636c78f65d3639ece5a064b5ae753e3408614a14fb18ab4d7540d2c248543";
const asset = {
  id: assetId,
  workspace_id: workspaceId,
  name: "原始照片.png",
  media_type: "image/png",
  size: bytes.byteLength,
  storage_path: `${workspaceId}/${userId}/${assetId}.png`,
  created_at: "2026-10-15T00:00:00Z",
  sha256: null as string | null,
};
let role: string, assets: (typeof asset)[], fetcher: ReturnType<typeof vi.fn>;
const services = () =>
  createSupabaseServices("https://example.supabase.co", "sb_publishable_test");
beforeEach(() => {
  vi.resetAllMocks();
  role = "owner";
  assets = [{ ...asset }];
  mocks.user.mockResolvedValue({
    data: { user: { id: userId, email: "test@example.test" } },
    error: null,
  });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.download.mockResolvedValue({
    data: null,
    error: { message: "not found" },
  });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.signed.mockResolvedValue({
    data: { signedUrl: "https://example.supabase.co/signed/photo" },
    error: null,
  });
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      order: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: { role }, error: null }),
      range: async () => ({
        data: table === "fo_assets" ? assets : [],
        count: assets.length,
        error: null,
      }),
    };
    return query;
  });
  mocks.rpc.mockImplementation(
    async (name: string, args: Record<string, unknown>) => ({
      data:
        name === "fo_register_asset_with_hash"
          ? {
              ...asset,
              id: args.p_id,
              storage_path: args.p_path,
              sha256: args.p_sha256,
            }
          : { revision: "10" },
      error: null,
    }),
  );
  fetcher = vi.fn(
    async () =>
      new Response(bytes, { headers: { "content-type": "image/png" } }),
  );
  vi.stubGlobal("fetch", fetcher);
});

describe("Supabase 交换边界", () => {
  it("登记结果未知保留正文，同文件显式重试复用 ID/path 且不重复上传", async () => {
    const service = services(),
      file = new File([bytes], "原始照片.png", { type: "image/png" });
    mocks.rpc.mockRejectedValueOnce(new Error("超时但事务可能仍在提交"));
    await expect(service.assets.upload(workspaceId, file)).rejects.toThrow(
      "超时",
    );
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledOnce();
    const result = await service.assets.upload(workspaceId, file);
    expect(result.sha256).toBe(sha256);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.rpc.mock.calls[0][1]).toEqual(mocks.rpc.mock.calls[1][1]);
    expect(await service.assets.upload(workspaceId, file)).toEqual(result);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it("上传回包丢失时下载同路径并验实际字节，成功后继续同ID登记", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "上传响应丢失" } });
    mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    const result = await services().assets.upload(
      workspaceId,
      new File([bytes], "原始照片.png", { type: "image/png" }),
    );
    expect(result.sha256).toBe(sha256);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("上传登记回包丢失时按同ID读取已提交记录，不重复上传或删文件", async () => {
    let registered: Record<string, unknown> | null = null;
    mocks.rpc.mockImplementation(
      async (_name: string, args: Record<string, unknown>) => {
        registered = {
          ...asset,
          id: args.p_id,
          storage_path: args.p_path,
          sha256: args.p_sha256,
        };
        throw new Error("响应丢失");
      },
    );
    mocks.from.mockImplementation(() => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: registered, error: null }),
      };
      return query;
    });
    const result = await services().assets.upload(
      workspaceId,
      new File([bytes], "原始照片.png", { type: "image/png" }),
    );
    expect(result.sha256).toBe(sha256);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("上传计算实际字节 SHA-256 并通过原子登记 RPC 保存", async () => {
    const result = await services().assets.upload(
      workspaceId,
      new File([bytes], "原始照片.png", { type: "image/png" }),
    );
    expect(result.sha256).toBe(sha256);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "fo_register_asset_with_hash",
      expect.objectContaining({
        p_sha256: sha256,
        p_size: 4,
        p_media_type: "image/png",
      }),
    );
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("旧资产授权读取正文补摘要后才请求最终一致快照", async () => {
    const result = await services().exchange!.exportSnapshot(workspaceId);
    expect(result).toEqual({ revision: "10" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.supabase.co/signed/photo",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual([
      "fo_set_asset_hash",
      "fo_export_snapshot",
    ]);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "fo_set_asset_hash", {
      p_asset: assetId,
      p_sha256: sha256,
    });
  });
  it("已登记摘要的资产不重新下载，快照由 RPC 返回", async () => {
    assets[0].sha256 = sha256;
    await services().exchange!.exportSnapshot(workspaceId);
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.signed).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("fo_export_snapshot", {
      p_workspace: workspaceId,
    });
  });
  it("旧正文大小不一致时不登记摘要或导出", async () => {
    fetcher.mockResolvedValue(new Response(new Uint8Array([1])));
    await expect(
      services().exchange!.exportSnapshot(workspaceId),
    ).rejects.toThrow("大小");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("非所有者在下载旧正文之前拒绝完整导出", async () => {
    role = "operator";
    await expect(
      services().exchange!.exportSnapshot(workspaceId),
    ).rejects.toThrow("所有者");
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.signed).not.toHaveBeenCalled();
  });
  it("预览保留原始 JSON 文本供服务器检测重复键", async () => {
    const packageText = '{"schemaVersion":1,"schemaVersion":1}';
    await services().exchange!.previewImport(workspaceId, {
      packageText,
      mode: "replace",
      replaceScope: ["factory"],
    });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("fo_preview_import", {
      p_workspace: workspaceId,
      p_package_text: packageText,
      p_replace_scope: ["factory"],
    });
  });
  it("提交使用计划/版本/请求 ID，冲突直接返回且不自动重试", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PT409", message: "stale" },
    });
    await expect(
      services().exchange!.commitImport(workspaceId, {
        planId: assetId,
        expectedRevision: "9",
        requestId: userId,
      }),
    ).rejects.toThrow("刷新");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("fo_commit_import", {
      p_workspace: workspaceId,
      p_plan: assetId,
      p_expected_revision: "9",
      p_request: userId,
    });
  });
});
