import type { AssetRef, UserIdentity, Workspace } from "./contracts";

export type ContentOrigin = "synthetic" | "user-imported" | "mixed";
export interface Provenance {
  contentOrigin: ContentOrigin;
  recognition?: {
    mode: "mock" | "connected";
    reviewStatus: "unreviewed" | "reviewed";
    sourceAssetIds: string[];
  };
}
export const ledgerTables = [
  "factory",
  "reports",
  "report-events",
  "visits",
] as const;
export type LedgerTable = (typeof ledgerTables)[number];
export interface LedgerRow {
  id: string;
  data: Record<string, unknown>;
  provenance: Provenance;
}
export interface LedgerAsset {
  id: string;
  name: string;
  mediaType: string;
  size: number;
  sha256: string;
  reference: { storeId: string; objectId: string };
}
export interface LedgerPackage {
  schemaVersion: 1;
  packageKind: "snapshot" | "template";
  packageId: string;
  datasetContract: { id: string; version: number };
  dataRevision: string | null;
  metadata: {
    contentOrigin: ContentOrigin;
    storage: "local" | "shared";
    label?: string;
    exportedAt?: string;
  };
  exportScope: {
    completeness: "full" | "partial";
    tables: LedgerTable[];
  } | null;
  tables: Partial<Record<LedgerTable, LedgerRow[]>>;
  assets: LedgerAsset[];
}
export interface DatasetState {
  workspaceId: string;
  label: string;
  revision: string;
  contentOrigin: ContentOrigin;
  storage: "local" | "shared";
  recognitionModes: ("mock" | "connected")[];
}
export interface ImportIssue {
  table: string | null;
  row: number | null;
  field: string;
  code: string;
  message: string;
}
export interface ImportCount {
  table: LedgerTable;
  before: number;
  incoming: number;
  after: number;
  removed: number;
}
export interface ImportPreview {
  planId: string | null;
  expectedRevision: string;
  sourceWorkspaceId: string | null;
  targetWorkspaceId: string;
  sourceLabel: string;
  targetLabel: string;
  counts: ImportCount[];
  issues: ImportIssue[];
  warnings: string[];
  canCommit: boolean;
}
export interface ImportRequest {
  /** 原文保留到可信服务端，不能在 JSON.parse 后丢失重复对象键。 */
  packageText: string;
  mode: "replace";
  replaceScope: LedgerTable[];
}
export interface ImportCommit {
  planId: string;
  expectedRevision: string;
  requestId: string;
}
export interface ImportResult {
  revision: string;
  contentOrigin: ContentOrigin;
  counts: ImportCount[];
}
export interface LedgerExchange {
  getDatasetState(workspaceId: string): Promise<DatasetState>;
  exportSnapshot(workspaceId: string): Promise<LedgerPackage>;
  previewImport(
    workspaceId: string,
    input: ImportRequest,
  ): Promise<ImportPreview>;
  commitImport(workspaceId: string, input: ImportCommit): Promise<ImportResult>;
}
export interface RecognitionInput {
  workspace: Workspace;
  user: UserIdentity;
  asset: AssetRef;
  ledgerType: "reports" | "visits";
  snapshot: LedgerPackage;
}
export interface RecognitionDraft {
  draftId: string;
  mode: "mock";
  sourceAssetId: string;
  ledgerType: "reports" | "visits";
  rowIds: string[];
  package: LedgerPackage;
  warnings: string[];
}
