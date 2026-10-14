import { createTimeoutFetch } from "./network";
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
  const client = createClient(url, publishableKey, {
    db: { retry: false },
    global: { fetch: createTimeoutFetch() },
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
  return {
    provider: "supabase",
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
        if (input.kind === "broken_needle")
          validateReportAttachments(input, await listAssets(id));
        return loadReport(
          await rpc<ReportRow>("fo_create_report", {
            p_workspace: id,
            p_input: input,
          }),
        );
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
          }>(client, "fo_report_events", { report_id: id })
        ).map(
          (row): TimelineEntry => ({
            id: row.id,
            reportId: row.report_id,
            actorId: row.actor_id,
            action: row.action,
            note: row.note,
            createdAt: row.created_at,
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
        const { data: auth, error: authError } = await client.auth.getUser();
        fail(authError);
        if (!auth.user) throw new Error("请先登录。");
        const id = crypto.randomUUID(),
          extensions: Record<string, string> = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "application/pdf": "pdf",
            "video/mp4": "mp4",
            "audio/mpeg": "mp3",
          };
        const path = `${workspaceId}/${auth.user.id}/${id}.${extensions[file.type]}`;
        const { error: uploadError } = await client.storage
          .from(bucket)
          .upload(path, file, { upsert: false, contentType: file.type });
        fail(uploadError);
        try {
          return assetFromRow(
            await rpc<AssetRow>("fo_register_asset", {
              p_id: id,
              p_workspace: workspaceId,
              p_name: file.name,
              p_media_type: file.type,
              p_size: file.size,
              p_path: path,
            }),
          );
        } catch (error) {
          await client.storage.from(bucket).remove([path]);
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
