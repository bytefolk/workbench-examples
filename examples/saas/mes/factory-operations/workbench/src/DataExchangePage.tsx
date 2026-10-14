import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Download,
  FileJson,
  FlaskConical,
  ScanLine,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type {
  AssetRef,
  DataServices,
  UserIdentity,
  Workspace,
} from "./data/contracts";
import {
  ledgerTables,
  type ImportPreview,
  type LedgerPackage,
  type LedgerRow,
  type RecognitionDraft,
} from "./data/exchange-contracts";
import {
  createLedgerTemplate,
  createMockRecognitionDraft,
  markDraftReviewed,
} from "./domain/exchange";
import { validateAsset } from "./domain/rules";
import { Empty, ErrorBanner, errorMessage } from "./ui";
import { SourceBadge } from "./SourceBadge";

const tableLabels: Record<string, string> = {
  factory: "工厂档案",
  reports: "生产申领",
  "report-events": "流转与回收记录",
  visits: "销售拜访",
};
const draftFields: Record<
  "reports" | "visits",
  { key: string; label: string; multiline?: boolean; numeric?: boolean }[]
> = {
  reports: [
    { key: "contractNumber", label: "合同号" },
    { key: "materialNumber", label: "物料编号" },
    { key: "station", label: "生产工位" },
    { key: "quantity", label: "申领数量", numeric: true },
    { key: "reason", label: "申领原因", multiline: true },
  ],
  visits: [
    { key: "customer", label: "客户名称" },
    { key: "visitedAt", label: "拜访时间（ISO 时间）" },
    { key: "summary", label: "拜访纪要", multiline: true },
    { key: "issues", label: "客户问题", multiline: true },
    { key: "nextStep", label: "下一步行动", multiline: true },
    { key: "followUpDate", label: "跟进日期（YYYY-MM-DD）" },
  ],
};

