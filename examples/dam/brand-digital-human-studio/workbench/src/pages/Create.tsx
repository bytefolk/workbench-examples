import { mediaAsset } from "../media";
import { useRef, useState } from "react";
import {
  WandSparkles,
  ArrowRight,
  Check,
  Bookmark,
  ChevronRight,
  Plus,
  Film,
  SlidersHorizontal,
  LoaderCircle,
  Cable,
  CircleDollarSign,
} from "lucide-react";
import type { Asset, AssetKind, Draft } from "../types";
import { kindLabels } from "../types";
import { makeShots } from "../data";
import { AssetImage, PageHeader } from "../components/UI";
import { MatchPanel } from "../components/MatchPanel";
import { api, matchAssets, rulesFallback } from "../api";
import type { MatchResult, ProviderConfig } from "../api";
interface Props {
  draft: Draft;
  assets: Asset[];
  onChange: (draft: Draft) => void;
  onSubmit: () => void;
  onSave: () => void;
  config: ProviderConfig | null;
  submitting: boolean;
}
export function Create({
  draft,
  assets,
  onChange,
  onSubmit,
  onSave,
  config,
  submitting,
}: Props) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [matching, setMatching] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{
    usd: number;
    credits: number;
  } | null>(null);
  const matchVersion = useRef(0);
  const estimateVersion = useRef(0);
  const realMode = draft.mode === "higgsfield";
  const realAvailable = !!config?.configured && !!config?.enabled;
  const models = config?.models?.length
    ? config.models
    : [
        {
          id: "seedance-reference",
          label: "Seedance 2.0 · 参考图视频",
          minDuration: 4,
          maxDuration: 15,
        },
        {
          id: "kling-reference",
          label: "Kling O3 · 多图参考",
          minDuration: 3,
          maxDuration: 15,
        },
      ];
  const model =
    models.find(
      (item) => item.id === (draft.modelId || "seedance-reference"),
    ) || models[0];
  const patch = (p: Partial<Draft>) => {
    estimateVersion.current += 1;
    setEstimate(null);
    setEstimating(false);
    onChange({ ...draft, ...p });
    setError("");
  };
  const selected = [
    draft.characterId,
    draft.productId,
    draft.sceneId,
    draft.voiceId,
  ]
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is Asset => !!a);
  function next() {
    if (!draft.title.trim()) {
      setError("请先为这次创作起一个名字。");
      return;
    }
    if (!draft.prompt.trim()) {
      setError("请填写创作需求，让分镜有明确的方向。");
      return;
    }
    if (!draft.characterId || !draft.productId || !draft.sceneId) {
      setError("请选择人物、商品和场景。");
      return;
    }
    if (!draft.shots.length) patch({ shots: makeShots(draft, assets) });
    setStep(2);
  }
  async function match() {
    const version = ++matchVersion.current;
    const prompt = draft.prompt;
    setMatching(true);
    setMatchResult(null);
    try {
      const result = await matchAssets(prompt, assets);
      if (version === matchVersion.current) setMatchResult(result);
    } catch {
      if (version === matchVersion.current) {
        const fallback = rulesFallback(prompt, assets);
        setMatchResult({
          ...fallback,
          warnings: [
            ...fallback.warnings,
            "服务暂不可用，已使用本地规则检索。",
          ],
        });
      }
    } finally {
      if (version === matchVersion.current) setMatching(false);
    }
  }
  function applyCandidates(selection: Partial<Record<AssetKind, string>>) {
    const changes: Partial<Draft> = { shots: [] };
    for (const [kind, id] of Object.entries(selection)) {
      if (id)
        changes[
          `${kind}Id` as "characterId" | "productId" | "sceneId" | "voiceId"
        ] = id;
    }
    patch(changes);
  }
  function chooseMode(mode: "demo" | "higgsfield") {
    patch({
      mode,
      modelId: model.id,
      resolution: draft.resolution || "720p",
      duration:
        mode === "higgsfield"
          ? Math.min(
              model.maxDuration,
              Math.max(model.minDuration, draft.duration),
            )
          : [12, 24, 36].includes(draft.duration)
            ? draft.duration
            : 12,
    });
  }
  async function estimateCost() {
    if (!realMode || !realAvailable || estimating) return;
    const version = ++estimateVersion.current;
    setEstimating(true);
    setEstimate(null);
    setError("");
    try {
      const prepared = {
        ...draft,
        shots: draft.shots.length ? draft.shots : makeShots(draft, assets),
      };
      const result = await api<{ usd: number; credits: number }>(
        "/api/videos/estimate",
        { draft: prepared, assets: selected },
      );
      if (version === estimateVersion.current) setEstimate(result);
    } catch (failure) {
      if (version === estimateVersion.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "费用估算失败，请稍后重试。",
        );
    } finally {
      if (version === estimateVersion.current) setEstimating(false);
    }
  }
  function picker(
    kind: AssetKind,
    key: "characterId" | "productId" | "sceneId" | "voiceId",
  ) {
    return (
      <label className="field" key={kind}>
        {kindLabels[kind]}
        <select
          value={draft[key]}
          onChange={(e) => patch({ [key]: e.target.value, shots: [] })}
        >
          {kind === "voice" && <option value="">不使用声音档案</option>}
          {assets
            .filter((a) => a.kind === kind)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </label>
    );
  }
  return (
    <>
      <PageHeader
        title="视频创作"
        description="把一个想法，变成属于品牌的下一段故事。"
      >
        <button className="button secondary" onClick={onSave}>
          <Bookmark size={16} />
          保存草稿
        </button>
      </PageHeader>
      <div className="creation-steps">
        <button
          className={step === 1 ? "active" : "done"}
          onClick={() => setStep(1)}
        >
          <span>{step > 1 ? <Check size={14} /> : 1}</span>创意与资产
        </button>
        <ChevronRight size={15} />
        <button className={step === 2 ? "active" : ""} onClick={next}>
          <span>2</span>脚本与分镜
        </button>
        <ChevronRight size={15} />
        <div>
          <span>3</span>生成与成片
        </div>
      </div>
      <section className="provider-choice" aria-label="生成模式">
        <div className="integration-heading">
          <div>
            <Cable size={17} />
            <strong>生成模式</strong>
          </div>
          <span
            className={`connection-status ${realAvailable ? "connected" : ""}`}
          >
            {realAvailable ? "API 已配置" : "本地 Demo"}
          </span>
        </div>
        <div className="mode-options" role="group" aria-label="选择生成模式">
          <button
            className={!realMode ? "active" : ""}
            aria-pressed={!realMode}
            onClick={() => chooseMode("demo")}
          >
            <strong>模拟流程</strong>
            <span>免费 · 内置样片 · 验证操作流程</span>
          </button>
          <button
            className={realMode ? "active" : ""}
            aria-pressed={realMode}
            onClick={() => chooseMode("higgsfield")}
          >
            <strong>Higgsfield 真实 API</strong>
            <span>按调用计费 · 参考图生成短视频</span>
          </button>
        </div>
        {realMode && (
          <p className="helper provider-note">
            {config?.catalogOnly
              ? "此目录入口仅运行免费模拟。真实验证请按案例说明单独启动工作台和本机代理。"
              : realAvailable
                ? "提交将上传所选人物、商品和场景参考图，并产生平台调用费用。实际效果需要样片验证。"
                : "可查看参数与能力边界。运行服务并在 .env 配置 HF_API_KEY、HF_ENABLE_REAL=true 后，才能提交真实生成；密钥由服务端保管。"}
          </p>
        )}
      </section>
      <div className="creation-layout">
        <section className="creation-form">
          {step === 1 ? (
            <>
              <div className="section-heading">
                <h2>这一次，想讲什么故事？</h2>
                <span>01 / 创意</span>
              </div>
              <label className="field">
                创作名称
                <input
                  value={draft.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  maxLength={60}
                  placeholder="例如：云朵羊毛帽 · 秋日庭院"
                />
              </label>
              <label className="field">
                创作需求
                <textarea
                  value={draft.prompt}
                  onChange={(e) => {
                    patch({ prompt: e.target.value, shots: [] });
                    matchVersion.current += 1;
                    setMatchResult(null);
                    setMatching(false);
                  }}
                  maxLength={1200}
                  rows={5}
                  placeholder="描述人物、单品、场景和想表达的情绪。比如：让林知夏戴着 H001 羊毛帽，在秋日庭院自然地介绍产品…"
                />
                <span className="text-counter">
                  {draft.prompt.length} / 1200
                </span>
              </label>
              <div className="prompt-actions">
                <button
                  className="text-button"
                  onClick={() => {
                    matchVersion.current += 1;
                    setMatchResult(null);
                    setMatching(false);
                    patch({
                      title: "秋日，自有风格",
                      prompt:
                        "让林知夏戴着 H001 云朵羊毛帽，在秋日庭院温柔地介绍产品，包含自然走动和转身。镜头克制，光线柔和，体现成熟而从容的生活态度。",
                      shots: [],
                    });
                  }}
                >
                  <Plus size={14} />
                  填入示例灵感
                </button>
                <button
                  className="button secondary compact"
                  disabled={!draft.prompt.trim() || matching}
                  onClick={match}
                >
                  {matching ? (
                    <LoaderCircle size={15} className="spinning" />
                  ) : (
                    <WandSparkles size={15} />
                  )}
                  {matching ? "解析与检索中…" : "推荐品牌资产"}
                </button>
              </div>
              {matchResult && (
                <MatchPanel
                  result={matchResult}
                  assets={assets}
                  onApply={applyCandidates}
                  onClose={() => setMatchResult(null)}
                />
              )}
              <div className="section-heading divided">
                <h2>选择这段故事的主角</h2>
                <span>02 / 资产</span>
              </div>
              <div className="field-grid">
                {picker("character", "characterId")}
                {picker("product", "productId")}
                {picker("scene", "sceneId")}
                {picker("voice", "voiceId")}
              </div>
              <p className="helper">
                声音档案仅关联素材；本次未接入声线克隆或口型同步服务。人物参考图也不等于自有模型文件。
              </p>
              <div className="section-heading divided">
                <h2>定义画面的节奏</h2>
                <SlidersHorizontal size={17} />
              </div>
              <div className="field-grid">
                <div className="field">
                  <span>画面比例</span>
                  <div className="segmented" role="group" aria-label="画面比例">
                    {(["16:9", "9:16"] as const).map((r) => (
                      <button
                        key={r}
                        className={draft.ratio === r ? "active" : ""}
                        onClick={() => patch({ ratio: r })}
                        aria-pressed={draft.ratio === r}
                      >
                        <span
                          className={`ratio-icon ${r === "9:16" ? "vertical" : ""}`}
                        />
                        {r === "16:9" ? "横屏 16:9" : "竖屏 9:16"}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="field">
                  目标时长
                  <select
                    value={draft.duration}
                    onChange={(e) =>
                      patch({ duration: Number(e.target.value) })
                    }
                  >
                    {realMode ? (
                      Array.from(
                        { length: model.maxDuration - model.minDuration + 1 },
                        (_, i) => model.minDuration + i,
                      ).map((duration) => (
                        <option key={duration} value={duration}>
                          {duration} 秒
                        </option>
                      ))
                    ) : (
                      <>
                        <option value={12}>12 秒 · 精简叙事</option>
                        <option value={24}>24 秒 · 产品介绍</option>
                        <option value={36}>36 秒 · 生活短片</option>
                      </>
                    )}
                  </select>
                </label>
                <label className="field">
                  情绪与语气
                  <select
                    value={draft.mood}
                    onChange={(e) => patch({ mood: e.target.value, shots: [] })}
                  >
                    <option>自然温柔</option>
                    <option>从容自信</option>
                    <option>愉悦轻快</option>
                    <option>安静沉思</option>
                  </select>
                </label>
                <label className="field">
                  {realMode ? "视频模型" : "生成方式"}
                  {realMode ? (
                    <select
                      value={model.id}
                      onChange={(e) => {
                        const nextModel = models.find(
                          (item) => item.id === e.target.value,
                        )!;
                        patch({
                          modelId: nextModel.id,
                          duration: Math.min(
                            nextModel.maxDuration,
                            Math.max(nextModel.minDuration, draft.duration),
                          ),
                        });
                      }}
                    >
                      {models.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="static-input">
                      <span className="tiny-dot" />
                      Higgsfield · 本地模拟
                    </div>
                  )}
                </label>
                {realMode && (
                  <>
                    {model.id === "kling-reference" ? (
                      <div className="field">
                        <span>输出档位</span>
                        <div className="static-input">平台标准档</div>
                        <small className="helper">
                          该接口不传分辨率参数，输出由平台决定。
                        </small>
                      </div>
                    ) : (
                      <label className="field">
                        分辨率
                        <select
                          value={draft.resolution || "720p"}
                          onChange={(e) =>
                            patch({
                              resolution: e.target.value as "720p" | "1080p",
                            })
                          }
                        >
                          <option value="720p">720p</option>
                          <option value="1080p">1080p</option>
                        </select>
                      </label>
                    )}
                    <div className="field">
                      <span>音频输出</span>
                      <label className="integration-check">
                        <input
                          type="checkbox"
                          checked={draft.generateAudio ?? false}
                          onChange={(e) =>
                            patch({ generateAudio: e.target.checked })
                          }
                        />
                        生成模型原生音频
                      </label>
                      <small className="helper">
                        可能包含环境音或模型配音，不代表克隆品牌声线。
                      </small>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="section-heading">
                <h2>让故事在镜头里展开</h2>
                <span>共 {draft.shots.length} 个镜头</span>
              </div>
              <p className="muted">
                基于当前素材的规则分镜，可自由修改。没有调用语言模型。
              </p>
              <div className="shots">
                {draft.shots.map((shot, i) => (
                  <div className="shot" key={shot.id}>
                    <div className="shot-top">
                      <span>
                        <Film size={15} />
                        {shot.title}
                      </span>
                      <small>
                        {Math.round(draft.duration / draft.shots.length)} 秒
                      </small>
                    </div>
                    <label className="field">
                      画面与动作
                      <textarea
                        rows={2}
                        value={shot.description}
                        onChange={(e) =>
                          patch({
                            shots: draft.shots.map((s, n) =>
                              n === i
                                ? { ...s, description: e.target.value }
                                : s,
                            ),
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      旁白／台词
                      <input
                        value={shot.narration}
                        onChange={(e) =>
                          patch({
                            shots: draft.shots.map((s, n) =>
                              n === i ? { ...s, narration: e.target.value } : s,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
              <div className="inline-note">
                <Film size={17} />
                {realMode
                  ? "本次将分镜编译为一条短视频提示词，提交所选参考图。分镜用于表达意图，不能保证逐镜精确表演；台词是提示信息，尚未做克隆声线与口型同步。"
                  : "演示任务约 22 秒完成；输出为内置 6 秒静态素材动态样片，不是 AI 表演或声音克隆结果。"}
              </div>
            </>
          )}
          {realMode && (
            <div className="match-panel" aria-label="生成费用估算">
              <div className="integration-heading">
                <div>
                  <CircleDollarSign size={17} />
                  <strong>当前账号费用估算</strong>
                </div>
              </div>
              <p className="helper">
                按当前模型、时长与素材查询平台估算。估算会上传引用素材，不会创建视频生成任务；更改参数后需重新估算。
              </p>
              <div className="integration-actions">
                <span className="helper">
                  {estimate
                    ? `预计 USD ${Number(estimate.usd).toFixed(4)} · ${estimate.credits} credits。以 API 实际消费为准。`
                    : !realAvailable
                      ? "配置并启用真实 API 后可查询估算。"
                      : "先填写需求并选好人物、商品和场景。"}
                </span>
                <button
                  className="button secondary compact"
                  disabled={
                    !realAvailable ||
                    estimating ||
                    submitting ||
                    !draft.prompt.trim() ||
                    !draft.characterId ||
                    !draft.productId ||
                    !draft.sceneId
                  }
                  onClick={() => void estimateCost()}
                >
                  {estimating ? (
                    <LoaderCircle size={15} className="spinning" />
                  ) : (
                    <CircleDollarSign size={15} />
                  )}
                  {estimating ? "查询估算中…" : "估算本次费用"}
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="creation-bottom">
            <span>
              <span className="tiny-dot" />
              草稿自动保存在本地
            </span>
            {step === 1 ? (
              <button className="button" onClick={next}>
                下一步：脚本与分镜
                <ArrowRight size={17} />
              </button>
            ) : (
              <div className="button-row">
                <button className="button secondary" onClick={() => setStep(1)}>
                  上一步
                </button>
                <button
                  className="button"
                  disabled={submitting || (realMode && !realAvailable)}
                  onClick={() => {
                    if (draft.shots.some((s) => !s.description.trim())) {
                      setError("请补充每个镜头的画面描述。");
                      return;
                    }
                    onSubmit();
                  }}
                >
                  {submitting ? (
                    <LoaderCircle size={17} className="spinning" />
                  ) : (
                    <WandSparkles size={17} />
                  )}
                  {submitting
                    ? "正在提交…"
                    : realMode
                      ? "提交真实生成 · 按调用计费"
                      : "提交模拟生成"}
                </button>
              </div>
            )}
          </div>
        </section>
        <aside className="creation-preview">
          <div className="preview-poster">
            <img
              src={
                selected.find((a) => a.kind === "character")?.image ||
                mediaAsset("portrait.png")
              }
              alt="所选人物参考预览"
            />
            <span>人物参考 · 非生成结果</span>
            <div>
              <small>MUSE / BRAND STORY</small>
              <h3>{draft.title || "你的下一段品牌故事"}</h3>
            </div>
          </div>
          <div className="preview-summary">
            <h3>本次使用的品牌资产</h3>
            {selected.map((a) => (
              <div key={a.id} className="summary-asset">
                <AssetImage asset={a} />
                <div>
                  <small>{kindLabels[a.kind]}</small>
                  <strong>{a.name}</strong>
                </div>
                <Check size={14} />
              </div>
            ))}
            <div className="spec-summary">
              <span>{draft.ratio}</span>
              <span>目标 {draft.duration}s</span>
              <span>{draft.mood}</span>
            </div>
            <p className="helper">
              {realMode
                ? "所选参考图由服务端上传并缓存复用。跨镜头人物、动作和商品细节需要人工审核。声音档案仅演示关联。"
                : "已保存的资产会自动带入创作，无需重复上传。声音档案仅演示关联。"}
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
