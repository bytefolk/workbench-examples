import { createTimeoutFetch } from "./network";
import type { AssetRef, DataServices, UserIdentity } from "./contracts";
import {
  validateAsset,
  validateReport,
  validateReportAttachments,
  validateVisit,
} from "../domain/rules";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
/** 企业 HTTP 服务使用 HttpOnly 会话 cookie；业务数据格式即 contracts.ts。 */
export function createHttpServices(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): DataServices {
  const boundedFetch = createTimeoutFetch(fetcher);
  const base = baseUrl.replace(/\/$/, "");
  const listeners = new Set<(user: UserIdentity | null) => void>();
  const notify = (user: UserIdentity | null) =>
    listeners.forEach((listener) => listener(user));
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    requestId?: string,
  ): Promise<T> {
    const form = body instanceof FormData;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Requested-With": "FactoryOperations",
    };
    if (body !== undefined && !form)
      headers["Content-Type"] = "application/json";
    if (requestId) headers["Idempotency-Key"] = requestId;
    const response = await boundedFetch(`${base}${path}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
    if (!response.ok) {
      if (
        response.status === 401 &&
        !["/auth/sign-in", "/auth/sign-up"].includes(path)
      )
        notify(null);
      const payload = await response.json().catch(() => null);
      throw new ApiError(
        payload?.message ||
          (response.status === 409
            ? "记录已更新，请刷新后重试。"
            : response.status === 403
              ? "没有执行此操作的权限。"
              : "服务请求失败，请稍后重试。"),
        response.status,
      );
    }
    return response.status === 204
      ? (undefined as T)
      : (response.json() as Promise<T>);
  }
  const workspace = (id: string) => `/workspaces/${encodeURIComponent(id)}`;
  return {
    provider: "http",
    identity: {
      async currentUser() {
        try {
          return await request<UserIdentity | null>("/session");
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) return null;
          throw error;
        }
      },
      async signIn(email, password) {
        const user = await request<UserIdentity>("/auth/sign-in", "POST", {
          email,
          password,
        });
        notify(user);
        return user;
      },
      async signUp(email, password) {
        const result = await request<{
          user: UserIdentity | null;
          needsEmailConfirmation: boolean;
        }>("/auth/sign-up", "POST", { email, password });
        if (!result.needsEmailConfirmation) notify(result.user);
        return result;
      },
      async signOut() {
        try {
          await request<void>("/auth/sign-out", "POST");
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) return;
          throw error;
        }
        notify(null);
      },
      onChange(listener) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    operations: {
      listWorkspaces: () => request("/workspaces"),
      createWorkspace: (name) => request("/workspaces", "POST", { name }),
      listMembers: (id) => request(`${workspace(id)}/members`),
      addMember: (id, email, role) =>
        request(`${workspace(id)}/members`, "POST", { email, role }),
      listReports: (id) => request(`${workspace(id)}/reports`),
      createReport: async (id, input) => {
        validateReport(input);
        if (input.kind === "broken_needle")
          validateReportAttachments(
            input,
            await request<AssetRef[]>(`${workspace(id)}/assets`),
          );
        return request(`${workspace(id)}/reports`, "POST", input);
      },
      transitionReport: (input) =>
        request(
          `/reports/${encodeURIComponent(input.reportId)}/transitions`,
          "POST",
          input,
          input.requestId,
        ),
      confirmRecovery: (input) =>
        request(
          `/reports/${encodeURIComponent(input.reportId)}/recovery`,
          "POST",
          input,
          input.requestId,
        ),
      listTimeline: (id) =>
        request(`/reports/${encodeURIComponent(id)}/timeline`),
      listVisits: (id) => request(`${workspace(id)}/visits`),
      createVisit: (id, input) => {
        validateVisit(input);
        return request(`${workspace(id)}/visits`, "POST", input);
      },
    },
    assets: {
      list: (id) => request(`${workspace(id)}/assets`),
      async upload(id, file) {
        validateAsset(file);
        const body = new FormData();
        body.append("file", file);
        return request<AssetRef>(`${workspace(id)}/assets`, "POST", body);
      },
      async signedUrl(asset) {
        return (
          await request<{ url: string }>(
            `/assets/${encodeURIComponent(asset.id)}/download-url`,
            "POST",
          )
        ).url;
      },
    },
  };
}
