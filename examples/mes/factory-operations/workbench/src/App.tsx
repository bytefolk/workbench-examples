import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  Factory,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type {
  AssetRef,
  DataServices,
  OperationReport,
  SalesVisit,
  UserIdentity,
  Workspace,
} from "./data/contracts";
import { createConfiguredProvider } from "./data";
import { AuthScreen } from "./AuthScreen";
import { ReportDetail, ReportForm, ReportsPage, ReportTable } from "./Reports";
import {
  AssetPreview,
  AssetsPage,
  SettingsPage,
  VisitForm,
  VisitsPage,
} from "./WorkspacePages";
import {
  Empty,
  ErrorBanner,
  errorMessage,
  formatDate,
  Loading,
  Modal,
  roleLabels,
} from "./ui";

type Page = "overview" | "reports" | "visits" | "assets" | "settings";
const navigation = [
  { id: "overview" as const, title: "工作台概览", icon: LayoutDashboard },
  { id: "reports" as const, title: "工厂申领", icon: ClipboardList },
  { id: "visits" as const, title: "销售拜访", icon: Users },
  { id: "assets" as const, title: "资产资料", icon: FolderOpen },
];
const configured = createConfiguredProvider();

export default function App() {
  const [user, setUser] = useState<UserIdentity | null>(null);
  const [sessionLoading, setSessionLoading] = useState(
    Boolean(configured.provider),
  );
  const [error, setError] = useState("");
  const services = configured.provider;
  useEffect(() => {
    if (!services) return;
    let active = true;
    services.identity
      .currentUser()
      .then((value) => {
        if (active) setUser(value);
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason));
      })
      .finally(() => {
        if (active) setSessionLoading(false);
      });
    const dispose = services.identity.onChange((value) => {
      if (active) {
        setUser(value);
        setSessionLoading(false);
      }
    });
    return () => {
      active = false;
      dispose();
    };
  }, [services]);
  if (sessionLoading)
    return (
      <div className="boot-screen">
        <Factory size={34} />
        <Loading label="正在连接工作台…" />
      </div>
    );
  if (!services || !user)
    return (
      <AuthScreen
        services={services}
        issue={configured.configurationIssue ?? (error || null)}
        onAuthenticated={setUser}
      />
    );
  return (
    <WorkspaceApp
      key={user.id}
      services={services}
      user={user}
      onSignedOut={() => setUser(null)}
    />
  );
}

