import { mediaAsset } from "../media";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Sparkles,
} from "lucide-react";
import {
  authenticateDemo,
  clearDemoSession,
  DEMO_AUTH_NAMESPACE,
  DEMO_USERS,
  readDemoSession,
  saveDemoSession,
} from "../demoAuth";
import type { DemoUser } from "../demoAuth";
import "../login.css";

export function DemoAuthGate({
  children,
}: {
  children: (user: DemoUser, onLogout: () => void) => ReactNode;
}) {
  const [session, setSession] = useState(readDemoSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const restoreBlocked = useRef(false);

  useEffect(() => {
    const check = () => {
      if (!restoreBlocked.current) setSession(readDemoSession());
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === DEMO_AUTH_NAMESPACE || event.key === null) check();
    };
    const timer = window.setInterval(check, 30_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function logout() {
    const notice = clearDemoSession();
    restoreBlocked.current = !!notice;
    setSession({ user: null, expiresAt: null, notice });
    setPassword("");
    setError("");
  }

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const user = authenticateDemo(email, password);
    if (!user) {
      setError("演示邮箱或密码不正确，请使用下方示例账号。");
      return;
    }
    try {
      const expiresAt = saveDemoSession(user, remember);
      restoreBlocked.current = false;
      setPassword("");
      setSession({ user, expiresAt, notice: "" });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "无法保存演示登录，请重试。",
      );
    }
  }

  function fillAccount(user: DemoUser) {
    setEmail(user.email);
    setPassword("Muse2026!");
    setError("");
  }

  if (session.user) return children(session.user, logout);

  return (
    <main className="demo-login">
      <section className="login-story" aria-label="MUSE 品牌创作空间">
        <div className="login-brand">
          <span>
            MUSE<span className="brand-dot">.</span>
          </span>
          <p>缪思 · 品牌创作空间</p>
        </div>
        <div className="login-story-copy">
          <span className="login-eyebrow">A SPACE FOR YOUR BRAND</span>
          <h1>
            让每一份创意，
            <br />
            成为品牌的长期资产。
          </h1>
          <p>
            从人物与声线，到脚本与影像。
            <br />
            在一个工作空间里，留住品牌的每一次表达。
          </p>
        </div>
        <figure className="login-image">
          <img
            src={mediaAsset("portrait.png")}
            alt="品牌数字人物戴帽形象示意"
          />
          <figcaption>
            <Sparkles size={15} aria-hidden="true" /> 品牌人物 · 创作起点
          </figcaption>
        </figure>
        <div className="login-story-footer">
          <span>资产沉淀</span>
          <i />
          <span>视频创作</span>
          <i />
          <span>内容复用</span>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-form-wrap">
          <span className="login-demo-badge">
            <span /> 账号登录 Demo
          </span>
          <h2 id="login-title">欢迎回到创作空间</h2>
          <p className="login-subtitle">选择一个演示身份，开始体验工作台。</p>

          <form onSubmit={login} className="login-form">
            <label htmlFor="demo-email">演示邮箱</label>
            <div className="login-input-wrap">
              <Mail size={18} aria-hidden="true" />
              <input
                id="demo-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@muse.demo"
                required
                aria-describedby="login-account-hint"
              />
            </div>
            <label htmlFor="demo-password">演示密码</label>
            <div className="login-input-wrap">
              <LockKeyhole size={18} aria-hidden="true" />
              <input
                id="demo-password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入演示密码"
                required
                aria-describedby="login-account-hint"
              />
              <button
                type="button"
                className="login-password-toggle"
                aria-label={visible ? "隐藏演示密码" : "显示演示密码"}
                aria-pressed={visible}
                onClick={() => setVisible((current) => !current)}
              >
                {visible ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </div>
            <label className="login-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />{" "}
              在此浏览器记住我 7 天
            </label>
            <div
              className="login-feedback"
              aria-live="polite"
              aria-atomic="true"
            >
              {error || session.notice ? (
                <p>{error || session.notice}</p>
              ) : null}
            </div>
            <button type="submit" className="login-submit">
              登录工作台 <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>

          <div className="login-examples">
            <div className="login-examples-title">
              <span>示例账号</span>
              <small>密码：Muse2026!</small>
            </div>
            {DEMO_USERS.map((user, index) => (
              <button
                type="button"
                key={user.id}
                onClick={() => fillAccount(user)}
                aria-label={index === 0 ? "填入管理员账号" : "填入创作成员账号"}
              >
                <span className="login-account-avatar">
                  {user.name.slice(0, 1)}
                </span>
                <span className="login-account-details">
                  <strong>
                    {user.name} <span>{user.role}</span>
                  </strong>
                  <small>{user.email}</small>
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="login-scope" id="login-account-hint">
            <strong>请只使用示例账号，不要输入真实密码。</strong>
            <p>
              这是本地登录流程演示，不是企业鉴权。两种身份共用当前浏览器的工作空间，未实现权限或数据隔离。暂不提供注册、找回密码与企业
              SSO。
            </p>
            <p>
              未勾选时登录保留在当前标签页，最长 8
              小时；退出不会清空工作台数据、供应商配置或取消已提交的真实任务。
            </p>
          </div>
        </div>
        <footer className="login-panel-footer">
          MUSE 缪思 · 技术验证 Demo
        </footer>
      </section>
    </main>
  );
}
