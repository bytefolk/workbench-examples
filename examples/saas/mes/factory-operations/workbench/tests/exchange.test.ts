import { describe, expect, it } from "vitest";
import {
  aggregateOrigin,
  createLedgerTemplate,
  createMockRecognitionDraft,
  markDraftReviewed,
  maxPackageBytes,
  parseLedgerPackage,
  validateLedgerImport,
} from "../src/domain/exchange";
import type {
  LedgerPackage,
  LedgerTable,
} from "../src/data/exchange-contracts";
import {
  actor,
  makeSnapshot,
  otherWorkspaceId,
  photo,
  photoId,
  reportId,
  workspace,
  workspaceId,
} from "./fixtures/exchange";

const allTables: LedgerTable[] = [
  "factory",
  "reports",
  "report-events",
  "visits",
];

it("UUID大小写不能掩盖重复记录或改写既有来源，且不修改输入", () => {
  const current = makeSnapshot();
  current.tables.visits![0].id = "abcdef01-0000-4000-8000-000000000001";
  const duplicate = structuredClone(current);
  duplicate.tables.visits!.push({
    ...structuredClone(duplicate.tables.visits![0]),
    id: current.tables.visits![0].id.toUpperCase(),
  });
  expect(
    check(duplicate, current).issues.some(
      (issue) => issue.code === "duplicate-id",
    ),
  ).toBe(true);
  const changed = structuredClone(current);
  changed.tables.visits![0].id = changed.tables.visits![0].id.toUpperCase();
  changed.tables.visits![0].provenance.contentOrigin = "synthetic";
  changed.metadata.contentOrigin = "synthetic";
  const original = structuredClone(changed);
  expect(
    check(changed, current).issues.some(
      (issue) => issue.code === "provenance-change",
    ),
  ).toBe(true);
  expect(changed).toEqual(original);
});
function scoped(snapshot: LedgerPackage, tables: LedgerTable[]): LedgerPackage {
  const result = structuredClone(snapshot);
  result.tables = Object.fromEntries(
    tables.map((table) => [table, result.tables[table]!]),
  );
  result.exportScope = { completeness: "full", tables };
  result.metadata.contentOrigin = aggregateOrigin(
    Object.values(result.tables).flat(),
  );
  return result;
}
function check(
  packet: LedgerPackage,
  current = makeSnapshot(),
  scope = allTables,
) {
  return validateLedgerImport(packet, current, scope);
}

it("事件顺序和报告时间按Postgres微秒精度校验", () => {
  const reversed = makeSnapshot();
  reversed.tables.reports![0].data.createdAt = "2026-10-15T00:00:00.000003Z";
  reversed.tables["report-events"]![0].data.createdAt =
    "2026-10-15T00:00:00.000003Z";
  reversed.tables["report-events"]![1].data.createdAt =
    "2026-10-15T00:00:00.000002Z";
  expect(check(reversed).issues.some((issue) => issue.code === "history")).toBe(
    true,
  );
  const mismatch = makeSnapshot();
  mismatch.tables.reports![0].data.updatedAt = "2026-10-15T00:04:00.000001Z";
  expect(check(mismatch).issues.some((issue) => issue.code === "history")).toBe(
    true,
  );
});
function reject(
  packet: LedgerPackage,
  current = makeSnapshot(),
  scope = allTables,
) {
  const result = check(packet, current, scope);
  expect(result.candidate).toBeNull();
  expect(result.issues.length).toBeGreaterThan(0);
  for (const issue of result.issues) {
    expect(issue).toEqual(
      expect.objectContaining({
        table: expect.toSatisfy(
          (value: unknown) => value === null || typeof value === "string",
        ),
        row: expect.toSatisfy(
          (value: unknown) =>
            value === null || (Number.isInteger(value) && Number(value) >= 1),
        ),
        field: expect.any(String),
        code: expect.any(String),
        message: expect.any(String),
      }),
    );
  }
  return result;
}

