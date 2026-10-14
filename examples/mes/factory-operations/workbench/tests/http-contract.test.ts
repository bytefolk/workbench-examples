import { describe, expect, it, vi } from "vitest";
import { ApiError, createHttpServices } from "../src/data/http";
import type { AssetRef } from "../src/data/contracts";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const user = { id: "u1", email: "synthetic@example.test" };
const asset: AssetRef = {
  id: "a1",
  workspaceId: "w1",
  name: "photo.png",
  mediaType: "image/png",
  size: 4,
  storagePath: "w1/u1/a1.png",
  createdAt: "2026-10-14T00:00:00Z",
};
describe("企业 HTTP 适配契约", () => {
  it("登录使用cookie凭据与JSON，请求完成才广播身份，注销可取消监听", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(user))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const services = createHttpServices(
        "https://factory.example.test/api/v1/",
        fetcher as typeof fetch,
      ),
      listener = vi.fn();
    const off = services.identity.onChange(listener);
    expect(
      await services.identity.signIn(user.email, "temporary-password"),
    ).toEqual(user);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://factory.example.test/api/v1/auth/sign-in",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          email: user.email,
          password: "temporary-password",
        }),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Requested-With": "FactoryOperations",
        }),
      }),
    );
    expect(listener).toHaveBeenCalledWith(user);
    off();
    await services.identity.signOut();
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("未登录401返回null，但服务端错误不能假装已退出", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ message: "暂时不可用" }, 503));
    const services = createHttpServices("/api/v1", fetcher as typeof fetch);
    expect(await services.identity.currentUser()).toBeNull();
    await expect(services.identity.currentUser()).rejects.toThrow("暂时不可用");
  });
  it("状态提交携带expectedVersion和一致的幂等键，409原样报告失败", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}, 409));
    const services = createHttpServices("/api/v1", fetcher as typeof fetch);
    const input = {
      reportId: "report/1",
      expectedVersion: 3,
      status: "completed" as const,
      note: "配送完成",
      requestId: "request-1",
    };
    await expect(
      services.operations.transitionReport(input),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/reports/report%2F1/transitions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
        headers: expect.objectContaining({ "Idempotency-Key": "request-1" }),
      }),
    );
  });
  it("真实文件以multipart上传且不手写boundary，授权链接从服务端取得", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(asset))
      .mockResolvedValueOnce(
        json({ url: "https://files.example.test/signed" }),
      );
    const services = createHttpServices("/api/v1", fetcher as typeof fetch);
    expect(
      await services.assets.upload(
        "w1",
        new File(["test"], "photo.png", { type: "image/png" }),
      ),
    ).toEqual(asset);
    const options = fetcher.mock.calls[0][1] as RequestInit;
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.headers).not.toHaveProperty("Content-Type");
    expect(await services.assets.signedUrl(asset)).toBe(
      "https://files.example.test/signed",
    );
    expect(fetcher.mock.calls[1][0]).toBe("/api/v1/assets/a1/download-url");
  });
  it("断针提交前读取资产照片类型，非照片禁止写入", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(json([{ ...asset, mediaType: "application/pdf" }]));
    const services = createHttpServices("/api/v1", fetcher as typeof fetch);
    await expect(
      services.operations.createReport("w1", {
        kind: "broken_needle",
        contractNumber: "TEST",
        materialNumber: "N1",
        station: "A1",
        reason: "断裂",
        quantity: 1,
        assetIds: ["a1"],
      }),
    ).rejects.toThrow("照片");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/workspaces/w1/assets");
  });
  it("成员添加与拜访按工作空间路由，不使用数据库专属字段", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json([]));
    const services = createHttpServices("/api/v1", fetcher as typeof fetch);
    await services.operations.addMember("space/1", user.email, "operator");
    await services.operations.listVisits("space/1");
    expect(fetcher.mock.calls[0][0]).toBe(
      "/api/v1/workspaces/space%2F1/members",
    );
    expect(fetcher.mock.calls[0][1].body).toBe(
      JSON.stringify({ email: user.email, role: "operator" }),
    );
    expect(fetcher.mock.calls[1][0]).toBe(
      "/api/v1/workspaces/space%2F1/visits",
    );
  });
});

describe("企业HTTP会话失效", () => {
  it("业务请求401清空身份，已过期会话仍可退出", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}, 401)),
      listener = vi.fn();
    const services = createHttpServices("/api/v1", fetcher as typeof fetch);
    services.identity.onChange(listener);
    await expect(services.operations.listWorkspaces()).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(listener).toHaveBeenLastCalledWith(null);
    await expect(services.identity.signOut()).resolves.toBeUndefined();
    expect(listener).toHaveBeenLastCalledWith(null);
  });
  it("输错密码不会广播一次身份变更", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}, 401)),
      listener = vi.fn();
    const services = createHttpServices("/api/v1", fetcher as typeof fetch);
    services.identity.onChange(listener);
    await expect(
      services.identity.signIn(user.email, "wrong"),
    ).rejects.toBeInstanceOf(ApiError);
    expect(listener).not.toHaveBeenCalled();
  });
});
