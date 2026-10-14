const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const $ = (selector) => document.querySelector(selector);
const serviceLabels = { saas: "SaaS", paas: "PaaS", iaas: "IaaS" };
const statusLabels = {
  proposal: "需求提议",
  specified: "规格已整理",
  prototype: "可交互原型",
  integrated: "已接入服务",
  verified: "已验收",
};
const typeLabels = {
  blueprints: "标准主干",
  variants: "场景变体",
  "reference-implementation": "参考实现",
  "project-case": "项目案例",
};
const typeDescriptions = {
  blueprints: "可复用的业务规格：角色、对象、流程、页面与扩展点。",
  variants: "在标准主干上，记录行业差异与场景适配方式。",
  "reference-implementation":
    "用于验证方案的具体实现；运行状态与接入条件见案例材料。",
  "project-case": "以具体项目材料为依据沉淀的案例，验证范围以证据记录为准。",
};
const icons = {
  saas: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="15" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="15" width="7" height="7" rx="1.5"/><rect x="15" y="15" width="7" height="7" rx="1.5"/>',
  paas: '<path d="m13 3 10 6-10 6L3 9zM3 14l10 6 10-6M3 19l10 6 10-6"/>',
  iaas: '<rect x="3" y="3" width="20" height="8" rx="2"/><rect x="3" y="15" width="20" height="8" rx="2"/><path d="M7 7h1m4 0h7M7 19h1m4 0h7"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 26 28" aria-hidden="true">${icons[name] ?? icons.saas}</svg>`;
let models = [],
  groups = [],
  domains = [],
  blueprints = [],
  variants = [],
  entries = [];
let manifests = new Map();
const defaults = {
  serviceModel: "saas",
  group: "all",
  domain: "all",
  type: "blueprints",
  industry: "all",
  search: "",
  blueprint: "",
  variant: "",
};
let state = { ...defaults },
  searchTimer,
  loading = false;
const findBlueprint = (id) => blueprints.find((item) => item.id === id);
const findDomain = (id) => domains.find((item) => item.id === id);
const textOf = (...values) =>
  values.flat(Infinity).filter(Boolean).join(" ").toLocaleLowerCase();
const bpText = (bp) => {
  const domain = findDomain(bp?.domain);
  return textOf(
    bp?.id,
    bp?.title,
    bp?.summary,
    bp?.roles,
    bp?.entities,
    bp?.workflow,
    bp?.pages,
    bp?.extensionPoints,
    domain?.id,
    domain?.title,
    domain?.summary,
    groups.find((group) => group.id === domain?.groupId)?.title,
  );
};
const variantText = (variant) =>
  textOf(
    variant?.id,
    variant?.title,
    variant?.summary,
    variant?.industries,
    variant?.adaptations,
  );
const caseText = (entry) =>
  textOf(entry.id, entry.title, entry.summary, entry.tags);
const relatedVariants = (id) =>
  variants.filter((variant) => variant.blueprintId === id);
const relatedCases = (id, variantId = "") =>
  entries.filter(
    (entry) =>
      entry.blueprintId === id && (!variantId || entry.variantId === variantId),
  );
const layerIndustries = () =>
  [
    ...new Set(
      variants
        .filter(
          (variant) =>
            findBlueprint(variant.blueprintId)?.serviceModel ===
            state.serviceModel,
        )
        .flatMap((variant) => variant.industries),
    ),
  ].sort((a, b) => a.localeCompare(b, "zh-CN"));
const domainLabel = (domain) =>
  domain?.id.length < 6 ? domain.id.toUpperCase() : domain?.title;

function readLocation() {
  const params = new URLSearchParams(location.search);
  const next = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      params.get(key) ?? fallback,
    ]),
  );
  if (!models.some((item) => item.id === next.serviceModel))
    next.serviceModel = "saas";
  if (
    !groups.some(
      (item) =>
        item.id === next.group && item.serviceModel === next.serviceModel,
    )
  )
    next.group = "all";
  const domain = domains.find(
    (item) =>
      item.id === next.domain && item.serviceModel === next.serviceModel,
  );
  if (!domain) next.domain = "all";
  else next.group = domain.groupId;
  if (!Object.hasOwn(typeLabels, next.type)) next.type = "blueprints";
  let bp = findBlueprint(next.blueprint);
  const variant = variants.find((item) => item.id === next.variant);
  if (!bp && variant) bp = findBlueprint(variant.blueprintId);
  if (!bp || bp.serviceModel !== next.serviceModel) {
    next.blueprint = "";
    next.variant = "";
  } else {
    next.blueprint = bp.id;
    if (variant?.blueprintId !== bp.id) next.variant = "";
  }
  const availableIndustries = variants
    .filter(
      (item) =>
        findBlueprint(item.blueprintId)?.serviceModel === next.serviceModel,
    )
    .flatMap((item) => item.industries);
  if (!availableIndustries.includes(next.industry)) next.industry = "all";
  return next;
}
function persistState(mode = "push") {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(state)) {
    if (key === "serviceModel" || value !== defaults[key])
      url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href !== location.href)
    history[mode === "replace" ? "replaceState" : "pushState"](null, "", url);
}
function updateState(change) {
  clearTimeout(searchTimer);
  persistState();
  state = { ...state, ...change };
  persistState();
  render();
}
function withinScope(bp) {
  const domain = findDomain(bp.domain);
  return (
    bp.serviceModel === state.serviceModel &&
    (state.group === "all" || domain?.groupId === state.group) &&
    (state.domain === "all" || bp.domain === state.domain)
  );
}
function filteredAssets() {
  const query = state.search.trim().toLocaleLowerCase();
  const industryMatches = (variant) =>
    state.industry === "all" || variant.industries.includes(state.industry);
  const scopedBlueprints = blueprints.filter(withinScope);
  const ids = new Set(scopedBlueprints.map((bp) => bp.id));
  const scopedVariants = variants.filter((variant) =>
    ids.has(variant.blueprintId),
  );
  const matchesBlueprint = (bp) => {
    const children = relatedVariants(bp.id).filter(industryMatches);
    const matchingCases = relatedCases(bp.id).filter(
      (entry) =>
        state.industry === "all" ||
        children.some((variant) => variant.id === entry.variantId),
    );
    return (
      (state.industry === "all" || children.length > 0) &&
      textOf(
        bpText(bp),
        children.map(variantText),
        matchingCases.map(caseText),
      ).includes(query)
    );
  };
  const filteredVariants = scopedVariants.filter(
    (variant) =>
      industryMatches(variant) &&
      textOf(
        variantText(variant),
        bpText(findBlueprint(variant.blueprintId)),
        relatedCases(variant.blueprintId, variant.id).map(caseText),
      ).includes(query),
  );
  const cases = entries.filter(
    (entry) =>
      ids.has(entry.blueprintId) &&
      (state.industry === "all" ||
        variants
          .find((variant) => variant.id === entry.variantId)
          ?.industries.includes(state.industry)) &&
      textOf(
        caseText(entry),
        bpText(findBlueprint(entry.blueprintId)),
        variantText(variants.find((variant) => variant.id === entry.variantId)),
      ).includes(query),
  );
  return {
    blueprints: scopedBlueprints.filter(matchesBlueprint),
    variants: filteredVariants,
    "reference-implementation": cases.filter(
      (entry) => entry.caseKind === "reference-implementation",
    ),
    "project-case": cases.filter((entry) => entry.caseKind === "project-case"),
  };
}
function renderModels() {
  $("#service-models").innerHTML = models
    .map(
      (model) =>
        `<button type="button" class="service-card service-mini ${model.id === state.serviceModel ? "active" : ""}" data-service-model="${escape(model.id)}" aria-pressed="${model.id === state.serviceModel}"><span class="service-icon">${icon(model.id)}</span><span class="service-mini-copy"><strong>${escape(model.title)}</strong><small>${domains.filter((domain) => domain.serviceModel === model.id).length} 个分类 · ${blueprints.filter((bp) => bp.serviceModel === model.id).length} 个主干</small></span><span class="service-selected" aria-hidden="true">✓</span></button>`,
    )
    .join("");
  $("#service-models").setAttribute("aria-busy", "false");
  const layerBlueprints = blueprints.filter(
    (bp) => bp.serviceModel === state.serviceModel,
  );
  const layerIds = new Set(layerBlueprints.map((bp) => bp.id));
  const counts = [
    [
      "domains",
      "业务分类",
      domains.filter((domain) => domain.serviceModel === state.serviceModel)
        .length,
    ],
    ["blueprints", "标准主干", layerBlueprints.length],
    [
      "variants",
      "场景变体",
      variants.filter((variant) => layerIds.has(variant.blueprintId)).length,
    ],
    [
      "reference-implementation",
      "参考实现",
      entries.filter(
        (entry) =>
          entry.serviceModel === state.serviceModel &&
          entry.caseKind === "reference-implementation",
      ).length,
    ],
    [
      "project-case",
      "项目案例",
      entries.filter(
        (entry) =>
          entry.serviceModel === state.serviceModel &&
          entry.caseKind === "project-case",
      ).length,
    ],
  ];
  $("#inventory").innerHTML = counts
    .map(
      ([id, title, count]) =>
        `<div class="inventory-item" data-stat="${id}"><strong>${count}</strong><span>${title}</span>${id === "project-case" && !count ? "<small>待沉淀</small>" : ""}</div>`,
    )
    .join("");
  $("#inventory").hidden = false;
}
function renderDomains() {
  const layerGroups = groups.filter(
    (group) => group.serviceModel === state.serviceModel,
  );
  const layerDomains = domains.filter(
    (domain) => domain.serviceModel === state.serviceModel,
  );
  $("#group-select").innerHTML =
    '<option value="all">全部业务族</option>' +
    layerGroups
      .map(
        (group) =>
          `<option value="${escape(group.id)}">${escape(group.title)}</option>`,
      )
      .join("");
  $("#group-select").value = state.group;
  $("#category-layer").textContent = serviceLabels[state.serviceModel];
  $("#domain-total").textContent = `${layerDomains.length} 类`;
  const query = $("#domain-search").value.trim().toLocaleLowerCase();
  const matches = layerDomains.filter(
    (domain) =>
      (query || state.group === "all" || domain.groupId === state.group) &&
      textOf(domain.title, domain.id, domain.summary).includes(query),
  );
  const allButton = `<button class="domain-option all-domains ${state.domain === "all" ? "active" : ""}" data-domain="all" aria-pressed="${state.domain === "all"}"><span class="all-icon" aria-hidden="true">▦</span><span class="domain-copy"><strong>${state.group === "all" ? "全部 " + serviceLabels[state.serviceModel] + " 资产" : "本业务族全部资产"}</strong><small>${state.group === "all" ? "按业务族进入，或直接搜索分类" : "查看本业务族的主干与场景"}</small></span></button>`;
  const domainButton = (domain) => {
    const count = blueprints.filter(
      (bp) => bp.domain === domain.id && bp.serviceModel === state.serviceModel,
    ).length;
    return `<button class="domain-option ${state.domain === domain.id ? "active" : ""}" data-domain="${escape(domain.id)}" aria-pressed="${state.domain === domain.id}"><span class="domain-copy"><strong>${escape(domain.title)}</strong><small>${escape(domain.summary)}</small></span><span class="domain-count ${count ? "has-cases" : ""}" title="${count} 个标准主干">${count}</span></button>`;
  };
  $("#domains").innerHTML = query
    ? matches.map(domainButton).join("")
    : allButton +
      (state.group === "all"
        ? layerGroups
            .map(
              (group) =>
                `<button class="domain-option group-option" data-group="${escape(group.id)}"><span class="domain-copy"><strong>${escape(group.title)}</strong><small>${escape(group.summary)}</small></span><span class="group-count">${layerDomains.filter((domain) => domain.groupId === group.id).length} 类 <b aria-hidden="true">›</b></span></button>`,
            )
            .join("")
        : matches.map(domainButton).join(""));
  $("#no-domains").hidden = matches.length > 0;
}
const pills = (items, className = "") =>
  `<div class="detail-pills ${className}">${items.map((item) => `<span>${escape(item)}</span>`).join("")}</div>`;
