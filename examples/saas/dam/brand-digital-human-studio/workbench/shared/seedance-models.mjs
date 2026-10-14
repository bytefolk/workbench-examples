// Conservative Demo preset from the gateway's official example, 2026-10-14.
// Account access, image Base64 support and actual quality still need a real test.
const preset = {
  id: "doubao-seedance-2-0-fast-260128",
  label: "Seedance 2.0 Fast",
  description:
    "文生视频或单图生视频；当前 Demo 预设 5 秒、720P，模型权限及图片格式需账号验证。",
  durations: Object.freeze([5]),
  resolutions: Object.freeze(["720p"]),
  inputModes: Object.freeze(["text", "image"]),
  promptLimit: 1500,
  defaultDuration: 5,
  defaultResolution: "720p",
};
export const SEEDANCE_MODELS = Object.freeze([Object.freeze(preset)]);
export function seedanceModel(id) {
  return SEEDANCE_MODELS.find((model) => model.id === id);
}
export function normalizeSeedanceDraft(draft, modelId = preset.id) {
  const model = seedanceModel(modelId);
  if (!model) throw new RangeError("未支持的 Seedance 视频模型。");
  return {
    ...draft,
    modelId: model.id,
    duration: model.defaultDuration,
    resolution: model.defaultResolution,
    generateAudio: false,
    seedanceInputMode: model.inputModes.includes(draft.seedanceInputMode)
      ? draft.seedanceInputMode
      : "image",
  };
}
