import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  ImagePlus,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Scissors,
  X,
} from "lucide-react";
import type {
  AssetRef,
  DataServices,
  OperationReport,
  ReportKind,
  ReportStatus,
  TimelineEntry,
  Workspace,
} from "./data/contracts";
import {
  canCloseReport,
  Empty,
  ErrorBanner,
  errorMessage,
  filterReports,
  formatDate,
  Loading,
  Modal,
  StatusBadge,
  statusLabels,
} from "./ui";
import { maxAssetBytes, validateAsset, validateReport } from "./domain/rules";

export function ReportTable({
  reports,
  onSelect,
}: {
  reports: OperationReport[];
  onSelect: (report: OperationReport) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="report-table">
        <thead>
          <tr>
            <th>事项 / 物料</th>
            <th>合同号</th>
            <th>工位</th>
            <th>提交时间</th>
            <th>当前状态</th>
            <th>
              <span className="sr-only">查看</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.id} onClick={() => onSelect(report)}>
              <td>
                <button
                  className="row-title"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(report);
                  }}
                >
                  <span
                    className={`kind-icon ${report.kind === "broken_needle" ? "needle" : ""}`}
                  >
                    {report.kind === "broken_needle" ? (
                      <Scissors size={18} />
                    ) : (
                      <Package size={18} />
                    )}
                  </span>
                  <span>
                    <strong>
                      {report.kind === "broken_needle"
                        ? "断针补领"
                        : "耗材申领"}
                    </strong>
                    <small>
                      {report.materialNumber} · {report.quantity} 件
                    </small>
                  </span>
                </button>
              </td>
              <td>{report.contractNumber}</td>
              <td>{report.station}</td>
              <td className="muted">{formatDate(report.createdAt, true)}</td>
              <td>
                <StatusBadge status={report.status} />
              </td>
              <td>
                <ArrowUpRight size={17} className="muted" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportsPage({
  reports,
  canCreate,
  onCreate,
  onSelect,
}: {
  reports: OperationReport[];
  canCreate: boolean;
  onCreate: () => void;
  onSelect: (report: OperationReport) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const filtered = filterReports(reports, query, status, kind);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PRODUCTION OPERATIONS</span>
          <h1>工厂申领</h1>
          <p>从现场上报到回收完成，每一步都有记录。</p>
        </div>
        {canCreate && (
          <button className="button primary" onClick={onCreate}>
            <Plus size={17} /> 新建申领
          </button>
        )}
      </div>
      <div className="panel">
        <div className="filter-bar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="搜索申领"
              placeholder="搜索合同号、物料、工位或原因…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            aria-label="申领类型"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="all">全部类型</option>
            <option value="broken_needle">断针补领</option>
            <option value="consumable">耗材申领</option>
          </select>
          <select
            aria-label="申领状态"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="status-tabs">
          <button
            className={status === "all" ? "active" : ""}
            onClick={() => setStatus("all")}
          >
            全部事项 <span>{reports.length}</span>
          </button>
          {(
            [
              "submitted",
              "approved",
              "delivering",
              "completed",
            ] as ReportStatus[]
          ).map((value) => (
            <button
              className={status === value ? "active" : ""}
              key={value}
              onClick={() => setStatus(value)}
            >
              {statusLabels[value]}{" "}
              <span>
                {reports.filter((report) => report.status === value).length}
              </span>
            </button>
          ))}
        </div>
        {filtered.length ? (
          <ReportTable reports={filtered} onSelect={onSelect} />
        ) : (
          <Empty
            title={
              query || status !== "all" || kind !== "all"
                ? "没有匹配的申领"
                : "从第一张申领单开始"
            }
            description={
              reports.length
                ? "试试其他合同号、物料编号或筛选条件。"
                : "现场提交后，管理人员可以审批、发放，并记录回收情况。"
            }
            action={
              canCreate && !reports.length ? (
                <button className="button secondary" onClick={onCreate}>
                  <Plus size={15} /> 新建申领
                </button>
              ) : undefined
            }
          />
        )}
        <div className="panel-footnote">
          共 {filtered.length} 条记录{" "}
          <span>按提交时间倒序 · 数据来自当前工作区</span>
        </div>
      </div>
    </>
  );
}