describe("交换包解析与非执行模板", () => {
  it("合法合成快照经过序列化与解析保留全部业务、事件、来源和资产", () => {
    const packet = makeSnapshot();
    expect(parseLedgerPackage(JSON.stringify(packet))).toEqual(packet);
    const result = check(packet);
    expect(result.issues).toEqual([]);
    expect(result.candidate?.tables).toEqual(packet.tables);
    expect(result.candidate?.assets).toEqual(packet.assets);
  });

  it("空模板是准备材料，不能提交或用作清库", () => {
    const packet = createLedgerTemplate(workspace);
    expect(packet.packageKind).toBe("template");
    expect(packet.tables).toEqual({});
    expect(packet.dataRevision).toBeNull();
    expect(packet.exportScope).toBeNull();
    expect(packet.assets).toEqual([]);
    reject(packet);
  });

  it.each([
    (text: string) => text.replace('"quantity":1', '"quantity":1,"quantity":2'),
    (text: string) =>
      text.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
    (text: string) =>
      text.replace(
        '"contentOrigin":"mixed"',
        '"contentOrigin":"mixed","contentOrigin":"synthetic"',
      ),
  ])("拒绝重复对象键，而不是由 JSON.parse 静默保留最后值", (duplicate) => {
    expect(() =>
      parseLedgerPackage(duplicate(JSON.stringify(makeSnapshot()))),
    ).toThrow();
  });

  it("超过 5 MiB 的原文及超过 40 层嵌套均拒绝", () => {
    const oversized =
      JSON.stringify(makeSnapshot()) + " ".repeat(maxPackageBytes);
    expect(() => parseLedgerPackage(oversized)).toThrow(
      "整包 JSON 不能超过 5 MB。",
    );
    const nested = '{"nested":'.repeat(41) + "null" + "}".repeat(41);
    expect(() => parseLedgerPackage(nested)).toThrow("JSON 嵌套层级过深。");
  });
  it("拒绝未知版本、未知业务契约和未声明业务表", () => {
    const unknownVersion = makeSnapshot();
    (unknownVersion as unknown as { schemaVersion: number }).schemaVersion = 2;
    reject(unknownVersion);
    const unknownContract = makeSnapshot();
    unknownContract.datasetContract.id = "other-ledger";
    reject(unknownContract);
    const unknownTable = makeSnapshot();
    (unknownTable.tables as Record<string, unknown>).inventory = [];
    reject(unknownTable);
  });
});

describe("替换范围与最终候选库", () => {
  it("允许完整同工作区恢复，保留事件的历史操作者、请求与payload", () => {
    const packet = makeSnapshot();
    const result = check(packet);
    expect(result.issues).toEqual([]);
    expect(result.candidate?.tables["report-events"]).toEqual(
      packet.tables["report-events"],
    );
    expect(result.candidate?.tables.visits).toEqual(packet.tables.visits);
  });

  it("显式空表只清除范围内表，保留范围外数据并准确给出删除数量", () => {
    const current = makeSnapshot();
    const scope: LedgerTable[] = ["factory", "visits"];
    const packet = scoped(current, scope);
    packet.tables.visits = [];
    const result = check(packet, current, scope);
    expect(result.issues).toEqual([]);
    expect(result.candidate?.tables.visits).toEqual([]);
    expect(result.candidate?.tables.reports).toEqual(current.tables.reports);
    expect(result.candidate?.tables["report-events"]).toEqual(
      current.tables["report-events"],
    );
    expect(
      result.counts.find((count) => count.table === "visits"),
    ).toMatchObject({
      before: 1,
      incoming: 0,
      after: 0,
      removed: 1,
    });
  });

  it("范围内漏表、空范围、不含工厂身份或scope不相等均拒绝", () => {
    const missing = makeSnapshot();
    delete missing.tables.visits;
    reject(missing);
    reject(makeSnapshot(), makeSnapshot(), []);
    reject(scoped(makeSnapshot(), ["visits"]), makeSnapshot(), ["visits"]);
    reject(makeSnapshot(), makeSnapshot(), ["factory", "reports"]);
  });

  it("partial 导出不能伪装成整表替换", () => {
    const packet = makeSnapshot();
    packet.exportScope!.completeness = "partial";
    reject(packet);
  });

  it("删除报告时也检查保留事件，不能只验证传入的新表", () => {
    const scope: LedgerTable[] = ["factory", "reports"];
    const packet = scoped(makeSnapshot(), scope);
    packet.tables.reports = [];
    reject(packet, makeSnapshot(), scope);
  });

  it("最后一行无效时返回整包失败并保留原始行号，不修改任一输入", () => {
    const current = makeSnapshot();
    const packet = structuredClone(current);
    const bad = structuredClone(packet.tables.visits![0]);
    bad.id = "50000000-0000-4000-8000-000000000002";
    bad.data.followUpDate = "2026-02-30";
    packet.tables.visits!.push(bad);
    const beforeCurrent = structuredClone(current);
    const beforePacket = structuredClone(packet);
    const result = reject(packet, current);
    expect(
      result.issues.some(
        (issue) => issue.table === "visits" && issue.row === 2,
      ),
    ).toBe(true);
    expect(current).toEqual(beforeCurrent);
    expect(packet).toEqual(beforePacket);
  });

  it("重复ID即使字段不同也拒绝，未知业务列不会静默丢弃", () => {
    const duplicate = makeSnapshot();
    duplicate.tables.visits!.push({
      ...structuredClone(duplicate.tables.visits![0]),
      data: { ...duplicate.tables.visits![0].data, summary: "不能覆盖原纪要" },
    });
    reject(duplicate);
    const extra = makeSnapshot();
    extra.tables.reports![0].data.stockBalance = 100;
    reject(extra);
  });
});

