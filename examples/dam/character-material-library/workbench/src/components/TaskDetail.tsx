import { useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  FileText,
  LoaderCircle,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import { useApp } from "../store";
import { cancelTask, reviewResult, visibleTasks } from "../domain/model";
import { can, roleNames, scopeNames } from "../domain/types";
import { mockAdapter } from "../domain/provider";
import {
  AssetIcon,
  Badge,
  Dialog,
  formatDate,
  MockBadge,
  Portrait,
  shortId,
} from "./ui";
export function TaskDetail() {
  const app = useApp(),
    [tab, setTab] = useState("overview"),
    [preview, setPreview] = useState(false),
    [reviewComment, setReviewComment] = useState(""),
    [reviewError, setReviewError] = useState("");
  const task = visibleTasks(app.db, app.role).find(
    (t) => t.id === app.selectedTask,
  );
  if (!task) return null;
  const v = app.db.versions.find((v) => v.id === task.characterVersionId)!,
    c = app.db.characters.find((c) => c.id === v.characterId)!;
  const result = app.db.results.find((r) => r.taskId === task.id),
    request = app.db.requests.find((r) => r.id === task.requestId)!;
  const reviews = result
    ? app.db.reviews.filter((r) => r.resultId === result.id)
    : [];
  const own = app.role === "admin" || task.createdBy === app.role;
  const progress =
    task.startedAt !== undefined
      ? mockAdapter.getTask(
          task.externalId || "",
          task.startedAt,
          task.config,
          Date.now(),
        ).progress
      : 0;
  const approve = (yes: boolean) => {
    if (!reviewComment.trim()) {
      setReviewError("请先填写审核意见。");
      return;
    }
    if (
      app.run(
        (db) => reviewResult(db, app.role, result!.id, yes, reviewComment),
        yes ? "审核通过，Mock 结果已归档到成片库" : "结果已退回，意见已记录",
      )
    ) {
      setReviewError("");
      setReviewComment("");
    }
  };
  const download = () => {
    const content = {
      notice: "MOCK 占位结果清单，不是视频文件，不代表真实生成质量或费用",
      result,
      task,
      request,
      characterVersion: v,
      reviews,
    };
    const blob = new Blob([JSON.stringify(content, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `${shortId(task.id)}-mock-manifest.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    app.setToast("已导出 Mock 结果清单（JSON）");
  };
  return (
    <>
      <Dialog
        drawer
        title={task.title}
        subtitle={`${shortId(task.id)} · ${formatDate(task.createdAt)}`}
        onClose={() => app.setSelectedTask(null)}
      >
        <div className="dialog-content">
          <div className="task-status-line">
            <Badge status={task.status} />
            <MockBadge />
            <span className="muted small-text">
              {roleNames[task.createdBy]}创建
            </span>
          </div>
          {["queued", "generating"].includes(task.status) && (
            <div className="generation-progress">
              <div>
                <LoaderCircle className="spin" size={19} />
                <b>
                  {task.status === "queued"
                    ? "等待模拟生成"
                    : "正在生成 Mock 占位结果"}
                </b>
                <span>{progress}%</span>
              </div>
              <div className="progress-track">
                <i style={{ width: `${progress}%` }} />
              </div>
              <p>模拟渠道约 11 秒完成，随后进入人工审核。</p>
              <button
                className="text-button"
                onClick={() => app.advance(task.id)}
              >
                立即推进模拟
                <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {task.failureReason && (
            <div className="notice warning">
              <b>失败原因</b>
              <p>{task.failureReason}</p>
              <small>不会自动重试。调整配置后，可以重新创建任务。</small>
            </div>
          )}
          {result && (
            <button
              className="result-preview-button"
              onClick={() => setPreview(true)}
            >
              <Portrait index={c.portrait} className="result-wide-preview">
                <span className="preview-mock">
                  <MockBadge />
                  静态占位预览
                </span>
                <span className="play-button">
                  <Play size={20} fill="currentColor" />
                </span>
                <div className="video-caption">
                  <b>{result.title}</b>
                  <span>
                    {result.duration}s · {result.resolution} · v{result.version}
                  </span>
                </div>
              </Portrait>
            </button>
          )}
          <div className="detail-actions">
            {can(app.role, "create") && (
              <button
                className="button secondary"
                onClick={() => app.openGenerate(undefined, task.id)}
              >
                <Copy size={15} />
                {task.status === "draft"
                  ? "编辑草稿"
                  : task.status === "failed"
                    ? "调整并重新生成"
                    : "复制为新草稿"}
              </button>
            )}
            {own &&
              can(app.role, "create") &&
              ["draft", "confirming", "queued"].includes(task.status) && (
                <button
                  className="button secondary"
                  onClick={() =>
                    app.run(
                      (db) => cancelTask(db, app.role, task.id),
                      "尚未开始的任务已取消",
                    )
                  }
                >
                  <X size={15} />
                  取消任务
                </button>
              )}
            {result && (
              <button className="button secondary" onClick={download}>
                <Download size={15} />
                导出 Mock 清单
              </button>
            )}
          </div>
          {task.status === "review" && result && (
            <section className="review-box">
              <h3>
                <ShieldCheck size={17} />
                成片审核
              </h3>
              {can(app.role, "review") ? (
                <>
                  <label>
                    审核意见
                    <textarea
                      aria-label="审核意见"
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      rows={3}
                      placeholder="确认品牌表达、脚本与配置，填写审核意见…"
                    />
                  </label>
                  {reviewError && (
                    <p role="alert" className="error-text">
                      {reviewError}
                    </p>
                  )}
                  <div className="review-actions">
                    <button
                      className="button secondary"
                      onClick={() => approve(false)}
                    >
                      驳回并填写原因
                    </button>
                    <button
                      className="button primary"
                      onClick={() => approve(true)}
                    >
                      <Check size={15} />
                      通过并归档
                    </button>
                  </div>
                </>
              ) : (
                <p>等待审核人确认。切换「审核人」角色可通过或退回结果。</p>
              )}
            </section>
          )}
          {reviews.map((r) => (
            <div
              className={`notice ${r.decision === "approved" ? "success" : "warning"}`}
              key={r.id}
            >
              <b>{r.decision === "approved" ? "审核已通过" : "审核已退回"}</b>
              <p>{r.comment}</p>
              <small>
                {roleNames[r.reviewerId]} · {formatDate(r.createdAt)}
              </small>
            </div>
          ))}
          <div className="detail-tabs">
            {[
              ["overview", "配置溯源"],
              ["assets", `素材快照 · ${task.assetSnapshot.length}`],
              ["events", "操作记录"],
            ].map(([id, text]) => (
              <button
                key={id}
                className={tab === id ? "selected" : ""}
                onClick={() => setTab(id)}
              >
                {text}
              </button>
            ))}
          </div>
          {tab === "overview" && (
            <>
              <h3 className="detail-section-heading">原始需求</h3>
              <p className="script-block">{request.rawPrompt}</p>
              <div className="detail-kv">
                <span>
                  人物版本
                  <b>
                    {v.name} · v{v.version}.0
                  </b>
                </span>
                <span>
                  模型渠道
                  <b>
                    {task.providerSnapshot} <MockBadge />
                  </b>
                </span>
                <span>
                  素材快照<b>{task.assetSnapshot.length} 份 · 提交时固化</b>
                </span>
                <span>
                  时长 / 画幅
                  <b>
                    {task.config.duration} 秒 / {task.config.ratio}
                  </b>
                </span>
                <span>
                  场景<b>{task.config.scene}</b>
                </span>
                <span>
                  情绪 / 动作
                  <b>
                    {task.config.emotion} / {task.config.action}
                  </b>
                </span>
                <span>
                  商品 / 用途
                  <b>
                    {task.config.product} / {task.config.purpose}
                  </b>
                </span>
                <span>
                  语言 / 声线
                  <b>
                    {task.config.language} / {task.config.voice}
                  </b>
                </span>
                <span>
                  使用范围<b>{scopeNames[task.config.scope]}</b>
                </span>
                <span>
                  费用估算（Mock）
                  <b>
                    {task.estimatedCost == null
                      ? "待确认"
                      : `¥${task.estimatedCost.toFixed(2)}`}
                  </b>
                </span>
                <span>
                  人物版本 ID
                  <b className="technical-id">{task.characterVersionId}</b>
                </span>
                <span>
                  生成请求 ID<b className="technical-id">{task.requestId}</b>
                </span>
              </div>
              <h3 className="detail-section-heading">
                <FileText size={15} />
                视频脚本
              </h3>
              <p className="script-block">{task.config.script}</p>
              <div className="notice small-text">
                人物历史版本和素材快照不会随当前档案修改而改变。模型能力、费用和占位预览均为
                Mock。
              </div>
            </>
          )}
          {tab === "assets" && (
            <div className="asset-list">
              {task.assetSnapshot.map((a) => (
                <div className="asset-row" key={a.id}>
                  <span className="asset-icon">
                    <AssetIcon type={a.type} />
                  </span>
                  <div>
                    <b>{a.name}</b>
                    <small>
                      v{a.version} · {a.source}
                    </small>
                    <small>
                      {a.createdBy} · {formatDate(a.createdAt)} · {a.note}
                    </small>
                  </div>
                  <span className={`license-pill ${a.licenseStatus}`}>
                    {a.licenseStatus === "valid" ? "有效" : "待处理"}
                  </span>
                </div>
              ))}
            </div>
          )}
          {tab === "events" && (
            <div className="timeline">
              {task.events.map((e, i) => (
                <div key={i}>
                  <i className="timeline-dot" />
                  <article>
                    <b>{e.reason}</b>
                    <p>
                      <Badge status={e.status} />
                    </p>
                    <small>
                      {e.actor} · {formatDate(e.at)}
                    </small>
                  </article>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>
      {preview && result && (
        <Dialog
          title="Mock 成片占位预览"
          subtitle="此画面仅演示归档与溯源，不是生成的视频。"
          onClose={() => setPreview(false)}
        >
          <div className="dialog-content">
            <Portrait index={c.portrait} className="vertical-preview">
              <span className="preview-mock">
                <MockBadge />
                静态占位
              </span>
              <div className="video-caption">
                <b>{result.title}</b>
                <span>{task.config.script.split("\n")[0]}</span>
              </div>
            </Portrait>
            <div className="preview-meta">
              <span>
                {result.duration} 秒 · {result.resolution}
              </span>
              <span>v{result.version}</span>
            </div>
            <p className="muted small-text">
              实际试戴、口型同步和全身动作需接入真实 Provider 后验证。
            </p>
          </div>
        </Dialog>
      )}
    </>
  );
}