export function ReportForm({
  services,
  workspace,
  onClose,
  onCreated,
}: {
  services: DataServices;
  workspace: Workspace;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [kind, setKind] = useState<ReportKind>("broken_needle");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("");
  const uploadedFiles = useRef(new Map<File, AssetRef>());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (kind === "broken_needle" && !files.length)
        throw new Error("断针补领至少需要一张现场照片。");
      const fields = {
        kind,
        contractNumber: String(form.get("contractNumber")).trim(),
        materialNumber: String(form.get("materialNumber")).trim(),
        station: String(form.get("station")).trim(),
        reason: String(form.get("reason")).trim(),
        quantity: Number(form.get("quantity")),
      };
      validateReport({
        ...fields,
        assetIds: files.map((_, index) => `pending-${index}`),
      });
      const uploaded: AssetRef[] = [];
      for (let index = 0; index < files.length; index += 1) {
        setStage(`正在上传图片 ${index + 1}/${files.length}…`);
        let asset = uploadedFiles.current.get(files[index]);
        if (!asset) {
          asset = await services.assets.upload(workspace.id, files[index]);
          uploadedFiles.current.set(files[index], asset);
        }
        uploaded.push(asset);
      }
      setStage("正在提交申领…");
      await services.operations.createReport(workspace.id, {
        ...fields,
        assetIds: uploaded.map((asset) => asset.id),
      });
      await onCreated();
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="新建工厂申领"
      description="补齐现场信息，后续审批和发放更顺畅。"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="kind-choice">
          <button
            type="button"
            className={kind === "broken_needle" ? "selected" : ""}
            onClick={() => setKind("broken_needle")}
          >
            <Scissors size={20} />
            <span>
              <strong>断针补领</strong>
              <small>需回收确认后闭环</small>
            </span>
          </button>
          <button
            type="button"
            className={kind === "consumable" ? "selected" : ""}
            onClick={() => setKind("consumable")}
          >
            <Package size={20} />
            <span>
              <strong>耗材申领</strong>
              <small>生产物料与日常耗材</small>
            </span>
          </button>
        </div>
        <div className="form-grid">
          <label>
            合同号
            <input
              name="contractNumber"
              required
              maxLength={120}
              placeholder="输入关联生产合同号"
            />
          </label>
          <label>
            物料编号
            <input
              name="materialNumber"
              required
              maxLength={120}
              placeholder="输入针型或耗材编号"
            />
          </label>
          <label>
            工位
            <input
              name="station"
              required
              maxLength={120}
              placeholder="例如：A 线 03 工位"
            />
          </label>
          <label>
            申领数量
            <input
              name="quantity"
              type="number"
              min="1"
              max="100000"
              step="1"
              defaultValue="1"
              required
            />
          </label>
        </div>
        <label>
          {kind === "broken_needle" ? "断针情况 / 申领原因" : "申领原因"}
          <textarea
            name="reason"
            required
            rows={3}
            maxLength={2000}
            placeholder="说明现场情况、发生原因和需要补领的物料…"
          />
        </label>
        <label className="upload-zone">
          <ImagePlus size={24} />
          <strong>
            添加现场图片{kind === "broken_needle" ? "（必填）" : ""}
          </strong>
          <span>支持 JPG、PNG、WebP · 最多 10 张 · 单张不超过 20 MB</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              try {
                if (
                  selected.length > 10 ||
                  selected.some((file) => file.size > maxAssetBytes)
                )
                  throw new Error("最多选择 10 张图片，且单张不超过 20 MB。");
                for (const file of selected) {
                  validateAsset(file);
                  if (!file.type.startsWith("image/"))
                    throw new Error("现场图片仅支持 JPG、PNG、WebP。");
                }
                setError("");
                setFiles(selected);
              } catch (reason) {
                setError(errorMessage(reason));
                event.target.value = "";
              }
            }}
          />
        </label>
        {files.length > 0 && (
          <div className="file-chips">
            {files.map((file, index) => (
              <span key={`${file.name}-${index}`}>
                {file.name}
                <button
                  type="button"
                  aria-label={`移除 ${file.name}`}
                  onClick={() =>
                    setFiles(files.filter((_, position) => position !== index))
                  }
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        {kind === "broken_needle" && (
          <div className="info-note">
            <ShieldCheck size={17} />
            <span>断针补领需要由管理人员确认碎片回收，才能完成闭环。</span>
          </div>
        )}
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? stage : "提交申领"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ReportDetail({
  report: initial,
  services,
  workspace,
  onClose,
  onUpdated,
  onPreview,
}: {
  report: OperationReport;
  services: DataServices;
  workspace: Workspace;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onPreview: (asset: AssetRef) => void;
}) {
  const [report, setReport] = useState(initial);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ReportStatus | "recovery" | null>(null);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const manager = workspace.role === "owner" || workspace.role === "manager";
  useEffect(() => {
    let active = true;
    setLoading(true);
    services.operations
      .listTimeline(report.id)
      .then((items) => {
        if (active) setTimeline(items);
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [services, report.id, report.version]);
  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const note = String(values.get("note")).trim();
      const signature = JSON.stringify([
        report.id,
        report.version,
        action,
        note,
      ]);
      if (request.current?.signature !== signature)
        request.current = { signature, id: crypto.randomUUID() };
      const input = {
        reportId: report.id,
        expectedVersion: report.version,
        note,
        requestId: request.current.id,
      };
      const updated =
        action === "recovery"
          ? await services.operations.confirmRecovery(input)
          : await services.operations.transitionReport({
              ...input,
              status: action,
            });
      setReport(updated);
      setAction(null);
      request.current = null;
      await onUpdated();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  const actionLabel =
    action === "recovery"
      ? "确认断针回收"
      : action === "approved"
        ? "审批通过"
        : action === "delivering"
          ? "确认发放"
          : action === "completed"
            ? "完成闭环"
            : "驳回申领";
  const timelineLabels: Record<string, string> = {
    created: "提交申领",
    submitted: "提交申领",
    approved: "审批通过",
    delivering: "物料已发放",
    completed: "完成闭环",
    rejected: "申领已驳回",
    recovery: "确认断针回收",
    recovered: "确认断针回收",
    fragments_recovered: "确认断针回收",
  };
  return (
    <Modal
      title={report.kind === "broken_needle" ? "断针补领详情" : "耗材申领详情"}
      description={`记录 ${report.id.slice(0, 8).toUpperCase()}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="detail-status">
        <StatusBadge status={report.status} />
        <span className="muted">
          创建于 {formatDate(report.createdAt, true)}
        </span>
      </div>
      <dl className="detail-grid">
        <div>
          <dt>合同号</dt>
          <dd>{report.contractNumber}</dd>
        </div>
        <div>
          <dt>物料编号</dt>
          <dd>{report.materialNumber}</dd>
        </div>
        <div>
          <dt>生产工位</dt>
          <dd>{report.station}</dd>
        </div>
        <div>
          <dt>申领数量</dt>
          <dd>{report.quantity} 件</dd>
        </div>
      </dl>
      <div className="detail-block">
        <h3>申领原因</h3>
        <p className="preserve-lines">{report.reason}</p>
      </div>
      {report.kind === "broken_needle" && (
        <div
          className={report.fragmentsRecovered ? "success-banner" : "info-note"}
        >
          <ShieldCheck size={18} />
          <span>
            {report.fragmentsRecovered
              ? "已确认断针碎片回收"
              : "断针碎片尚未确认回收，暂不能完成闭环。"}
          </span>
        </div>
      )}
      {report.assets.length > 0 && (
        <div className="detail-block">
          <h3>现场图片 · {report.assets.length}</h3>
          <div className="attachment-list">
            {report.assets.map((asset) => (
              <button key={asset.id} onClick={() => onPreview(asset)}>
                <ImagePlus size={16} />
                {asset.name}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </div>
      )}
      {manager &&
        !["completed", "rejected"].includes(report.status) &&
        !action && (
          <div className="detail-actions">
            {report.status === "submitted" && (
              <>
                <button
                  className="button primary"
                  onClick={() => setAction("approved")}
                >
                  <CheckCircle2 size={16} /> 审批通过
                </button>
                <button
                  className="button secondary danger"
                  onClick={() => setAction("rejected")}
                >
                  驳回
                </button>
              </>
            )}
            {report.status === "approved" && (
              <button
                className="button primary"
                onClick={() => setAction("delivering")}
              >
                <Package size={16} /> 确认发放
              </button>
            )}
            {report.kind === "broken_needle" && !report.fragmentsRecovered && (
              <button
                className="button secondary"
                onClick={() => setAction("recovery")}
              >
                <ShieldCheck size={16} /> 确认回收
              </button>
            )}
            {report.status === "delivering" && (
              <button
                className="button primary"
                disabled={!canCloseReport(report)}
                onClick={() => setAction("completed")}
              >
                <CheckCircle2 size={16} /> 完成闭环
              </button>
            )}
          </div>
        )}
      {action && (
        <form className="action-note form-stack" onSubmit={transition}>
          <label>
            {actionLabel} · 处理说明
            <textarea
              name="note"
              rows={2}
              required
              maxLength={1000}
              placeholder={
                action === "recovery"
                  ? "记录碎片数量和回收检查情况…"
                  : "记录本次处理情况，便于后续追溯…"
              }
            />
          </label>
          <div className="form-actions">
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              取消
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "正在保存…" : actionLabel}
            </button>
          </div>
        </form>
      )}
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div className="detail-block">
        <h3>
          <ClipboardList size={16} /> 活动记录
        </h3>
        {loading ? (
          <Loading label="正在加载活动记录…" />
        ) : timeline.length ? (
          <ol className="timeline">
            {timeline.map((entry) => (
              <li key={entry.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>
                    {timelineLabels[entry.action] ?? entry.action}
                  </strong>
                  <time>{formatDate(entry.createdAt, true)}</time>
                  <p>{entry.note || "已记录此次操作"}</p>
                  <small>操作人 {entry.actorId.slice(0, 8)}</small>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">暂无活动记录。</p>
        )}
      </div>
    </Modal>
  );
}
