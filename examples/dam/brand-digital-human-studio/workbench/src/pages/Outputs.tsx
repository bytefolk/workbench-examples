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
import { dateLabel, downloadJson, mediaPath, downloadPath } from "../store";
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
        模拟作品使用内置 6
        秒样片；真实作品播放平台结果。请下载保存真实成品，供应商链接可能过期。
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
                <img
                  src={
                    t.assets.find(
                      (a) => a.kind === (i % 3 === 1 ? "scene" : "character"),
                    )?.image || mediaAsset("portrait.png")
                  }
                  alt={t.title}
                />
                <span className="play-circle">
                  <Play size={22} fill="currentColor" />
                </span>
                <span className="cover-duration">
                  {t.provider === "higgsfield"
                    ? "真实 API 结果"
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
                  {t.draft.ratio} · 目标 {t.draft.duration} 秒{" "}
                  <span>{dateLabel(t.createdAt)}</span>
                </p>
                <div className="output-actions">
                  <button onClick={() => onReuse(t)}>
                    <Copy size={14} />
                    复用创作
                  </button>
                  <a href={downloadPath(t)} download={`${t.title}.mp4`}>
                    <Download size={14} />
                    {t.provider === "higgsfield" ? "下载成品" : "下载样片"}
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
            preload="metadata"
            poster={task.assets.find((a) => a.kind === "character")?.image}
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
            {task.provider === "higgsfield"
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
            <span>{task.draft.ratio}</span>
            <span>目标 {task.draft.duration} 秒</span>
          </div>
          <p className="muted">{task.draft.prompt}</p>
          <h3>使用的品牌资产</h3>
          <div className="tags">
            {task.assets.map((a) => (
              <span key={a.id}>{a.name.split(" · ")[0]}</span>
            ))}
          </div>
          <div className="review-note">
            <strong>审核建议</strong>
            <p>
              请检查人物一致性、商品细节、全身动作及声音口型。API
              原生音频不等于品牌克隆声线。
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
            {task.provider === "higgsfield" ? "下载真实成品" : "下载演示视频"}
          </a>
          <button
            className="text-button"
            onClick={() =>
              downloadJson(
                { demo: task.provider !== "higgsfield", ...task },
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
