import { mediaAsset } from "./media";
import type { Asset, Draft, StudioState, Task } from "./types";
export const initialAssets: Asset[] = [
  {
    id: "lin",
    name: "林知夏 · 品牌主理人",
    kind: "character",
    image: mediaAsset("portrait.png"),
    position: "76% 40%",
    tags: ["知性", "自然表达", "品牌主理人"],
    description:
      "自然、从容的品牌数字人物。适用于产品介绍、生活独白与秋日主题创作。此人物为虚构演示资产。",
    code: "IP-001",
    updated: "2026-10-13",
  },
  {
    id: "hat",
    name: "云朵羊毛帽 · H001",
    kind: "product",
    image: mediaAsset("hat.png"),
    tags: ["羊毛", "米白色", "秋冬系列"],
    description:
      "柔和的米白色羊毛礼帽，宽檐设计与同色缎带。用于演示品牌商品素材引用，不代表真实在售商品。",
    code: "H001",
    updated: "2026-10-13",
  },
  {
    id: "courtyard",
    name: "秋日庭院",
    kind: "scene",
    image: mediaAsset("courtyard.png"),
    tags: ["户外", "自然光", "秋日"],
    description:
      "石墙、秋叶与柔和日光构成的生活方式场景，适合人物走动和产品展示。",
    code: "SC-001",
    updated: "2026-10-12",
  },
  {
    id: "su",
    name: "苏遥 · 生活方式",
    kind: "character",
    image: mediaAsset("suyao.png"),
    tags: ["成熟知性", "生活方式", "优雅"],
    description:
      "短发、自然妆容的虚构数字人物。适合安静叙事、情感独白与生活方式内容。",
    code: "IP-002",
    updated: "2026-10-12",
  },
  {
    id: "scarf",
    name: "雾棕羊绒围巾 · S002",
    kind: "product",
    image: mediaAsset("scarf.png"),
    tags: ["羊绒", "雾棕色", "配饰"],
    description:
      "细腻绒面与流苏边缘，为秋冬造型提供柔和的层次感。演示商品素材。",
    code: "S002",
    updated: "2026-10-11",
  },
  {
    id: "knit",
    name: "燕麦针织衫 · K003",
    kind: "product",
    image: mediaAsset("portrait.png"),
    position: "85% 94%",
    tags: ["针织", "燕麦色", "穿搭参考"],
    description:
      "来自人物造型的针织穿搭参考图，用于示例素材关联，不是独立商品精确建模。",
    code: "K003",
    updated: "2026-10-11",
  },
  {
    id: "window",
    name: "午后窗边",
    kind: "scene",
    image: mediaAsset("portrait.png"),
    position: "5% 40%",
    tags: ["室内", "侧光", "独白"],
    description: "暖色石墙与窗边日光。适合慢节奏独白与产品细节镜头。",
    code: "SC-002",
    updated: "2026-10-10",
  },
  {
    id: "voice",
    name: "知夏 · 温柔叙事",
    kind: "voice",
    image: "",
    tags: ["普通话", "舒缓", "声音档案"],
    description: "仅演示声音档案与创作绑定，不包含声音克隆或音频合成。",
    code: "VO-001",
    updated: "2026-10-10",
  },
];
export const emptyDraft: Draft = {
  title: "",
  prompt: "",
  characterId: "lin",
  productId: "hat",
  sceneId: "courtyard",
  voiceId: "voice",
  ratio: "16:9",
  duration: 12,
  mood: "自然温柔",
  shots: [],
};
export function makeShots(draft: Draft, assets: Asset[]) {
  const person =
    assets.find((a) => a.id === draft.characterId)?.name.split(" · ")[0] ||
    "品牌人物";
  const product =
    assets.find((a) => a.id === draft.productId)?.name.split(" · ")[0] ||
    "品牌单品";
  const scene = assets.find((a) => a.id === draft.sceneId)?.name || "品牌场景";
  return [
    {
      id: "shot-1",
      title: "01 / 场景开篇",
      description: `${scene}，全景缓缓推进，${person}自然走入画面。`,
      narration: "把步调放慢，让日常多一点从容。",
    },
    {
      id: "shot-2",
      title: "02 / 人物与单品",
      description: `中景，${person}以${draft.mood}的状态展示${product}。创意参考：${draft.prompt.slice(0, 100)}`,
      narration: `一件${product}，让喜欢的风格，自然而然。`,
    },
    {
      id: "shot-3",
      title: "03 / 细节与收尾",
      description: `${product}细节特写，切回人物的自然微笑，画面留白。`,
      narration: "少一点刻意，多一点自己。",
    },
  ];
}
export function createSeed(): StudioState {
  const now = Date.now();
  const draft = {
    ...emptyDraft,
    title: "秋日，自有风格",
    prompt:
      "让林知夏戴着 H001 云朵羊毛帽，在秋日庭院温柔地介绍产品，包含自然走动和转身。",
  };
  draft.shots = makeShots(draft, initialAssets);
  const task = (
    id: string,
    title: string,
    status: Task["status"],
    age: number,
  ): Task => ({
    id,
    title,
    status,
    createdAt: now - age,
    startedAt: now - age,
    draft: { ...draft, title },
    assets: initialAssets.filter((a) =>
      [
        draft.characterId,
        draft.productId,
        draft.sceneId,
        draft.voiceId,
      ].includes(a.id),
    ),
    approved: id === "MS-1023",
    favorite: false,
    ...(status === "failed"
      ? {
          error:
            "模拟异常：场景参考处理超时。可重试此任务，素材和配置将被保留。",
        }
      : {}),
  });
  return {
    version: 1,
    assets: initialAssets,
    draft: emptyDraft,
    tasks: [
      task("MS-1025", "云朵羊毛帽 · 秋日庭院", "generating", 2500),
      task("MS-1024", "午后，一段温柔独白", "failed", 3600000),
      task("MS-1023", "秋日，自有风格", "completed", 7200000),
      task("MS-1022", "把日常过成喜欢的样子", "completed", 86400000),
    ],
  };
}