describe("核心业务事实", () => {
  it.each([0, -1, 1.5, 100001, "1", "", Number.NaN, Number.POSITIVE_INFINITY])(
    "申领数量 %s 不能被默认值、取整或类型转换修正后导入",
    (quantity) => {
      const packet = makeSnapshot();
      packet.tables.reports![0].data.quantity = quantity;
      reject(packet);
    },
  );

  it.each([
    ["visitedAt", "2026-02-30T08:00:00Z"],
    ["visitedAt", "2026-10-15"],
    ["followUpDate", "2026-02-29"],
    ["followUpDate", "2026-13-01"],
  ])("拒绝不合法的日历/精度：%s=%s", (field, value) => {
    const packet = makeSnapshot();
    packet.tables.visits![0].data[field] = value;
    reject(packet);
  });

  it("合法闰日可以导入，合同和物料前导零保持原值", () => {
    const packet = makeSnapshot();
    packet.tables.visits![0].data.followUpDate = "2028-02-29";
    packet.tables.reports![0].data.contractNumber = "000012";
    packet.tables.reports![0].data.materialNumber = "000034";
    const result = check(packet);
    expect(result.issues).toEqual([]);
    expect(result.candidate?.tables.reports?.[0].data.contractNumber).toBe(
      "000012",
    );
    expect(result.candidate?.tables.reports?.[0].data.materialNumber).toBe(
      "000034",
    );
  });

  it("完成断针必须有回收事实与有效照片，普通PDF不能替代照片", () => {
    const unrecovered = makeSnapshot();
    unrecovered.tables.reports![0].data.fragmentsRecovered = false;
    reject(unrecovered);
    const noPhoto = makeSnapshot();
    noPhoto.tables.reports![0].data.assetIds = [];
    reject(noPhoto);
    const pdf = makeSnapshot();
    pdf.assets[0].mediaType = "application/pdf";
    pdf.assets[0].name = "evidence.pdf";
    reject(pdf, structuredClone(pdf));
  });

  it("事件必须还原状态与版本，不能跳步、漏回收或有悬空事件", () => {
    const jumped = makeSnapshot();
    jumped.tables["report-events"]![1].data.action = "completed";
    reject(jumped);
    const missingRecovery = makeSnapshot();
    missingRecovery.tables["report-events"] = missingRecovery.tables[
      "report-events"
    ]!.filter((row) => row.data.action !== "recovery");
    reject(missingRecovery);
    const badVersion = makeSnapshot();
    badVersion.tables.reports![0].data.version = 4;
    reject(badVersion);
    const dangling = makeSnapshot();
    dangling.tables["report-events"]![0].data.reportId =
      "30000000-0000-4000-8000-000000000099";
    reject(dangling);
  });
});

