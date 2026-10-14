import { createTimeoutFetch } from "./network";
import type {
  DatasetState,
  ImportPreview,
  ImportResult,
  LedgerPackage,
  Provenance,
} from "./exchange-contracts";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type {
  AssetRef,
  DataServices,
  MemberRole,
  OperationReport,
  ReportKind,
  ReportStatus,
  SalesVisit,
  TimelineEntry,
  UserIdentity,
} from "./contracts";
import {
  validateAsset,
  validateReport,
  validateReportAttachments,
  validateVisit,
} from "../domain/rules";

interface AssetRow {
  id: string;
  workspace_id: string;
  name: string;
  media_type: string;
  size: number;
  storage_path: string;
  created_at: string;
  sha256: string | null;
}
interface ReportRow {
  id: string;
  workspace_id: string;
  kind: ReportKind;
  contract_number: string;
  material_number: string;
  station: string;
  reason: string;
  quantity: number;
  asset_ids: string[];
  status: ReportStatus;
  version: number;
  fragments_recovered: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  provenance: Provenance;
}
interface VisitRow {
  id: string;
  workspace_id: string;
  customer: string;
  visited_at: string;
  summary: string;
  issues: string;
  next_step: string;
  follow_up_date: string | null;
  created_by: string;
  created_at: string;
  provenance: Provenance;
}
interface MemberRow {
  workspace_id: string;
  user_id: string;
  email: string;
  role: MemberRole;
}
interface WorkspaceRow {
  id: string;
  name: string;
  created_at: string;
}
const bucket = "factory-operations-assets";
const identity = (user: User | null): UserIdentity | null =>
  user ? { id: user.id, email: user.email || "" } : null;
