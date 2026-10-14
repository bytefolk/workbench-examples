const kinds = ["character", "product", "scene", "voice"];
const synonyms = {
  羊毛: ["毛呢", "保暖"],
  帽: ["帽子", "礼帽", "试戴"],
  围巾: ["披肩", "围脖"],
  米白: ["奶油色", "象牙白"],
  室内: ["屋内", "房间"],
  户外: ["室外", "院子"],
  秋日: ["秋天", "秋季"],
  舒缓: ["温柔", "慢节奏"],
};
const normalized = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/\s+/g, "");
const tokens = (text) =>
  [...new Intl.Segmenter("zh", { granularity: "word" }).segment(text)]
    .filter((s) => s.isWordLike && s.segment.length > 1)
    .map((s) => normalized(s.segment));
export function rankAssets(prompt, assets) {
  const query = normalized(prompt);
  const terms = tokens(prompt);
  const groups = kinds.map((kind) => {
    const candidates = assets
      .filter((a) => a.kind === kind)
      .map((a) => {
        let score = 0;
        const reasons = [];
        const name = a.name.split(" · ")[0];
        if (a.code && query.includes(normalized(a.code))) {
          score += 100;
          reasons.push(`命中编号 ${a.code}`);
        }
        if (name && query.includes(normalized(name))) {
          score += 90;
          reasons.push(`命中名称 ${name}`);
        }
        for (const tag of a.tags || [])
          if (tag && query.includes(normalized(tag))) {
            score += 15;
            reasons.push(`命中标签 ${tag}`);
          }
        const text = normalized(
          [a.name, ...(a.tags || []), a.description].join(" "),
        );
        for (const term of new Set(terms)) if (text.includes(term)) score += 3;
        for (const [term, aliases] of Object.entries(synonyms))
          if (
            text.includes(normalized(term)) &&
            aliases.some((t) => query.includes(t))
          ) {
            score += 8;
            reasons.push(`关联词 ${term}`);
          }
        return {
          id: a.id,
          score,
          reason: reasons.join("；") || "描述词相关，建议人工确认",
        };
      })
      .filter((a) => a.score >= 8)
      .sort((a, b) => b.score - a.score);
    const strongest = candidates[0]?.score || 0;
    const relevant = candidates
      .filter((a) => (strongest >= 90 ? a.score >= 90 : true))
      .slice(0, 3);
    return { kind, candidates: relevant, needsConfirmation: true };
  });
  return {
    method: "rules",
    intent: { character: "", product: "", scene: "", action: "", mood: "" },
    groups,
    warnings: [
      "当前使用本地规则检索，支持编号、名称、标签和少量关联词；自由表达的语义理解需要配置 Qwen。",
      ...groups
        .filter((g) => !g.candidates.length)
        .map(
          (g) =>
            `${{ character: "人物", product: "商品", scene: "场景", voice: "声音" }[g.kind]}未找到明确候选，请手动选择。`,
        ),
    ],
  };
}
