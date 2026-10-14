import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Boxes,
  Check,
  Factory,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { DataServices, UserIdentity } from "./data/contracts";
import { ConnectionSettings } from "./ConnectionSettings";
import { ErrorBanner, errorMessage } from "./ui";

export function AuthScreen({
  services,
  issue,
  onAuthenticated,
}: {
  services: DataServices | null;
  issue: string | null;
  onAuthenticated: (user: UserIdentity) => void;
}) {
  const [register, setRegister] = useState(false);
  const [configure, setConfigure] = useState(!services);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!services) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const email = String(form.get("email")).trim();
      const password = String(form.get("password"));
      if (register) {
        const result = await services.identity.signUp(email, password);
        if (result.needsEmailConfirmation)
          setNotice("注册申请已提交，请打开邮箱中的确认链接，再回到这里登录。");
        else if (result.user) onAuthenticated(result.user);
      } else onAuthenticated(await services.identity.signIn(email, password));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <aside className="auth-story">
        <a className="brand" href="./">
          <span className="brand-mark">
            <Factory size={24} />
          </span>
          <span>
            工序<span className="brand-subtitle">FACTORY WORKSPACE</span>
          </span>
        </a>
        <div className="auth-story-content">
          <span className="eyebrow light">让每一道工序，有迹可循</span>
          <h1>
            连接现场，
            <br />
            把事情做到闭环。
          </h1>
          <p>
            从一根断针的回收，到一次客户拜访的跟进。
            <br />
            让生产、销售和资产，在同一个工作区协作。
          </p>
          <div className="story-points">
            <span>
              <Check size={17} /> 申领与回收，全程追溯
            </span>
            <span>
              <Check size={17} /> 业务资料，统一资产存储
            </span>
            <span>
              <Check size={17} /> 自选数据平台，按角色协作
            </span>
          </div>
        </div>
        <div className="auth-story-bottom">
          <Boxes size={19} />
          <span>BYTEFOLK / OPERATIONS</span>
          <span>01</span>
        </div>
      </aside>
      <main className="auth-main">
        <div className={`auth-card ${configure ? "config-card" : ""}`}>
          <span className="eyebrow">YOUR DAILY WORKSPACE</span>
          <h2>
            {configure
              ? "连接你的数据平台"
              : register
                ? "创建你的账号"
                : "欢迎回到工作台"}
          </h2>
          <p className="muted">
            {configure
              ? "选择适合你的存储方式，业务流程保持一致。"
              : "登录后，继续与你的团队协作。"}
          </p>
          {configure ? (
            <>
              {issue && !services && <div className="info-note">{issue}</div>}
              <ConnectionSettings
                currentProvider={services?.provider}
                services={services}
                onCancel={services ? () => setConfigure(false) : undefined}
              />
            </>
          ) : (
            <>
              {issue && <ErrorBanner>{issue}</ErrorBanner>}
              <form className="form-stack auth-form" onSubmit={submit}>
                <label>
                  邮箱
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                  />
                </label>
                <label>
                  密码
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={register ? 8 : undefined}
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                    placeholder={register ? "至少 8 位字符" : "请输入密码"}
                  />
                </label>
                {error && <ErrorBanner>{error}</ErrorBanner>}
                {notice && (
                  <div className="success-banner" role="status">
                    {notice}
                  </div>
                )}
                <button className="button primary wide" disabled={busy}>
                  {busy ? "正在连接…" : register ? "注册账号" : "登录工作台"}
                  <ArrowRight size={17} />
                </button>
              </form>
              <p className="auth-switch">
                {register ? "已经有账号？" : "第一次使用？"}
                <button
                  onClick={() => {
                    setRegister(!register);
                    setError("");
                    setNotice("");
                  }}
                >
                  {register ? "登录账号" : "创建账号"}
                </button>
              </p>
              <div className="auth-connection">
                <ShieldCheck size={15} />
                <span>
                  当前数据平台：
                  {services?.provider === "supabase"
                    ? "Supabase"
                    : "标准 HTTP API"}
                </span>
                <button
                  onClick={() => setConfigure(true)}
                  aria-label="更换数据平台"
                >
                  <Settings2 size={15} /> 更换
                </button>
              </div>
            </>
          )}
          <p className="auth-footer">
            数据属于你的工作区 · 账号与访问权限由所选平台管理
          </p>
        </div>
      </main>
    </div>
  );
}
