import { useState } from "react";
import {
  Check,
  CircleDashed,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { useApp } from "../store";
import { audit, configureProvider } from "../domain/model";
import { can, roleNames } from "../domain/types";
import { Dialog, formatDate, MockBadge, PageTitle } from "../components/ui";
export function Settings() {
  const app = useApp(),
    [tab, setTab] = useState("providers"),
    [reset, setReset] = useState(false);
  const allowed = can(app.role, "settings");
  return (
    <>
      <PageTitle
        eyebrow="WORKSPACE SETTINGS"
        title="管理设置"
        description="清楚的权限、可替换的模型渠道，以及可以追溯的每一次操作。"
        actions={
          <span className="outline-label">
            <ShieldCheck size={14} />
            演示权限
          </span>
        }
      />
      <div className="page-tabs">
        {[
          ["providers", "模型渠道"],
          ["members", "成员与角色"],
          ["rules", "标签与审核规则"],
          ["audit", "操作审计"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {!allowed && (
        <div className="notice">
          当前角色可查看设置。修改模型渠道和审核规则需要切换「系统管理员」。
        </div>
      )}
      {tab === "providers" && (
        <>
          <div className="provider-grid">
            {app.db.providers.map((p) => (
              <section className="panel provider-card" key={p.id}>
                <div className="provider-header">
                  <span
                    className={`provider-icon ${p.mode === "mock" ? "green" : ""}`}
                  >
                    <SlidersHorizontal size={23} />
                  </span>
                  <span
                    className={`provider-state ${p.enabled && p.configured ? "ready" : ""}`}
                  >
                    {!p.enabled
                      ? "已停用"
                      : p.configured
                        ? "可用 · Mock"
                        : p.documentationUrl
                          ? "待接入"
                          : "配置缺失"}
                  </span>
                </div>
                <h2>
                  {p.name}
                  {p.mode === "mock" && <MockBadge />}
                </h2>
                <p>{p.description}</p>
                {p.documentationUrl && (
                  <div className="provider-doc-links">
                    <a
                      href={p.documentationUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      官方 API 文档 ↗
                    </a>
                    {p.websiteUrl && (
                      <a href={p.websiteUrl} target="_blank" rel="noreferrer">
                        平台官网 ↗
                      </a>
                    )}
                  </div>
                )}
                <div className="provider-capabilities">
                  {p.capabilities.map((cap) => (
                    <span key={cap}>
                      {p.configured ? (
                        <Check size={13} />
                      ) : (
                        <CircleDashed size={13} />
                      )}
                      {cap}
                    </span>
                  ))}
                </div>
                <div className="provider-card-footer">
                  <span>
                    {p.mode === "mock"
                      ? `¥${p.rate?.toFixed(2)} / 秒 · 模拟估算`
                      : "尚无可验证价格"}
                  </span>
                  <button
                    disabled={!allowed}
                    className="button secondary small"
                    onClick={() =>
                      app.run(
                        (db) => configureProvider(db, app.role, p.id),
                        "模型开关已更新并记录审计",
                      )
                    }
                  >
                    {p.enabled ? "停用渠道" : "启用渠道"}
                  </button>
                </div>
              </section>
            ))}
          </div>
          <div className="notice">
            客户使用小云雀短剧平台，官方 API
            文档已查证。账号调用权限、人物素材复用与真实生成质量仍待验证；启用渠道开关不代表已接入。
          </div>
        </>
      )}
      {tab === "members" && (
        <div className="panel">
          <div className="panel-heading">
            <h2>
              <UsersRound size={18} />
              角色权限矩阵
            </h2>
            <span className="muted small-text">4 个演示身份 · 无真实登录</span>
          </div>
          <div className="table-scroll">
            <table className="task-table permission-table">
              <thead>
                <tr>
                  <th>角色</th>
                  <th>浏览资产</th>
                  <th>创建任务</th>
                  <th>维护人物</th>
                  <th>审核结果</th>
                  <th>修改设置</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(roleNames).map(([id, name]) => (
                  <tr key={id}>
                    <td>
                      <b>{name}</b>
                    </td>
                    <td>
                      <Check size={17} />
                    </td>
                    {["create", "manage", "review", "settings"].map(
                      (action) => (
                        <td key={action}>
                          {can(
                            id as keyof typeof roleNames,
                            action as Parameters<typeof can>[1],
                          ) ? (
                            <Check size={17} />
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="notice">
            内容创作者仅查看本人任务；人物可见范围可由资产管理员在人物档案中维护。生产阶段需在服务端实现真实身份与鉴权。
          </div>
        </div>
      )}
      {tab === "rules" && (
        <>
          <div className="panel rules-panel">
            <div className="panel-heading">
              <h2>结果审核</h2>
              <ShieldCheck size={19} />
            </div>
            <div className="setting-row">
              <div>
                <b>模拟结果须人工审核后归档</b>
                <p>
                  开启后，结果进入待审核；关闭后，后续 Mock
                  结果自动归档并记录审计。
                </p>
              </div>
              <button
                className={`switch ${app.db.requireReview ? "on" : ""}`}
                role="switch"
                aria-checked={app.db.requireReview}
                aria-label="结果人工审核"
                disabled={!allowed}
                onClick={() =>
                  app.run((db) => {
                    const next = structuredClone(db);
                    next.requireReview = !next.requireReview;
                    audit(
                      next,
                      roleNames[app.role],
                      "修改审核规则",
                      "settings",
                      "review",
                      `${db.requireReview}`,
                      `${next.requireReview}`,
                    );
                    return next;
                  }, "审核规则已更新")
                }
              >
                <i />
              </button>
            </div>
            <div className="notice">
              当前仅演示单级审核。授权、核心素材与使用范围检查始终生效。
            </div>
          </div>
          <div className="panel rules-panel">
            <div className="panel-heading">
              <h2>人物标签与内容分类</h2>
            </div>
            <p className="muted">
              标签在人物档案中编辑，内容分类由模拟解析给出并随任务归档。
            </p>
            <div className="tags large">
              {[...new Set(app.db.characters.flatMap((c) => c.tags))].map(
                (tag) => (
                  <span key={tag}>{tag}</span>
                ),
              )}
            </div>
          </div>
          <div className="panel rules-panel">
            <div className="setting-row">
              <div>
                <b>恢复初始演示数据</b>
                <p>清除本浏览器的自建人物、任务与审核记录，恢复预置示例。</p>
              </div>
              <button
                disabled={!allowed}
                className="button secondary"
                onClick={() => setReset(true)}
              >
                重置 Demo
              </button>
            </div>
          </div>
        </>
      )}
      {tab === "audit" && (
        <div className="panel table-scroll">
          <table className="task-table audit-table">
            <thead>
              <tr>
                <th>操作</th>
                <th>操作者</th>
                <th>对象</th>
                <th>变更记录</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {app.db.audit.map((log) => (
                <tr key={log.id}>
                  <td>
                    <b>{log.action}</b>
                  </td>
                  <td>{log.actorId}</td>
                  <td className="technical-id">
                    {log.targetType} · {log.targetId.slice(0, 17)}
                  </td>
                  <td>
                    <small>
                      {log.before || "—"} → {log.after || "—"}
                    </small>
                  </td>
                  <td className="table-date">{formatDate(log.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {reset && (
        <Dialog
          title="恢复初始演示数据"
          subtitle="此操作会清除当前浏览器中创建的所有演示内容。"
          onClose={() => setReset(false)}
        >
          <div className="dialog-content">
            <div className="dialog-footer">
              <button
                className="button secondary"
                onClick={() => setReset(false)}
              >
                保留当前数据
              </button>
              <button
                className="button danger"
                onClick={() => {
                  app.reset();
                  setReset(false);
                }}
              >
                确认重置
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
