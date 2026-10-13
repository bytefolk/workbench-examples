import { useEffect, useState } from "react";
import {
  Sparkles,
  ArrowRight,
  Check,
  ShieldCheck,
  Info,
  Save,
  ChevronRight,
  WandSparkles,
  SlidersHorizontal,
  AlertTriangle,
} from "lucide-react";
import { useApp } from "../store";
import {
  characterIssues,
  configIssues,
  parsePrompt,
  versionOf,
  visibleCharacters,
} from "../domain/model";
import {
  can,
  scopeNames,
  type GenerationConfig,
  type Scope,
} from "../domain/types";
import {
  AssetIcon,
  Badge,
  Dialog,
  MockBadge,
  PageTitle,
  Portrait,
} from "../components/ui";
export function Generate() {
  const app = useApp();
  const [prompt, setPrompt] = useState(app.draft.prompt);
  const [config, setConfig] = useState<GenerationConfig>(app.draft.config);
  const [savedId, setSavedId] = useState(app.draft.id);
  const [parsed, setParsed] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [reason, setReason] = useState(
    "根据人物标签与可用素材推荐，请确认选择。",
  );
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setPrompt(app.draft.prompt);
    setConfig(app.draft.config);
    setSavedId(app.draft.id);
  }, [app.draft]);
  const characters = visibleCharacters(app.db, app.role),
    character = characters.find((c) => c.id === config.characterId),
    version = character ? versionOf(app.db, character) : undefined;
  const issues = configIssues(app.db, config, app.role);
  const charIssues =
    character && version
      ? characterIssues(character, version, config.scope)
      : ["请选择人物"];
  const provider = app.db.providers.find((p) => p.id === config.providerId);
  const set = <K extends keyof GenerationConfig>(
    key: K,
    value: GenerationConfig[K],
  ) => setConfig((prev) => ({ ...prev, [key]: value }));
  const parse = () => {
    try {
      const r = parsePrompt(app.db, prompt, app.role);
      setConfig(r.config);
      setNotes(r.notes);
      setReason(r.reason);
      setParsed(true);
      setError("");
      app.setToast("已完成 Mock 需求解析，请确认并调整配置");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="FROM IDEA TO STORY"
        title="视频生成"
        description="描述你的灵感，工作台会推荐人物与素材。每一项配置，都由你确认。"
        actions={
          <span className="outline-label">
            <Sparkles size={14} />
            Mock 生成体验
          </span>
        }
      />
      <div className="flow-steps">
        <span className="active">
          <i>01</i>描述需求
        </span>
        <ChevronRight size={14} />
        <span className={parsed ? "active" : ""}>
          <i>02</i>确认创作配置
        </span>
        <ChevronRight size={14} />
        <span>
          <i>03</i>生成与审核
        </span>
      </div>
      {!can(app.role, "create") && (
        <div className="notice warning">
          当前角色可查看配置。提交生成任务需要切换「内容创作者」或「系统管理员」。
        </div>
      )}
      <div className="generation-layout">
        <div className="generation-main">
          <section className="panel prompt-panel">
            <div className="panel-heading">
              <h2>
                <WandSparkles size={19} />
                这次，想讲什么故事？
              </h2>
              <MockBadge />
            </div>
            <textarea
              aria-label="视频创作需求"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述人物、内容、商品、情绪与时长…"
            />
            <div className="prompt-bottom">
              <span>描述越具体，推荐越贴近你的想法</span>
              <button className="button primary" onClick={parse}>
                <Sparkles size={16} />
                解析需求
              </button>
            </div>
            {error && (
              <div className="notice warning" role="alert">
                {error}
              </div>
            )}
          </section>
          {notes.length > 0 && (
            <div className="notice warning">
              <Info size={17} />
              <div>
                <b>以下建议需要你确认</b>
                {notes.map((n) => (
                  <p key={n}>{n}</p>
                ))}
              </div>
            </div>
          )}
          <section className="panel config-panel">
            <div className="panel-heading">
              <h2>
                <SlidersHorizontal size={18} />
                创作配置
              </h2>
              <span className="muted small-text">所有字段均可调整</span>
            </div>
            <div className="form-grid">
              <label className="span-2">
                视频脚本
                <span className="label-note">AI 模拟建议 · 请审核品牌表达</span>
                <textarea
                  aria-label="视频脚本"
                  className="script-editor"
                  value={config.script}
                  onChange={(e) => set("script", e.target.value)}
                  rows={5}
                />
                <span className="textarea-count">
                  {config.script.length} 字 · {config.duration} 秒
                </span>
              </label>
              <label className="span-2">
                内容用途
                <select
                  aria-label="内容用途"
                  value={config.purpose}
                  onChange={(e) => set("purpose", e.target.value)}
                >
                  {["商品试戴", "生活方式独白", "剧情独角戏", "种草短片"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                商品 / 内容主题
                <input
                  aria-label="商品或内容主题"
                  value={config.product}
                  onChange={(e) => set("product", e.target.value)}
                />
              </label>
              <label>
                场景
                <input
                  aria-label="场景"
                  value={config.scene}
                  onChange={(e) => set("scene", e.target.value)}
                />
              </label>
              <label>
                情绪与语气
                <input
                  aria-label="情绪与语气"
                  value={config.emotion}
                  onChange={(e) => set("emotion", e.target.value)}
                />
              </label>
              <label>
                动作表现
                <input
                  aria-label="动作表现"
                  value={config.action}
                  onChange={(e) => set("action", e.target.value)}
                />
              </label>
              <label>
                视频时长
                <span className="input-with-unit">
                  <input
                    aria-label="视频时长"
                    type="number"
                    min="5"
                    max="120"
                    value={config.duration}
                    onChange={(e) => set("duration", Number(e.target.value))}
                  />
                  <span>秒</span>
                </span>
              </label>
              <label>
                画幅
                <select
                  aria-label="画幅"
                  value={config.ratio}
                  onChange={(e) =>
                    set("ratio", e.target.value as GenerationConfig["ratio"])
                  }
                >
                  <option value="9:16">9:16 · 竖屏</option>
                  <option value="16:9">16:9 · 横屏</option>
                  <option value="1:1">1:1 · 方形</option>
                </select>
              </label>
              <label>
                语言
                <select
                  aria-label="语言"
                  value={config.language}
                  onChange={(e) => set("language", e.target.value)}
                >
                  <option>普通话</option>
                  <option>英语</option>
                  <option>粤语</option>
                </select>
              </label>
              <label>
                声线
                <input
                  aria-label="声线"
                  value={config.voice}
                  onChange={(e) => set("voice", e.target.value)}
                />
              </label>
              <label>
                使用范围
                <select
                  aria-label="使用范围"
                  value={config.scope}
                  onChange={(e) => set("scope", e.target.value as Scope)}
                >
                  {Object.entries(scopeNames).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                模型渠道
                <select
                  aria-label="模型渠道"
                  value={config.providerId}
                  onChange={(e) => set("providerId", e.target.value)}
                >
                  {app.db.providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {!p.enabled
                        ? " · 已停用"
                        : !p.configured
                          ? " · 缺少配置"
                          : " · Mock"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="capability-note">
              <Info size={15} />
              <p>
                试戴、口型与人物一致性仅作为配置展示，真实生成质量需由供应商样片验证。
              </p>
            </div>
          </section>
        </div>
        <aside className="generation-aside">
          <section className="panel recommended-panel">
            <div className="panel-heading">
              <h2>本次人物资产</h2>
              <span className="tiny-spark">✦</span>
            </div>
            <label className="select-label">
              选择人物
              <select
                aria-label="选择生成的人物"
                value={config.characterId}
                onChange={(e) => {
                  const c = characters.find((c) => c.id === e.target.value);
                  setConfig((prev) => ({
                    ...prev,
                    characterId: e.target.value,
                    voice: `${c?.subtitle || ""} · 温柔女声`,
                  }));
                  setReason("你已手动选择人物，请核对授权与素材。");
                }}
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.subtitle}
                  </option>
                ))}
              </select>
            </label>
            {character && version && (
              <>
                <Portrait
                  index={character.portrait}
                  className="recommended-photo"
                >
                  <span className="photo-ai">AI 示意图</span>
                </Portrait>
                <div className="card-title">
                  <h3>{character.name}</h3>
                  <span className="version-tag">v{version.version}.0</span>
                </div>
                <p className="recommend-reason">{reason}</p>
                <div className="recommended-assets">
                  {version.assets
                    .filter((a) =>
                      ["image", "video", "voice", "license"].includes(a.type),
                    )
                    .map((a) => (
                      <div key={a.id}>
                        <AssetIcon type={a.type} size={15} />
                        <span>{a.name}</span>
                        {a.licenseStatus === "valid" ? (
                          <Check size={13} />
                        ) : (
                          <AlertTriangle size={13} />
                        )}
                      </div>
                    ))}
                </div>
                <div
                  className={`license-check ${charIssues.length ? "blocked" : ""}`}
                >
                  <ShieldCheck size={16} />
                  <span>
                    {charIssues.length
                      ? "授权或素材需要处理"
                      : "授权有效 · 可用于品牌社交媒体"}
                  </span>
                </div>
                {charIssues.length > 0 && (
                  <div className="inline-issues">
                    {charIssues.map((i) => (
                      <p key={i}>{i}</p>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
          <section className="panel estimate-panel">
            <div className="panel-heading">
              <h2>生成估算</h2>
              <MockBadge />
            </div>
            <div className="estimate-value">
              <span>{provider?.rate == null ? "" : "¥"}</span>
              {provider?.rate == null
                ? "待确认"
                : (provider.rate * config.duration).toFixed(2)}
              <small>模拟费用</small>
            </div>
            <div className="estimate-lines">
              <span>
                预计耗时<b>约 11 秒 · 演示</b>
              </span>
              <span>
                结果形式<b>静态占位预览</b>
              </span>
            </div>
            <fieldset className="outcome-choice">
              <legend>模拟演示结果</legend>
              <label>
                <input
                  name="outcome"
                  type="radio"
                  checked={config.outcome === "success"}
                  onChange={() => set("outcome", "success")}
                />
                成功
              </label>
              <label>
                <input
                  name="outcome"
                  type="radio"
                  checked={config.outcome === "failure"}
                  onChange={() => set("outcome", "failure")}
                />
                失败
              </label>
            </fieldset>
            <button
              className="button primary full"
              disabled={!can(app.role, "create") || issues.length > 0}
              onClick={() => setConfirm(true)}
            >
              确认生成配置
              <ArrowRight size={16} />
            </button>
            <button
              className="button text full"
              disabled={!can(app.role, "create")}
              onClick={() => {
                const id = app.saveDraft(prompt, config, savedId);
                if (id) setSavedId(id);
              }}
            >
              <Save size={15} />
              保存为草稿
            </button>
            {issues.length > 0 && (
              <div className="submit-issues" role="alert">
                {issues.map((i) => (
                  <p key={i}>{i}</p>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
      {confirm && (
        <Dialog
          title="确认这次创作"
          subtitle="提交后会保存人物版本、素材快照与全部参数。"
          onClose={() => setConfirm(false)}
          wide
        >
          <div className="dialog-content">
            <div className="confirmation-persona">
              {character && (
                <Portrait
                  index={character.portrait}
                  className="mini-portrait"
                />
              )}
              <div>
                <b>
                  {version?.name} · v{version?.version}.0
                </b>
                <p>
                  {version?.assets.length} 份素材 · 授权至 {version?.validUntil}
                </p>
              </div>
              <Badge status="available" />
            </div>
            <div className="detail-kv">
              <span>
                模型渠道
                <b>
                  {provider?.name} <MockBadge />
                </b>
              </span>
              <span>
                时长 / 画幅
                <b>
                  {config.duration} 秒 / {config.ratio}
                </b>
              </span>
              <span>
                场景<b>{config.scene}</b>
              </span>
              <span>
                情绪与动作
                <b>
                  {config.emotion} / {config.action}
                </b>
              </span>
              <span>
                商品 / 用途
                <b>
                  {config.product} / {config.purpose}
                </b>
              </span>
              <span>
                语言与声线
                <b>
                  {config.language} / {config.voice}
                </b>
              </span>
              <span>
                使用范围<b>{scopeNames[config.scope]}</b>
              </span>
              <span>
                模拟估算
                <b>
                  {provider?.rate == null
                    ? "待确认"
                    : `¥${(provider.rate * config.duration).toFixed(2)}`}
                </b>
              </span>
            </div>
            <h3 className="detail-section-heading">引用素材</h3>
            <div className="tags">
              {version?.assets.map((a) => (
                <span key={a.id}>
                  {a.name} · v{a.version}
                </span>
              ))}
            </div>
            <h3 className="detail-section-heading">视频脚本</h3>
            <p className="script-block">{config.script}</p>
            <div className="notice">
              本次提交为 Mock 任务，模拟结果为
              {config.outcome === "success" ? "成功" : "失败"}
              。不调用真实模型，不发生实际费用。
            </div>
            {issues.length > 0 && (
              <div className="notice warning" role="alert">
                {issues.join("；")}
              </div>
            )}
            <div className="dialog-footer">
              <button
                className="button secondary"
                onClick={() => setConfirm(false)}
              >
                返回调整
              </button>
              <button
                className="button primary"
                disabled={issues.length > 0}
                onClick={() => app.submit(prompt, config, savedId)}
              >
                确认并提交
                <Sparkles size={16} />
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
