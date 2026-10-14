import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Database,
  FileImage,
  FileText,
  FolderOpen,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import type {
  AssetRef,
  DataServices,
  MemberRole,
  SalesVisit,
  Workspace,
  WorkspaceMember,
} from "./data/contracts";
import { ConnectionSettings } from "./ConnectionSettings";
import {
  Empty,
  ErrorBanner,
  errorMessage,
  fileSize,
  formatDate,
  Loading,
  Modal,
  roleLabels,
} from "./ui";
import { allowedMediaTypes, validateAsset } from "./domain/rules";

export function VisitsPage({
  visits,
  canCreate,
  onCreate,
}: {
  visits: SalesVisit[];
  canCreate: boolean;
  onCreate: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = visits.filter((visit) =>
    [visit.customer, visit.summary, visit.issues, visit.nextStep].some(
      (value) => value.toLowerCase().includes(query.toLowerCase().trim()),
    ),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CUSTOMER FOLLOW-UP</span>
          <h1>销售拜访</h1>
          <p>留下有效纪要，让客户的问题有下一步。</p>
        </div>
        {canCreate && (
          <button className="button primary" onClick={onCreate}>
            <Plus size={17} /> 记录拜访
          </button>
        )}
      </div>
      <div className="visits-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="搜索拜访"
            placeholder="搜索客户、问题或拜访内容…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="muted">{filtered.length} 条拜访记录</span>
      </div>
      {filtered.length ? (
        <div className="visit-grid">
          {filtered.map((visit) => (
            <article className="visit-card panel" key={visit.id}>
              <div className="visit-card-header">
                <span className="customer-avatar">
                  {visit.customer.slice(0, 1)}
                </span>
                <div>
                  <h3>{visit.customer}</h3>
                  <p>{formatDate(visit.visitedAt, true)} · 拜访纪要</p>
                </div>
                <FileText size={19} className="muted" />
              </div>
              <p className="visit-summary preserve-lines">{visit.summary}</p>
              <div className="visit-section">
                <span>客户问题</span>
                <p className="preserve-lines">{visit.issues || "暂无记录"}</p>
              </div>
              <div className="next-step">
                <ArrowUpRight size={17} />
                <div>
                  <span>下一步行动</span>
                  <p className="preserve-lines">{visit.nextStep}</p>
                </div>
              </div>
              <div className="visit-footer">
                <CalendarDays size={15} />
                {visit.followUpDate
                  ? `跟进日期 ${visit.followUpDate}`
                  : "未设置跟进日期"}
                <span>记录人 {visit.createdBy.slice(0, 8)}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel">
          <Empty
            title={query ? "没有匹配的拜访记录" : "把下一次机会记录下来"}
            description={
              query
                ? "尝试搜索其他客户或纪要关键词。"
                : canCreate
                  ? "记录客户反馈、明确下一步，并设置跟进日期。"
                  : "当前角色没有销售拜访权限，联系工作区管理人员调整。"
            }
            action={
              canCreate && !query ? (
                <button className="button secondary" onClick={onCreate}>
                  <Plus size={15} /> 记录拜访
                </button>
              ) : undefined
            }
          />
        </div>
      )}
    </>
  );
}

export function VisitForm({
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const localDate = new Date(
    Date.now() - new Date().getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await services.operations.createVisit(workspace.id, {
        customer: String(form.get("customer")).trim(),
        visitedAt: new Date(String(form.get("visitedAt"))).toISOString(),
        summary: String(form.get("summary")).trim(),
        issues: String(form.get("issues")).trim(),
        nextStep: String(form.get("nextStep")).trim(),
        followUpDate: String(form.get("followUpDate")) || null,
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
      title="记录销售拜访"
      description="记录事实、问题和下一步，团队跟进更清楚。"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <label>
            客户名称
            <input
              name="customer"
              required
              maxLength={200}
              placeholder="客户或公司名称"
            />
          </label>
          <label>
            拜访时间
            <input
              name="visitedAt"
              type="datetime-local"
              required
              defaultValue={localDate}
            />
          </label>
        </div>
        <label>
          拜访纪要
          <textarea
            name="summary"
            required
            rows={4}
            maxLength={5000}
            placeholder="记录沟通内容、客户反馈与达成的共识…"
          />
        </label>
        <label>
          客户问题
          <textarea
            name="issues"
            rows={2}
            maxLength={5000}
            placeholder="记录需要协调解决的问题…"
          />
        </label>
        <label>
          下一步行动
          <textarea
            name="nextStep"
            required
            rows={2}
            maxLength={2000}
            placeholder="下一步具体做什么、交付什么…"
          />
        </label>
        <label>
          跟进日期
          <input name="followUpDate" type="date" />
        </label>
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
          <button className="button primary" disabled={busy}>
            {busy ? "正在保存…" : "保存拜访记录"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AssetsPage({
  assets,
  services,
  workspace,
  onUploaded,
  onPreview,
}: {
  assets: AssetRef[];
  services: DataServices;
  workspace: Workspace;
  onUploaded: () => Promise<void>;
  onPreview: (asset: AssetRef) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filtered = assets.filter((asset) =>
    asset.name.toLowerCase().includes(query.toLowerCase().trim()),
  );
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(files)) validateAsset(file);
      for (const file of Array.from(files))
        await services.assets.upload(workspace.id, file);
      await onUploaded();
    } catch (reason) {
      setError(errorMessage(reason));
      await onUploaded();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">SHARED ASSET LIBRARY</span>
          <h1>资产资料</h1>
          <p>现场图片和业务资料，统一保存在工作区。</p>
        </div>
        <label
          className={`button primary file-button ${busy ? "disabled" : ""}`}
        >
          <Upload size={17} />
          {busy ? "正在上传…" : "上传资料"}
          <input
            aria-label="上传资产资料"
            type="file"
            multiple
            disabled={busy}
            accept={allowedMediaTypes.join(",")}
            onChange={(event) => {
              void upload(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="asset-summary">
        <div className="asset-summary-icon">
          <FolderOpen size={24} />
        </div>
        <div>
          <strong>工作区资产库</strong>
          <span>
            {assets.length} 份资料 ·{" "}
            {fileSize(assets.reduce((total, asset) => total + asset.size, 0))}
          </span>
        </div>
        <span className="asset-access">
          <ShieldCheck size={14} /> 工作区成员可访问
        </span>
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <div className="panel">
        <div className="filter-bar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="搜索资产"
              placeholder="搜索文件名称…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <span className="muted small">
            图片 / PDF / MP4 / MP3 · 单文件最大 20 MB
          </span>
        </div>
        {filtered.length ? (
          <div className="asset-grid">
            {filtered.map((asset) => (
              <button
                className="asset-card"
                key={asset.id}
                onClick={() => onPreview(asset)}
              >
                <div
                  className={`asset-art ${asset.mediaType.startsWith("image/") ? "image-art" : "document-art"}`}
                >
                  {asset.mediaType.startsWith("image/") ? (
                    <FileImage size={37} strokeWidth={1.3} />
                  ) : (
                    <FileText size={37} strokeWidth={1.3} />
                  )}
                  <span>
                    {asset.mediaType.startsWith("image/")
                      ? "IMAGE"
                      : asset.mediaType === "application/pdf"
                        ? "PDF"
                        : "FILE"}
                  </span>
                  <span className="asset-open">
                    <ArrowUpRight size={17} />
                  </span>
                </div>
                <div className="asset-info">
                  <strong>{asset.name}</strong>
                  <span>
                    {fileSize(asset.size)}
                    <time>{formatDate(asset.createdAt)}</time>
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title={query ? "没有找到这份资料" : "业务资料，有一个共同的家"}
            description={
              query
                ? "换个文件名关键词试试。"
                : "上传现场图片、合同资料或工作说明，申领中的附件也会保存在这里。"
            }
          />
        )}
      </div>
    </>
  );
}

export function AssetPreview({
  asset,
  services,
  onClose,
}: {
  asset: AssetRef;
  services: DataServices;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    services.assets
      .signedUrl(asset)
      .then((value) => {
        if (active) setUrl(value);
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [asset, services]);
  return (
    <Modal
      title={asset.name}
      description={`${fileSize(asset.size)} · 工作区受控访问`}
      onClose={onClose}
    >
      {error ? (
        <ErrorBanner>{error}</ErrorBanner>
      ) : !url ? (
        <Loading label="正在获取文件…" />
      ) : (
        <>
          <div className="asset-preview">
            {asset.mediaType.startsWith("image/") ? (
              <img
                src={url}
                alt={asset.name}
                onError={() => setError("图片加载失败，请关闭后重试。")}
              />
            ) : (
              <div className="file-preview">
                <FileText size={48} strokeWidth={1.2} />
                <h3>{asset.name}</h3>
                <p>在新窗口打开原始资料。</p>
              </div>
            )}
          </div>
          <div className="form-actions">
            <a
              className="button primary"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              打开原文件 <ArrowUpRight size={16} />
            </a>
          </div>
        </>
      )}
    </Modal>
  );
}

export function SettingsPage({
  services,
  workspace,
  onNewWorkspace,
}: {
  services: DataServices;
  workspace: Workspace;
  onNewWorkspace: () => void;
}) {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState(false);
  const manager = workspace.role === "owner";
  useEffect(() => {
    let active = true;
    setLoading(true);
    services.operations
      .listMembers(workspace.id)
      .then((items) => {
        if (active) setMembers(items);
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
  }, [workspace.id, services]);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setError("");
    try {
      await services.operations.addMember(
        workspace.id,
        String(form.get("email")).trim(),
        String(form.get("role")) as Exclude<MemberRole, "owner">,
      );
      setMembers(await services.operations.listMembers(workspace.id));
      element.reset();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE SETTINGS</span>
          <h1>工作区设置</h1>
          <p>管理团队协作与当前数据平台。</p>
        </div>
        <button className="button secondary" onClick={onNewWorkspace}>
          <Plus size={17} /> 创建工作区
        </button>
      </div>
      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="section-heading">
            <div>
              <h2>
                <Users size={18} /> 工作区成员
              </h2>
              <p>
                {workspace.name} · 你的角色：{roleLabels[workspace.role]}
              </p>
            </div>
            <span className="count-chip">{members.length} 人</span>
          </div>
          {error && <ErrorBanner>{error}</ErrorBanner>}
          {loading ? (
            <Loading label="正在加载成员…" />
          ) : (
            <div className="member-list">
              {members.map((member) => (
                <div className="member-row" key={member.userId}>
                  <span className="member-avatar">
                    {member.email.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{member.email}</strong>
                    <small>{member.userId.slice(0, 8)}</small>
                  </div>
                  <span className="role-chip">{roleLabels[member.role]}</span>
                </div>
              ))}
            </div>
          )}
          {manager && (
            <form className="form-stack member-form" onSubmit={add}>
              <h3>添加已注册成员</h3>
              <p className="muted small">
                成员需先在同一数据平台注册，再通过邮箱加入工作区。
              </p>
              <label>
                成员邮箱
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="colleague@company.com"
                />
              </label>
              <div className="member-form-bottom">
                <select
                  name="role"
                  aria-label="成员角色"
                  defaultValue="operator"
                >
                  <option value="operator">生产人员 · 提交申领</option>
                  <option value="sales">销售人员 · 拜访跟进</option>
                  <option value="manager">管理人员 · 审批与团队管理</option>
                </select>
                <button className="button primary" disabled={busy}>
                  {busy ? "正在添加…" : "添加成员"}
                </button>
              </div>
            </form>
          )}
        </section>
        <div className="settings-right">
          <section className="panel settings-panel">
            <div className="section-heading">
              <div>
                <h2>
                  <Database size={18} /> 数据平台
                </h2>
                <p>当前浏览器使用的连接</p>
              </div>
              <span className="connection-dot" />
            </div>
            <div className="current-provider">
              <strong>
                {services.provider === "supabase"
                  ? "Supabase"
                  : "标准 HTTP API"}
              </strong>
              <span>账号 · 业务记录 · 资产文件</span>
            </div>
            <button
              className="button secondary wide"
              onClick={() => setConnection(true)}
            >
              更换数据平台 <ArrowRight size={15} />
            </button>
            <p className="muted small">
              可选择 Supabase，或连接由 MySQL 等数据库支撑的标准
              API。更换连接后需重新登录。
            </p>
          </section>
          <section className="panel settings-panel">
            <h2>集成状态</h2>
            <div className="integration-row">
              <span>AI 纪要分析</span>
              <span className="unavailable-chip">未接入</span>
            </div>
            <div className="integration-row">
              <span>钉钉消息与通知</span>
              <span className="unavailable-chip">未接入</span>
            </div>
            <p className="muted small">
              当前拜访纪要由团队手动记录，申领状态在工作台内流转。
            </p>
          </section>
        </div>
      </div>
      {connection && (
        <Modal
          title="更换数据平台"
          description="选择连接方式；工作区与数据保留在原平台。"
          onClose={() => setConnection(false)}
        >
          <ConnectionSettings
            services={services}
            currentProvider={services.provider}
            onCancel={() => setConnection(false)}
          />
        </Modal>
      )}
    </>
  );
}
