import type { LedgerExchange, Provenance } from "./exchange-contracts";
/** 工厂运营工作台的稳定业务契约；适配器负责转换服务端格式。 */
export type MemberRole = "owner" | "manager" | "operator" | "sales";
export interface UserIdentity {
  id: string;
  email: string;
}
export interface IdentityProvider {
  currentUser(): Promise<UserIdentity | null>;
  signIn(email: string, password: string): Promise<UserIdentity>;
  signUp(
    email: string,
    password: string,
  ): Promise<{ user: UserIdentity | null; needsEmailConfirmation: boolean }>;
  signOut(): Promise<void>;
  onChange(listener: (user: UserIdentity | null) => void): () => void;
}
export interface Workspace {
  id: string;
  name: string;
  role: MemberRole;
  createdAt: string;
}
export interface WorkspaceMember {
  userId: string;
  email: string;
  role: MemberRole;
}
export type ReportKind = "broken_needle" | "consumable";
export type ReportStatus =
  | "submitted"
  | "approved"
  | "delivering"
  | "completed"
  | "rejected";
export interface AssetRef {
  id: string;
  workspaceId: string;
  name: string;
  mediaType: string;
  size: number;
  storagePath: string;
  createdAt: string;
  sha256?: string;
}
export interface ReportInput {
  kind: ReportKind;
  contractNumber: string;
  materialNumber: string;
  station: string;
  reason: string;
  quantity: number;
  assetIds: string[];
}
export interface OperationReport extends ReportInput {
  id: string;
  workspaceId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: ReportStatus;
  version: number;
  fragmentsRecovered: boolean;
  assets: AssetRef[];
  provenance?: Provenance;
}
export interface TransitionInput {
  reportId: string;
  expectedVersion: number;
  status: ReportStatus;
  note: string;
  requestId: string;
}
export interface RecoveryInput {
  reportId: string;
  expectedVersion: number;
  note: string;
  requestId: string;
}
export interface TimelineEntry {
  id: string;
  reportId: string;
  actorId: string;
  action: string;
  note: string;
  createdAt: string;
  provenance?: Provenance;
}
export interface VisitInput {
  customer: string;
  visitedAt: string;
  summary: string;
  issues: string;
  nextStep: string;
  followUpDate: string | null;
}
export interface SalesVisit extends VisitInput {
  id: string;
  workspaceId: string;
  createdBy: string;
  createdAt: string;
  provenance?: Provenance;
}
export interface OperationsRepository {
  listWorkspaces(): Promise<Workspace[]>;
  createWorkspace(name: string): Promise<Workspace>;
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  addMember(
    workspaceId: string,
    email: string,
    role: Exclude<MemberRole, "owner">,
  ): Promise<void>;
  listReports(workspaceId: string): Promise<OperationReport[]>;
  createReport(
    workspaceId: string,
    input: ReportInput,
  ): Promise<OperationReport>;
  transitionReport(input: TransitionInput): Promise<OperationReport>;
  confirmRecovery(input: RecoveryInput): Promise<OperationReport>;
  listTimeline(reportId: string): Promise<TimelineEntry[]>;
  listVisits(workspaceId: string): Promise<SalesVisit[]>;
  createVisit(workspaceId: string, input: VisitInput): Promise<SalesVisit>;
}
export interface AssetStore {
  list(workspaceId: string): Promise<AssetRef[]>;
  upload(workspaceId: string, file: File): Promise<AssetRef>;
  signedUrl(asset: AssetRef): Promise<string>;
}
export interface DataServices {
  identity: IdentityProvider;
  operations: OperationsRepository;
  assets: AssetStore;
  provider: string;
  /** 老提供方可暂不实现；界面必须明确显示未支持，不能回退成前端循环写入。 */
  exchange?: LedgerExchange;
}
export interface DataConfiguration {
  provider: string;
  options?: Record<string, string>;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  apiBaseUrl?: string;
}
