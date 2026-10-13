import { useState } from "react";
import { Search, ArrowUpRight, Play } from "lucide-react";
import { useApp } from "../store";
import { visibleTasks } from "../domain/model";
import { Empty, MockBadge, PageTitle, Portrait } from "../components/ui";
export function Library() {
  const app = useApp(),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("approved"),
    [genre, setGenre] = useState("all");
  const tasks = visibleTasks(app.db, app.role),
    all = app.db.results.filter((r) => tasks.some((t) => t.id === r.taskId));
  const results = all.filter(
    (r) =>
      (filter === "all" || r.reviewStatus === filter) &&
      (genre === "all" || r.genre === genre) &&
      [r.title, ...r.tags].join(" ").includes(search),
  );
  return (
    <>
      <PageTitle
        eyebrow="THE BRAND FILM ARCHIVE"
        title="成片库"
        description="让每一次创作留下来，成为下一次灵感的起点。"
        actions={
          <span className="outline-label">
            {all.filter((r) => r.reviewStatus === "approved").length} 支已归档 ·
            Mock
          </span>
        }
      />
      <div className="page-tabs">
        {[
          ["approved", "已归档"],
          ["pending", "待审核"],
          ["rejected", "已退回"],
          ["all", "全部结果"],
        ].map(([id, text]) => (
          <button
            key={id}
            className={filter === id ? "selected" : ""}
            onClick={() => setFilter(id)}
          >
            {text}
            <span>
              {all.filter((r) => id === "all" || r.reviewStatus === id).length}
            </span>
          </button>
        ))}
        <span className="tabs-note">静态占位结果 · 不代表真实视频质量</span>
      </div>
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索成片"
            placeholder="搜索内容名称或标签"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="筛选成片类型"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
        >
          <option value="all">全部内容类型</option>
          {[...new Set(all.map((r) => r.genre))].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <span className="result-count">{results.length} 个结果</span>
      </div>
      {!results.length ? (
        <Empty
          title="还没有符合条件的成片"
          detail="审核通过后的 Mock 结果会归档到这里，也可以调整筛选条件。"
        />
      ) : (
        <div className="film-grid">
          {results.map((r, i) => {
            const task = tasks.find((t) => t.id === r.taskId)!,
              v = app.db.versions.find(
                (v) => v.id === task.characterVersionId,
              )!,
              c = app.db.characters.find((c) => c.id === v.characterId)!;
            return (
              <button
                key={r.id}
                className={`film-card film-style-${i % 4}`}
                onClick={() => app.setSelectedTask(task.id)}
              >
                <Portrait index={c.portrait} className="film-cover">
                  <span className="film-cover-tags">
                    <MockBadge />
                    <span>{r.genre}</span>
                  </span>
                  <span className="play-button">
                    <Play size={17} fill="currentColor" />
                  </span>
                  <span className="film-cover-bottom">
                    <span>{r.duration}s</span>
                    <span>
                      {task.config.ratio} · v{r.version}
                    </span>
                  </span>
                </Portrait>
                <div className="film-card-body">
                  <h3>
                    {r.title}
                    <ArrowUpRight size={17} />
                  </h3>
                  <p>
                    {v.name} · 人物 v{v.version}.0
                    <span>
                      {r.reviewStatus === "approved"
                        ? "已归档"
                        : r.reviewStatus === "pending"
                          ? "待审核"
                          : "已退回"}
                    </span>
                  </p>
                  <div className="tags">
                    {r.tags.slice(0, 2).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="page-footnote">
        点击结果查看占位预览、审核记录和完整来源。Demo 下载导出 Mock
        清单，不提供真实视频文件。
      </div>
    </>
  );
}
