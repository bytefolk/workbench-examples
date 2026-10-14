import { mediaAsset } from "../media";
import { useState } from "react";
import {
  Plus,
  Play,
  Heart,
  Download,
  Copy,
  Check,
  RotateCcw,
  FileDown,
} from "lucide-react";
import type { Task } from "../types";
import { VideoCover } from "../components/VideoCover";
import { PUBLIC_DEMO } from "../api";
import {
  dateLabel,
  downloadJson,
  mediaPath,
  downloadPath,
  ratioLabel,
  seedanceReferenceLabel,
} from "../store";
import { Empty, Modal, PageHeader, SearchBox } from "../components/UI";
export function Outputs({
  tasks,
  onCreate,
  onPreview,
  onFavorite,
  onReuse,
}: {
  tasks: Task[];
  onCreate: () => void;
  onPreview: (t: Task) => void;
  onFavorite: (id: string) => void;
  onReuse: (t: Task) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const filtered = tasks.filter(
    (t) =>
      t.status === "completed" &&
      (filter === "all" ||
        (filter === "pending" && !t.approved) ||
        (filter === "approved" && t.approved) ||
        (filter === "favorite" && t.favorite)) &&
      t.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="成品库"
        description="把每一次灵感，留成品牌的长期作品。"
      >
        <button className="button" onClick={onCreate}>
          <Plus size={17} />
          新建视频
        </button>
      </PageHeader>
      <div className="outputs-toolbar">
        <div className="filter-tabs">
          {[
            ["all", "全部作品"],
            ["pending", "待审核"],
            ["approved", "已通过"],
            ["favorite", "我的收藏"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="搜索作品名称"
        />
      </div>
      <div className="inline-note muted-note">
        {PUBLIC_DEMO
          ? "公开演示作品使用内置 6 秒示意样片，不是 AI 生成结果；素材与任务仅保存在当前浏览器，不连接真实 API。"
          : "模拟作品使用内置 6 秒样片；Seedance、万相与小云雀真实作品保存到本机，Higgsfield 作品播放平台结果。正式多人共享仍需公司存储。"}
      </div>
      {filtered.length ? (
        <div className="output-grid">
          {filtered.map((t, i) => (
            <article className="output-card" key={t.id}>
              <button
                className="output-cover"
                onClick={() => onPreview(t)}
                aria-label={`预览 ${t.title}`}
              >
                {t.provider ? (
                  <VideoCover src={mediaPath(t)} label={t.title} />
                ) : (
                  <img
                    src={
                      t.assets.find(
                        (a) => a.kind === (i % 3 === 1 ? "scene" : "character"),
                      )?.image || mediaAsset("portrait.png")
                    }
                    alt={t.title}
                  />
                )}
                <span className="play-circle">
                  <Play size={22} fill="currentColor" />
                </span>
                <span className="cover-duration">
                  {t.provider
                    ? t.provider === "speech"
                      ? "对口型 · 本地成片"
                      : t.provider === "seedance"
                        ? "Seedance · 本地成片"
                        : t.provider === "wan"
                          ? "万相 · 本地成片"
                          : t.provider === "xiaoyunque"
                            ? "小云雀 · 本地成片"
                            : "真实 API 结果"
                    : "00:06 · 演示样片"}
                </span>
                <span
                  className={`review-badge ${t.approved ? "approved" : ""}`}
                >
                  {t.approved ? (
                    <>
                      <Check size={12} />
                      已通过
                    </>
                  ) : (
                    "待审核"
                  )}
                </span>
              </button>
              <div className="output-body">
                <div className="output-title-row">
                  <h3>{t.title}</h3>
                  <button
                    className="icon-button"
                    aria-label={`${t.favorite ? "取消收藏" : "收藏作品"} ${t.title}`}
                    onClick={() => onFavorite(t.id)}
                  >
                    <Heart
                      size={17}
                      fill={t.favorite ? "currentColor" : "none"}
                    />
                  </button>
                </div>
                <p>
                  {ratioLabel(t)} ·{" "}
                  {t.provider === "speech" ? "跟随语音" : "目标"}{" "}
                  {Number(t.draft.duration.toFixed(1))} 秒{" "}
                  <span>{dateLabel(t.createdAt)}</span>
                </p>
                <div className="output-actions">
                  <button onClick={() => onReuse(t)}>
                    <Copy size={14} />
                    复用创作
                  </button>
                  <a href={downloadPath(t)} download={`${t.title}.mp4`}>
                    <Download size={14} />
                    {t.provider ? "下载成品" : "下载样片"}
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="这里还没有作品"
          description="完成一个模拟任务后，成品会自动出现在这里。"
          action={
            <button className="button" onClick={onCreate}>
              <Plus size={17} />
              开始创作
            </button>
          }
        />
      )}
    </>
  );
}
export function Preview({
  task,
  onClose,
  onApprove,
  onRetry,
  onReuse,
}: {
  task: Task;
  onClose: () => void;
  onApprove: (id: string) => void;
  onRetry: (id: string) => void;
  onReuse: (t: Task) => void;
}) {
  const [mediaError, setMediaError] = useState(false);
  return (
    <Modal title="作品预览与审核" onClose={onClose} wide>
      <div className="preview-layout">
        <div className="video-panel">
          <video
            key={task.draft.ratio}
            controls
            playsInline
            preload="auto"
            poster={
              task.provider
                ? undefined
                : task.assets.find((a) => a.kind === "character")?.image
            }
            onError={() => setMediaError(true)}
          >
            <source src={mediaPath(task)} type="video/mp4" />
          </video>
          {mediaError && (
            <p role="alert" className="error-message">
              视频加载失败；真实结果链接可能已过期，请检查任务与供应商记录。
            </p>
          )}
          <p>
            {task.provider === "speech"
              ? "万相对口型结果 · 已保存到本机 · 需人工审核声音和口型"
              : task.provider === "seedance"
                ? "Seedance 返回的视频 · 已保存到本机 · 需人工审核"
                : task.provider === "wan"
                  ? `万相${task.providerProtocol === "gateway" ? "网关" : ""}返回的视频 · 已保存到本机 · 需人工审核`
                  : task.provider === "xiaoyunque"
                    ? "小云雀返回的视频 · 已保存到本机 · 需人工审核"
                    : task.provider === "higgsfield"
                      ? "Higgsfield 返回的视频 · 需人工审核人物和商品细节"
                      : "内置素材动态样片 · 6 秒 · 无声音克隆或 AI 表演"}
          </p>
        </div>
        <div className="preview-inspector">
          <span className="asset-type">
            {task.id} / {task.approved ? "审核通过" : "等待审核"}
          </span>
          <h2>{task.title}</h2>
          <div className="spec-summary">
            <span>{ratioLabel(task)}</span>
            <span>
              {task.provider === "speech" ? "跟随语音" : "目标"}{" "}
              {Number(task.draft.duration.toFixed(1))} 秒
            </span>
          </div>
          <p className="muted">
            {task.provider === "speech"
              ? task.draft.speechText
              : task.draft.prompt}
          </p>
          <h3>
            {task.provider === "speech"
              ? "人物与声线档案"
              : task.provider === "seedance"
                ? "创作档案（实际输入见下方）"
                : task.provider === "wan"
                  ? "创作档案（仅首帧提交模型）"
                  : "使用的品牌资产"}
          </h3>
          {task.provider === "seedance" && (
            <p className="helper">
              实际参考：{seedanceReferenceLabel(task)}
              。其他独立商品、场景和声线未额外提交；本入口未接入克隆声音和口型驱动。
            </p>
          )}
          {task.provider === "speech" && (
            <p className="helper">
              提交内容为人物图＋新台词音频。声线 ID：
              {task.assets.find((a) => a.id === task.draft.characterId)
                ?.clonedVoiceId || "查看人物绑定"}
              ；独立商品/场景参考未提交。
            </p>
          )}
          {task.provider === "speech" && task.draft.speechAudioId && (
            <a
              className="text-button"
              href={`/api/speech/utterances/${task.draft.speechAudioId}/download`}
              download
            >
              下载本片使用的语音
            </a>
          )}
          {task.provider === "wan" && (
            <p className="helper">
              实际首帧：
              {
                task.assets.find(
                  (a) =>
                    a.id ===
                    (task.draft.wanFrameAssetId || task.draft.characterId),
                )?.name
              }
            </p>
          )}
          <div className="tags">
            {task.assets.map((a) => (
              <span key={a.id}>{a.name.split(" · ")[0]}</span>
            ))}
          </div>
          <div className="review-note">
            <strong>审核建议</strong>
            <p>
              {PUBLIC_DEMO
                ? "此示意样片仅演示审核操作，不能据此验证同人物新表情、全身动作、帽子细节或声音口型效果。"
                : task.provider === "speech"
                  ? "请试听声线相似度、发音与情绪，检查口型时序及面部变化。此片仅验证语音驱动，不代表全身剧情和帽子细节已通过。"
                  : "请检查人物一致性、商品细节、全身动作及声音口型。API 原生音频不等于品牌克隆声线。"}
            </p>
          </div>
          <button
            className="button full"
            disabled={task.approved}
            onClick={() => onApprove(task.id)}
          >
            <Check size={17} />
            {task.approved ? "已审核通过" : "审核通过"}
          </button>
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() => {
                onRetry(task.id);
                onClose();
              }}
            >
              <RotateCcw size={15} />
              退回重做
            </button>
            <button
              className="button secondary"
              onClick={() => {
                onReuse(task);
                onClose();
              }}
            >
              <Copy size={15} />
              复用创作
            </button>
          </div>
          <a
            className="button secondary full"
            href={downloadPath(task)}
            download={`${task.title}.mp4`}
          >
            <Download size={16} />
            {task.provider ? "下载真实成品" : "下载演示视频"}
          </a>
          <button
            className="text-button"
            onClick={() =>
              downloadJson(
                { demo: !task.provider, ...task },
                `${task.title}-创作配置.json`,
              )
            }
          >
            <FileDown size={15} />
            导出创作配置
          </button>
        </div>
      </div>
    </Modal>
  );
}
