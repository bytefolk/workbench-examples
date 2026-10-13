import { Plus, Search, FastForward, Pause, Play } from "lucide-react";
import { useState } from "react";
import { useApp } from "../store";
import { can, statusNames } from "../domain/types";
import { visibleTasks } from "../domain/model";
import { PageTitle } from "../components/ui";
import { TaskTable } from "../components/TaskTable";
export function Tasks() {
  const app = useApp(),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const tasks = visibleTasks(app.db, app.role);
  const filtered = tasks.filter(
    (t) =>
      (filter === "all" ||
        (filter === "active"
          ? ["queued", "generating"].includes(t.status)
          : t.status === filter)) &&
      t.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        eyebrow="GENERATION QUEUE"
        title="生成任务"
        description="从一次灵感，到一个结果。每一步进度，都有记录。"
        actions={
          can(app.role, "create") && (
            <button
              className="button primary"
              onClick={() => app.openGenerate()}
            >
              <Plus size={16} />
              新建生成任务
            </button>
          )
        }
      />
      <div className="page-tabs">
        {[
          ["all", "全部任务"],
          ["active", "进行中"],
          ["review", "待审核"],
          ["completed", "已完成"],
          ["failed", "失败"],
          ["draft", "草稿"],
        ].map(([id, text]) => (
          <button
            className={filter === id ? "selected" : ""}
            onClick={() => setFilter(id)}
            key={id}
          >
            {text}
            <span>
              {
                tasks.filter(
                  (t) =>
                    id === "all" ||
                    (id === "active"
                      ? ["queued", "generating"].includes(t.status)
                      : t.status === id),
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索生成任务"
            placeholder="搜索任务名称"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="筛选任务状态"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">全部状态</option>
          {[
            "draft",
            "confirming",
            "queued",
            "generating",
            "review",
            "completed",
            "failed",
            "cancelled",
          ].map((id) => (
            <option value={id} key={id}>
              {statusNames[id as keyof typeof statusNames]}
            </option>
          ))}
          {filter === "active" && <option value="active">进行中</option>}
        </select>
        <div className="simulation-controls">
          <span>Mock 进度</span>
          <button
            className="button secondary small"
            onClick={() => app.setAuto(!app.auto)}
          >
            {app.auto ? <Pause size={13} /> : <Play size={13} />}
            {app.auto ? "暂停自动推进" : "恢复自动推进"}
          </button>
          <button
            className="button secondary small"
            onClick={() => app.advance()}
          >
            <FastForward size={13} />
            推进模拟
          </button>
        </div>
      </div>
      <div className="panel">
        <TaskTable tasks={filtered} />
      </div>
      <div className="page-footnote">
        {app.role === "creator"
          ? "当前仅展示内容创作者自己的任务。"
          : "当前演示角色可查看所有任务。"}
        失败任务不会自动重试，复制后会重新检查授权与模型状态。
      </div>
    </>
  );
}
