import {
  LayoutDashboard,
  UsersRound,
  Sparkles,
  ListVideo,
  Film,
  Settings2,
  ChevronDown,
  ArrowUpRight,
  Leaf,
  ShieldCheck,
  CircleHelp,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useApp, type Page } from "../store";
import { roleNames, type Role } from "../domain/types";
import { Dialog } from "./ui";
const nav = [
  { id: "overview", icon: LayoutDashboard, name: "工作台概览" },
  { id: "characters", icon: UsersRound, name: "人物资产" },
  { id: "generate", icon: Sparkles, name: "视频生成" },
  { id: "tasks", icon: ListVideo, name: "生成任务" },
  { id: "library", icon: Film, name: "成片库" },
] as const;
export function Shell({ children }: { children: ReactNode }) {
  const app = useApp();
  const [help, setHelp] = useState(false);
  const pending = app.db.tasks.filter(
    (t) =>
      t.status === "review" &&
      (app.role !== "creator" || t.createdBy === app.role),
  ).length;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => app.setPage("overview")}
          aria-label="本色首页"
        >
          <span className="brand-mark">
            <Leaf size={22} />
          </span>
          <span>
            <strong>
              本色<span className="brand-dot">®</span>
            </strong>
            <small>PERSONA STUDIO</small>
          </span>
        </button>
        <div className="workspace-label">
          <span className="workspace-avatar">本</span>
          <div>
            <b>品牌内容工作室</b>
            <small>企业工作空间</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">创作空间</div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              aria-label={item.name}
              aria-current={app.page === item.id ? "page" : undefined}
              className={`nav-item ${app.page === item.id ? "active" : ""}`}
              onClick={() => app.setPage(item.id)}
            >
              <item.icon size={19} strokeWidth={1.6} />
              <span>{item.name}</span>
              {item.id === "tasks" && pending > 0 && (
                <span className="nav-count" aria-hidden="true">
                  {pending}
                </span>
              )}
              {item.id === "generate" && (
                <span className="nav-spark" aria-hidden="true">
                  ✦
                </span>
              )}
            </button>
          ))}
          <button
            className={`nav-item mobile-settings ${app.page === "settings" ? "active" : ""}`}
            onClick={() => app.setPage("settings")}
          >
            <Settings2 size={17} />
            <span>管理设置</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${app.page === "settings" ? "active" : ""}`}
            onClick={() => app.setPage("settings")}
          >
            <Settings2 size={19} strokeWidth={1.6} />
            <span>管理设置</span>
          </button>
          <button className="nav-item" onClick={() => setHelp(true)}>
            <CircleHelp size={19} strokeWidth={1.6} />
            <span>演示指南</span>
            <ArrowUpRight size={14} />
          </button>
          <div className="demo-note">
            <span className="live-dot" />
            <b>本地演示环境</b>
            <p>素材与模型能力均为模拟</p>
          </div>
        </div>
        <div className="sidebar-footer">
          <span className="person-avatar">创</span>
          <div>
            <b>{roleNames[app.role]}</b>
            <small>角色权限 · 演示</small>
          </div>
          <ShieldCheck size={16} />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            创作空间<span>/</span>
            <b>{nav.find((n) => n.id === app.page)?.name || "管理设置"}</b>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span className="live-dot" />
              DEMO v0.1
            </span>
            <span className="topbar-divider" />
            <div className="role-control">
              <span className="role-label">演示角色</span>
              <select
                aria-label="切换演示角色"
                value={app.role}
                onChange={(e) => app.setRole(e.target.value as Role)}
              >
                {Object.entries(roleNames).map(([id, name]) => (
                  <option value={id} key={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>
        {app.storageError && (
          <div className="error-banner" role="alert">
            本地存储不可用，当前改动仅在本次打开期间保留。
          </div>
        )}
        <main key={app.page} className={`page page-${app.page}`}>
          {children}
        </main>
        <footer className="main-footer">
          <span>本色 · 让品牌人物，成为长期资产。</span>
          <span>
            LOCAL DEMO <i /> ALL GENERATION IS MOCK
          </span>
        </footer>
      </div>
      {app.toast && (
        <div className="toast" role="status">
          <span className="live-dot" />
          {app.toast}
        </div>
      )}
      {help && (
        <Dialog
          title="从人物资产，到一支品牌短片"
          subtitle="约 3 分钟，走完一次完整的模拟创作流程。"
          onClose={() => setHelp(false)}
        >
          <div className="dialog-content">
            <ol className="guide-list">
              <li>切换到「内容创作者」，在视频生成页描述内容需求。</li>
              <li>解析需求，检查推荐人物与素材，修改脚本或画幅。</li>
              <li>确认配置并提交 Mock 任务；约 11 秒后进入待审核。</li>
              <li>切换「审核人」，打开任务，填写意见并通过。</li>
              <li>到成片库查看占位结果，以及人物版本、素材和脚本。</li>
            </ol>
            <div className="notice">
              所有结果都是静态占位预览；费用是演示估算，未经模型供应商验证。角色切换不代表真实登录或生产鉴权。
            </div>
            <button
              className="button primary full"
              onClick={() => {
                setHelp(false);
                app.openGenerate();
              }}
            >
              开始一次创作
              <Sparkles size={16} />
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
