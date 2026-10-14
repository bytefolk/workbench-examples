// Beijing region contracts and list prices verified on 2026-10-14.
// https://help.aliyun.com/zh/model-studio/legacy-image-to-video-api-reference/
// https://help.aliyun.com/zh/model-studio/model-pricing
// Estimates exclude account-specific free quotas and discounts.
const seconds = Array.from({ length: 14 }, (_, i) => i + 2);
const definitions = [
  {
    id: "wan2.6-i2v-flash",
    label: "万相 2.6 Flash · 首帧生视频",
    description: "支持 2–15 秒、单镜头或多镜头，可选择自动音效或无声输出。",
    durations: seconds,
    resolutions: ["720p", "1080p"],
    audioMode: "toggle",
    multiShot: true,
    promptLimit: 1500,
    defaultDuration: 5,
    defaultResolution: "720p",
    rates: {
      "720p": { silent: 0.15, audio: 0.3 },
      "1080p": { silent: 0.25, audio: 0.5 },
    },
  },
  {
    id: "wan2.6-i2v",
    label: "万相 2.6 · 首帧生视频",
    description:
      "支持 2–15 秒、单镜头或多镜头，固定有声输出；不是绑定人物声线。",
    durations: seconds,
    resolutions: ["720p", "1080p"],
    audioMode: "always",
    multiShot: true,
    promptLimit: 1500,
    defaultDuration: 5,
    defaultResolution: "720p",
    rates: {
      "720p": { silent: null, audio: 0.6 },
      "1080p": { silent: null, audio: 1 },
    },
  },
  {
    id: "wan2.2-i2v-flash",
    label: "万相 2.2 Flash · 首帧生视频",
    description: "固定 5 秒无声输出，支持 480P、720P、1080P；无多镜头参数。",
    durations: [5],
    resolutions: ["480p", "720p", "1080p"],
    audioMode: "none",
    multiShot: false,
    promptLimit: 800,
    defaultDuration: 5,
    defaultResolution: "720p",
    rates: {
      "480p": { silent: 0.1, audio: null },
      "720p": { silent: 0.2, audio: null },
      "1080p": { silent: 0.48, audio: null },
    },
  },
];
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const WAN_MODELS = freeze(definitions);
export function wanModel(id) {
  return WAN_MODELS.find((model) => model.id === id);
}
// Used only when a person changes the UI selection. The backend validates the
// submitted draft strictly and never silently normalizes a paid request.
export function normalizeWanDraft(draft, modelId) {
  const model = wanModel(modelId);
  if (!model) throw new RangeError("未支持的万相视频模型。");
  return {
    ...draft,
    modelId: model.id,
    duration: model.durations.includes(draft.duration)
      ? draft.duration
      : model.defaultDuration,
    resolution: model.resolutions.includes(draft.resolution)
      ? draft.resolution
      : model.defaultResolution,
    generateAudio:
      model.audioMode === "always" ||
      (model.audioMode === "toggle" && draft.generateAudio === true),
    wanShotType:
      model.multiShot && draft.wanShotType === "multi" ? "multi" : "single",
  };
}
export function wanRate(draft) {
  const model = wanModel(draft?.modelId);
  if (!model || !model.resolutions.includes(draft.resolution)) return null;
  if (
    (model.audioMode === "always" && draft.generateAudio === false) ||
    (model.audioMode === "none" && draft.generateAudio === true)
  )
    return null;
  const audio =
    model.audioMode === "always" ||
    (model.audioMode === "toggle" && draft.generateAudio === true);
  return model.rates[draft.resolution][audio ? "audio" : "silent"] ?? null;
}
export function wanEstimate(draft) {
  const model = wanModel(draft?.modelId);
  const rate = wanRate(draft);
  if (!model || rate === null || !model.durations.includes(draft.duration))
    return null;
  return Math.round(rate * draft.duration * 100) / 100;
}
