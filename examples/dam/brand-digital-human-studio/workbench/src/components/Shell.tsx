import {
  FolderOpen,
  Clapperboard,
  ListChecks,
  Images,
  ChevronRight,
  Info,
  RotateCcw,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { Page } from "../types";
import type { DemoUser } from "../demoAuth";
const nav = [
  { id: "assets", label: "资产库", icon: FolderOpen },
  { id: "create", label: "视频创作", icon: Clapperboard },
  { id: "tasks", label: "任务管理", icon: ListChecks },
  { id: "outputs", label: "成品库", icon: Images },
] as const;
export function Shell({
  page,
  onNavigate,
  activeCount,
  children,
  onHelp,
  onReset,
  connected,
  user,
  onLogout,
}: {
  page: Page;
  onNavigate: (page: Page) => void;
  activeCount: number;
  children: ReactNode;
  onHelp: () => void;
  onReset: () => void;
  connected?: boolean;
  user: DemoUser;
  onLogout: () => void;
}) {
  const [mobile, setMobile] = useState(false);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="brand">
          <span>
            MUSE<span className="brand-dot">.</span>
          </span>
          <p>缪思 · 品牌创作空间</p>
        </div>
        <button
          className="mobile-close icon-button"
          onClick={() => setMobile(false)}
          aria-label="关闭导航"
        >
          <X />
        </button>
        <div className="workspace-label">工作空间</div>
        <nav aria-label="主导航">
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? "active" : ""}`}
              aria-current={page === n.id ? "page" : undefined}
              onClick={() => {
                onNavigate(n.id);
                setMobile(false);
              }}
            >
              <n.icon size={20} strokeWidth={1.6} />
              <span>{n.label}</span>
              {n.id === "tasks" && activeCount > 0 && <b>{activeCount}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span className="tiny-dot" />
            本地演示空间<p>让创意发生，让品牌沉淀。</p>
          </div>
          <button className="sidebar-link" onClick={onHelp}>
            <Info size={16} />
            演示使用指南
            <ChevronRight size={14} />
          </button>
          <button className="sidebar-link" onClick={onReset}>
            <RotateCcw size={16} />
            重置演示数据
          </button>
          <div className="profile">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobile(false)}
          aria-label="关闭导航遮罩"
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            onClick={() => setMobile(true)}
            aria-label="打开导航"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            工作空间<span>/</span>
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </div>
          <button className="demo-indicator" onClick={onHelp}>
            <i />
            {connected ? "API 已配置" : "技术验证 Demo"}
            <Info size={14} />
          </button>
          <button
            className="session-logout"
            onClick={onLogout}
            aria-label="退出登录"
            title={`退出${user.name}的演示登录`}
          >
            <LogOut size={17} />
            <span>退出</span>
          </button>
        </header>
        <main key={page}>{children}</main>
        <footer className="app-footer">
          <span>默认模拟 · 真实 API 按量计费 · 当前为技术验证 Demo</span>
          <span>MUSE 缪思 · 品牌创作空间</span>
        </footer>
      </div>
    </div>
  );
}