function WorkspaceApp({
  services,
  user,
  onSignedOut,
}: {
  services: DataServices;
  user: UserIdentity;
  onSignedOut: () => void;
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [reports, setReports] = useState<OperationReport[]>([]);
  const [visits, setVisits] = useState<SalesVisit[]>([]);
  const [assets, setAssets] = useState<AssetRef[]>([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState<Page>("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [modal, setModal] = useState<"workspace" | "report" | "visit" | null>(
    null,
  );
  const [selectedReport, setSelectedReport] = useState<OperationReport | null>(
    null,
  );
  const [preview, setPreview] = useState<AssetRef | null>(null);
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const refreshGeneration = useRef(0);
  const activeWorkspaceId = useRef(workspaceId);
  activeWorkspaceId.current = workspaceId;
  const canCreateReport = Boolean(workspace && workspace.role !== "sales");
  const canCreateVisit = Boolean(workspace && workspace.role !== "operator");
  const loadWorkspaces = useCallback(async () => {
    setInitialLoading(true);
    setError("");
    try {
      const items = await services.operations.listWorkspaces();
      setWorkspaces(items);
      const saved = localStorage.getItem(`factory-workspace-${user.id}`);
      setWorkspaceId((current) =>
        items.some((item) => item.id === current)
          ? current
          : (items.find((item) => item.id === saved)?.id ?? items[0]?.id ?? ""),
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setInitialLoading(false);
    }
  }, [services, user.id]);
  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);
  const refresh = useCallback(async () => {
    if (!workspaceId || activeWorkspaceId.current !== workspaceId) return;
    const generation = ++refreshGeneration.current;
    const isCurrent = () =>
      refreshGeneration.current === generation &&
      activeWorkspaceId.current === workspaceId;
    setDataLoading(true);
    setError("");
    try {
      const [reportItems, visitItems, assetItems] = await Promise.all([
        services.operations.listReports(workspaceId),
        canCreateVisit
          ? services.operations.listVisits(workspaceId)
          : Promise.resolve<SalesVisit[]>([]),
        services.assets.list(workspaceId),
      ]);
      if (!isCurrent()) return;
      setReports(
        reportItems.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
      setVisits(
        visitItems.sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)),
      );
      setAssets(
        assetItems.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    } catch (reason) {
      if (isCurrent()) setError(errorMessage(reason));
    } finally {
      if (isCurrent()) setDataLoading(false);
    }
  }, [services, workspaceId, canCreateVisit]);
  useEffect(() => {
    ++refreshGeneration.current;
    setReports([]);
    setVisits([]);
    setAssets([]);
    setSelectedReport(null);
    setPreview(null);
    setModal(null);
    if (workspaceId) {
      localStorage.setItem(`factory-workspace-${user.id}`, workspaceId);
      void refresh();
    }
    return () => {
      ++refreshGeneration.current;
    };
  }, [workspaceId, refresh, user.id]);
  async function signOut() {
    try {
      await services.identity.signOut();
      onSignedOut();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }
  function changeWorkspace(id: string) {
    ++refreshGeneration.current;
    activeWorkspaceId.current = id;
    setReports([]);
    setVisits([]);
    setAssets([]);
    setSelectedReport(null);
    setPreview(null);
    setModal(null);
    setDataLoading(true);
    setWorkspaceId(id);
  }
  function navigate(next: Page) {
    setPage(next);
    setMobileMenu(false);
  }
  return (
    <div className="app-shell">
      {mobileMenu && (
        <button
          className="sidebar-backdrop"
          aria-label="关闭导航"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
        <a className="brand" href="./">
          <span className="brand-mark">
            <Factory size={24} />
          </span>
          <span>
            工序<span className="brand-subtitle">FACTORY WORKSPACE</span>
          </span>
        </a>
        <div className="workspace-picker">
          <span className="workspace-icon">
            {workspace?.name.slice(0, 1) ?? "W"}
          </span>
          <div>
            <small>当前工作区</small>
            <select
              aria-label="切换工作区"
              value={workspaceId}
              onChange={(event) => changeWorkspace(event.target.value)}
              disabled={!workspaces.length}
            >
              {!workspaces.length && <option value="">创建你的工作区</option>}
              {workspaces.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-section-label">工作空间</div>
        <nav aria-label="主导航">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} strokeWidth={1.7} />
              <span>{item.title}</span>
              {item.id === "reports" &&
                reports.some((report) => report.status === "submitted") && (
                  <b>
                    {
                      reports.filter((report) => report.status === "submitted")
                        .length
                    }
                  </b>
                )}
            </button>
          ))}
        </nav>
        <div className="sidebar-lower">
          <div className="workspace-note">
            <span className="connection-dot" />
            <span>真实数据 · 团队协作</span>
            <p>每次操作，都有迹可循。</p>
          </div>
          <button
            className={page === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={18} />
            <span>工作区设置</span>
          </button>
          <div className="user-block">
            <span className="user-avatar">
              {user.email.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user.email.split("@")[0]}</strong>
              <small>{workspace ? roleLabels[workspace.role] : "已登录"}</small>
            </div>
            <button
              className="icon-button"
              title="退出登录"
              aria-label="退出登录"
              onClick={() => {
                void signOut();
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-toggle"
              aria-label="打开导航"
              onClick={() => setMobileMenu(true)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              工作空间 <span>/</span>{" "}
              <strong>
                {page === "settings"
                  ? "工作区设置"
                  : navigation.find((item) => item.id === page)?.title}
              </strong>
            </span>
          </div>
          <div className="topbar-actions">
            <span className="today">
              <CalendarDays size={15} />
              {new Intl.DateTimeFormat("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "short",
              }).format(new Date())}
            </span>
            {workspace && (
              <button
                className="icon-button"
                aria-label="刷新数据"
                title="刷新数据"
                disabled={dataLoading}
                onClick={() => {
                  void refresh();
                }}
              >
                <RefreshCw size={16} className={dataLoading ? "spin" : ""} />
              </button>
            )}
            <span className="mini-avatar">
              {user.email.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="main-content">
          {error && (
            <ErrorBanner
              retry={() => {
                void (workspaceId ? refresh() : loadWorkspaces());
              }}
            >
              {error}
            </ErrorBanner>
          )}
          {initialLoading ? (
            <Loading />
          ) : !workspace ? (
            <div className="workspace-onboarding">
              <span className="onboarding-icon">
                <Factory size={36} />
              </span>
              <span className="eyebrow">LET’S GET STARTED</span>
              <h1>为你的团队，建一个工作区。</h1>
              <p>
                集中管理生产申领、客户拜访和资产资料。
                <br />
                创建后即可邀请同事，一起开始协作。
              </p>
              <button
                className="button primary"
                onClick={() => setModal("workspace")}
              >
                <Plus size={17} /> 创建工作区
              </button>
              <p className="muted small">
                加入已有工作区？请所有者通过你的注册邮箱添加。
              </p>
            </div>
          ) : (
            <>
              {dataLoading &&
              !reports.length &&
              !visits.length &&
              !assets.length ? (
                <Loading />
              ) : (
                <>
                  {page === "overview" && (
                    <Overview
                      workspace={workspace}
                      reports={reports}
                      visits={visits}
                      assets={assets}
                      onNavigate={navigate}
                      onNewReport={
                        canCreateReport ? () => setModal("report") : undefined
                      }
                      onNewVisit={
                        canCreateVisit ? () => setModal("visit") : undefined
                      }
                      onSelect={setSelectedReport}
                    />
                  )}
                  {page === "reports" && (
                    <ReportsPage
                      reports={reports}
                      canCreate={canCreateReport}
                      onCreate={() => setModal("report")}
                      onSelect={setSelectedReport}
                    />
                  )}
                  {page === "visits" && (
                    <VisitsPage
                      visits={visits}
                      canCreate={canCreateVisit}
                      onCreate={() => setModal("visit")}
                    />
                  )}
                  {page === "assets" && (
                    <AssetsPage
                      key={workspace.id}
                      assets={assets}
                      services={services}
                      workspace={workspace}
                      onUploaded={refresh}
                      onPreview={setPreview}
                    />
                  )}
                  {page === "settings" && (
                    <SettingsPage
                      key={workspace.id}
                      services={services}
                      workspace={workspace}
                      onNewWorkspace={() => setModal("workspace")}
                    />
                  )}
                </>
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>工序 / FACTORY WORKSPACE</span>
          <span>
            {workspace?.name ?? "工作区待创建"}
            <span className="footer-dot">·</span>让协作发生在每一道工序
          </span>
        </footer>
      </div>
      {modal === "workspace" && (
        <WorkspaceForm
          services={services}
          onClose={() => setModal(null)}
          onCreated={async (item) => {
            setWorkspaces((items) => [...items, item]);
            changeWorkspace(item.id);
          }}
        />
      )}
      {modal === "report" && workspace && (
        <ReportForm
          services={services}
          workspace={workspace}
          onClose={() => setModal(null)}
          onCreated={refresh}
        />
      )}
      {modal === "visit" && workspace && (
        <VisitForm
          services={services}
          workspace={workspace}
          onClose={() => setModal(null)}
          onCreated={refresh}
        />
      )}
      {selectedReport && workspace && (
        <ReportDetail
          key={selectedReport.id}
          report={selectedReport}
          services={services}
          workspace={workspace}
          onClose={() => setSelectedReport(null)}
          onUpdated={refresh}
          onPreview={setPreview}
        />
      )}
      {preview && (
        <AssetPreview
          asset={preview}
          services={services}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function Overview({
  workspace,
  reports,
  visits,
  assets,
  onNavigate,
  onNewReport,
  onNewVisit,
  onSelect,
}: {
  workspace: Workspace;
  reports: OperationReport[];
  visits: SalesVisit[];
  assets: AssetRef[];
  onNavigate: (page: Page) => void;
  onNewReport?: () => void;
  onNewVisit?: () => void;
  onSelect: (report: OperationReport) => void;
}) {
  const open = reports.filter(
    (report) => !["completed", "rejected"].includes(report.status),
  );
  const recovery = reports.filter(
    (report) =>
      report.kind === "broken_needle" &&
      !report.fragmentsRecovered &&
      !["completed", "rejected"].includes(report.status),
  );
  const stats = [
    {
      title: "待处理申领",
      count: open.length,
      hint: `${reports.filter((report) => report.status === "submitted").length} 项等待审批`,
      icon: ClipboardList,
      color: "green",
    },
    {
      title: "待回收确认",
      count: recovery.length,
      hint: "断针回收后完成闭环",
      icon: ShieldCheck,
      color: "amber",
    },
    {
      title: "已完成事项",
      count: reports.filter((report) => report.status === "completed").length,
      hint: "每一步，都有完整记录",
      icon: CheckCheck,
      color: "blue",
    },
    {
      title: "客户拜访记录",
      count: visits.length,
      hint: `${visits.filter((visit) => visit.followUpDate).length} 项设有跟进日期`,
      icon: Users,
      color: "purple",
    },
  ];
  return (
    <>
      <div className="page-heading overview-heading">
        <div>
          <span className="eyebrow">EVERY STEP COUNTS</span>
          <h1>
            工作台概览<span className="heading-dot">.</span>
          </h1>
          <p>你好，今天也让每件事有着落。</p>
        </div>
        <div className="workspace-status">
          <span className="connection-dot" /> {workspace.name}
        </div>
      </div>
      <section className="welcome-banner">
        <div className="welcome-copy">
          <span className="banner-kicker">
            <Activity size={15} /> 生产 · 协同 · 闭环
          </span>
          <h2>连接现场，推进每一步。</h2>
          <p>
            {open.length
              ? `当前有 ${open.length} 项申领正在流转，${recovery.length} 项断针等待回收确认。`
              : "从现场申领开始，让进度、资料与责任清晰可见。"}
          </p>
          <div className="banner-actions">
            {onNewReport && (
              <button className="button light" onClick={onNewReport}>
                <Plus size={16} /> 发起现场申领
              </button>
            )}
            {onNewVisit && (
              <button className="text-button light-text" onClick={onNewVisit}>
                记录客户拜访 <ArrowUpRight size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="banner-illustration" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="factory-card">
            <Factory size={41} strokeWidth={1.2} />
            <span>WORK IN FLOW</span>
            <div>
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <span className="floating-check">
            <CheckCheck size={20} />
          </span>
          <span className="floating-node">
            <Activity size={21} />
          </span>
        </div>
      </section>
      <div className="stat-grid">
        {stats.map((stat) => (
          <div className="stat-card panel" key={stat.title}>
            <div>
              <span>{stat.title}</span>
              <span className={`stat-icon ${stat.color}`}>
                <stat.icon size={18} />
              </span>
            </div>
            <strong>
              {stat.count}
              <small>项</small>
            </strong>
            <p>{stat.hint}</p>
          </div>
        ))}
      </div>
      <div className="overview-columns">
        <section className="panel recent-reports">
          <div className="section-heading">
            <div>
              <h2>最近申领</h2>
              <p>现场事项的最新进展</p>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate("reports")}
            >
              查看全部 <ArrowUpRight size={15} />
            </button>
          </div>
          {reports.length ? (
            <ReportTable reports={reports.slice(0, 5)} onSelect={onSelect} />
          ) : (
            <Empty
              title="现场事项，等待你的第一条记录"
              description="提交一张申领单，团队即可开始审批与跟进。"
              action={
                onNewReport ? (
                  <button className="button secondary" onClick={onNewReport}>
                    <Plus size={15} /> 新建申领
                  </button>
                ) : undefined
              }
            />
          )}
        </section>
        <aside className="overview-aside">
          <section className="panel followup-panel">
            <div className="section-heading">
              <div>
                <h2>接下来跟进</h2>
                <p>来自客户拜访的行动记录</p>
              </div>
              <CalendarDays size={19} className="muted" />
            </div>
            {visits.filter((visit) => visit.followUpDate).length ? (
              <div className="followup-list">
                {visits
                  .filter((visit) => visit.followUpDate)
                  .sort((a, b) =>
                    a.followUpDate!.localeCompare(b.followUpDate!),
                  )
                  .slice(0, 3)
                  .map((visit) => (
                    <button key={visit.id} onClick={() => onNavigate("visits")}>
                      <span className="followup-date">
                        {formatDate(`${visit.followUpDate}T12:00:00`)}
                      </span>
                      <strong>{visit.customer}</strong>
                      <p>{visit.nextStep}</p>
                    </button>
                  ))}
              </div>
            ) : (
              <div className="compact-empty">
                <CalendarDays size={27} strokeWidth={1.4} />
                <strong>还没有跟进计划</strong>
                <p>
                  在拜访记录中设置跟进日期，
                  <br />
                  下一步就会出现在这里。
                </p>
              </div>
            )}
          </section>
          <button
            className="asset-shortcut"
            onClick={() => onNavigate("assets")}
          >
            <span>
              <FolderOpen size={23} />
              <strong>工作区资产库</strong>
              <small>{assets.length} 份资料，集中管理</small>
            </span>
            <ArrowRight size={20} />
          </button>
        </aside>
      </div>
    </>
  );
}

function WorkspaceForm({
  services,
  onClose,
  onCreated,
}: {
  services: DataServices;
  onClose: () => void;
  onCreated: (workspace: Workspace) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const workspace = await services.operations.createWorkspace(
        String(form.get("name")).trim(),
      );
      await onCreated(workspace);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="创建工作区"
      description="工作区内的成员共享业务记录和资产资料。"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          工作区名称
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            placeholder="例如：生产运营一部"
            autoFocus
          />
        </label>
        <div className="info-note">
          <ShieldCheck size={17} />
          <span>你将成为该工作区的所有者，可添加成员并分配角色。</span>
        </div>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <div className="form-actions">
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "正在创建…" : "创建并进入"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