function downloadPackage(value: LedgerPackage, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataExchangePage({
  services,
  workspace,
  user,
  onPublished,
  onAssetUploaded,
}: {
  services: DataServices;
  workspace: Workspace;
  user: UserIdentity;
  onPublished: () => Promise<void>;
  onAssetUploaded: () => Promise<void>;
}) {
  const exchange = services.exchange;
  const owner = workspace.role === "owner";
  const [mode, setMode] = useState<"json" | "photo">("json");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [packageText, setPackageText] = useState("");
  const [fileName, setFileName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [ledgerType, setLedgerType] = useState<"reports" | "visits">("reports");
  const [draft, setDraft] = useState<RecognitionDraft | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState("");
  const active = useRef(true);
  const operation = useRef(0);
  const uploaded = useRef<{ file: File; asset: AssetRef } | null>(null);
  const commitRequest = useRef<{
    planId: string;
    revision: string;
    id: string;
  } | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      ++operation.current;
    };
  }, []);
  useEffect(() => {
    if (!photo) {
      setPhotoUrl("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  function invalidate() {
    ++operation.current;
    setPreview(null);
    setConfirmed(false);
    setReceipt("");
    setNotice("");
    setError("");
    commitRequest.current = null;
  }
  function start(label: string) {
    const id = ++operation.current;
    setBusy(label);
    setError("");
    setNotice("");
    setReceipt("");
    return () => active.current && operation.current === id;
  }
  async function exportSnapshot() {
    if (!exchange || !owner || busy) return;
    const current = start("正在读取一致快照…");
    try {
      const snapshot = await exchange.exportSnapshot(workspace.id);
      if (!current()) return;
      downloadPackage(
        snapshot,
        `factory-${workspace.id}-${snapshot.dataRevision ?? "snapshot"}.json`,
      );
      setNotice(
        "已导出当前工作区的完整业务快照。JSON 只含资产清单，文件正文仍在原资产平台。",
      );
    } catch (reason) {
      if (current()) setError(errorMessage(reason));
    } finally {
      if (current()) setBusy("");
    }
  }
  async function readFile(file?: File) {
    if (!file || busy) return;
    invalidate();
    setDraft(null);
    setReviewed(false);
    setPackageText("");
    setFileName("");
    const current = start("正在读取 JSON 文件…");
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("数据包不能超过 5 MB，请缩小文件后重试。");
      const text = await file.text();
      if (!current()) return;
      setPackageText(text);
      setFileName(file.name);
    } catch (reason) {
      if (current()) setError(errorMessage(reason));
    } finally {
      if (current()) setBusy("");
    }
  }
  async function recognize() {
    if (!exchange || !owner || !photo || busy) return;
    invalidate();
    setDraft(null);
    setReviewed(false);
    const current = start("正在上传照片到资产平台…");
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type))
        throw new Error("请选择 JPG、PNG 或 WebP 照片。");
      validateAsset(photo);
      let asset =
        uploaded.current?.file === photo ? uploaded.current.asset : null;
      if (!asset) {
        asset = await services.assets.upload(workspace.id, photo);
        if (!current()) return;
        uploaded.current = { file: photo, asset };
      }
      setBusy("正在准备模拟草稿…");
      const snapshot = await exchange.exportSnapshot(workspace.id);
      if (!current()) return;
      const value = createMockRecognitionDraft({
        workspace,
        user,
        asset,
        ledgerType,
        snapshot,
      });
      setDraft(value);
      await onAssetUploaded();
    } catch (reason) {
      if (current()) setError(errorMessage(reason));
    } finally {
      if (current()) setBusy("");
    }
  }
  function updateRow(row: LedgerRow, key: string, value: unknown) {
    if (!draft || busy) return;
    invalidate();
    setReviewed(false);
    setDraft({
      ...draft,
      package: {
        ...draft.package,
        tables: {
          ...draft.package.tables,
          [draft.ledgerType]: (
            draft.package.tables[draft.ledgerType] ?? []
          ).map((item) =>
            item.id === row.id
              ? { ...item, data: { ...item.data, [key]: value } }
              : item,
          ),
        },
      },
    });
  }
  async function inspect() {
    if (
      !exchange ||
      !owner ||
      busy ||
      (mode === "photo" && (!draft || !reviewed))
    )
      return;
    setPreview(null);
    setConfirmed(false);
    commitRequest.current = null;
    const current = start("正在校验完整候选数据…");
    try {
      const text =
        mode === "photo" && draft
          ? JSON.stringify(markDraftReviewed(draft))
          : packageText;
      if (!text.trim()) throw new Error("请先选择数据包。");
      const result = await exchange.previewImport(workspace.id, {
        packageText: text,
        mode: "replace",
        replaceScope: [...ledgerTables],
      });
      if (result.targetWorkspaceId !== workspace.id)
        throw new Error("预览返回了其他工作区的结果，请重新载入后再试。");
      if (current())
        setPreview(
          mode === "photo" &&
            draft &&
            result.expectedRevision !== draft.package.dataRevision
            ? {
                ...result,
                canCommit: false,
                planId: null,
                issues: [
                  ...result.issues,
                  {
                    table: null,
                    row: null,
                    field: "/dataRevision",
                    code: "STALE_PHOTO_DRAFT",
                    message:
                      "生成草稿后工作区已有新数据，请重新生成模拟草稿并再次核对，避免覆盖其他成员的更新。",
                  },
                ],
              }
            : result,
        );
    } catch (reason) {
      if (current()) setError(errorMessage(reason));
    } finally {
      if (current()) setBusy("");
    }
  }
  async function commit() {
    if (
      !exchange ||
      !owner ||
      !preview?.canCommit ||
      !preview.planId ||
      !confirmed ||
      busy
    )
      return;
    const current = start("正在原子替换工作区数据…");
    try {
      if (
        commitRequest.current?.planId !== preview.planId ||
        commitRequest.current.revision !== preview.expectedRevision
      )
        commitRequest.current = {
          planId: preview.planId,
          revision: preview.expectedRevision,
          id: crypto.randomUUID(),
        };
      const result = await exchange.commitImport(workspace.id, {
        planId: preview.planId,
        expectedRevision: preview.expectedRevision,
        requestId: commitRequest.current.id,
      });
      if (!current()) return;
      setPreview(null);
      setConfirmed(false);
      setDraft(null);
      setReviewed(false);
      setPackageText("");
      setFileName("");
      commitRequest.current = null;
      setReceipt(
        `已发布数据版本 ${result.revision}。工作区来源与业务页面将从服务端重新读取，照片的模拟识别标记继续保留。`,
      );
      await onPublished();
    } catch (reason) {
      if (current())
        setError(
          `${errorMessage(reason)} 已保留原预览与提交标识。可重试确认；若数据版本已变化，请重新预览。`,
        );
    } finally {
      if (current()) setBusy("");
    }
  }
  const rows = draft
    ? (draft.package.tables[draft.ledgerType] ?? []).filter((row) =>
        draft.rowIds.includes(row.id),
      )
    : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DATA EXCHANGE</span>
          <h1>数据接入</h1>
          <p>把台账带进工作区，先核对，再发布。</p>
        </div>
        {owner && exchange && (
          <button
            className="button secondary"
            disabled={!!busy}
            onClick={() => void exportSnapshot()}
          >
            <Download size={16} />
            导出完整快照
          </button>
        )}
      </div>
      {!owner ? (
        <div className="panel">
          <Empty
            title="数据替换由工作区所有者执行"
            description="你可以在各页面查看数据来源与业务记录。整包导出、拍照草稿及确认替换仅向所有者开放。"
          />
        </div>
      ) : !exchange ? (
        <div className="panel">
          <Empty
            title="当前数据平台尚未支持整包交换"
            description="请为当前数据提供方接入快照、预览和原子替换服务。工作区现有数据继续可用。"
          />
        </div>
      ) : (
        <div className="exchange-layout" aria-busy={!!busy}>
          {error && <ErrorBanner>{error}</ErrorBanner>}
          {notice && (
            <div className="info-note">
              <FileJson size={18} />
              <span>{notice}</span>
            </div>
          )}
          {receipt && (
            <div className="exchange-receipt" role="status">
              <CheckCircle2 size={21} />
              <div>
                <strong>整包替换已完成</strong>
                <p>{receipt}</p>
              </div>
            </div>
          )}
          <section className="panel exchange-panel">
            <div className="exchange-modes" aria-label="选择数据接入方式">
              <button
                aria-pressed={mode === "json"}
                disabled={!!busy}
                onClick={() => {
                  invalidate();
                  setMode("json");
                }}
              >
                <FileJson size={16} />
                JSON 数据包
              </button>
              <button
                aria-pressed={mode === "photo"}
                disabled={!!busy}
                onClick={() => {
                  invalidate();
                  setMode("photo");
                }}
              >
                <Camera size={16} />
                拍照台账 · 模拟
              </button>
            </div>
            <h2>
              {mode === "json" ? (
                <>
                  <Upload size={19} />
                  导入工作区快照
                </>
              ) : (
                <>
                  <ScanLine size={19} />
                  从照片准备台账草稿
                </>
              )}
            </h2>
            <p>
              {mode === "json"
                ? "使用本工作区导出的完整快照。读取文件与预览都不会改动当前业务数据；明确确认后才整包替换。"
                : "照片先保存到当前资产平台。当前使用固定规则生成合成草稿，不读取或识别照片内容；请逐项编辑核对，模拟来源会一直保留。"}
            </p>
            <ol className="exchange-steps">
              <li>
                <b>1</b>
                {mode === "json" ? "选择数据包" : "上传照片与编辑草稿"}
              </li>
              <li>
                <b>2</b>预览校验与删除影响
              </li>
              <li>
                <b>3</b>确认原子替换
              </li>
            </ol>
            {mode === "json" ? (
              <>
                <div className="exchange-input">
                  <FileJson size={28} strokeWidth={1.4} />
                  <div>
                    <strong>{fileName || "选择完整 JSON 数据包"}</strong>
                    <p>最多 5 MB · 保留原始文件校验重复键、字段和业务关联</p>
                  </div>
                  <label className="button secondary file-button">
                    <Upload size={15} />
                    {fileName ? "更换文件" : "选择 JSON"}
                    <input
                      type="file"
                      accept=".json,application/json"
                      aria-label="选择 JSON 数据包"
                      disabled={!!busy}
                      onChange={(event) => {
                        void readFile(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
                <div className="exchange-toolbar">
                  <button
                    className="button primary"
                    disabled={!!busy || !packageText}
                    onClick={() => void inspect()}
                  >
                    <ShieldCheck size={16} />
                    预览并校验
                  </button>
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() =>
                      downloadPackage(
                        createLedgerTemplate(workspace),
                        "factory-ledger-template.json",
                      )
                    }
                  >
                    下载格式模板
                  </button>
                </div>
                <p className="exchange-caption">
                  整包范围：工厂档案、申领、流转事件与拜访。空模板只说明格式，不可直接提交；请先导出当前快照，以导出包为填写基准，保留档案、流程历史和资产引用。拍照快速填报可使用上方模拟草稿。JSON
                  只含资产引用，不含文件正文；本版仅支持同一工作区还原。
                </p>
              </>
            ) : (
              <>
                <div className="form-stack">
                  <label>
                    台账类型
                    <select
                      aria-label="拍照台账类型"
                      value={ledgerType}
                      disabled={!!busy}
                      onChange={(event) => {
                        invalidate();
                        setDraft(null);
                        setReviewed(false);
                        setLedgerType(
                          event.target.value as "reports" | "visits",
                        );
                      }}
                    >
                      <option value="reports">生产申领</option>
                      <option value="visits">销售拜访</option>
                    </select>
                  </label>
                </div>
                <div className="exchange-input">
                  <Camera size={28} strokeWidth={1.4} />
                  <div>
                    <strong>{photo?.name ?? "拍摄或选择台账照片"}</strong>
                    <p>
                      JPG / PNG / WebP · 最大 20 MB · 上传后保存在工作区资产库
                    </p>
                  </div>
                  <label className="button secondary file-button">
                    <Camera size={15} />
                    选择照片
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      aria-label="选择台账照片"
                      disabled={!!busy}
                      onChange={(event) => {
                        invalidate();
                        setDraft(null);
                        setReviewed(false);
                        setPhoto(event.target.files?.[0] ?? null);
                      }}
                    />
                  </label>
                </div>
                <div className="exchange-toolbar">
                  <button
                    className="button primary"
                    disabled={!!busy || !photo}
                    onClick={() => void recognize()}
                  >
                    <FlaskConical size={16} />
                    上传并生成模拟草稿
                  </button>
                </div>
                {photoUrl && (
                  <figure className="ledger-photo-preview">
                    <img src={photoUrl} alt="待核对的台账原图" />
                    <figcaption>
                      对照原图逐项填写；模拟器不读取照片内容。
                    </figcaption>
                  </figure>
                )}
                {draft && (
                  <div className="recognition-draft">
                    <div className="draft-warning">
                      <FlaskConical size={20} />
                      <div>
                        <strong>模拟识别草稿 · 待人工核对</strong>
                        <br />
                        以下内容是合成占位，不能视为照片中的事实。修改或确认都不会把模拟识别升级为真实识别。
                      </div>
                    </div>
                    {draft.warnings.length > 0 && (
                      <ul className="exchange-caption">
                        {draft.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    )}
                    {rows.map((row, index) => (
                      <section className="draft-row" key={row.id}>
                        <div className="draft-row-heading">
                          <h3>草稿第 {index + 1} 行</h3>
                          <SourceBadge source={row.provenance} />
                        </div>
                        <div className="form-grid">
                          {draftFields[draft.ledgerType].map((field) => (
                            <label key={field.key}>
                              {field.label}
                              {field.multiline ? (
                                <textarea
                                  aria-label={`草稿 ${index + 1} ${field.label}`}
                                  value={String(row.data[field.key] ?? "")}
                                  disabled={!!busy}
                                  onChange={(event) =>
                                    updateRow(
                                      row,
                                      field.key,
                                      event.target.value,
                                    )
                                  }
                                  rows={3}
                                />
                              ) : (
                                <input
                                  aria-label={`草稿 ${index + 1} ${field.label}`}
                                  inputMode={
                                    field.numeric ? "numeric" : undefined
                                  }
                                  value={String(row.data[field.key] ?? "")}
                                  disabled={!!busy}
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    updateRow(
                                      row,
                                      field.key,
                                      field.numeric &&
                                        /^\d+$/.test(value) &&
                                        Number.isSafeInteger(Number(value))
                                        ? Number(value)
                                        : field.key === "followUpDate" && !value
                                          ? null
                                          : value,
                                    );
                                  }}
                                />
                              )}
                            </label>
                          ))}
                        </div>
                      </section>
                    ))}
                    <label className="exchange-check">
                      <input
                        type="checkbox"
                        checked={reviewed}
                        disabled={!!busy}
                        onChange={(event) => {
                          invalidate();
                          setReviewed(event.target.checked);
                        }}
                      />
                      <span>
                        我已逐项核对并编辑这些草稿，知晓来源仍为模拟识别。
                      </span>
                    </label>
                    <div className="exchange-toolbar">
                      <button
                        className="button primary"
                        disabled={!!busy || !reviewed}
                        onClick={() => void inspect()}
                      >
                        <ShieldCheck size={16} />
                        核对后预览整包
                      </button>
                    </div>
                    <p className="exchange-caption">
                      草稿在当前快照基础上加入新记录；预览会再次检查整个数据包。预览前后若有人修改工作区，旧计划不能覆盖新版本。
                    </p>
                  </div>
                )}
              </>
            )}
            {busy && (
              <p className="exchange-caption" role="status">
                {busy}
              </p>
            )}
          </section>
          {preview && (
            <section className="panel exchange-panel" aria-label="导入预览">
              <div className="exchange-preview-heading">
                <div>
                  <h2>
                    <ShieldCheck size={19} />
                    替换前，请核对影响
                  </h2>
                  <p>
                    {preview.sourceLabel} → {preview.targetLabel}
                    <br />
                    源工作区 {preview.sourceWorkspaceId ?? "未识别"} · 目标{" "}
                    {preview.targetWorkspaceId}
                    <br />
                    目标当前数据版本 {preview.expectedRevision}
                  </p>
                </div>
                <span
                  className={
                    preview.canCommit ? "role-chip" : "unavailable-chip"
                  }
                >
                  {preview.canCommit ? "校验通过 · 尚未发布" : "校验未通过"}
                </span>
              </div>
              <div className="table-scroll">
                <table className="exchange-table">
                  <thead>
                    <tr>
                      <th>逻辑表</th>
                      <th>当前</th>
                      <th>导入</th>
                      <th>替换后</th>
                      <th>删除</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.counts.map((count) => (
                      <tr key={count.table}>
                        <td>{tableLabels[count.table] ?? count.table}</td>
                        <td>{count.before}</td>
                        <td>{count.incoming}</td>
                        <td>{count.after}</td>
                        <td className="deletion-count">{count.removed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="exchange-caption">
                删除数量是将不再出现在正式业务表中的记录。资产库文件与工作区成员不会因本次数据包被清空。
              </p>
              {preview.issues.length > 0 && (
                <div className="exchange-errors" role="alert">
                  <h3>{preview.issues.length} 项问题需要修正</h3>
                  <ul>
                    {preview.issues.map((issue, index) => (
                      <li key={index}>
                        <strong>
                          {issue.table
                            ? (tableLabels[issue.table] ?? issue.table)
                            : "数据包"}
                          {issue.row != null ? ` · 第 ${issue.row} 行` : ""} ·{" "}
                          {issue.field || "/"}
                        </strong>
                        ：{issue.message}（{issue.code}）
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <ul className="exchange-caption">
                  {preview.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              )}
              {preview.canCommit && preview.planId && (
                <div className="exchange-confirmation">
                  <label className="exchange-check">
                    <input
                      type="checkbox"
                      aria-label="确认整包替换"
                      checked={confirmed}
                      disabled={!!busy}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                    <span>
                      我已核对目标工作区、所有表和删除数量，确认用此数据包替换当前业务数据。
                    </span>
                  </label>
                  <p>
                    建议先导出当前快照。确认后由服务端一次事务发布；提交失败时不会显示新来源标签。
                  </p>
                  <button
                    className="button primary"
                    disabled={!!busy || !confirmed}
                    onClick={() => void commit()}
                  >
                    <CheckCircle2 size={16} />
                    确认替换当前数据
                  </button>
                </div>
              )}
              <div className="exchange-toolbar">
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => void inspect()}
                >
                  重新预览
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
