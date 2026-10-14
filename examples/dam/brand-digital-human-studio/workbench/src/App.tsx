import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ArrowRight, X } from "lucide-react";
import { Shell } from "./components/Shell";
import { Modal } from "./components/UI";
import { Assets } from "./pages/Assets";
import { Create } from "./pages/Create";
import { Tasks } from "./pages/Tasks";
import { Outputs, Preview } from "./pages/Outputs";
import { useStudio, isActive } from "./store";
import { createSeed, emptyDraft } from "./data";
import type { Asset, Page, Task } from "./types";
import { api, type ProviderConfig, type RemoteGeneration } from "./api";
import "./integration.css";
const pages = ["assets", "create", "tasks", "outputs"];
const route = (): Page =>
  pages.includes(location.hash.slice(1))
    ? (location.hash.slice(1) as Page)
    : "assets";
export default function App() {
  const { state, update, now, storageError } = useStudio();
  const [page, setPage] = useState<Page>(route);
  const [toast, setToast] = useState("");
  const [help, setHelp] = useState(false);
  const [reset, setReset] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [config, setConfig] = useState<ProviderConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const busy = useRef(false);
  const submission = useRef<{ id: string; payload: string } | null>(null);
  useEffect(() => {
    api<ProviderConfig>("/api/config")
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);
  useEffect(() => {
    const listener = () => setPage(route());
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  function navigate(p: Page) {
    location.hash = p;
    setPage(p);
    window.scrollTo({ top: 0 });
  }
  function create(asset?: Asset) {
    if (asset) {
      const key = `${asset.kind}Id`;
      update((s) => ({
        ...s,
        draft: { ...s.draft, [key]: asset.id, shots: [] },
      }));
    }
    navigate("create");
  }
  async function cancel(id: string) {
    const task = state.tasks.find((t) => t.id === id);
    if (task?.provider === "higgsfield") {
      if (!task.remoteRequestId) return;
      try {
        await api(`/api/requests/${task.remoteRequestId}/cancel`, {});
      } catch (error) {
        setApiError(error instanceof Error ? error.message : "取消失败");
        return;
      }
    }
    update((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id && isActive(t) ? { ...t, status: "canceled" } : t,
      ),
    }));
    setToast("任务已取消，配置仍然保留");
  }
  function retry(id: string) {
    const task = state.tasks.find((t) => t.id === id);
    if (task?.provider === "higgsfield") {
      reuse(task);
      setToast("已带入原配置，请确认后重新提交真实生成");
      return;
    }
    update((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "queued",
              startedAt: Date.now(),
              approved: false,
              error: undefined,
            }
          : t,
      ),
    }));
    navigate("tasks");
    setToast("已重新加入模拟生成队列");
  }
  function reuse(task: Task) {
    update((s) => ({
      ...s,
      draft: {
        ...structuredClone(task.draft),
        title: `${task.title} · 新版本`,
      },
    }));
    navigate("create");
    setToast("已复用人物、素材与分镜配置");
  }
  async function submit() {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setApiError("");
    const draft = structuredClone(state.draft);
    const time = Date.now();
    const task: Task = {
      id: `MS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      title: draft.title,
      status: "queued",
      createdAt: time,
      startedAt: time,
      draft,
      assets: state.assets
        .filter((a) =>
          [
            draft.characterId,
            draft.productId,
            draft.sceneId,
            draft.voiceId,
          ].includes(a.id),
        )
        .map((a) => ({ ...a })),
      approved: false,
      favorite: false,
    };
    try {
      if (draft.mode === "higgsfield") {
        if (!config?.configured || !config.enabled)
          throw new Error(
            "真实 API 未配置或未开启，请先按 .env.example 配置本地代理。",
          );
        const payload = JSON.stringify({ draft, assets: task.assets });
        if (submission.current?.payload !== payload)
          submission.current = { id: crypto.randomUUID(), payload };
        const remote = await api<RemoteGeneration>("/api/videos", {
          draft,
          assets: task.assets,
          submissionId: submission.current.id,
        });
        task.provider = "higgsfield";
        task.remoteRequestId = remote.requestId;
        task.providerStatus = remote.status;
        task.canCancel = remote.canCancel;
        task.resultUrl = remote.video;
        task.status =
          remote.status === "in_progress"
            ? "generating"
            : remote.status === "completed"
              ? "completed"
              : "queued";
      }
      if (
        !update((s) => ({
          ...s,
          tasks: [task, ...s.tasks],
          draft: { ...emptyDraft },
        }))
      )
        return;
      navigate("tasks");
      submission.current = null;
      setToast(
        task.provider === "higgsfield"
          ? "Higgsfield 已接受任务，正在查询真实状态"
          : "模拟生成已提交，完成后自动进入成品库",
      );
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "提交失败，请稍后重试",
      );
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }
  const preview = state.tasks.find(
    (t) => t.id === previewId && t.status === "completed",
  );
  return (
    <>
      <Shell
        page={page}
        onNavigate={navigate}
        activeCount={state.tasks.filter(isActive).length}
        onHelp={() => setHelp(true)}
        onReset={() => setReset(true)}
        connected={config?.configured && config.enabled}
      >
        {apiError && (
          <p role="alert" className="error-message">
            {apiError}
            <button className="text-button" onClick={() => setApiError("")}>
              关闭提示
            </button>
          </p>
        )}
        {storageError && (
          <p role="alert" className="error-message">
            {storageError}
          </p>
        )}
        {page === "assets" && (
          <Assets
            assets={state.assets}
            config={config}
            onUpdate={(id, patch) =>
              update((s) => ({
                ...s,
                assets: s.assets.map((a) =>
                  a.id === id ? { ...a, ...patch } : a,
                ),
              }))
            }
            onCreate={create}
            onAdd={(asset) => {
              const saved = update((s) => ({
                ...s,
                assets: [asset, ...s.assets],
              }));
              if (saved) setToast("资产已保存，可在创作中复用");
              return saved;
            }}
            onFavorite={(id) =>
              update((s) => ({
                ...s,
                assets: s.assets.map((a) =>
                  a.id === id ? { ...a, favorite: !a.favorite } : a,
                ),
              }))
            }
          />
        )}
        {page === "create" && (
          <Create
            draft={state.draft}
            config={config}
            submitting={submitting}
            assets={state.assets}
            onChange={(draft) => update((s) => ({ ...s, draft }))}
            onSave={() =>
              setToast(
                storageError
                  ? "草稿未保存，请处理存储问题"
                  : "草稿已保存在当前浏览器",
              )
            }
            onSubmit={submit}
          />
        )}
        {page === "tasks" && (
          <Tasks
            tasks={state.tasks}
            now={now}
            onCreate={() => create()}
            onCancel={cancel}
            onRetry={retry}
            onPreview={(t) => setPreviewId(t.id)}
          />
        )}
        {page === "outputs" && (
          <Outputs
            tasks={state.tasks}
            onCreate={() => create()}
            onPreview={(t) => setPreviewId(t.id)}
            onFavorite={(id) =>
              update((s) => ({
                ...s,
                tasks: s.tasks.map((t) =>
                  t.id === id ? { ...t, favorite: !t.favorite } : t,
                ),
              }))
            }
            onReuse={reuse}
          />
        )}
      </Shell>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="关闭通知">
            <X size={15} />
          </button>
        </div>
      )}
      {help && (
        <Modal title="欢迎来到 MUSE 缪思" onClose={() => setHelp(false)}>
          <div className="modal-body help-body">
            <p>
              这是品牌数字人技术验证
              Demo。默认可用模拟模式，也支持通过本地接口代理连接 Higgsfield
              与阿里云 Qwen。
            </p>
            <ol>
              <li>
                <b>选择资产</b>
                <span>浏览人物、商品、场景与声音档案，或上传自己的图片。</span>
              </li>
              <li>
                <b>开始创作</b>
                <span>填写需求，匹配资产，调整画面规格和镜头脚本。</span>
              </li>
              <li>
                <b>跟踪任务</b>
                <span>
                  模拟任务约 22 秒完成；真实任务显示供应商状态，仅排队时可取消。
                </span>
              </li>
              <li>
                <b>审核成品</b>
                <span>播放模拟样片或真实结果，审核、下载或复用创作配置。</span>
              </li>
            </ol>
            <p className="helper">
              未配置密钥时使用本地规则和内置样片。已配置的真实生成按账号计费。Soul
              ID
              仅用于平台人物参考复用，声音克隆仍待接入。当前资产库保存在浏览器中。
            </p>
            <button className="button full" onClick={() => setHelp(false)}>
              开始探索
              <ArrowRight size={17} />
            </button>
          </div>
        </Modal>
      )}
      {reset && (
        <Modal title="重置演示数据" onClose={() => setReset(false)}>
          <div className="modal-body">
            <p>
              将清除本浏览器中的演示记录，并恢复内置示例。已提交到平台的任务仍可能继续执行；重置不会取消云端任务或删除
              Soul ID。
            </p>
            <div className="button-row">
              <button
                className="button secondary"
                onClick={() => setReset(false)}
              >
                保留数据
              </button>
              <button
                className="button"
                onClick={() => {
                  update(() => createSeed());
                  setReset(false);
                  setPreviewId(null);
                  navigate("assets");
                  setToast("已恢复初始演示数据");
                }}
              >
                确认重置
              </button>
            </div>
          </div>
        </Modal>
      )}
      {preview && (
        <Preview
          task={preview}
          onClose={() => setPreviewId(null)}
          onApprove={(id) => {
            update((s) => ({
              ...s,
              tasks: s.tasks.map((t) =>
                t.id === id ? { ...t, approved: true } : t,
              ),
            }));
            setToast("作品已审核通过");
          }}
          onRetry={retry}
          onReuse={reuse}
        />
      )}
    </>
  );
}
