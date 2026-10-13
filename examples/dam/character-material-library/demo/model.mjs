export const emotionLabels = {
  neutral: "基础",
  happy: "喜",
  angry: "怒",
  sad: "哀",
  joyful: "乐",
};
export const typeLabels = { image: "图片", video: "视频", product: "产品" };
export const usageLabels = {
  "internal-demo": "内部演示",
  marketing: "营销视频",
};
export const rightsLabels = {
  approved: "范围已确认",
  pending: "待确认",
  restricted: "受限",
};

export function findAssets(
  assets,
  { query = "", type = "all", characterId = "all" } = {},
) {
  const term = query.trim().toLocaleLowerCase();
  return assets.filter(
    (asset) =>
      asset.status === "active" &&
      (type === "all" || asset.type === type) &&
      (characterId === "all" || asset.characterId === characterId) &&
      `${asset.name} ${asset.tags.join(" ")}`
        .toLocaleLowerCase()
        .includes(term),
  );
}

export function emotionCoverage(assets, characterId) {
  const present = new Set(
    assets
      .filter(
        (asset) =>
          asset.status === "active" &&
          asset.type === "video" &&
          asset.characterId === characterId,
      )
      .map((asset) => asset.emotion),
  );
  return Object.keys(emotionLabels).map((emotion) => ({
    emotion,
    present: present.has(emotion),
  }));
}

export function prepareMockJob(data, input, { id, createdAt }) {
  if (input.kind !== "video")
    throw new Error("该生成服务尚未接入，请先体验视频任务准备。");
  if (!Object.hasOwn(usageLabels, input.usage))
    throw new Error("请选择有效用途。");
  const character = data.characters.find(
    (item) => item.id === input.characterId,
  );
  const material = data.assets.find((item) => item.id === input.materialId);
  const product = data.assets.find((item) => item.id === input.productId);
  if (!character || !material || !product)
    throw new Error("请选择人物、人物素材与产品素材。");
  if (
    material.characterId !== character.id ||
    material.type === "product" ||
    product.type !== "product"
  )
    throw new Error("人物素材或产品关联不正确。");
  if ([material, product].some((item) => item.status !== "active"))
    throw new Error("已归档素材不能用于新任务。");
  for (const item of [character, material, product]) {
    if (item.rights.status !== "approved")
      throw new Error(`${item.name}的使用范围待确认或受限。`);
    if (!item.rights.allowedUsages.includes(input.usage))
      throw new Error(`${item.name}不允许用于${usageLabels[input.usage]}。`);
  }
  const prompt = input.prompt?.trim();
  if (!prompt) throw new Error("请填写任务说明。");
  const snapshot = (asset) => ({
    id: asset.id,
    name: asset.name,
    version: asset.version,
  });
  return {
    id,
    kind: "video",
    status: "mock-queued",
    createdAt,
    character: { id: character.id, name: character.name },
    inputs: [snapshot(material), snapshot(product)],
    usage: input.usage,
    prompt,
    output: null,
  };
}

export function completeMockJob(job) {
  if (job.status !== "mock-queued")
    throw new Error("只有排队中的模拟任务可以完成。");
  return { ...job, status: "mock-complete", output: null };
}