const assetFromRow = (row: AssetRow): AssetRef => ({
  id: row.id,
  workspaceId: row.workspace_id,
  name: row.name,
  mediaType: row.media_type,
  size: Number(row.size),
  storagePath: row.storage_path,
  createdAt: row.created_at,
  sha256: row.sha256 || undefined,
});
const visitFromRow = (row: VisitRow): SalesVisit => ({
  id: row.id,
  workspaceId: row.workspace_id,
  customer: row.customer,
  visitedAt: row.visited_at,
  summary: row.summary,
  issues: row.issues,
  nextStep: row.next_step,
  followUpDate: row.follow_up_date,
  createdBy: row.created_by,
  createdAt: row.created_at,
  provenance: row.provenance,
});
const reportFromRow = (
  row: ReportRow,
  assets: AssetRef[],
): OperationReport => ({
  id: row.id,
  workspaceId: row.workspace_id,
  kind: row.kind,
  contractNumber: row.contract_number,
  materialNumber: row.material_number,
  station: row.station,
  reason: row.reason,
  quantity: row.quantity,
  assetIds: row.asset_ids,
  status: row.status,
  version: row.version,
  fragmentsRecovered: row.fragments_recovered,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  provenance: row.provenance,
  assets: assets.filter((asset) => row.asset_ids.includes(asset.id)),
});
function fail(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === "PT409" || error.code === "40001")
    throw new Error("记录已更新，请刷新后重试。");
  if (error.code === "23505")
    throw new Error("记录或请求标识已存在，请刷新检查。");
  throw new Error(error.message);
}
/** 分页直到完整读取；超过一万条明确报错，禁止默认 Data API 截断造成静默遗漏。 */
async function readAll<T>(
  client: SupabaseClient,
  table: string,
  filters: Record<string, string> = {},
  order = "created_at",
): Promise<T[]> {
  const rows: T[] = [],
    pageSize = 500;
  for (let offset = 0; ; offset = rows.length) {
    let query = client
      .from(table)
      .select("*", { count: "exact" })
      .order(order, { ascending: false });
    if (order !== "id" && table !== "fo_members") query = query.order("id");
    for (const [key, value] of Object.entries(filters))
      query = query.eq(key, value);
    const { data, error, count } = await query.range(
      offset,
      offset + pageSize - 1,
    );
    fail(error);
    rows.push(...((data || []) as T[]));
    if (rows.length > 10000)
      throw new Error(
        "记录超过 10000 条，请通过企业数据接口按范围查询后再打开。",
      );
    if (count === null)
      throw new Error("服务未返回分页总数，无法确认数据是否完整。");
    if (rows.length >= count) return rows;
    if (!data?.length) throw new Error("分页读取中断，请刷新后重试。");
  }
}
export function createSupabaseServices(
  url: string,
  publishableKey: string,
): DataServices {
  const fetchWithTimeout = createTimeoutFetch();
  const client = createClient(url, publishableKey, {
    db: { retry: false },
    global: { fetch: fetchWithTimeout },
    auth: {
      storageKey: `factory-operations-auth-${new URL(url).host}`,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  async function rpc<T>(
    name: string,
    input: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await client.rpc(name, input);
    fail(error);
    return data as T;
  }
  const listAssets = async (workspaceId: string) =>
    (
      await readAll<AssetRow>(client, "fo_assets", {
        workspace_id: workspaceId,
      })
    ).map(assetFromRow);
  const loadReport = async (row: ReportRow) =>
    reportFromRow(row, await listAssets(row.workspace_id));
  const hashBytes = async (bytes: ArrayBuffer) =>
    Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0"),
    ).join("");
  interface UploadIntent {
    id: string;
    path: string;
    attempted: boolean;
    uploaded: boolean;
    asset?: AssetRef;
  }
  // 仅同一个 File 对象、用户和工作区复用上传意图；用户显式重试才再次发送登记请求。
  const uploadIntents = new WeakMap<File, Map<string, UploadIntent>>();
  async function existingUpload(
    intent: UploadIntent,
    file: File,
    sha256: string,
  ): Promise<boolean> {
    const { data, error } = await client.storage
      .from(bucket)
      .download(intent.path);
    if (error || !data) return false;
    const bytes = await data.arrayBuffer();
    if (bytes.byteLength !== file.size || (await hashBytes(bytes)) !== sha256)
      throw new Error("同路径正文与本次文件不一致，请重新选择文件。");
    return true;
  }
  return {
    provider: "supabase",
    exchange: {
      getDatasetState: (workspaceId) =>
        rpc<DatasetState>("fo_dataset_state", { p_workspace: workspaceId }),
      async exportSnapshot(workspaceId) {
        // 旧资产没有摘要时，授权读取实际正文后补登记。最终快照由持工作区锁的 RPC 一次生成。
        const { data: auth, error } = await client.auth.getUser();
        fail(error);
        if (!auth.user) throw new Error("请先登录。");
        const { data: member, error: memberError } = await client
          .from("fo_members")
          .select("role")
          .eq("workspace_id", workspaceId)
          .eq("user_id", auth.user.id)
          .maybeSingle();
        fail(memberError);
        if (member?.role !== "owner")
          throw new Error("只有所有者可以导出完整工作区。");
        for (const asset of await listAssets(workspaceId)) {
          if (asset.sha256) continue;
          const { data, error: signedError } = await client.storage
            .from(bucket)
            .createSignedUrl(asset.storagePath, 300);
          fail(signedError);
          if (!data?.signedUrl) throw new Error("未能取得资产摘要读取授权。");
          const response = await fetchWithTimeout(data.signedUrl);
          if (!response.ok)
            throw new Error(`读取资产正文失败（${response.status}）。`);
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength !== asset.size)
            throw new Error("资产正文大小与登记不一致，不能导出。");
          await rpc("fo_set_asset_hash", {
            p_asset: asset.id,
            p_sha256: await hashBytes(bytes),
          });
        }
        return rpc<LedgerPackage>("fo_export_snapshot", {
          p_workspace: workspaceId,
        });
      },
      previewImport(workspaceId, input) {
        if (input.mode !== "replace")
          throw new Error("当前仅支持有完整范围声明的替换。");
        return rpc<ImportPreview>("fo_preview_import", {
          p_workspace: workspaceId,
          p_package_text: input.packageText,
          p_replace_scope: input.replaceScope,
        });
      },
      commitImport: (workspaceId, input) =>
        rpc<ImportResult>("fo_commit_import", {
          p_workspace: workspaceId,
          p_plan: input.planId,
          p_expected_revision: input.expectedRevision,
          p_request: input.requestId,
        }),
    },
    identity: {
      async currentUser() {
        const { data: session, error: sessionError } =
          await client.auth.getSession();
        fail(sessionError);
        if (!session.session) return null;
        const { data, error } = await client.auth.getUser();
        fail(error);
        return identity(data.user);
      },
      async signIn(email, password) {
        const { data, error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        fail(error);
        if (!data.user) throw new Error("登录未返回用户身份。");
        return identity(data.user)!;
      },
      async signUp(email, password) {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
        });
        fail(error);
        return {
          user: identity(data.user),
          needsEmailConfirmation: !data.session,
        };
      },
      async signOut() {
        const { error } = await client.auth.signOut();
        fail(error);
      },
      onChange(listener) {
        const { data } = client.auth.onAuthStateChange((_event, session) =>
          listener(identity(session?.user || null)),
        );
        return () => data.subscription.unsubscribe();
      },
    },
    operations: {
      async listWorkspaces() {
        const { data, error } = await client.auth.getUser();
        fail(error);
        if (!data.user) return [];
        const [workspaces, memberships] = await Promise.all([
          readAll<WorkspaceRow>(client, "fo_workspaces"),
          readAll<MemberRow>(
            client,
            "fo_members",
            { user_id: data.user.id },
            "workspace_id",
          ),
        ]);
        return workspaces.flatMap((workspace) => {
          const membership = memberships.find(
            (member) => member.workspace_id === workspace.id,
          );
          return membership
            ? [
                {
                  id: workspace.id,
                  name: workspace.name,
                  role: membership.role,
                  createdAt: workspace.created_at,
                },
              ]
            : [];
        });
      },
      async createWorkspace(name) {
        const row = await rpc<WorkspaceRow>("fo_create_workspace", {
          p_name: name,
        });
        return {
          id: row.id,
          name: row.name,
          role: "owner",
          createdAt: row.created_at,
        };
      },
      async listMembers(id) {
        return (
          await readAll<MemberRow>(
            client,
            "fo_members",
            { workspace_id: id },
            "user_id",
          )
        ).map((row) => ({
          userId: row.user_id,
          email: row.email,
          role: row.role,
        }));
      },
      async addMember(id, email, role) {
        await rpc("fo_add_member", {
          p_workspace: id,
          p_email: email.trim(),
          p_role: role,
        });
      },
      async listReports(id) {
        const [rows, assets] = await Promise.all([
          readAll<ReportRow>(client, "fo_reports", { workspace_id: id }),
          listAssets(id),
        ]);
        return rows.map((row) => reportFromRow(row, assets));
      },
      async createReport(id, input) {
        validateReport(input);
        const assets = await listAssets(id);
        if (input.kind === "broken_needle")
          validateReportAttachments(input, assets);
        const row = await rpc<ReportRow>("fo_create_report", {
          p_workspace: id,
          p_input: input,
        });
        // 保存成功后不再追加可能失败的展示查询，避免把已落库申领误报为提交失败。
        return reportFromRow(row, assets);
      },
      async transitionReport(input) {
        return loadReport(
          await rpc<ReportRow>("fo_change_report", {
            p_report: input.reportId,
            p_version: input.expectedVersion,
            p_action: input.status,
            p_note: input.note,
            p_request: input.requestId,
          }),
        );
      },
      async confirmRecovery(input) {
        return loadReport(
          await rpc<ReportRow>("fo_change_report", {
            p_report: input.reportId,
            p_version: input.expectedVersion,
            p_action: "recovery",
            p_note: input.note,
            p_request: input.requestId,
          }),
        );
      },
      async listTimeline(id) {
        return (
          await readAll<{
            id: string;
            report_id: string;
            actor_id: string;
            action: string;
            note: string;
            created_at: string;
            provenance: Provenance;
          }>(client, "fo_report_events", { report_id: id })
        ).map(
          (row): TimelineEntry => ({
            id: row.id,
            reportId: row.report_id,
            actorId: row.actor_id,
            action: row.action,
            note: row.note,
            createdAt: row.created_at,
            provenance: row.provenance,
          }),
        );
      },
      async listVisits(id) {
        return (
          await readAll<VisitRow>(
            client,
            "fo_visits",
            { workspace_id: id },
            "visited_at",
          )
        ).map(visitFromRow);
      },
      async createVisit(id, input) {
        validateVisit(input);
        return visitFromRow(
          await rpc<VisitRow>("fo_create_visit", {
            p_workspace: id,
            p_input: input,
          }),
        );
      },
    },
    assets: {
      list: listAssets,
      async upload(workspaceId, file) {
        validateAsset(file);
        const sha256 = await hashBytes(await file.arrayBuffer());
        const { data: auth, error: authError } = await client.auth.getUser();
        fail(authError);
        if (!auth.user) throw new Error("请先登录。");
        const extensions: Record<string, string> = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "application/pdf": "pdf",
          "video/mp4": "mp4",
          "audio/mpeg": "mp3",
        };
        const key = `${workspaceId}/${auth.user.id}`;
        let intents = uploadIntents.get(file);
        if (!intents) {
          intents = new Map();
          uploadIntents.set(file, intents);
        }
        let intent = intents.get(key);
        if (!intent) {
          const id = crypto.randomUUID();
          intent = {
            id,
            path: `${key}/${id}.${extensions[file.type]}`,
            attempted: false,
            uploaded: false,
          };
          intents.set(key, intent);
        }
        if (intent.asset) return intent.asset;
        const { id, path } = intent;
        if (!intent.uploaded && intent.attempted)
          intent.uploaded = await existingUpload(intent, file, sha256);
        if (!intent.uploaded) {
          intent.attempted = true;
          const { error: uploadError } = await client.storage
            .from(bucket)
            .upload(path, file, { upsert: false, contentType: file.type });
          if (uploadError && !(await existingUpload(intent, file, sha256)))
            fail(uploadError);
          intent.uploaded = true;
        }
        try {
          intent.asset = assetFromRow(
            await rpc<AssetRow>("fo_register_asset_with_hash", {
              p_id: id,
              p_workspace: workspaceId,
              p_name: file.name,
              p_media_type: file.type,
              p_size: file.size,
              p_path: path,
              p_sha256: sha256,
            }),
          );
          return intent.asset;
        } catch (error) {
          // RPC 响应丢失时，先按本次稳定 ID 回查已提交记录，不重放上传。
          try {
            const { data: registered, error: readError } = await client
              .from("fo_assets")
              .select("*")
              .eq("id", id)
              .maybeSingle();
            if (
              !readError &&
              registered?.storage_path === path &&
              registered.sha256 === sha256 &&
              registered.size === file.size &&
              registered.media_type === file.type
            ) {
              intent.asset = assetFromRow(registered as AssetRow);
              return intent.asset;
            }
          } catch {
            /* 网络仍不可用时保留原始错误。 */
          }
          // 查不到不代表原 RPC 已回滚：不确定失败时保留正文，避免删除仍在提交的资产。
          // 同 File 的显式重试复用上述路径/ID；孤立正文由部署方延迟回收策略处理。
          throw error;
        }
      },
      async signedUrl(asset) {
        const { data, error } = await client.storage
          .from(bucket)
          .createSignedUrl(asset.storagePath, 300);
        fail(error);
        if (!data?.signedUrl) throw new Error("未能取得下载授权。");
        return data.signedUrl;
      },
    },
  };
}
