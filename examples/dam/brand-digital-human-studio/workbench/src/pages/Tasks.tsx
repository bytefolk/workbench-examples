import { mediaAsset } from "../media";
import { useState } from "react";
import {
  Plus,
  ArrowUpRight,
  RotateCcw,
  CircleStop,
  Clock3,
  CheckCircle2,
  AlertCircle,
  LoaderCircle,
  FileText,
} from "lucide-react";
import type { Task, TaskStatus } from "../types";
import { statusLabels } from "../types";
import { dateLabel, getProgress, isActive } from "../store";
import { Empty, Modal, PageHeader, SearchBox, Status } from "../components/UI";
export function Tasks({
  tasks,
  now,
  onCreate,
  onCancel,
  onRetry,
  onPreview,
}: {
  tasks: Task[];
  now: number;
  onCreate: () => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onPreview: (task: Task) => void;
}) {
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const filtered = tasks.filter(
    (t) =>
      (filter === "all" || t.status === filter) &&
      `${t.title} ${t.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  const task = tasks.find((t) => t.id === detail);
  return (
    <>
      <PageHeader title="任务管理" description="每一段创作，都有迹可循。">
        <button className="button" onClick={onCreate}>
          <Plus size={17} />
          新建视频
        </button>
      </PageHeader>
      <div className="task-overview">
        {[
          {
            label: "正在进行",
            count: tasks.filter(isActive).length,
            icon: LoaderCircle,
          },
          {
            label: "已完成",
            count: tasks.filter((t) => t.status === "completed").length,
            icon: CheckCircle2,
          },
          {
            label: "需处理",
            count: tasks.filter((t) => t.status === "failed").length,
            icon: AlertCircle,
          },
        ].map((s) => (
          <div key={s.label}>
            <s.icon size={22} strokeWidth={1.4} />
            <span>
              {s.label}
              <strong>{String(s.count).padStart(2, "0")}</strong>
            </span>
          </div>
        ))}
        <p>
          从创意到成片
          <br />
          <span>进度与结果，尽在掌握。</span>
        </p>
      </div>
      <div className="task-toolbar">
        <div className="filter-tabs">
          {(
            [
              "all",
              "generating",
              "queued",
              "completed",
              "failed",
              "canceled",
            ] as const
          ).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={filter === f ? "active" : ""}
            >
              {f === "all" ? "全部任务" : statusLabels[f]}
            </button>
          ))}
        </div>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="搜索任务名称或编号"
        />
      </div>
      {filtered.length ? (
        <div className="table-container">
          <table className="task-table">
            <thead>
              <tr>
                <th>创作任务</th>
                <th>状态与进度</th>
                <th>视频规格</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td>
                    <button
                      className="task-name"
                      onClick={() => setDetail(t.id)}
                    >
                      <img
                        src={
                          t.assets.find((a) => a.kind === "character")?.image ||
                          mediaAsset("portrait.png")
                        }
                        alt=""
                      />
                      <span>
                        <strong>{t.title}</strong>
                        <small>
                          {t.id} ·{" "}
                          {t.provider === "speech"
                            ? "语音驱动单段视频"
                            : `${t.draft.shots.length} 个镜头`}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <Status status={t.status} />
                    {isActive(t) && !t.provider && (
                      <div className="progress-row">
                        <div
                          className="progress-track"
                          role="progressbar"
                          aria-label={`${t.title}进度`}
                          aria-valuenow={getProgress(t, now)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <i style={{ width: `${getProgress(t, now)}%` }} />
                        </div>
                        <small>{getProgress(t, now)}%</small>
                      </div>
                    )}
                    {isActive(t) && t.provider && (
                      <small className="task-subtext">
                        {(t.provider === "wan" || t.provider === "speech") &&
                        t.providerStatus === "SUBMITTING"
                          ? "正在提交万相平台"
                          : (t.provider === "wan" || t.provider === "speech") &&
                              t.providerStatus === "SUCCEEDED"
                            ? "生成成功 · 正在下载成片"
                            : t.status === "queued"
                              ? "平台排队中"
                              : "平台处理中 · 不提供百分比"}
                      </small>
                    )}
                    {t.error && (
                      <small className="task-subtext">{t.error}</small>
                    )}
                  </td>
                  <td>
                    <span>
                      {t.provider === "wan" || t.provider === "speech"
                        ? "比例随人物图"
                        : t.draft.ratio}{" "}
                      ·{" "}
                      {t.provider === "wan" || t.provider === "speech"
                        ? t.draft.resolution || "720p"
                        : t.provider === "xiaoyunque"
                          ? t.draft.xyqResolution || "平台档位"
                          : t.provider === "higgsfield"
                            ? t.draft.modelId === "kling-reference"
                              ? "平台标准档"
                              : t.draft.resolution || "720p"
                            : "模拟"}
                    </span>
                    <small className="task-subtext">
                      {t.provider === "speech" ? "跟随语音" : "目标"}{" "}
                      {Number(t.draft.duration.toFixed(1))} 秒
                    </small>
                  </td>
                  <td className="date-cell">{dateLabel(t.createdAt)}</td>
                  <td>
                    <div className="table-actions">
                      {t.status === "completed" ? (
                        <button onClick={() => onPreview(t)}>
                          查看成品
                          <ArrowUpRight size={15} />
                        </button>
                      ) : isActive(t) ? (
                        <button
                          disabled={!!t.provider && !t.canCancel}
                          title={
                            t.provider && t.provider !== "higgsfield"
                              ? "当前接入暂不支持取消"
                              : undefined
                          }
                          onClick={() => onCancel(t.id)}
                        >
                          取消
                          <CircleStop size={14} />
                        </button>
                      ) : (
                        <button onClick={() => onRetry(t.id)}>
                          重试
                          <RotateCcw size={14} />
                        </button>
                      )}
                      <button
                        className="icon-button"
                        aria-label={`查看任务详情 ${t.title}`}
                        onClick={() => setDetail(t.id)}
                      >
                        <FileText size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="暂无符合条件的任务"
          description="调整筛选，或开启一次新的品牌创作。"
          action={
            <button
              className="button secondary"
              onClick={() => {
                setFilter("all");
                setQuery("");
              }}
            >
              查看全部任务
            </button>
          }
        />
      )}
      <p className="table-footnote">
        <Clock3 size={14} />
        模拟任务约 22 秒完成；真实任务查询供应商结果，不显示模拟进度。Higgsfield
        仅排队可取消，万相与小云雀暂不支持在此取消。
      </p>
      {task && (
        <Modal title="任务详情" onClose={() => setDetail(null)}>
          <div className="modal-body">
            <div className="detail-task-heading">
              <h2>{task.title}</h2>
              <Status status={task.status} />
            </div>
            <dl className="detail-list">
              <div>
                <dt>任务编号</dt>
                <dd>{task.id}</dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{dateLabel(task.createdAt)}</dd>
              </div>
              <div>
                <dt>目标规格</dt>
                <dd>
                  {task.provider === "wan" || task.provider === "speech"
                    ? "比例随人物图"
                    : task.draft.ratio}{" "}
                  / {Number(task.draft.duration.toFixed(1))} 秒
                </dd>
              </div>
              <div>
                <dt>执行方式</dt>
                <dd>
                  {task.provider === "speech"
                    ? `阿里云对口型 · ${task.draft.modelId}`
                    : task.provider === "wan"
                      ? `阿里云万相 · ${task.draft.modelId}`
                      : task.provider === "xiaoyunque"
                        ? `小云雀 · ${task.draft.modelId}`
                        : task.provider === "higgsfield"
                          ? `Higgsfield · ${task.draft.modelId}`
                          : "本地模拟 · 未调用 API"}
                </dd>
              </div>
            </dl>
            <h3>{task.provider === "speech" ? "实际新台词" : "创作需求"}</h3>
            <p className="muted">
              {task.provider === "speech"
                ? task.draft.speechText
                : task.draft.prompt}
            </p>
            <h3>
              {task.provider === "speech"
                ? "创作档案（提交人物图与新语音）"
                : task.provider === "wan"
                  ? "创作资产快照（仅首帧提交）"
                  : "引用资产快照"}
            </h3>
            {task.provider === "speech" && (
              <p className="helper">
                人物图与已生成的新台词音频用于对口型；其他商品、场景及分镜仅保留在创作档案中。声线
                ID：
                {task.assets.find((a) => a.id === task.draft.characterId)
                  ?.clonedVoiceId || "查看人物声线绑定"}
              </p>
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
                <span key={a.id}>{a.name}</span>
              ))}
            </div>
            <div className="task-timeline">
              <div className="done">
                <i />
                任务已创建 <small>{dateLabel(task.createdAt)}</small>
              </div>
              <div className={task.status !== "queued" ? "done" : ""}>
                <i />
                素材匹配与镜头准备
              </div>
              <div className={task.status === "completed" ? "done" : ""}>
                <i />
                {task.provider ? "平台生成与结果返回" : "模拟生成与成品归档"}
              </div>
            </div>
            {task.error && <p className="error-message">{task.error}</p>}
            <button
              className="button full"
              disabled={!!task.provider && isActive(task) && !task.canCancel}
              onClick={() => {
                if (task.status === "completed") onPreview(task);
                else if (isActive(task)) onCancel(task.id);
                else onRetry(task.id);
                setDetail(null);
              }}
            >
              {task.status === "completed"
                ? "查看成品"
                : isActive(task)
                  ? "取消此任务"
                  : "重新生成"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
