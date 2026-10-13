import { ArrowUpRight } from "lucide-react";
import type { GenerationTask } from "../domain/types";
import { useApp } from "../store";
import { Badge, Empty, formatDate, MockBadge, Portrait, shortId } from "./ui";
export function TaskTable({ tasks }: { tasks: GenerationTask[] }) {
  const app = useApp();
  if (!tasks.length)
    return (
      <Empty
        title="还没有符合条件的任务"
        detail="创建一个品牌内容任务，或调整筛选条件。"
      />
    );
  return (
    <div className="table-scroll">
      <table className="task-table">
        <thead>
          <tr>
            <th>内容任务</th>
            <th>人物资产</th>
            <th>模型渠道</th>
            <th>任务状态</th>
            <th>创建时间</th>
            <th>
              <span className="sr-only">查看</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const v = app.db.versions.find(
              (v) => v.id === task.characterVersionId,
            )!;
            const c = app.db.characters.find((c) => c.id === v.characterId)!;
            return (
              <tr key={task.id} onClick={() => app.setSelectedTask(task.id)}>
                <td>
                  <button
                    className="table-title"
                    onClick={() => app.setSelectedTask(task.id)}
                  >
                    {task.title}
                  </button>
                  <small className="table-subtitle">
                    {shortId(task.id)}
                    <span>·</span>
                    {task.config.duration}s<span>·</span>
                    {task.config.ratio}
                  </small>
                </td>
                <td>
                  <div className="table-character">
                    <Portrait index={c.portrait} className="mini-portrait" />
                    <span>
                      {v.name}
                      <small>v{v.version}.0</small>
                    </span>
                  </div>
                </td>
                <td>
                  <span className="provider-label">
                    {task.providerSnapshot}
                    <MockBadge />
                  </span>
                </td>
                <td>
                  <Badge status={task.status} />
                </td>
                <td className="muted table-date">
                  {formatDate(task.createdAt)}
                </td>
                <td>
                  <button
                    className="icon-button"
                    onClick={() => app.setSelectedTask(task.id)}
                    aria-label={`查看任务 ${task.title}`}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
