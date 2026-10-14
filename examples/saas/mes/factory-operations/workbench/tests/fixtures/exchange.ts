import type {
  LedgerPackage,
  LedgerRow,
} from "../../src/data/exchange-contracts";
import type {
  AssetRef,
  UserIdentity,
  Workspace,
} from "../../src/data/contracts";

export const workspaceId = "10000000-0000-4000-8000-000000000001";
export const actorId = "20000000-0000-4000-8000-000000000001";
export const reportId = "30000000-0000-4000-8000-000000000001";
export const photoId = "40000000-0000-4000-8000-000000000001";
export const visitId = "50000000-0000-4000-8000-000000000001";
export const otherWorkspaceId = "10000000-0000-4000-8000-000000000002";

export const workspace: Workspace = {
  id: workspaceId,
  name: "合成车间交换测试",
  role: "owner",
  createdAt: "2026-10-15T00:00:00.000Z",
};
export const actor: UserIdentity = {
  id: actorId,
  email: "ledger-fixture@example.test",
};
export const photo: AssetRef = {
  id: photoId,
  workspaceId,
  name: "synthetic-evidence.png",
  mediaType: "image/png",
  size: 68,
  sha256: "ab".repeat(32),
  storagePath: `${workspaceId}/${actorId}/${photoId}.png`,
  createdAt: "2026-10-15T00:00:00.000Z",
};

/** 纯合成领域测试输入；摘要和元信息不能作为真实上传证明。 */
export function makeSnapshot(): LedgerPackage {
  const actions = [
    "submitted",
    "approved",
    "delivering",
    "recovery",
    "completed",
  ];
  const events: LedgerRow[] = actions.map((action, index) => ({
    id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    data: {
      reportId,
      actorId,
      action,
      note: `合成事件：${action}`,
      createdAt: `2026-10-15T00:0${index}:00.000Z`,
      requestId:
        index === 0
          ? null
          : `70000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      payload:
        index === 0
          ? null
          : { version: index, action, note: `合成事件：${action}` },
    },
    provenance: { contentOrigin: "synthetic" },
  }));
  return {
    schemaVersion: 1,
    packageKind: "snapshot",
    packageId: "80000000-0000-4000-8000-000000000001",
    datasetContract: { id: "factory-operations", version: 1 },
    dataRevision: "17",
    metadata: {
      contentOrigin: "mixed",
      storage: "shared",
      label: workspace.name,
      exportedAt: "2026-10-15T01:00:00.000Z",
    },
    exportScope: {
      completeness: "full",
      tables: ["factory", "reports", "report-events", "visits"],
    },
    tables: {
      factory: [
        {
          id: workspaceId,
          data: { name: workspace.name },
          provenance: { contentOrigin: "user-imported" },
        },
      ],
      reports: [
        {
          id: reportId,
          data: {
            kind: "broken_needle",
            contractNumber: "DEMO-CONTRACT-0001",
            materialNumber: "NEEDLE-0001",
            station: "合成 01 工位",
            reason: "仅用于领域测试的断针场景",
            quantity: 1,
            assetIds: [photoId],
            createdBy: actorId,
            createdAt: "2026-10-15T00:00:00.000Z",
            updatedAt: "2026-10-15T00:04:00.000Z",
            status: "completed",
            version: 5,
            fragmentsRecovered: true,
          },
          provenance: { contentOrigin: "synthetic" },
        },
      ],
      "report-events": events,
      visits: [
        {
          id: visitId,
          data: {
            customer: "合成客户",
            visitedAt: "2026-10-15T08:00:00+08:00",
            summary: "合成沟通纪要",
            issues: "合成待确认问题",
            nextStep: "下周复核样品",
            followUpDate: "2026-10-22",
            createdBy: actorId,
            createdAt: "2026-10-15T01:00:00.000Z",
          },
          provenance: { contentOrigin: "user-imported" },
        },
      ],
    },
    assets: [
      {
        id: photo.id,
        name: photo.name,
        mediaType: photo.mediaType,
        size: photo.size,
        sha256: photo.sha256!,
        reference: {
          storeId: "factory-operations-assets",
          objectId: photo.storagePath,
        },
      },
    ],
  };
}
