import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canReport,
  canVisit,
  maxAssetBytes,
  validateAsset,
  validateReport,
  validateReportAttachments,
  validateVisit,
} from "../src/domain/rules";
import type { AssetRef, ReportInput, VisitInput } from "../src/data/contracts";
const report: ReportInput = {
  kind: "broken_needle",
  contractNumber: "TEST-2026",
  materialNumber: "NEEDLE-01",
  station: "A-01",
  reason: "针尖断裂",
  quantity: 1,
  assetIds: ["photo-1"],
};
const visit: VisitInput = {
  customer: "合成客户",
  visitedAt: "2026-10-14T09:00:00+08:00",
  summary: "核对交货期",
  issues: "",
  nextStep: "补充报价",
  followUpDate: "2026-10-16",
};
const image: AssetRef = {
  id: "photo-1",
  workspaceId: "w1",
  name: "evidence.png",
  mediaType: "image/png",
  size: 100,
  storagePath: "w1/u1/photo.png",
  createdAt: "2026-10-14T00:00:00Z",
};
describe("业务边界", () => {
  it("断针没有回收记录不能关闭；回收后允许主管关闭", () => {
    const current = {
      status: "delivering" as const,
      kind: "broken_needle" as const,
      fragmentsRecovered: false,
      version: 3,
    };
    expect(() => assertTransition(current, "completed", "manager", 3)).toThrow(
      "碎片",
    );
    expect(() =>
      assertTransition(
        { ...current, fragmentsRecovered: true },
        "completed",
        "manager",
        3,
      ),
    ).not.toThrow();
  });
  it("禁止跨越状态、旧版本操作和现场员工审批", () => {
    const current = {
      status: "submitted" as const,
      kind: "consumable" as const,
      fragmentsRecovered: false,
      version: 1,
    };
    expect(() => assertTransition(current, "completed", "owner", 1)).toThrow(
      "状态",
    );
    expect(() => assertTransition(current, "approved", "manager", 0)).toThrow(
      "刷新",
    );
    expect(() => assertTransition(current, "approved", "operator", 1)).toThrow(
      "主管",
    );
    expect(canReport("sales")).toBe(false);
    expect(canVisit("operator")).toBe(false);
  });
  it("断针需要实际关联照片，PDF或未选中的照片不满足条件", () => {
    expect(() => validateReport({ ...report, assetIds: [] })).toThrow("照片");
    expect(() =>
      validateReportAttachments(report, [
        { ...image, mediaType: "application/pdf" },
      ]),
    ).toThrow("照片");
    expect(() =>
      validateReportAttachments(report, [{ ...image, id: "other" }]),
    ).toThrow("照片");
    expect(() => validateReportAttachments(report, [image])).not.toThrow();
    expect(() =>
      validateReport({ ...report, kind: "consumable", assetIds: [] }),
    ).not.toThrow();
  });
  it("限制异常数量、空字段、重复附件和附件数量", () => {
    for (const quantity of [0, -1, 1.5, 100001, Number.NaN])
      expect(() => validateReport({ ...report, quantity })).toThrow("数量");
    expect(() => validateReport({ ...report, reason: " " })).toThrow("原因");
    expect(() => validateReport({ ...report, assetIds: ["a", "a"] })).toThrow(
      "重复",
    );
    expect(() =>
      validateReport({
        ...report,
        assetIds: Array.from({ length: 11 }, (_, i) => String(i)),
      }),
    ).toThrow("10");
  });
  it("拒绝无效日期和超范围文件", () => {
    for (const followUpDate of [
      "2026-99-99",
      "2026-02-30",
      "2025-02-29",
      "not-a-date",
    ])
      expect(() => validateVisit({ ...visit, followUpDate })).toThrow("日期");
    expect(() =>
      validateVisit({ ...visit, followUpDate: "2028-02-29" }),
    ).not.toThrow();
    expect(() => validateVisit({ ...visit, visitedAt: "invalid" })).toThrow(
      "时间",
    );
    expect(() =>
      validateAsset({
        name: "photo.png",
        size: maxAssetBytes + 1,
        type: "image/png",
      }),
    ).toThrow("20 MB");
    expect(() =>
      validateAsset({ name: "script.svg", size: 12, type: "image/svg+xml" }),
    ).toThrow("支持");
    expect(() =>
      validateAsset({ name: "empty.png", size: 0, type: "image/png" }),
    ).toThrow("大于 0");
  });
});
