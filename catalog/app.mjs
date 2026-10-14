const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const $ = (selector) => document.querySelector(selector);
const serviceLabels = { saas: "SaaS", paas: "PaaS", iaas: "IaaS" };
const serviceHeadings = {
  saas: "全部业务应用",
  paas: "全部开发与数据平台",
  iaas: "全部基础设施",
};
const statusLabels = {
  proposal: "需求提议",
  specified: "规格已整理",
  prototype: "可交互原型",
  integrated: "已接入服务",
  verified: "已验收",
};
const icons = {
  saas: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="15" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="15" width="7" height="7" rx="1.5"/><rect x="15" y="15" width="7" height="7" rx="1.5"/>',
  paas: '<path d="m13 3 10 6-10 6L3 9zM3 14l10 6 10-6M3 19l10 6 10-6"/>',
  iaas: '<rect x="3" y="3" width="20" height="8" rx="2"/><rect x="3" y="15" width="20" height="8" rx="2"/><path d="M7 7h1m4 0h7M7 19h1m4 0h7"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 26 28" aria-hidden="true">${icons[name] ?? icons.saas}</svg>`;
const decodeLabel = (domain) =>
  domain.id.length < 6 ? domain.id.toUpperCase() : domain.title;

let models = [];
let domains = [];
let entries = [];
let manifests = new Map();
let state = { serviceModel: "saas", domain: "all", search: "" };
let searchTimer;
let loading = false;

function readLocation() {
  const params = new URLSearchParams(window.location.search);
  const serviceModel = models.some(
    (model) => model.id === params.get("serviceModel"),
  )
    ? params.get("serviceModel")
    : "saas";
  const domain = domains.some(
    (item) =>
      item.id === params.get("domain") && item.serviceModel === serviceModel,
  )
    ? params.get("domain")
    : "all";
  return { serviceModel, domain, search: params.get("search") ?? "" };
}

function persistState(mode = "push") {
  const url = new URL(window.location.href);
  url.searchParams.set("serviceModel", state.serviceModel);
  if (state.domain !== "all") url.searchParams.set("domain", state.domain);
  else url.searchParams.delete("domain");
  if (state.search) url.searchParams.set("search", state.search);
  else url.searchParams.delete("search");
  if (url.href !== window.location.href)
    window.history[mode === "replace" ? "replaceState" : "pushState"](
      null,
      "",
      url,
    );
}

function updateState(change) {
  clearTimeout(searchTimer);
  persistState();
  state = { ...state, ...change };
  persistState();
  render();
}

function countCases(serviceModel, domain = "all") {
  return entries.filter(
    (entry) =>
      entry.serviceModel === serviceModel &&
      (domain === "all" || entry.domain === domain),
  ).length;
}

function renderModels() {
  $("#service-models").innerHTML = models
    .map((model, index) => {
      const selected = model.id === state.serviceModel;
      return `<button type="button" class="service-card ${selected ? "active" : ""}" data-service-model="${escape(model.id)}" aria-pressed="${selected}"><span class="service-card-top"><span class="service-icon">${icon(model.id)}</span><span class="service-order">0${index + 1}</span><span class="service-selected" aria-hidden="true">✓</span></span><strong>${escape(model.title)}</strong><span class="service-description">${escape(model.summary)}</span><span class="service-card-bottom"><span><b>${domains.filter((item) => item.serviceModel === model.id).length}</b> 个分类 <i>·</i> <b>${countCases(model.id)}</b> 个案例</span><span class="service-arrow" aria-hidden="true">↗</span></span></button>`;
    })
    .join("");
  $("#service-models").setAttribute("aria-busy", "false");
}

function renderDomains() {
  const layerDomains = domains.filter(
    (domain) => domain.serviceModel === state.serviceModel,
  );
  const query = $("#domain-search").value.trim().toLocaleLowerCase();
  const matches = layerDomains.filter((domain) =>
    `${domain.title} ${domain.id} ${domain.summary}`
      .toLocaleLowerCase()
      .includes(query),
  );
  const allButton = `<button type="button" class="domain-option all-domains ${state.domain === "all" ? "active" : ""}" data-domain="all" aria-pressed="${state.domain === "all"}"><span class="all-icon" aria-hidden="true">▦</span><span class="domain-copy"><strong>全部 ${escape(serviceLabels[state.serviceModel])} 分类</strong><small>浏览本层已收录的案例</small></span><span class="domain-count">${countCases(state.serviceModel)}</span></button>`;
  $("#domains").innerHTML =
    `${query ? "" : allButton}${matches.map((domain) => `<button type="button" class="domain-option ${state.domain === domain.id ? "active" : ""}" data-domain="${escape(domain.id)}" aria-pressed="${state.domain === domain.id}"><span class="domain-copy"><strong>${escape(domain.title)}</strong><small>${escape(domain.summary)}</small></span><span class="domain-count ${countCases(state.serviceModel, domain.id) ? "has-cases" : ""}">${countCases(state.serviceModel, domain.id)}</span></button>`).join("")}`;
  $("#no-domains").hidden = matches.length > 0;
  $("#category-layer").textContent = serviceLabels[state.serviceModel];
  $("#domain-total").textContent = `${layerDomains.length} 类`;
}

function caseArtwork(entry) {
  const factory = entry.id === "factory-operations";
  const studio = entry.id === "character-material-library";
  const entryDomain = domains.find(
    (domain) =>
      domain.id === entry.domain && domain.serviceModel === entry.serviceModel,
  );
  const drawing = factory
    ? '<path d="M13 48V29l16 8V25l17 9V12h10v36zM21 43h4m9 0h4m9 0h3"/>'
    : studio
      ? '<rect x="15" y="10" width="40" height="40" rx="8"/><circle cx="35" cy="25" r="7"/><path d="M23 43c0-13 24-13 24 0"/>'
      : '<rect x="12" y="10" width="46" height="40" rx="5"/><path d="M12 22h46M25 22v28M19 16h2m5 0h2m5 0h2M32 31h17M32 39h12"/>';
  const label = factory
    ? "FACTORY OPERATIONS"
    : studio
      ? "PERSONA STUDIO"
      : "WORKBENCH CASE";
  const footnote = factory
    ? "生产协同 / 申领追溯"
    : studio
      ? "人物资产 / 内容制作"
      : (entryDomain?.title ?? entry.domain);
  return `<div class="case-art ${studio ? "studio-art" : "factory-art"}" aria-hidden="true"><span class="art-label">${label}</span><div class="mini-workspace"><div class="mini-sidebar"><i></i><span></span><span></span><span></span></div><div class="mini-content"><div class="mini-bar"><span></span><b></b></div><div class="mini-cards"><span></span><span></span><span></span></div><div class="mini-lines"><i></i><i></i><i></i></div></div></div><div class="art-symbol"><svg viewBox="0 0 70 60">${drawing}</svg></div><span class="art-footnote">${escape(footnote)}</span></div>`;
}

function renderCases() {
  const model = models.find((item) => item.id === state.serviceModel);
  const domain = domains.find(
    (item) =>
      item.id === state.domain && item.serviceModel === state.serviceModel,
  );
  const query = state.search.trim().toLocaleLowerCase();
  const matches = entries.filter((entry) => {
    const entryDomain = domains.find(
      (item) =>
        item.id === entry.domain && item.serviceModel === entry.serviceModel,
    );
    return (
      entry.serviceModel === state.serviceModel &&
      (state.domain === "all" || entry.domain === state.domain) &&
      `${entry.title} ${entry.summary} ${entry.tags.join(" ")} ${entry.domain} ${entryDomain?.title ?? ""} ${entryDomain?.summary ?? ""}`
        .toLocaleLowerCase()
        .includes(query)
    );
  });
  $("#breadcrumb").innerHTML =
    `<span>案例库</span><span aria-hidden="true">/</span><button type="button" data-domain="all">${escape(serviceLabels[state.serviceModel])}</button>${domain ? `<span aria-hidden="true">/</span><strong>${escape(decodeLabel(domain))}</strong>` : ""}`;
  $("#results-title").textContent =
    domain?.title ?? serviceHeadings[state.serviceModel];
  $("#domain-description").textContent = domain?.summary ?? model.summary;
  $("#results-count").textContent = `${matches.length} 个案例`;
  $("#summary").textContent = query
    ? `找到 ${matches.length} 个匹配案例`
    : `${countCases(state.serviceModel, state.domain)} 个已收录案例`;
  $("#cases").innerHTML = matches
    .map((entry) => {
      const manifest = manifests.get(entry.id);
      const entryDomain = domains.find(
        (item) =>
          item.id === entry.domain && item.serviceModel === entry.serviceModel,
      );
      const playable =
        manifest &&
        ["prototype", "integrated", "verified"].includes(manifest.status) &&
        manifest.runtime?.mode !== "none" &&
        manifest.runtime?.entry;
      const primaryUrl = playable
        ? `/${entry.path}/${manifest.runtime.entry}`
        : `/${entry.path}/README.md`;
      return `<article class="case-card">${caseArtwork(entry)}<div class="case-body"><div class="case-meta"><span class="case-breadcrumb">${escape(serviceLabels[entry.serviceModel])}<i>/</i>${escape(entryDomain ? decodeLabel(entryDomain) : entry.domain)}</span><span class="case-status status-${escape(entry.status)}"><i></i>${escape(statusLabels[entry.status] ?? entry.status)}</span></div><h3>${escape(entry.title)}</h3><p>${escape(entry.summary)}</p><div class="case-tags">${entry.tags
        .slice(0, 4)
        .map((tag) => `<span>${escape(tag)}</span>`)
        .join(
          "",
        )}${entry.tags.length > 4 ? `<span class="more-tags" title="${escape(entry.tags.slice(4).join("、"))}">+${entry.tags.length - 4}</span>` : ""}</div>${!manifest ? '<p class="manifest-warning">运行信息暂不可用，可先查看案例说明。</p>' : ""}<div class="case-footer"><a class="button primary" href="${escape(primaryUrl)}">${playable ? "体验工作台" : "查看案例"}<span aria-hidden="true">↗</span></a><a href="/${escape(entry.path)}/README.md">案例说明 <span aria-hidden="true">→</span></a></div></div></article>`;
    })
    .join("");
  $("#empty").hidden = matches.length > 0;
  $("#empty-code").textContent = query
    ? "NO MATCHING RESULTS"
    : "ROOM FOR THE NEXT IDEA";
  $("#empty-title").textContent = query
    ? "没有找到匹配案例"
    : domain
      ? `${domain.title} 暂无案例`
      : `${serviceLabels[state.serviceModel]} 暂无收录案例`;
  $("#empty-description").textContent = query
    ? `在当前${domain ? "分类" : "服务层"}中没有找到“${state.search.trim()}”。试试其他关键词，或清除搜索条件。`
    : domain
      ? "分类已建立，尚未收录实际案例。你的下一个真实场景，可以从这里开始。"
      : `已定义 ${domains.filter((item) => item.serviceModel === state.serviceModel).length} 个子类，尚未收录实际案例。选择分类查看范围，或贡献一个新场景。`;
  $("#clear-filter").hidden = !query && state.domain === "all";
  $("#clear-filter").textContent = query ? "清除搜索" : "浏览本层全部案例";
}

function render() {
  const active = document.activeElement;
  const focusedModel = active?.dataset.serviceModel;
  const focusedDomain = active?.dataset.domain;
  $("#search").value = state.search;
  renderModels();
  renderDomains();
  renderCases();
  if (focusedModel)
    document
      .querySelector(`[data-service-model="${CSS.escape(focusedModel)}"]`)
      ?.focus({ preventScroll: true });
  else if (focusedDomain)
    document
      .querySelector(`[data-domain="${CSS.escape(focusedDomain)}"]`)
      ?.focus({ preventScroll: true });
}

async function loadCatalog() {
  if (loading) return;
  loading = true;
  $("#catalog-error").hidden = true;
  $("#service-models").setAttribute("aria-busy", "true");
  try {
    const responses = await Promise.all([
      fetch("/catalog/service-models.json"),
      fetch("/catalog/domains.json"),
      fetch("/catalog/cases.json"),
    ]);
    if (responses.some((response) => !response.ok))
      throw new Error("目录数据读取失败，请确认服务正在运行后重试。");
    const [serviceCatalog, domainCatalog, caseCatalog] = await Promise.all(
      responses.map((response) => response.json()),
    );
    models = serviceCatalog.serviceModels;
    domains = domainCatalog.domains;
    entries = caseCatalog.cases;
    if (
      !models.some((model) => model.id === "saas") ||
      !Array.isArray(domains) ||
      !Array.isArray(entries)
    )
      throw new Error("目录格式无效，请检查分类与案例索引。");
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

$("#service-models").addEventListener("click", (event) => {
  const button = event.target.closest("[data-service-model]");
  if (!button || button.dataset.serviceModel === state.serviceModel) return;
  $("#domain-search").value = "";
  updateState({ serviceModel: button.dataset.serviceModel, domain: "all" });
});
for (const container of [$("#domains"), $("#breadcrumb")])
  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-domain]");
    if (button) updateState({ domain: button.dataset.domain });
  });
$("#domain-search").addEventListener("input", renderDomains);
$("#search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  state = { ...state, search: $("#search").value };
  renderCases();
  searchTimer = setTimeout(() => persistState(), 300);
});
$("#search").addEventListener("change", () => {
  clearTimeout(searchTimer);
  persistState();
});
$("#clear-filter").addEventListener("click", () =>
  updateState(state.search.trim() ? { search: "" } : { domain: "all" }),
);
$("#retry").addEventListener("click", loadCatalog);
window.addEventListener("popstate", () => {
  clearTimeout(searchTimer);
  if (!models.length) return;
  state = readLocation();
  $("#domain-search").value = "";
  render();
});
void loadCatalog();