describe("本轮可移植范围与来源", () => {
  it("不允许将另一工作区的快照按显示名称套入当前工作区", () => {
    const packet = makeSnapshot();
    packet.tables.factory![0].id = otherWorkspaceId;
    reject(packet);
  });

  it("业务引用未声明、未知或被改写的资产拒绝，不伪造已迁移文件", () => {
    const missing = makeSnapshot();
    missing.assets = [];
    reject(missing);
    const changedHash = makeSnapshot();
    changedHash.assets[0].sha256 = "cd".repeat(32);
    reject(changedHash);
    const foreignAsset = makeSnapshot();
    foreignAsset.assets[0].reference.objectId =
      otherWorkspaceId + "/foreign.png";
    reject(foreignAsset);
    const extraAsset = makeSnapshot();
    extraAsset.assets.push({
      ...structuredClone(extraAsset.assets[0]),
      id: "40000000-0000-4000-8000-000000000099",
    });
    reject(extraAsset);
  });

  it("备份后新增无关资产不阻止旧备份恢复，候选库保留当前资产", () => {
    const packet = makeSnapshot();
    const current = structuredClone(packet);
    const later = {
      ...structuredClone(current.assets[0]),
      id: "40000000-0000-4000-8000-000000000002",
      name: "later-photo.png",
      sha256: "cd".repeat(32),
      reference: {
        ...current.assets[0].reference,
        objectId: `${workspaceId}/later-photo.png`,
      },
    };
    current.assets.push(later);
    const result = check(packet, current);
    expect(result.issues).toEqual([]);
    expect(result.candidate?.assets).toEqual(current.assets);
    expect(result.candidate?.tables).toEqual(packet.tables);
    expect(packet.assets).toHaveLength(1);
  });

  it("包中业务行引用当前存在但包未声明的资产仍须拒绝", () => {
    const current = makeSnapshot();
    const later = {
      ...structuredClone(current.assets[0]),
      id: "40000000-0000-4000-8000-000000000002",
      name: "later-photo.png",
      sha256: "cd".repeat(32),
      reference: {
        ...current.assets[0].reference,
        objectId: `${workspaceId}/later-photo.png`,
      },
    };
    current.assets.push(later);
    const packet = makeSnapshot();
    packet.tables.reports![0].data.assetIds = [photoId, later.id];
    reject(packet, current);
  });

  it("替换范围外保留行的资产按当前清单校验，不强迫旧包声明其引用", () => {
    const current = makeSnapshot();
    const later = {
      ...structuredClone(current.assets[0]),
      id: "40000000-0000-4000-8000-000000000002",
      name: "later-photo.png",
      sha256: "cd".repeat(32),
      reference: {
        ...current.assets[0].reference,
        objectId: `${workspaceId}/later-photo.png`,
      },
    };
    current.assets.push(later);
    current.tables.reports![0].data.assetIds = [photoId, later.id];
    const scope: LedgerTable[] = ["factory", "visits"];
    const packet = scoped(makeSnapshot(), scope);
    const result = check(packet, current, scope);
    expect(result.issues).toEqual([]);
    expect(result.candidate?.tables.reports).toEqual(current.tables.reports);
    expect(result.candidate?.assets).toEqual(current.assets);
  });
  it("包元信息不能把混合来源行声明为全合成或全用户提供", () => {
    const packet = makeSnapshot();
    packet.metadata.contentOrigin = "user-imported";
    reject(packet);
    packet.metadata.contentOrigin = "synthetic";
    reject(packet);
    expect(aggregateOrigin(Object.values(makeSnapshot().tables).flat())).toBe(
      "mixed",
    );
  });

  it("已有模拟识别行不能经同ID替换删掉mock来源", () => {
    const current = makeSnapshot();
    current.tables.reports![0].provenance.recognition = {
      mode: "mock",
      reviewStatus: "reviewed",
      sourceAssetIds: [photoId],
    };
    const packet = structuredClone(current);
    delete packet.tables.reports![0].provenance.recognition;
    reject(packet, current);
  });

  it("mock只增加待核对草稿，不改原快照或把报告直接设为完成", () => {
    const snapshot = makeSnapshot();
    const before = structuredClone(snapshot);
    const draft = createMockRecognitionDraft({
      workspace,
      user: actor,
      asset: photo,
      ledgerType: "reports",
      snapshot,
    });
    expect(draft.mode).toBe("mock");
    expect(draft.sourceAssetId).toBe(photoId);
    expect(draft.rowIds.length).toBeGreaterThan(0);
    const rows = draft.package.tables.reports!.filter((row) =>
      draft.rowIds.includes(row.id),
    );
    expect(rows).toHaveLength(draft.rowIds.length);
    for (const row of rows) {
      expect(row.data.status).toBe("submitted");
      expect(row.data.fragmentsRecovered).toBe(false);
      expect(row.provenance).toMatchObject({
        contentOrigin: "synthetic",
        recognition: {
          mode: "mock",
          reviewStatus: "unreviewed",
          sourceAssetIds: [photoId],
        },
      });
    }
    expect(snapshot).toEqual(before);
    expect(
      draft.package.tables.reports!.find((row) => row.id === reportId),
    ).toEqual(snapshot.tables.reports![0]);
  });

  it.each(["reports", "visits"] as const)(
    "人工确认%s草稿仍保留mock及合成来源，并可序列化往返",
    (ledgerType) => {
      const draft = createMockRecognitionDraft({
        workspace,
        user: actor,
        asset: photo,
        ledgerType,
        snapshot: makeSnapshot(),
      });
      const before = structuredClone(draft);
      const reviewed = markDraftReviewed(draft);
      const rows = reviewed.tables[ledgerType]!.filter((row) =>
        draft.rowIds.includes(row.id),
      );
      for (const row of rows) {
        expect(row.provenance.contentOrigin).toBe("synthetic");
        expect(row.provenance.recognition).toEqual({
          mode: "mock",
          reviewStatus: "reviewed",
          sourceAssetIds: [photoId],
        });
      }
      expect(parseLedgerPackage(JSON.stringify(reviewed))).toEqual(reviewed);
      expect(draft).toEqual(before);
    },
  );
});