function blueprintCard(bp) {
  const children = relatedVariants(bp.id),
    implementations = relatedCases(bp.id);
  return `<article class="blueprint-card" data-blueprint-card="${escape(bp.id)}"><div class="asset-card-top"><span class="asset-code">${escape(serviceLabels[bp.serviceModel])} / ${escape(domainLabel(findDomain(bp.domain)))}</span><span class="spec-badge">标准主干</span></div><h3>${escape(bp.title)}</h3><p>${escape(bp.summary)}</p><div class="blueprint-roles"><span>典型角色</span>${escape(bp.roles.slice(0, 3).join(" · "))}${bp.roles.length > 3 ? " 等" : ""}</div><div class="workflow-preview">${bp.workflow
    .slice(0, 3)
    .map((step, index) => `<span>${index + 1}<b>${escape(step)}</b></span>`)
    .join(
      '<i aria-hidden="true">→</i>',
    )}${bp.workflow.length > 3 ? '<i aria-hidden="true">…</i>' : ""}</div><div class="blueprint-card-footer"><span>${children.length} 个变体 <i>·</i> ${implementations.length} 个关联实现</span><button class="text-button" data-blueprint="${escape(bp.id)}">查看主干 <span aria-hidden="true">↗</span></button></div></article>`;
}
function variantCard(variant) {
  const bp = findBlueprint(variant.blueprintId);
  return `<article class="variant-card" data-variant-card="${escape(variant.id)}"><div class="asset-card-top"><span class="asset-code">${escape(domainLabel(findDomain(bp.domain)))}</span><span class="spec-badge variant-badge">场景变体</span></div><h3>${escape(variant.title)}</h3><p>${escape(variant.summary)}</p>${pills(variant.industries, "industry-pills")}<div class="variant-parent">源自主干 <strong>${escape(bp.title)}</strong></div><div class="blueprint-card-footer"><span>${variant.adaptations.length} 项场景适配 <i>·</i> ${relatedCases(bp.id, variant.id).length} 个关联实现</span><button class="text-button" data-variant="${escape(variant.id)}">查看变体 <span aria-hidden="true">↗</span></button></div></article>`;
}
function caseArtwork(entry) {
  const factory = entry.id === "factory-operations",
    studio = entry.id === "character-material-library";
  const drawing = factory
    ? '<path d="M13 48V29l16 8V25l17 9V12h10v36zM21 43h4m9 0h4m9 0h3"/>'
    : studio
      ? '<rect x="15" y="10" width="40" height="40" rx="8"/><circle cx="35" cy="25" r="7"/><path d="M23 43c0-13 24-13 24 0"/>'
      : '<rect x="12" y="10" width="46" height="40" rx="5"/><path d="M12 22h46M25 22v28M32 31h17M32 39h12"/>';
  return `<div class="case-art ${studio ? "studio-art" : "factory-art"}" aria-hidden="true"><span class="art-label">${factory ? "FACTORY OPERATIONS" : studio ? "PERSONA STUDIO" : "WORKBENCH IMPLEMENTATION"}</span><div class="mini-workspace"><div class="mini-sidebar"><i></i><span></span><span></span><span></span></div><div class="mini-content"><div class="mini-bar"><span></span><b></b></div><div class="mini-cards"><span></span><span></span><span></span></div><div class="mini-lines"><i></i><i></i><i></i></div></div></div><div class="art-symbol"><svg viewBox="0 0 70 60">${drawing}</svg></div></div>`;
}
function materialLinks(entry, manifest) {
  const materials = [
    { title: "案例说明", path: "README.md" },
    { title: "需求规格", path: "requirements.md" },
    { title: "业务流程", path: "workflows.md" },
    { title: "数据模型", path: "data-model.md" },
    { title: "验收范围", path: "acceptance.md" },
    ...(manifest?.evidence ?? []),
  ];
  return `<details class="material-links"><summary>规格与验证材料 <span>${materials.length} 份</span></summary><div>${materials.map((item) => `<a href="/${escape(entry.path)}/${escape(item.path)}" target="_blank" rel="noreferrer">${escape(item.title)} <span aria-hidden="true">↗</span></a>`).join("")}</div></details>`;
}
function implementationCard(entry, compact = false) {
  const manifest = manifests.get(entry.id),
    bp = findBlueprint(entry.blueprintId),
    variant = variants.find((item) => item.id === entry.variantId);
  const playable =
    manifest &&
    ["prototype", "integrated", "verified"].includes(manifest.status) &&
    manifest.runtime?.mode !== "none" &&
    manifest.runtime?.entry;
  return `<article class="case-card ${compact ? "compact-case" : ""}" data-case="${escape(entry.id)}">${compact ? "" : caseArtwork(entry)}<div class="case-body"><div class="case-meta"><span class="case-breadcrumb">${escape(serviceLabels[entry.serviceModel])} / ${escape(domainLabel(findDomain(entry.domain)))}</span><span class="case-status status-${escape(entry.status)}"><i></i>${escape(statusLabels[entry.status] ?? entry.status)}</span></div><span class="implementation-kind">${escape(typeLabels[entry.caseKind])}</span><h3>${escape(entry.title)}</h3><p>${escape(entry.summary)}</p><div class="implementation-lineage"><span>标准主干 <strong>${escape(bp?.title ?? entry.blueprintId)}</strong></span><span>场景变体 <strong>${escape(variant?.title ?? entry.variantId)}</strong></span></div>${!manifest ? '<p class="manifest-warning">运行信息暂不可用，可先查看案例说明。</p>' : ""}${materialLinks(entry, manifest)}<div class="case-footer"><a class="button primary" href="/${escape(entry.path)}/${escape(playable ? manifest.runtime.entry : "README.md")}">${playable ? "体验工作台" : "查看案例"}<span aria-hidden="true">↗</span></a>${compact ? `<a href="/${escape(entry.path)}/README.md" target="_blank" rel="noreferrer">案例说明 →</a>` : `<button class="text-button" data-variant="${escape(entry.variantId)}">查看资产关系 →</button>`}</div></div></article>`;
}
function renderResults() {
  const model = models.find((item) => item.id === state.serviceModel),
    group = groups.find((item) => item.id === state.group),
    domain = findDomain(state.domain);
  const assets = filteredAssets(),
    matches = assets[state.type];
  $("#breadcrumb").innerHTML =
    `<button data-reset-scope>资产库 / ${escape(serviceLabels[state.serviceModel])}</button>${group ? `<span>/</span><button data-group="${escape(group.id)}">${escape(group.title)}</button>` : ""}${domain ? `<span>/</span><strong>${escape(domainLabel(domain))}</strong>` : ""}`;
  $("#results-title").textContent =
    domain?.title ??
    group?.title ??
    `全部 ${serviceLabels[state.serviceModel]} 资产`;
  $("#domain-description").textContent =
    domain?.summary ?? group?.summary ?? model.summary;
  $("#results-count").textContent =
    `${matches.length} 个${typeLabels[state.type]}`;
  $("#asset-tabs").innerHTML = Object.entries(typeLabels)
    .map(
      ([id, title]) =>
        `<button type="button" role="tab" id="tab-${id}" aria-controls="asset-results" aria-selected="${state.type === id}" tabindex="${state.type === id ? 0 : -1}" data-type="${id}">${title}<span>${assets[id].length}</span></button>`,
    )
    .join("");
  $("#asset-results").setAttribute("aria-labelledby", `tab-${state.type}`);
  $("#type-description").textContent = typeDescriptions[state.type];
  $("#summary").textContent = `显示 ${matches.length} 项`;
  $("#cases").className =
    `case-grid ${state.type === "blueprints" ? "blueprint-grid" : state.type === "variants" ? "variant-grid" : ""}`;
  $("#cases").innerHTML = matches
    .map((item) =>
      state.type === "blueprints"
        ? blueprintCard(item)
        : state.type === "variants"
          ? variantCard(item)
          : implementationCard(item),
    )
    .join("");
  const constrained = Boolean(state.search.trim() || state.industry !== "all");
  $("#empty").hidden = matches.length > 0;
  $("#empty-title").textContent = constrained
    ? "没有找到匹配资产"
    : `${typeLabels[state.type]}待沉淀`;
  $("#empty-description").textContent = constrained
    ? `当前范围内没有符合${state.search.trim() ? `“${state.search.trim()}”` : "所选行业"}的${typeLabels[state.type]}，可以清除检索条件或切换资产类型。`
    : state.type === "project-case"
      ? "当前尚未收录有项目材料支撑的项目案例。参考实现可在相应类型下查阅。"
      : state.type === "blueprints" || state.type === "variants"
        ? "分类已建立，标准规格与场景适配尚待整理。这里不会把分类本身计为可运行案例。"
        : "当前范围尚未关联参考实现。可先查阅标准主干和变体，了解业务边界与适配方式。";
  $("#clear-filter").hidden = !constrained;
}
function standardSections(bp) {
  return `<div class="standard-sections"><section><h3><span>01</span> 业务角色</h3>${pills(bp.roles)}</section><section><h3><span>02</span> 业务对象</h3>${pills(bp.entities)}</section><section class="wide-section"><h3><span>03</span> 标准流程</h3><ol class="standard-workflow">${bp.workflow.map((step, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><p>${escape(step)}</p></li>`).join("")}</ol></section><section><h3><span>04</span> 页面组成</h3><ul class="standard-list">${bp.pages.map((page) => `<li>${escape(page)}</li>`).join("")}</ul></section><section><h3><span>05</span> 扩展点</h3><ul class="standard-list">${bp.extensionPoints.map((point) => `<li>${escape(point)}</li>`).join("")}</ul></section></div>`;
}
function renderDetail() {
  const dialog = $("#asset-detail"),
    bp = findBlueprint(state.blueprint),
    variant = variants.find(
      (item) => item.id === state.variant && item.blueprintId === bp?.id,
    );
  if (!bp) {
    if (dialog.open) dialog.close();
    return;
  }
  const children = relatedVariants(bp.id),
    implementations = relatedCases(bp.id, variant?.id);
  const title = variant?.title ?? bp.title;
  $("#detail-content").innerHTML =
    `<div class="detail-heading"><div class="detail-breadcrumb">${escape(serviceLabels[bp.serviceModel])} / ${escape(domainLabel(findDomain(bp.domain)))} / ${variant ? "场景变体" : "标准主干"}</div><span class="spec-badge ${variant ? "variant-badge" : ""}">${variant ? "场景适配规格" : "标准业务规格"}</span><h2 id="detail-title">${escape(title)}</h2><p>${escape(variant?.summary ?? bp.summary)}</p></div>${variant ? `<div class="variant-origin"><span>继承标准主干</span><button data-blueprint="${escape(bp.id)}">${escape(bp.title)} <span aria-hidden="true">↗</span></button></div><section class="variant-adaptations"><h3>适用行业</h3>${pills(variant.industries, "industry-pills")}<h3>场景适配</h3><ul class="standard-list">${variant.adaptations.map((item) => `<li>${escape(item)}</li>`).join("")}</ul></section><details class="inherited-standard"><summary>查阅继承的标准主干 <span>角色 · 对象 · 流程 · 页面 · 扩展点</span></summary>${standardSections(bp)}</details>` : standardSections(bp)}<section class="detail-related"><div class="related-heading"><h3>${variant ? "同一主干的场景变体" : "场景变体"} <span>${children.length}</span></h3><p>在标准主干上记录业务差异</p></div><div class="related-variants">${children.length ? children.map((child) => `<button class="related-variant ${variant?.id === child.id ? "active" : ""}" data-variant="${escape(child.id)}" aria-pressed="${variant?.id === child.id}"><strong>${escape(child.title)}</strong><span>${escape(child.industries.join(" · "))}</span><small>${escape(child.summary)}</small><b aria-hidden="true">↗</b></button>`).join("") : '<p class="inline-empty">场景变体待沉淀。</p>'}</div></section><section class="detail-related"><div class="related-heading"><h3>关联实现与项目材料 <span>${implementations.length}</span></h3><p>参考实现 ${implementations.filter((entry) => entry.caseKind === "reference-implementation").length} 个 · 项目案例 ${implementations.filter((entry) => entry.caseKind === "project-case").length} 个</p></div>${implementations.length ? `<div class="related-implementations">${implementations.map((entry) => implementationCard(entry, true)).join("")}</div>` : '<div class="inline-empty">关联实现待沉淀。当前内容为业务规格，可作为设计与适配的起点。</div>'}</section>`;
  if (!dialog.open) dialog.showModal();
}
function render() {
  const active = document.activeElement,
    focused = active?.dataset;
  $("#search").value = state.search;
  renderModels();
  renderDomains();
  $("#industry-select").innerHTML =
    '<option value="all">全部行业</option>' +
    layerIndustries()
      .map(
        (industry) =>
          `<option value="${escape(industry)}">${escape(industry)}</option>`,
      )
      .join("");
  $("#industry-select").value = state.industry;
  renderResults();
  renderDetail();
  if (!$("#asset-detail").open && focused)
    for (const key of ["serviceModel", "domain", "group", "type"])
      if (focused[key]) {
        const attribute = key.replace(
          /[A-Z]/g,
          (letter) => `-${letter.toLowerCase()}`,
        );
        document
          .querySelector(`[data-${attribute}="${CSS.escape(focused[key])}"]`)
          ?.focus({ preventScroll: true });
        break;
      }
}
async function loadCatalog() {
  if (loading) return;
  loading = true;
  $("#catalog-error").hidden = true;
  $("#service-models").setAttribute("aria-busy", "true");
  try {
    const resources = [
      "service-models",
      "domain-groups",
      "domains",
      "blueprints",
      "variants",
      "cases",
    ];
    const responses = await Promise.all(
      resources.map((name) => fetch(`/catalog/${name}.json`)),
    );
    if (responses.some((response) => !response.ok))
      throw new Error("资产目录数据读取失败，请确认服务正在运行后重试。");
    const data = await Promise.all(
      responses.map((response) => response.json()),
    );
    [models, groups, domains, blueprints, variants, entries] = data.map(
      (resource, index) =>
        resource[
          [
            "serviceModels",
            "groups",
            "domains",
            "blueprints",
            "variants",
            "cases",
          ][index]
        ],
    );
    if (
      ![models, groups, domains, blueprints, variants, entries].every(
        Array.isArray,
      ) ||
      !models.some((model) => model.id === "saas")
    )
      throw new Error("资产目录格式无效，请检查分类与关系索引。");
    manifests = new Map(
      await Promise.all(
        entries.map(async (entry) => {
          try {
            const response = await fetch(`/${entry.path}/case.json`);
            return [entry.id, response.ok ? await response.json() : null];
          } catch {
            return [entry.id, null];
          }
        }),
      ),
    );
    state = readLocation();
    persistState("replace");
    render();
    $("#catalog-content").hidden = false;
  } catch (error) {
    $("#catalog-error").hidden = false;
    $("#error-message").textContent =
      error instanceof Error
        ? error.message
        : "请通过 npm run demo 启动服务后重试。";
    $("#service-models").innerHTML =
      '<div class="loading-panel">服务分类尚未加载</div>';
  } finally {
    loading = false;
    $("#service-models").setAttribute("aria-busy", "false");
  }
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const data = button.dataset;
  if (data.serviceModel) {
    $("#domain-search").value = "";
    updateState({
      serviceModel: data.serviceModel,
      group: "all",
      domain: "all",
      industry: "all",
      blueprint: "",
      variant: "",
    });
  } else if (data.group) {
    $("#domain-search").value = "";
    updateState({
      group: data.group,
      domain: "all",
      blueprint: "",
      variant: "",
    });
  } else if (data.domain) {
    const domain = findDomain(data.domain);
    $("#domain-search").value = "";
    updateState({
      domain: data.domain,
      ...(domain ? { group: domain.groupId } : {}),
      blueprint: "",
      variant: "",
    });
  } else if ("resetScope" in data) {
    $("#domain-search").value = "";
    updateState({ group: "all", domain: "all", blueprint: "", variant: "" });
  } else if (data.type)
    updateState({ type: data.type, blueprint: "", variant: "" });
  else if (data.blueprint) {
    updateState({ blueprint: data.blueprint, variant: "" });
    $("#asset-detail").scrollTop = 0;
  } else if (data.variant) {
    const variant = variants.find((item) => item.id === data.variant);
    if (variant) {
      updateState({ blueprint: variant.blueprintId, variant: variant.id });
      $("#asset-detail").scrollTop = 0;
    }
  } else if ("closeDetail" in data) updateState({ blueprint: "", variant: "" });
});
$("#group-select").addEventListener("change", () => {
  $("#domain-search").value = "";
  updateState({
    group: $("#group-select").value,
    domain: "all",
    blueprint: "",
    variant: "",
  });
});
$("#industry-select").addEventListener("change", () =>
  updateState({
    industry: $("#industry-select").value,
    blueprint: "",
    variant: "",
  }),
);
$("#domain-search").addEventListener("input", renderDomains);
$("#search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  state = { ...state, search: $("#search").value, blueprint: "", variant: "" };
  renderResults();
  renderDetail();
  searchTimer = setTimeout(() => persistState(), 300);
});
$("#search").addEventListener("change", () => {
  clearTimeout(searchTimer);
  persistState();
});
$("#clear-filter").addEventListener("click", () =>
  updateState({ search: "", industry: "all" }),
);
$("#retry").addEventListener("click", loadCatalog);
$("#asset-detail").addEventListener("cancel", (event) => {
  event.preventDefault();
  updateState({ blueprint: "", variant: "" });
});
$("#asset-detail").addEventListener("click", (event) => {
  if (event.target === $("#asset-detail"))
    updateState({ blueprint: "", variant: "" });
});
$("#asset-tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const types = Object.keys(typeLabels),
    index = types.indexOf(state.type);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? types.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + types.length) %
          types.length;
  updateState({ type: types[next], blueprint: "", variant: "" });
  $(`#tab-${types[next]}`).focus();
});
window.addEventListener("popstate", () => {
  clearTimeout(searchTimer);
  if (!models.length) return;
  state = readLocation();
  $("#domain-search").value = "";
  render();
});
void loadCatalog();
