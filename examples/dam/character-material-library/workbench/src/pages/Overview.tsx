import {
  ArrowUpRight,
  Sparkles,
  UsersRound,
  Image,
  LoaderCircle,
  CircleCheck,
  ArrowRight,
  Plus,
  AlertCircle,
} from "lucide-react";
import { useState } from "react";
import { useApp } from "../store";
import { can } from "../domain/types";
import {
  displayCharacterStatus,
  versionOf,
  visibleCharacters,
  visibleTasks,
} from "../domain/model";
import { CharacterCard } from "../components/CharacterCard";
import { TaskTable } from "../components/TaskTable";
import { PageTitle, Portrait, SectionTitle } from "../components/ui";
import { CharacterDetail, CharacterForm } from "./Characters";
export function Overview() {
  const app = useApp();
  const [prompt, setPrompt] = useState("");
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const characters = visibleCharacters(app.db, app.role);
  const tasks = visibleTasks(app.db, app.role);
  const available = characters.filter(
    (c) => displayCharacterStatus(c, versionOf(app.db, c)) === "available",
  ).length;
  const stats = [
    {
      label: "可用人物",
      value: available,
      unit: "位",
      icon: UsersRound,
      note: `${characters.length} 位人物资产`,
    },
    {
      label: "素材资产",
      value: characters.reduce(
        (sum, c) => sum + versionOf(app.db, c).assets.length,
        0,
      ),
      unit: "份",
      icon: Image,
      note: "形象 · 声音 · 动作",
    },
    {
      label: "进行中任务",
      value: tasks.filter((t) => ["queued", "generating"].includes(t.status))
        .length,
      unit: "项",
      icon: LoaderCircle,
      note: `本月已创建 ${tasks.filter((t) => t.createdAt.slice(0, 7) === new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(0, 7)).length} 个任务`,
    },
    {
      label: "待审核",
      value: tasks.filter((t) => t.status === "review").length,
      unit: "项",
      icon: CircleCheck,
      note: "确认品牌表达与内容",
    },
  ];
  return (
    <>
      <PageTitle
        eyebrow="YOUR CREATIVE WORKSPACE"
        title="每一个品牌，都有自己的本色。"
        description="管理人物资产，让下一次创作从熟悉的面孔开始。"
        actions={
          <>
            {can(app.role, "manage") && (
              <button
                className="button primary"
                onClick={() => setCreating(true)}
              >
                <Plus size={15} />
                新建人物资产
              </button>
            )}
            <span className="today-label">
              {new Intl.DateTimeFormat("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
                timeZone: "Asia/Shanghai",
              }).format(new Date())}
            </span>
          </>
        }
      />
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <i />
            资产可以沉淀，灵感持续发生
          </span>
          <h2>
            让熟悉的面孔，
            <br />
            讲新的故事。
          </h2>
          <p>
            一次建立人物资产，每次创作自动复用。
            <br />
            从一段灵感，到一支有品牌温度的短片。
          </p>
          <button
            className="button hero-button"
            onClick={() => app.openGenerate()}
            disabled={!can(app.role, "create")}
          >
            开始创作
            <Sparkles size={16} />
          </button>
          <span className="hero-mock">Mock 流程演示 · 无真实模型调用</span>
        </div>
        <Portrait index={0} className="hero-photo">
          <div className="hero-caption">
            <span className="caption-label">FEATURED PERSONA</span>
            <strong>
              林知秋 <span>品牌主理人</span>
            </strong>
            <div>
              <span className="live-dot" />
              已沉淀 8 份素材 · v2.0
            </div>
          </div>
        </Portrait>
        <span className="hero-number">01 / 03</span>
      </section>
      <div className="stats-grid">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-heading">
              {s.label}
              <s.icon size={17} strokeWidth={1.5} />
            </div>
            <div className="stat-value">
              {String(s.value).padStart(2, "0")}
              <span>{s.unit}</span>
            </div>
            <p>{s.note}</p>
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <section>
          <SectionTitle
            title="人物资产"
            count={characters.length}
            action="管理全部"
            onClick={() => app.setPage("characters")}
          />
          <div className="character-grid">
            {characters.slice(0, 3).map((c) => (
              <CharacterCard
                compact
                character={c}
                onOpen={() => setCharacterId(c.id)}
                key={c.id}
              />
            ))}
          </div>
        </section>
        <aside className="idea-panel">
          <div className="idea-heading">
            <span className="spark-box">
              <Sparkles size={20} />
            </span>
            <span>
              一句话，开始创作<small>把想法交给工作台</small>
            </span>
          </div>
          <textarea
            aria-label="快捷创作需求"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例如：用品牌主理人生成一段秋季帽子试戴短片，温柔克制，30 秒…"
          />
          <div className="idea-example">
            <button
              onClick={() =>
                setPrompt(
                  "用品牌主理人生成 30 秒秋季帽子试戴短片，温柔克制，竖屏",
                )
              }
            >
              秋季帽子试戴
              <Plus size={13} />
            </button>
            <button
              onClick={() =>
                setPrompt(
                  "用品牌主理人生成 45 秒生活方式独白，户外，温柔自然，竖屏",
                )
              }
            >
              生活方式独白
              <Plus size={13} />
            </button>
          </div>
          <button
            className="button primary full"
            disabled={!can(app.role, "create")}
            onClick={() =>
              app.openGenerate(undefined, undefined, prompt || undefined)
            }
          >
            解析创作需求
            <ArrowRight size={16} />
          </button>
          <div className="idea-foot">
            <span>需求解析为本地模拟</span>
            <Sparkles size={12} />
          </div>
          <div className="asset-reminder">
            <AlertCircle size={16} />
            <div>
              {characters.length - available} 个人物暂不可生成
              <small>素材待补充或授权过期</small>
              <button onClick={() => app.setPage("characters")}>
                查看资产状态
                <ArrowUpRight size={12} />
              </button>
            </div>
          </div>
        </aside>
      </div>
      <section className="recent-tasks">
        <SectionTitle
          title="最近任务"
          action="查看全部任务"
          onClick={() => app.setPage("tasks")}
        />
        <div className="panel">
          <TaskTable tasks={tasks.slice(0, 4)} />
        </div>
      </section>
      {creating && <CharacterForm onClose={() => setCreating(false)} />}
      {characterId && (
        <CharacterDetail
          id={characterId}
          onClose={() => setCharacterId(null)}
        />
      )}
    </>
  );
}
