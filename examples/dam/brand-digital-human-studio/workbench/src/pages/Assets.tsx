import { mediaAsset } from "../media";
import { useState } from "react";
import {
  Upload,
  Plus,
  Grid2X2,
  List,
  ArrowUpRight,
  Heart,
  ImagePlus,
  Check,
  FolderOpen,
  WandSparkles,
} from "lucide-react";
import type { Asset, AssetKind, Task } from "../types";
import { VideoCover } from "../components/VideoCover";
import { mediaPath } from "../store";
import { kindLabels } from "../types";
import {
  AssetImage,
  Empty,
  Modal,
  PageHeader,
  SearchBox,
} from "../components/UI";
import { SoulPanel } from "../components/SoulPanel";
import { PUBLIC_DEMO, type ProviderConfig } from "../api";
interface Props {
  assets: Asset[];
  featuredTask?: Task;
  onPreview: (task: Task) => void;
  onCreate: (asset?: Asset) => void;
  onAdd: (asset: Asset) => boolean;
  onFavorite: (id: string) => void;
  config: ProviderConfig | null;
  onUpdate: (id: string, patch: Partial<Asset>) => void;
}
export function Assets({
  assets,
  featuredTask,
  onPreview,
  onCreate,
  onAdd,
  onFavorite,
  config,
  onUpdate,
}: Props) {
  const [category, setCategory] = useState<AssetKind | "all">("all");
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState("grid");
  const [detail, setDetail] = useState<Asset | null>(null);
  const [upload, setUpload] = useState(false);
  const [favorites, setFavorites] = useState(false);
  const [soulAsset, setSoulAsset] = useState<Asset | null>(null);
  const filtered = assets.filter(
    (a) =>
      (category === "all" || a.kind === category) &&
      (!favorites || a.favorite) &&
      [a.name, a.code, ...a.tags]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title="品牌资产库"
        description="让每一次创作，都从品牌积累开始。"
      >
        <button className="button secondary" onClick={() => setUpload(true)}>
          <Upload size={16} />
          上传资产
        </button>
        <button className="button" onClick={() => onCreate()}>
          <Plus size={18} />
          新建视频
        </button>
      </PageHeader>
      <section
        className={`collection-banner${featuredTask ? " has-generated-video" : ""}`}
      >
        {featuredTask ? (
          <VideoCover
            src={mediaPath(featuredTask)}
            label={featuredTask.title}
          />
        ) : (
          <img
            src={mediaAsset("portrait.png")}
            alt="秋日服饰主题，虚构品牌人物佩戴羊毛帽"
          />
        )}
        <div>
          <span className="collection-line" />
          <h2>{featuredTask?.title || "秋日，自有风格"}</h2>
          <p>
            {featuredTask ? "最近生成作品 · 视频画面" : "2026 秋冬内容计划"}
          </p>
          <button
            onClick={() =>
              featuredTask ? onPreview(featuredTask) : onCreate()
            }
          >
            {featuredTask ? "查看生成作品" : "开启秋日创作"}{" "}
            <ArrowUpRight size={16} />
          </button>
        </div>
        <span className="collection-index">
          {featuredTask ? "LATEST / VIDEO" : "AUTUMN / 2026"}
        </span>
      </section>
      <div className="asset-tabs" role="tablist" aria-label="资产分类">
        {(["all", "character", "product", "scene", "voice"] as const).map(
          (c) => (
            <button
              key={c}
              role="tab"
              aria-selected={category === c}
              className={category === c ? "active" : ""}
              onClick={() => setCategory(c)}
            >
              {c === "all" ? "全部资产" : kindLabels[c]}
              <span>
                {c === "all"
                  ? assets.length
                  : assets.filter((a) => a.kind === c).length}
              </span>
            </button>
          ),
        )}
      </div>
      <div className="library-toolbar">
        <SearchBox value={query} onChange={setQuery} />
        <button
          className={`button compact secondary ${favorites ? "selected" : ""}`}
          onClick={() => setFavorites(!favorites)}
          aria-pressed={favorites}
        >
          <Heart size={16} fill={favorites ? "currentColor" : "none"} />
          收藏
        </button>
        <div className="view-switch">
          <button
            onClick={() => setLayout("grid")}
            className={layout === "grid" ? "active" : ""}
            aria-label="网格视图"
            aria-pressed={layout === "grid"}
          >
            <Grid2X2 size={18} />
          </button>
          <button
            onClick={() => setLayout("list")}
            className={layout === "list" ? "active" : ""}
            aria-label="列表视图"
            aria-pressed={layout === "list"}
          >
            <List size={19} />
          </button>
        </div>
      </div>
      {filtered.length ? (
        <div className={`asset-grid ${layout === "list" ? "list-layout" : ""}`}>
          {filtered.map((a) => (
            <article key={a.id} className="asset-card">
              <button
                className="asset-visual"
                onClick={() => setDetail(a)}
                aria-label={`查看资产 ${a.name}`}
              >
                <AssetImage asset={a} />
                <span className="visual-open">
                  <ArrowUpRight size={18} />
                </span>
              </button>
              <button
                className={`favorite-button ${a.favorite ? "is-favorite" : ""}`}
                aria-label={`${a.favorite ? "取消收藏" : "收藏"} ${a.name}`}
                onClick={() => onFavorite(a.id)}
              >
                <Heart size={15} fill={a.favorite ? "currentColor" : "none"} />
              </button>
              <div className="asset-card-body">
                <span className="asset-type">
                  {kindLabels[a.kind]}
                  <span className="type-line" />
                </span>
                <button className="asset-title" onClick={() => setDetail(a)}>
                  {a.name}
                </button>
                <div className="tags">
                  {a.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <div className="asset-card-bottom">
                  <span>更新于 {a.updated}</span>
                  <button
                    aria-label={`使用 ${a.name} 创作`}
                    onClick={() => onCreate(a)}
                  >
                    <ArrowUpRight size={18} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="没有找到匹配的资产"
          description="试试其他关键词，或添加一份新的品牌素材。"
          action={
            <button
              className="button secondary"
              onClick={() => {
                setQuery("");
                setCategory("all");
                setFavorites(false);
              }}
            >
              清除筛选
            </button>
          }
        />
      )}
      <div className="library-count">
        <FolderOpen size={14} />
        <span>共 {filtered.length} 项资产 · 当前浏览器资产库</span>
        <span>素材仅用于本地流程演示</span>
      </div>
      {detail && (
        <Modal title="资产详情" onClose={() => setDetail(null)}>
          <div className="asset-detail-image">
            <AssetImage asset={detail} />
          </div>
          <div className="modal-body">
            <span className="asset-type">
              {kindLabels[detail.kind]} / {detail.code}
            </span>
            <h2>{detail.name}</h2>
            <p className="muted">{detail.description}</p>
            {detail.audioUrl && (
              <audio
                controls
                preload="metadata"
                className="asset-audio"
                src={detail.audioUrl}
                aria-label="资产录音试听"
              />
            )}
            <div className="tags">
              {detail.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <dl className="detail-list">
              <div>
                <dt>资产版本</dt>
                <dd>v1.0</dd>
              </div>
              <div>
                <dt>共享范围</dt>
                <dd>本地 Demo · 当前浏览器</dd>
              </div>
              <div>
                <dt>素材来源</dt>
                <dd>{detail.uploaded ? "本地上传" : "内置演示素材"}</dd>
              </div>
              {detail.soulId && (
                <>
                  <div>
                    <dt>Soul ID</dt>
                    <dd className="soul-id">{detail.soulId}</dd>
                  </div>
                  <div>
                    <dt>身份状态</dt>
                    <dd>{detail.soulStatus || "待查询"}</dd>
                  </div>
                </>
              )}
              {detail.clonedVoiceId && (
                <>
                  <div>
                    <dt>复刻声线 ID</dt>
                    <dd className="speech-id">{detail.clonedVoiceId}</dd>
                  </div>
                  <div>
                    <dt>声音模型</dt>
                    <dd>{detail.clonedVoiceModel}</dd>
                  </div>
                  <div>
                    <dt>声线状态</dt>
                    <dd>已绑定，可在声音工作室输入新台词</dd>
                  </div>
                </>
              )}
            </dl>
            <div className="inline-note">
              <Check size={16} />
              已录入，可在创作中反复引用
            </div>
            {!PUBLIC_DEMO && detail.kind === "character" && (
              <button
                className="button secondary full soul-entry"
                onClick={() => {
                  setSoulAsset(detail);
                  setDetail(null);
                }}
              >
                <WandSparkles size={16} />
                人物身份 · Soul 与参考图
              </button>
            )}
            <button
              className="button full"
              onClick={() => {
                onCreate(detail);
                setDetail(null);
              }}
            >
              使用此资产创作 <ArrowUpRight size={17} />
            </button>
          </div>
        </Modal>
      )}
      {!PUBLIC_DEMO && soulAsset && (
        <SoulPanel
          asset={soulAsset}
          config={config}
          onUpdate={onUpdate}
          onClose={() => setSoulAsset(null)}
        />
      )}
      {upload && (
        <UploadModal
          onClose={() => setUpload(false)}
          onAdd={(a) => {
            if (!onAdd(a)) return false;
            setUpload(false);
            setCategory("all");
            setQuery("");
            setFavorites(false);
            return true;
          }}
        />
      )}
    </>
  );
}
function UploadModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (a: Asset) => boolean;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AssetKind>("product");
  const [image, setImage] = useState("");
  const [filename, setFilename] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  function read(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("请选择 PNG、JPEG 或 WebP 图片。");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("图片不能超过 2 MB。");
      return;
    }
    setError("");
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setImage(String(reader.result));
      setFilename(file.name);
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
      setReading(false);
    };
    reader.onerror = () => {
      setReading(false);
      setError("文件读取失败，请重新选择。");
    };
    reader.readAsDataURL(file);
  }
  return (
    <Modal title="添加品牌资产" onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !image) {
            setError("请填写资产名称，并选择一张图片。");
            return;
          }
          const saved = onAdd({
            id: crypto.randomUUID(),
            name: name.trim(),
            kind,
            image,
            tags: tags
              .split(/[，,]/)
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 4),
            code: `LOCAL-${Date.now().toString().slice(-5)}`,
            description: "由本地上传的品牌素材，可在视频创作中复用。",
            updated: new Date().toLocaleDateString("sv-SE"),
            uploaded: true,
          });
          if (!saved)
            setError("浏览器存储不可用或空间不足，请换一张更小的图片后重试。");
        }}
      >
        <label
          className="upload-area"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            read(e.dataTransfer.files[0]);
          }}
        >
          {image ? (
            <img src={image} alt="待上传素材预览" />
          ) : (
            <ImagePlus size={34} strokeWidth={1.2} />
          )}
          <strong>{filename || "点击选择或拖入图片"}</strong>
          <span>PNG / JPEG / WebP · 最大 2 MB</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => read(e.target.files?.[0])}
            aria-label="选择资产图片"
          />
        </label>
        <label className="field">
          资产名称
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="例如：秋日羊毛帽 · H002"
          />
        </label>
        <label className="field">
          资产类型
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as AssetKind)}
          >
            <option value="product">商品素材</option>
            <option value="character">数字人物</option>
            <option value="scene">场景素材</option>
          </select>
        </label>
        <label className="field">
          标签<span className="field-hint">选填，用逗号分隔</span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            maxLength={80}
            placeholder="羊毛，秋冬，米白色"
          />
        </label>
        <p className="helper">
          文件仅保存在当前浏览器，不会上传到服务器或创建真实人物模型。
        </p>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <button className="button full" disabled={reading}>
          {reading ? "正在读取…" : "保存到资产库"}
          <Plus size={17} />
        </button>
      </form>
    </Modal>
  );
}
