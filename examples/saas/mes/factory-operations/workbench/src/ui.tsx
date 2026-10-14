import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, Inbox, LoaderCircle, X } from "lucide-react";
import type {
  MemberRole,
  OperationReport,
  ReportStatus,
} from "./data/contracts";

export const statusLabels: Record<ReportStatus, string> = {
  submitted: "待审批",
  approved: "待发放",
  delivering: "待闭环",
  completed: "已完成",
  rejected: "已驳回",
};
export const roleLabels: Record<MemberRole, string> = {
  owner: "所有者",
  manager: "管理人员",
  operator: "生产人员",
  sales: "销售人员",
};
export function formatDate(value: string, time = false) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    ...(time ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}
export function fileSize(bytes: number) {
  if (!bytes) return "0 KB";
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作未完成，请稍后重试。";
}
export function canCloseReport(report: OperationReport) {
  return (
    report.status === "delivering" &&
    (report.kind !== "broken_needle" || report.fragmentsRecovered)
  );
}
export function filterReports(
  reports: OperationReport[],
  query: string,
  status: string,
  kind: string,
) {
  const needle = query.trim().toLowerCase();
  return reports.filter(
    (report) =>
      (status === "all" || report.status === status) &&
      (kind === "all" || report.kind === kind) &&
      (!needle ||
        [
          report.id,
          report.contractNumber,
          report.materialNumber,
          report.station,
          report.reason,
        ].some((value) => value.toLowerCase().includes(needle))),
  );
}
export function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span className={`status status-${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Inbox size={25} strokeWidth={1.5} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading({ label = "正在读取工作区…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={22} />
      <span>{label}</span>
    </div>
  );
}
export function ErrorBanner({
  children,
  retry,
}: {
  children: ReactNode;
  retry?: () => void;
}) {
  return (
    <div className="error-banner" role="alert">
      <span>{children}</span>
      {retry && (
        <button onClick={retry}>
          重试 <ArrowUpRight size={14} />
        </button>
      )}
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="关闭弹窗"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
