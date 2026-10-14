import type {
  AssetRef,
  MemberRole,
  OperationReport,
  ReportInput,
  ReportStatus,
  VisitInput,
} from "../data/contracts";

export const reportStatusLabels: Record<ReportStatus, string> = {
  submitted: "待审批",
  approved: "已批准",
  delivering: "配送中",
  completed: "已完成",
  rejected: "已驳回",
};
export const roleLabels: Record<MemberRole, string> = {
  owner: "工作空间所有者",
  manager: "主管",
  operator: "现场员工",
  sales: "销售",
};
export const canManage = (role: MemberRole) =>
  role === "owner" || role === "manager";
export const canReport = (role: MemberRole) =>
  canManage(role) || role === "operator";
export const canVisit = (role: MemberRole) =>
  canManage(role) || role === "sales";
export const nextStatuses: Record<ReportStatus, ReportStatus[]> = {
  submitted: ["approved", "rejected"],
  approved: ["delivering"],
  delivering: ["completed"],
  completed: [],
  rejected: [],
};
export function assertTransition(
  report: Pick<
    OperationReport,
    "status" | "kind" | "fragmentsRecovered" | "version"
  >,
  status: ReportStatus,
  role: MemberRole,
  expectedVersion: number,
): void {
  if (!canManage(role)) throw new Error("只有主管或所有者可以处理上报。");
  if (report.version !== expectedVersion)
    throw new Error("记录已更新，请刷新后重试。");
  if (!nextStatuses[report.status].includes(status))
    throw new Error("当前状态不允许此操作。");
  if (
    status === "completed" &&
    report.kind === "broken_needle" &&
    !report.fragmentsRecovered
  )
    throw new Error("请先确认断针碎片已全部回收。");
}
const required = (value: string, label: string, max: number) => {
  if (!value.trim() || value.trim().length > max)
    throw new Error(`${label}不能为空且不得超过 ${max} 字。`);
};
export function validateReport(input: ReportInput): void {
  if (!["broken_needle", "consumable"].includes(input.kind))
    throw new Error("上报类型无效。");
  required(input.contractNumber, "合同号", 120);
  required(input.materialNumber, "物料编号", 120);
  required(input.station, "工位", 120);
  required(input.reason, "原因", 2000);
  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 100000
  )
    throw new Error("数量须为 1 至 100000 的整数。");
  if (input.kind === "broken_needle" && !input.assetIds.length)
    throw new Error("断针上报至少需要一张照片。");
  if (
    input.assetIds.length > 10 ||
    new Set(input.assetIds).size !== input.assetIds.length
  )
    throw new Error("附件最多 10 个，且不能重复。");
}
export function validateVisit(input: VisitInput): void {
  required(input.customer, "客户", 200);
  required(input.summary, "沟通纪要", 5000);
  required(input.nextStep, "下一步", 2000);
  if (!Number.isFinite(Date.parse(input.visitedAt)))
    throw new Error("拜访时间无效。");
  if (input.issues.length > 5000) throw new Error("问题描述不得超过 5000 字。");
  if (
    input.followUpDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(input.followUpDate) ||
      !Number.isFinite(Date.parse(input.followUpDate)) ||
      new Date(input.followUpDate).toISOString().slice(0, 10) !==
        input.followUpDate)
  )
    throw new Error("下次跟进日期无效。");
}
export const maxAssetBytes = 20 * 1024 * 1024;
export const allowedMediaTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "audio/mpeg",
];
export function validateAsset(
  file: Pick<File, "name" | "size" | "type">,
): void {
  required(file.name, "文件名", 240);
  if (file.size <= 0 || file.size > maxAssetBytes)
    throw new Error("文件必须大于 0 且不超过 20 MB。");
  if (!allowedMediaTypes.includes(file.type))
    throw new Error("支持 JPG、PNG、WebP、PDF、MP4 和 MP3 文件。");
}

export function validateReportAttachments(
  input: ReportInput,
  assets: AssetRef[],
): void {
  if (
    input.kind === "broken_needle" &&
    !assets.some(
      (asset) =>
        input.assetIds.includes(asset.id) &&
        ["image/jpeg", "image/png", "image/webp"].includes(asset.mediaType),
    )
  )
    throw new Error("断针上报至少需要一张照片。");
}
