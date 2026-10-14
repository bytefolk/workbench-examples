import { useEffect, useRef, useState } from "react";
import {
  Check,
  ImagePlus,
  Link,
  LoaderCircle,
  RefreshCw,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { api } from "../api";
import type { ProviderConfig, RemoteGeneration, SoulResponse } from "../api";
import type { Asset } from "../types";
import { Modal } from "./UI";

interface Props {
  asset: Asset;
  config: ProviderConfig | null;
  onUpdate: (id: string, patch: Partial<Asset>) => void;
  onClose: () => void;
}

interface Photo {
  name: string;
  data: string;
}
const soulLabels: Record<string, string> = {
  queued: "排队中",
  pending: "等待处理",
  processing: "处理中",
  in_progress: "处理中",
  generating: "生成中",
  training: "训练中",
  completed: "已完成",
  failed: "失败",
  nsfw: "平台未通过内容检查",
  canceled: "已取消",
};
const describeStatus = (status: string) =>
  soulLabels[status.toLowerCase()] || status || "尚未创建";

export function SoulPanel({ asset, config, onUpdate, onClose }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [soul, setSoul] = useState<SoulResponse | null>(() =>
    asset.soulId
      ? { id: asset.soulId, status: asset.soulStatus || "unknown" }
      : null,
  );
  const [bindId, setBindId] = useState(asset.soulId || "");
  const [prompt, setPrompt] = useState(
    "同一位人物，穿米白色针织衫，戴羊毛帽，在秋日庭院从容微笑，真实摄影，自然光，全身构图。",
  );
  const [ratio, setRatio] = useState<"16:9" | "9:16">("9:16");
  const [request, setRequest] = useState<RemoteGeneration | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [applied, setApplied] = useState(false);
  const mounted = useRef(true);
  const polling = useRef(false);
  const canCall = !!config?.configured && !!config?.enabled;
  const soulCompleted = soul?.status.toLowerCase() === "completed";
  const generationActive =
    !!request &&
    !["completed", "failed", "nsfw", "canceled"].includes(
      request.status.toLowerCase(),
    );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!request || !generationActive || !canCall) return;
    const requestId = request.requestId;
    const timer = window.setInterval(async () => {
      if (polling.current) return;
      polling.current = true;
      try {
        const result = await api<RemoteGeneration>(
          `/api/requests/${encodeURIComponent(requestId)}`,
        );
        if (!mounted.current) return;
        setRequest(result);
        setError(
          result.error ||
            (result.status.toLowerCase() === "nsfw"
              ? "平台未通过内容检查，请调整参考图和画面需求。"
              : ""),
        );
      } catch (failure) {
        if (mounted.current)
          setError(
            failure instanceof Error
              ? failure.message
              : "参考图状态查询失败，请稍后手动刷新。",
          );
      } finally {
        polling.current = false;
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [request?.requestId, generationActive, canCall]);

  async function readPhotos(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setNote("");
    const selected = Array.from(files);
    if (photos.length + selected.length > 12) {
      setError("本 Demo 最多选择 12 张同一人的参考照片。");
      return;
    }
    if (
      selected.some(
        (file) =>
          !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
          file.size > 2 * 1024 * 1024,
      )
    ) {
      setError("请使用 PNG / JPEG / WebP，每张不超过 2 MB。");
      return;
    }
    setBusy("reading");
    try {
      const loaded = await Promise.all(
        selected.map(
          (file) =>
            new Promise<Photo>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({ name: file.name, data: String(reader.result) });
              reader.onerror = () =>
                reject(new Error("图片读取失败，请重新选择。"));
              reader.readAsDataURL(file);
            }),
        ),
      );
      if (mounted.current) setPhotos((current) => [...current, ...loaded]);
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : "读取失败。");
    } finally {
      if (mounted.current) setBusy("");
    }
  }
  function saveSoul(result: SoulResponse) {
    setSoul(result);
    setBindId(result.id);
    onUpdate(asset.id, { soulId: result.id, soulStatus: result.status });
  }
  async function perform(action: string, work: () => Promise<void>) {
    if (!canCall || busy) return;
    setBusy(action);
    setError("");
    setNote("");
    try {
      await work();
    } catch (failure) {
      if (mounted.current)
        setError(failure instanceof Error ? failure.message : "接口调用失败。");
    } finally {
      if (mounted.current) setBusy("");
    }
  }
  return (
    <Modal
      title={`${asset.name.split(" · ")[0]} · 人物身份参考`}
      wide
      onClose={onClose}
    >
      <div className="modal-body soul-panel">
        <div className="inline-note">
          <ImagePlus size={18} />
          <span>
            Soul
            身份用于生成保持人物特征的参考图，再把参考图带入视频生成。它不包含克隆声线，也不提供可导出的私有模型文件。
          </span>
        </div>
        {!canCall && (
          <div className="integration-warning">
            真实接口尚未启用。可查看流程与准备素材；在服务端配置
            HF_API_KEY、HF_ENABLE_REAL=true
            后才能绑定、训练和生成。未配置密钥时不伪造训练结果。
          </div>
        )}
        <section className="soul-section">
          <div className="integration-heading">
            <div>
              <Link size={16} />
              <h3>1. 绑定已有 Soul，或创建人物身份</h3>
            </div>
          </div>
          <label className="field">
            已有 Soul ID
            <input
              value={bindId}
              onChange={(e) => setBindId(e.target.value)}
              placeholder="输入当前 API 账号下的 Soul UUID"
            />
          </label>
          <div className="integration-actions">
            <span className="helper">先查询验证归属与状态，再保存关联。</span>
            <button
              className="button secondary compact"
              disabled={
                !canCall || !!busy || generationActive || !bindId.trim()
              }
              onClick={() => {
                if (
                  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    bindId.trim(),
                  )
                ) {
                  setError("请输入完整的 Soul UUID。");
                  return;
                }
                void perform("bind", async () => {
                  const result = await api<SoulResponse>("/api/souls/bind", {
                    id: bindId.trim(),
                  });
                  if (mounted.current) {
                    saveSoul(result);
                    setNote("已验证并关联 Soul。状态已按接口返回保存。");
                  }
                });
              }}
            >
              {busy === "bind" ? (
                <LoaderCircle size={15} className="spinning" />
              ) : (
                <Link size={15} />
              )}
              验证并绑定
            </button>
          </div>
          <div className="soul-divider">或者，用同一人的照片创建新身份</div>
          <label className="soul-upload">
            <ImagePlus size={22} />
            <strong>选择参考照片</strong>
            <span>
              建议清晰正脸、侧脸与全身，统一人物 · 最多 12 张 · 每张 2 MB
            </span>
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              disabled={!!busy}
              aria-label="选择同一人物的参考照片"
              onChange={(e) => {
                void readPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {photos.length > 0 && (
            <div className="soul-photo-grid">
              {photos.map((photo, index) => (
                <div key={`${photo.name}-${index}`}>
                  <img src={photo.data} alt={`参考照片 ${index + 1}`} />
                  <span>{photo.name}</span>
                  <button
                    className="icon-button"
                    disabled={!!busy}
                    aria-label={`移除参考照片 ${index + 1}`}
                    onClick={() =>
                      setPhotos((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="integration-actions">
            <span className="helper">
              {photos.length} 张待上传 · 创建会调用收费平台能力。
            </span>
            <button
              className="button compact"
              disabled={
                !canCall || !!busy || generationActive || photos.length === 0
              }
              onClick={() =>
                void perform("create", async () => {
                  const result = await api<SoulResponse>("/api/souls", {
                    name: asset.name,
                    images: photos.map((photo) => photo.data),
                  });
                  if (mounted.current) {
                    saveSoul(result);
                    setPhotos([]);
                    setNote(
                      "已提交人物身份创建。请刷新状态，完成后可生成参考图。",
                    );
                  }
                })
              }
            >
              {busy === "create" ? (
                <LoaderCircle size={15} className="spinning" />
              ) : (
                <WandSparkles size={15} />
              )}
              创建人物身份 · 收费调用
            </button>
          </div>
        </section>
        <section className="soul-section">
          <div className="integration-heading">
            <div>
              <Check size={16} />
              <h3>2. 检查身份状态</h3>
            </div>
            <button
              className="text-button"
              disabled={!canCall || !!busy || !soul}
              onClick={() =>
                void perform("status", async () => {
                  const result = await api<SoulResponse>(
                    `/api/souls/${encodeURIComponent(soul!.id)}`,
                  );
                  if (mounted.current) saveSoul(result);
                })
              }
            >
              <RefreshCw
                size={14}
                className={busy === "status" ? "spinning" : ""}
              />
              刷新状态
            </button>
          </div>
          <dl className="soul-status">
            <div>
              <dt>Soul ID</dt>
              <dd>{soul?.id || "尚未绑定"}</dd>
            </div>
            <div>
              <dt>API 返回状态</dt>
              <dd>{soul ? describeStatus(soul.status) : "等待创建或绑定"}</dd>
            </div>
            {soul?.version && (
              <div>
                <dt>版本</dt>
                <dd>{soul.version}</dd>
              </div>
            )}
          </dl>
          <p className="helper">
            Soul 2 图像接口需要同一账号下已完成的 v2
            Soul；已完成状态不等于已确认版本。版本、账号或接口权限不符会由平台返回错误。
          </p>
        </section>
        <section className="soul-section">
          <div className="integration-heading">
            <div>
              <WandSparkles size={16} />
              <h3>3. 生成全新人物参考图</h3>
            </div>
          </div>
          <label className="field">
            画面需求
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={1200}
            />
          </label>
          <label className="field">
            参考图比例
            <select
              value={ratio}
              onChange={(e) => setRatio(e.target.value as "16:9" | "9:16")}
            >
              <option value="9:16">竖屏 9:16</option>
              <option value="16:9">横屏 16:9</option>
            </select>
          </label>
          <div className="integration-actions">
            <span className="helper">输出图片，再作为视频的身份参考。</span>
            <button
              className="button compact"
              disabled={
                !canCall ||
                !!busy ||
                !soulCompleted ||
                !prompt.trim() ||
                generationActive
              }
              onClick={() =>
                void perform("generate", async () => {
                  const result = await api<RemoteGeneration>("/api/images", {
                    soulId: soul!.id,
                    prompt: prompt.trim(),
                    ratio,
                  });
                  if (mounted.current) {
                    setRequest(result);
                    setApplied(false);
                  }
                })
              }
            >
              {busy === "generate" || generationActive ? (
                <LoaderCircle size={15} className="spinning" />
              ) : (
                <WandSparkles size={15} />
              )}
              {generationActive ? "参考图生成中…" : "生成参考图 · 收费调用"}
            </button>
          </div>
          {!soulCompleted && (
            <p className="helper">
              请先绑定或创建一个状态为 completed 的 Soul。
            </p>
          )}
          {request && (
            <div className="soul-result">
              <div className="integration-actions">
                <span>图像任务：{describeStatus(request.status)}</span>
                <button
                  className="text-button"
                  disabled={!canCall || !!busy}
                  onClick={() =>
                    void perform("request", async () => {
                      const result = await api<RemoteGeneration>(
                        `/api/requests/${encodeURIComponent(request.requestId)}`,
                      );
                      if (mounted.current) {
                        setRequest(result);
                        setError(
                          result.error ||
                            (result.status.toLowerCase() === "nsfw"
                              ? "平台未通过内容检查，请调整参考图和画面需求。"
                              : ""),
                        );
                      }
                    })
                  }
                >
                  <RefreshCw size={14} />
                  刷新图像任务
                </button>
              </div>
              <p className="helper soul-request-id">
                任务 ID：{request.requestId}。关闭面板不会停止平台任务；本 Demo
                需保留面板查看参考图结果。
              </p>
              {request.images?.[0] &&
                request.status.toLowerCase() === "completed" && (
                  <>
                    <img
                      className="soul-result-image"
                      src={request.images[0]}
                      alt="Soul 生成的人物参考图"
                    />
                    <button
                      className="button secondary full"
                      disabled={applied}
                      onClick={() => {
                        onUpdate(asset.id, {
                          image: request.images![0],
                          soulId: soul!.id,
                          soulStatus: soul!.status,
                          referenceImages: [
                            ...new Set([
                              request.images![0],
                              ...(asset.referenceImages || []),
                              asset.image,
                            ]),
                          ].slice(0, 12),
                        });
                        setApplied(true);
                        setNote("已设为人物参考图，后续创作将使用该图片。");
                      }}
                    >
                      <Check size={16} />
                      {applied ? "已设为人物参考图" : "设为人物参考图"}
                    </button>
                  </>
                )}
            </div>
          )}
        </section>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {note && (
          <p className="integration-success" role="status">
            {note}
          </p>
        )}
      </div>
    </Modal>
  );
}
