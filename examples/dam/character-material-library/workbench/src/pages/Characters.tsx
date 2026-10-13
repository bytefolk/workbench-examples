import { useState, type FormEvent } from "react";
import {
  Search,
  Plus,
  LayoutGrid,
  List,
  ArrowUpRight,
  ShieldCheck,
  Trash2,
  Pencil,
  Ban,
  Check,
  Clock3,
} from "lucide-react";
import { useApp } from "../store";
import {
  assetTypeNames,
  can,
  roleNames,
  scopeNames,
  type Asset,
  type AssetType,
  type Character,
  type CharacterStatus,
  type Role,
  type Scope,
} from "../domain/types";
import {
  characterIssues,
  completeness,
  displayCharacterStatus,
  saveCharacter,
  toggleCharacter,
  updateAssets,
  versionOf,
  visibleCharacters,
} from "../domain/model";
import { CharacterCard } from "../components/CharacterCard";
import {
  AssetIcon,
  Badge,
  Dialog,
  Empty,
  formatDate,
  PageTitle,
  Portrait,
} from "../components/ui";

export function Characters() {
  const app = useApp();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [scope, setScope] = useState("all");
  const [owner, setOwner] = useState("all");
  const [list, setList] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const all = visibleCharacters(app.db, app.role);
  const characters = all.filter(
    (c) =>
      (!search ||
        [c.name, c.subtitle, ...c.tags]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (status === "all" ||
        displayCharacterStatus(c, versionOf(app.db, c)) === status) &&
      (scope === "all" || c.scope.includes(scope as Scope)) &&
      (owner === "all" || c.ownerId === owner),
  );
  return (
    <>
      <PageTitle
        eyebrow="PERSONA ASSET LIBRARY"
        title="人物资产"
        description="每一张面孔、每一种声音，都是品牌可以长期复用的资产。"
        actions={
          can(app.role, "manage") && (
            <button
              className="button primary"
              onClick={() => setCreating(true)}
            >
              <Plus size={17} />
              新建人物资产
            </button>
          )
        }
      />
      <div className="page-tabs">
        <button
          className={status === "all" ? "selected" : ""}
          onClick={() => setStatus("all")}
        >
          全部人物<span>{all.length}</span>
        </button>
        <button
          className={status === "available" ? "selected" : ""}
          onClick={() => setStatus("available")}
        >
          可用人物
          <span>
            {
              all.filter(
                (c) =>
                  displayCharacterStatus(c, versionOf(app.db, c)) ===
                  "available",
              ).length
            }
          </span>
        </button>
        <span className="tabs-note">人物照片均为 AI 原创示意</span>
      </div>
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索人物资产"
            placeholder="搜索人物、名称或标签"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="筛选人物状态"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">所有状态</option>
          {["available", "incomplete", "draft", "disabled", "expired"].map(
            (s) => (
              <option value={s} key={s}>
                {
                  {
                    available: "可用",
                    incomplete: "待补充",
                    draft: "草稿",
                    disabled: "已停用",
                    expired: "授权过期",
                  }[s]
                }
              </option>
            ),
          )}
        </select>
        <select
          aria-label="筛选授权范围"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="all">所有授权范围</option>
          {Object.entries(scopeNames).map(([s, name]) => (
            <option value={s} key={s}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="筛选负责人"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="all">所有负责人</option>
          {[...new Set(all.map((c) => c.ownerId))].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div className="view-toggle">
          <button
            aria-label="卡片视图"
            className={!list ? "selected" : ""}
            onClick={() => setList(false)}
          >
            <LayoutGrid size={17} />
          </button>
          <button
            aria-label="列表视图"
            className={list ? "selected" : ""}
            onClick={() => setList(true)}
          >
            <List size={17} />
          </button>
        </div>
      </div>
      {!characters.length ? (
        <Empty title="没有找到人物" detail="尝试其他名称、标签或筛选条件。" />
      ) : list ? (
        <div className="panel table-scroll">
          <table className="task-table">
            <thead>
              <tr>
                <th>人物</th>
                <th>角色与标签</th>
                <th>完整度</th>
                <th>负责人</th>
                <th>状态</th>
                <th>查看</th>
              </tr>
            </thead>
            <tbody>
              {characters.map((c) => (
                <tr key={c.id} onClick={() => setDetail(c.id)}>
                  <td>
                    <button
                      className="table-character text-button"
                      onClick={() => setDetail(c.id)}
                    >
                      <Portrait index={c.portrait} className="mini-portrait" />
                      {c.name}
                    </button>
                  </td>
                  <td>{c.subtitle}</td>
                  <td>{completeness(versionOf(app.db, c))}%</td>
                  <td>{c.ownerId}</td>
                  <td>
                    <Badge
                      status={displayCharacterStatus(c, versionOf(app.db, c))}
                    />
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`查看 ${c.name}`}
                      onClick={() => setDetail(c.id)}
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="asset-grid">
          {characters.map((c) => (
            <CharacterCard
              key={c.id}
              character={c}
              onOpen={() => setDetail(c.id)}
            />
          ))}
          {can(app.role, "manage") && (
            <button
              className="new-asset-card"
              onClick={() => setCreating(true)}
            >
              <span>
                <Plus size={25} />
              </span>
              <h3>沉淀一个新的人物</h3>
              <p>
                形象、声音、人设与授权
                <br />
                从这里开始统一管理
              </p>
            </button>
          )}
        </div>
      )}
      <div className="page-footnote">
        <ShieldCheck size={14} />
        只有核心素材齐全、授权有效且覆盖用途的人物，才能提交生成任务。
      </div>
      {detail && (
        <CharacterDetail id={detail} onClose={() => setDetail(null)} />
      )}
      {creating && <CharacterForm onClose={() => setCreating(false)} />}
    </>
  );
}
export function CharacterDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const app = useApp();
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [remove, setRemove] = useState<Asset | null>(null);
  const [toggle, setToggle] = useState(false);
  const c = app.db.characters.find(
    (c) => c.id === id && c.visibleTo.includes(app.role),
  );
  if (!c) return null;
  const v = versionOf(app.db, c),
    issues = characterIssues(c, v),
    status = displayCharacterStatus(c, v);
  return (
    <>
      <Dialog
        drawer
        title="人物资产详情"
        subtitle="PERSONA PROFILE"
        onClose={onClose}
      >
        <div className="dialog-content">
          <div className="persona-profile">
            <Portrait index={c.portrait} className="profile-portrait" />
            <div>
              <h2>
                {c.name}
                <Badge status={status} />
              </h2>
              <p>
                {c.subtitle} <span>·</span> v{v.version}.0
              </p>
              <div className="tags">
                {c.tags.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="detail-actions">
            {can(app.role, "create") && (
              <button
                className="button primary"
                onClick={() => {
                  onClose();
                  app.openGenerate(c.id);
                }}
              >
                用此人物创作
                <ArrowUpRight size={15} />
              </button>
            )}
            {can(app.role, "manage") && (
              <>
                <button
                  className="button secondary"
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={15} />
                  编辑档案
                </button>
                <button
                  className="button secondary"
                  onClick={() => setToggle(true)}
                >
                  <Ban size={15} />
                  {c.status === "disabled" ? "恢复人物" : "停用人物"}
                </button>
              </>
            )}
          </div>
          <div className="detail-tabs">
            {[
              ["overview", "基础与人设"],
              ["assets", `素材 · ${v.assets.length}`],
              ["license", "授权信息"],
              ["versions", "版本记录"],
            ].map(([key, name]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={tab === key ? "selected" : ""}
              >
                {name}
              </button>
            ))}
          </div>
          {tab === "overview" && (
            <>
              <h3 className="detail-section-heading">人物简介</h3>
              <p className="profile-description">
                {c.profile || "尚未填写人物简介"}
              </p>
              <div className="detail-kv">
                <span>
                  负责人<b>{c.ownerId}</b>
                </span>
                <span>
                  人物归属<b>品牌工作空间（演示）</b>
                </span>
                <span>
                  素材完整度<b>{completeness(v)}%</b>
                </span>
                <span>
                  当前版本<b>v{v.version}.0</b>
                </span>
              </div>
              <h3 className="detail-section-heading">资产可用性</h3>
              {issues.length ? (
                <div className="notice warning">
                  <b>尚有 {issues.length} 项待处理</b>
                  <ul>
                    {issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="notice success">
                  <Check size={16} />
                  核心素材齐全，品牌社交媒体授权有效。
                </div>
              )}
              <h3 className="detail-section-heading">关联成片与任务</h3>
              <div className="related-list">
                {app.db.tasks
                  .filter(
                    (t) =>
                      t.config.characterId === c.id &&
                      (app.role !== "creator" || t.createdBy === app.role),
                  )
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        onClose();
                        app.setPage("tasks");
                        app.setSelectedTask(t.id);
                      }}
                    >
                      <span>
                        {t.title}
                        <small>
                          使用 v
                          {
                            app.db.versions.find(
                              (v) => v.id === t.characterVersionId,
                            )?.version
                          }
                          .0
                        </small>
                      </span>
                      <Badge status={t.status} />
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
              </div>
            </>
          )}
          {tab === "assets" && (
            <>
              <div className="section-title">
                <h3>素材元数据</h3>
                {can(app.role, "manage") && (
                  <button
                    className="button secondary small"
                    onClick={() => setAdding(true)}
                  >
                    <Plus size={14} />
                    登记素材
                  </button>
                )}
              </div>
              <p className="muted small-text">
                登记资料信息与来源；演示环境不上传真实文件。
              </p>
              <div className="asset-list">
                {v.assets.map((a) => (
                  <div className="asset-row" key={a.id}>
                    <span className="asset-icon">
                      <AssetIcon type={a.type} />
                    </span>
                    <div>
                      <b>{a.name}</b>
                      <small>
                        {assetTypeNames[a.type]} · v{a.version} · {a.source}
                      </small>
                      <small>
                        {a.createdBy} · {formatDate(a.createdAt)} · {a.note}
                      </small>
                    </div>
                    <span className={`license-pill ${a.licenseStatus}`}>
                      {a.licenseStatus === "valid"
                        ? "有效"
                        : a.licenseStatus === "pending"
                          ? "待确认"
                          : "过期"}
                    </span>
                    {can(app.role, "manage") && (
                      <button
                        className="icon-button"
                        aria-label={`删除素材引用 ${a.name}`}
                        onClick={() => setRemove(a)}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!v.assets.length && (
                <Empty
                  title="还没有素材"
                  detail="登记形象、声音和授权资料，逐步补全人物资产。"
                />
              )}
            </>
          )}
          {tab === "license" && (
            <>
              <div className="notice">
                授权数据为演示字段，不代表真实授权或合同。
              </div>
              <div className="detail-kv">
                <span>
                  授权状态
                  <b>
                    {v.licenseStatus === "valid"
                      ? "已确认（示例）"
                      : v.licenseStatus === "pending"
                        ? "待确认"
                        : "已过期"}
                  </b>
                </span>
                <span>
                  有效期至<b>{v.validUntil || "尚未登记"}</b>
                </span>
                <span>
                  授权范围
                  <b>
                    {v.scope.map((s) => scopeNames[s]).join("、") || "尚未登记"}
                  </b>
                </span>
                <span>
                  可见角色
                  <b>{c.visibleTo.map((r) => roleNames[r]).join("、")}</b>
                </span>
                <span>
                  资产归属<b>待商务与法务确认</b>
                </span>
              </div>
            </>
          )}
          {tab === "versions" && (
            <div className="timeline">
              {app.db.versions
                .filter((v) => v.characterId === c.id)
                .sort((a, b) => b.version - a.version)
                .map((v) => (
                  <div key={v.id}>
                    <Clock3 size={16} />
                    <article>
                      <b>
                        v{v.version}.0
                        {v.id === c.currentVersionId && (
                          <span className="tag">当前版本</span>
                        )}
                      </b>
                      <p>{v.changeNote}</p>
                      <small>
                        {formatDate(v.createdAt)} · {v.createdBy} ·{" "}
                        {v.assets.length} 份素材 · 授权
                        {v.licenseStatus === "valid" ? "有效" : "待处理"}
                      </small>
                    </article>
                  </div>
                ))}
              <p className="muted small-text">
                历史任务始终关联提交时的人物版本与素材快照。
              </p>
            </div>
          )}
        </div>
      </Dialog>
      {editing && (
        <CharacterForm character={c} onClose={() => setEditing(false)} />
      )}
      {adding && <AssetForm character={c} onClose={() => setAdding(false)} />}
      {remove && (
        <Dialog title="删除当前版本的素材引用" onClose={() => setRemove(null)}>
          <div className="dialog-content">
            <p>
              将移除「{remove.name}
              」，并创建新人物版本。历史任务的素材快照会保留。
            </p>
            <div className="dialog-footer">
              <button
                className="button secondary"
                onClick={() => setRemove(null)}
              >
                保留引用
              </button>
              <button
                className="button danger"
                onClick={() => {
                  if (
                    app.run(
                      (db) =>
                        updateAssets(
                          db,
                          app.role,
                          c.id,
                          v.assets.filter((a) => a.id !== remove.id),
                        ),
                      "素材引用已移除，新版本已保存",
                    )
                  )
                    setRemove(null);
                }}
              >
                删除引用
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {toggle && (
        <Dialog
          title={c.status === "disabled" ? "恢复人物资产" : "停用人物资产"}
          onClose={() => setToggle(false)}
        >
          <div className="dialog-content">
            <p>
              {c.status === "disabled"
                ? "恢复后仍会检查核心素材和授权状态。"
                : `停用「${c.name}」后，不可再用于新任务。历史记录会保留。`}
            </p>
            <div className="dialog-footer">
              <button
                className="button secondary"
                onClick={() => setToggle(false)}
              >
                取消
              </button>
              <button
                className="button primary"
                onClick={() => {
                  if (
                    app.run(
                      (db) => toggleCharacter(db, app.role, c.id),
                      "人物状态已更新并记录审计",
                    )
                  )
                    setToggle(false);
                }}
              >
                确认{c.status === "disabled" ? "恢复" : "停用"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
export function CharacterForm({
  character,
  onClose,
}: {
  character?: Character;
  onClose: () => void;
}) {
  const app = useApp(),
    v = character ? versionOf(app.db, character) : undefined;
  const [name, setName] = useState(character?.name || ""),
    [subtitle, setSubtitle] = useState(character?.subtitle || "品牌人物"),
    [profile, setProfile] = useState(character?.profile || ""),
    [owner, setOwner] = useState(character?.ownerId || ""),
    [tags, setTags] = useState(character?.tags.join("，") || ""),
    [status, setStatus] = useState<CharacterStatus>(
      character?.status || "draft",
    ),
    [scope, setScope] = useState<Scope[]>(character?.scope || ["social"]),
    [visible, setVisible] = useState<Role[]>(
      character?.visibleTo || ["creator", "assetManager", "reviewer", "admin"],
    ),
    [license, setLicense] = useState<"valid" | "pending" | "expired">(
      v?.licenseStatus || "pending",
    ),
    [until, setUntil] = useState(v?.validUntil || ""),
    [portrait, setPortrait] = useState(character?.portrait || 0);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (
      app.run(
        (db) =>
          saveCharacter(
            db,
            app.role,
            {
              name,
              subtitle,
              profile,
              ownerId: owner,
              tags: tags
                .split(/[,，]/)
                .map((s) => s.trim())
                .filter(Boolean),
              status,
              scope,
              visibleTo: visible,
              portrait,
            },
            { licenseStatus: license, validUntil: until },
            character?.id,
          ),
        "人物档案与版本已保存",
      )
    )
      onClose();
  };
  return (
    <Dialog
      title={character ? "编辑人物档案" : "新建人物资产"}
      subtitle="人物授权和素材状态需要由管理员明确填写。"
      onClose={onClose}
    >
      <form onSubmit={submit} className="dialog-content">
        <div className="form-grid">
          <label>
            人物名称
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：林知秋"
            />
          </label>
          <label>
            人物角色
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="品牌主理人"
            />
          </label>
          <label>
            负责人
            <input
              required
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </label>
          <label>
            资产状态
            <select
              aria-label="资产状态"
              value={status}
              onChange={(e) => setStatus(e.target.value as CharacterStatus)}
            >
              <option value="draft">草稿</option>
              <option value="incomplete">待补充</option>
              <option value="available">可用（需校验）</option>
              <option value="disabled">停用</option>
              <option value="expired">授权过期</option>
            </select>
          </label>
          <label className="span-2">
            人物简介与人设
            <textarea
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              rows={3}
            />
          </label>
          <label className="span-2">
            标签（用逗号分隔）
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          <label>
            授权状态
            <select
              aria-label="授权状态"
              value={license}
              onChange={(e) => setLicense(e.target.value as typeof license)}
            >
              <option value="pending">待确认</option>
              <option value="valid">有效（演示）</option>
              <option value="expired">已过期</option>
            </select>
          </label>
          <label>
            授权有效期
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </label>
        </div>
        <fieldset>
          <legend>使用范围</legend>
          <div className="checkbox-group">
            {Object.entries(scopeNames).map(([id, label]) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={scope.includes(id as Scope)}
                  onChange={(e) =>
                    setScope(
                      e.target.checked
                        ? [...scope, id as Scope]
                        : scope.filter((s) => s !== id),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>人物可见角色（演示）</legend>
          <div className="checkbox-group">
            {Object.entries(roleNames).map(([id, name]) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={visible.includes(id as Role)}
                  onChange={(e) =>
                    setVisible(
                      e.target.checked
                        ? [...visible, id as Role]
                        : visible.filter((r) => r !== id),
                    )
                  }
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>选择示意头像 · AI 原创</legend>
          <div className="portrait-picker">
            {[0, 1, 2].map((n) => (
              <button
                type="button"
                aria-label={`选择示意头像 ${n + 1}`}
                className={portrait === n ? "selected" : ""}
                onClick={() => setPortrait(n)}
                key={n}
              >
                <Portrait index={n} />
              </button>
            ))}
          </div>
        </fieldset>
        <div className="notice small-text">
          素材可在创建后登记。缺少形象、基础视频、音频、声线或授权文件时，无法标记为可用。
        </div>
        <div className="dialog-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button primary" type="submit">
            保存人物档案
          </button>
        </div>
      </form>
    </Dialog>
  );
}
function AssetForm({
  character,
  onClose,
}: {
  character: Character;
  onClose: () => void;
}) {
  const app = useApp(),
    [type, setType] = useState<AssetType>("image"),
    [name, setName] = useState(""),
    [source, setSource] = useState(""),
    [note, setNote] = useState(""),
    [version, setVersion] = useState("1.0"),
    [license, setLicense] = useState<Asset["licenseStatus"]>("pending");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const asset: Asset = {
      id: `asset-${crypto.randomUUID()}`,
      type,
      name,
      source,
      version,
      licenseStatus: license,
      createdBy: roleNames[app.role],
      createdAt: new Date().toISOString(),
      note,
    };
    if (
      app.run(
        (db) =>
          updateAssets(db, app.role, character.id, [
            ...versionOf(db, db.characters.find((c) => c.id === character.id)!)
              .assets,
            asset,
          ]),
        "素材元数据已登记",
      )
    )
      onClose();
  };
  return (
    <Dialog
      title="登记素材元数据"
      subtitle="仅保存描述与来源，不上传或播放真实素材。"
      onClose={onClose}
    >
      <form className="dialog-content" onSubmit={submit}>
        <div className="form-grid">
          <label>
            素材类型
            <select
              aria-label="素材类型"
              value={type}
              onChange={(e) => setType(e.target.value as AssetType)}
            >
              {Object.entries(assetTypeNames).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            素材版本
            <input
              required
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </label>
          <label className="span-2">
            素材名称
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="span-2">
            来源
            <input
              required
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="拍摄批次、文件名称或来源说明"
            />
          </label>
          <label>
            授权状态
            <select
              aria-label="授权状态"
              value={license}
              onChange={(e) => setLicense(e.target.value as typeof license)}
            >
              <option value="pending">待确认</option>
              <option value="valid">有效（演示）</option>
              <option value="expired">已过期</option>
            </select>
          </label>
          <label className="span-2">
            备注
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className="dialog-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            取消
          </button>
          <button className="button primary">保存素材元数据</button>
        </div>
      </form>
    </Dialog>
  );
}
