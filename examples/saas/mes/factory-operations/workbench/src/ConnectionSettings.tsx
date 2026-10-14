import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Database,
  Globe2,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import type { DataConfiguration, DataServices } from "./data/contracts";
import { configurationStorageKey, validateConfiguration } from "./data";
import { ErrorBanner } from "./ui";

export function ConnectionSettings({
  currentProvider = "supabase",
  services,
  onCancel,
}: {
  currentProvider?: string;
  services?: DataServices | null;
  onCancel?: () => void;
}) {
  const [provider, setProvider] = useState<"supabase" | "http">(
    currentProvider === "http" ? "http" : "supabase",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<{
    config?: DataConfiguration;
  } | null>(null);
  function applyConfiguration(config?: DataConfiguration) {
    if (config)
      localStorage.setItem(configurationStorageKey, JSON.stringify(config));
    else localStorage.removeItem(configurationStorageKey);
    window.location.reload();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const config: DataConfiguration =
      provider === "supabase"
        ? {
            provider,
            supabaseUrl: String(values.get("url") ?? "").trim(),
            supabasePublishableKey: String(values.get("key") ?? "").trim(),
          }
        : { provider, apiBaseUrl: String(values.get("url") ?? "").trim() };
    setBusy(true);
    setError("");
    setPendingSwitch(null);
    try {
      validateConfiguration(config);
      try {
        await services?.identity.signOut();
      } catch (reason) {
        setPendingSwitch({ config });
        throw reason;
      }
      applyConfiguration(config);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "连接配置保存失败。");
    } finally {
      setBusy(false);
    }
  }
  async function useDefault() {
    setBusy(true);
    setError("");
    setPendingSwitch(null);
    try {
      try {
        await services?.identity.signOut();
      } catch (reason) {
        setPendingSwitch({});
        throw reason;
      }
      applyConfiguration();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "连接切换失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="connection-settings">
      <div className="provider-options">
        <button
          type="button"
          className={
            provider === "supabase"
              ? "provider-option selected"
              : "provider-option"
          }
          onClick={() => setProvider("supabase")}
        >
          <Database size={21} />
          <strong>Supabase</strong>
          <span>托管数据库、账号与文件</span>
        </button>
        <button
          type="button"
          className={
            provider === "http" ? "provider-option selected" : "provider-option"
          }
          onClick={() => setProvider("http")}
        >
          <Globe2 size={21} />
          <strong>自有数据平台</strong>
          <span>标准 HTTP API · 可接 MySQL</span>
        </button>
      </div>
      <form onSubmit={save} className="form-stack">
        <label>
          {provider === "supabase" ? "Supabase 项目地址" : "数据平台 API 地址"}
          <input
            name="url"
            type="text"
            inputMode="url"
            required
            placeholder={
              provider === "supabase"
                ? "https://your-project.supabase.co"
                : "https://assets.example.com/api/workbench 或 /api/v1"
            }
          />
        </label>
        {provider === "supabase" && (
          <label>
            Publishable key / anon key
            <input
              name="key"
              required
              autoComplete="off"
              placeholder="sb_publishable_…"
            />
            <span className="field-hint">
              仅填写公开客户端密钥。不要填写 service_role 或 Secret key。
            </span>
          </label>
        )}
        <div className="info-note">
          <ShieldCheck size={17} />
          <span>
            {provider === "supabase"
              ? "先在项目中执行随案例提供的数据库迁移，并配置认证。项目地址和公开密钥保存在当前浏览器。"
              : "服务端需要实现本案例的标准接口，统一处理账号、工作区、业务记录和资产。MySQL 连接凭据只保存在服务端。"}
          </span>
        </div>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {pendingSwitch && (
          <div className="info-note">
            <span>
              原平台暂时无法退出；继续切换会保留原平台可能尚未过期的会话。
              <button
                type="button"
                className="text-button"
                onClick={() => applyConfiguration(pendingSwitch.config)}
              >
                仍然切换连接 <ArrowRight size={14} />
              </button>
            </span>
          </div>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              void useDefault();
            }}
          >
            使用部署默认配置
          </button>
          {onCancel && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={onCancel}
            >
              取消
            </button>
          )}
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? "正在切换…" : "保存并连接"} <ArrowRight size={16} />
          </button>
        </div>
      </form>
      <p className="connection-footnote">
        <KeyRound size={13} /> 更换数据平台后，使用对应平台的账号登录。
      </p>
    </div>
  );
}
