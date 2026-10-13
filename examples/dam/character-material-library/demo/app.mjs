import {
  emotionLabels,
  typeLabels,
  usageLabels,
  rightsLabels,
  findAssets,
  emotionCoverage,
  prepareMockJob,
  completeMockJob,
} from "./model.mjs";

const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const state = { characters: [], assets: [], jobs: [] };
let selectedAsset = null;
let toastTimer;
const toast = (message) => {
  $("#toast").textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("#toast").textContent = "";
  }, 3500);
};
const rightsBadge = (rights) =>
  `<span class="badge ${rights.status === "approved" ? "green" : "amber"}">${escape(rightsLabels[rights.status])}</span>`;

function visual(asset) {
  if (asset.type === "product") {
    return asset.tags.includes("眼镜")
      ? '<svg viewBox="0 0 120 70" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="4"><rect x="10" y="22" width="38" height="27" rx="9"/><rect x="72" y="22" width="38" height="27" rx="9"/><path d="M48 31Q60 20 72 31M10 25L3 18M110 25L117 18"/></g></svg>'
      : '<svg viewBox="0 0 100 75" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="5"><path d="M22 45V35a28 28 0 0 1 56 0v10"/><rect x="16" y="35" width="15" height="28" rx="7"/><rect x="69" y="35" width="15" height="28" rx="7"/></g></svg>';
  }
  return `<span class="symbol">${asset.characterId === "char-linxia" ? "林" : "周"}</span>`;
}

function renderPeople() {
  $("#people").innerHTML = state.characters
    .map(
      (character, index) =>
        `<article class="panel person-card"><div class="avatar ${index ? "lilac" : ""}">${escape(character.name[0])}</div><div><h3>${escape(character.name)} ${rightsBadge(character.rights)}</h3><div class="muted">${escape(character.description)}</div><div>${emotionCoverage(
          state.assets,
          character.id,
        )
          .map(
            (item) =>
              `<span class="emotion ${item.present ? "present" : ""}">${escape(emotionLabels[item.emotion])}${item.present ? " ✓" : " 缺失"}</span>`,
          )
          .join("")}</div></div></article>`,
    )
    .join("");
}

function renderAssets() {
  const items = findAssets(state.assets, {
    query: $("#asset-search").value,
    type: $("#asset-type").value,
  });
  $("#asset-count").textContent =
    `${state.assets.filter((asset) => asset.status === "active").length} 项在库素材`;
  $("#assets").innerHTML = items
    .map(
      (asset) =>
        `<button class="asset-card" data-asset="${escape(asset.id)}" aria-label="查看${escape(asset.name)}"><div class="asset-visual ${asset.type === "product" ? "product" : asset.characterId === "char-zhouning" ? "purple" : ""}">${visual(asset)}<span class="visual-label">合成占位 · ${escape(typeLabels[asset.type])}</span></div><div class="asset-info"><h3>${escape(asset.name)}</h3><div class="asset-meta"><span>${escape(typeLabels[asset.type])} · V${asset.version}</span><span>${asset.emotion ? escape(emotionLabels[asset.emotion]) : "参考素材"}</span></div>${rightsBadge(asset.rights)}</div></button>`,
    )
    .join("");
  $("#assets-empty").hidden = items.length > 0;
}

function renderMaterials() {
  const previous = $("#job-material").value;
  const materials = state.assets.filter(
    (asset) =>
      asset.status === "active" &&
      asset.characterId === $("#job-character").value &&
      asset.type !== "product",
  );
  $("#job-material").innerHTML = materials.length
    ? materials
        .map(
          (asset) =>
            `<option value="${escape(asset.id)}">${escape(asset.name)} · V${asset.version}</option>`,
        )
        .join("")
    : '<option value="">没有可用人物素材</option>';
  if (materials.some((asset) => asset.id === previous))
    $("#job-material").value = previous;
  const previousProduct = $("#job-product").value;
  const products = state.assets.filter(
    (asset) => asset.status === "active" && asset.type === "product",
  );
  $("#job-product").innerHTML = products.length
    ? products
        .map(
          (asset) =>
            `<option value="${escape(asset.id)}">${escape(asset.name)}</option>`,
        )
        .join("")
    : '<option value="">没有可用产品素材</option>';
  if (products.some((asset) => asset.id === previousProduct))
    $("#job-product").value = previousProduct;
}

function selectTab(tab) {
  const jobs = tab === "jobs";
  $("#asset-view").hidden = jobs;
  $("#job-view").hidden = !jobs;
  for (const [id, active] of [
    ["assets-tab", !jobs],
    ["jobs-tab", jobs],
  ]) {
    $(`#${id}`).classList.toggle("active", active);
    $(`#${id}`).setAttribute("aria-pressed", String(active));
  }
}

function renderJobs() {
  $("#job-count").textContent = state.jobs.length;
  $("#jobs-empty").hidden = state.jobs.length > 0;
  $("#jobs").innerHTML = state.jobs
    .map(
      (job) =>
        `<article class="job"><h3>${escape(job.character.name)} · 视频任务<span class="badge ${job.status === "mock-complete" ? "green" : "blue"}">${job.status === "mock-complete" ? "模拟完成" : "模拟排队"}</span></h3><p>${escape(job.prompt)}</p><div class="inputs">输入快照：${job.inputs.map((asset) => `${escape(asset.name)} · V${asset.version}`).join(" / ")}</div><p>${escape(usageLabels[job.usage])} · ${escape(new Date(job.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}（北京时间）</p><p><code>${escape(job.id)}</code></p>${job.status === "mock-queued" ? `<button data-complete="${escape(job.id)}">模拟完成</button>` : "<p>没有生成视频或输出文件。真实生成服务尚未接入。</p>"}</article>`,
    )
    .join("");
}

function openAsset(id) {
  selectedAsset = state.assets.find((asset) => asset.id === id);
  if (!selectedAsset) return;
  const character = state.characters.find(
    (item) => item.id === selectedAsset.characterId,
  );
  $("#detail-title").textContent = selectedAsset.name;
  const rows = [
    ["类型", typeLabels[selectedAsset.type]],
    ["关联人物", character?.name || "产品素材"],
    ["版本", `V${selectedAsset.version}`],
    ["状态", selectedAsset.status === "active" ? "可用" : "已归档"],
    ["使用范围", rightsLabels[selectedAsset.rights.status]],
    [
      "允许用途",
      selectedAsset.rights.allowedUsages
        .map((usage) => usageLabels[usage])
        .join("、") || "无",
    ],
    ["来源", selectedAsset.source],
    ["标签", selectedAsset.tags.join("、")],
  ];
  $("#detail-body").innerHTML = rows
    .map(
      ([label, value]) =>
        `<div class="detail-row"><span>${escape(label)}</span><span>${escape(value)}</span></div>`,
    )
    .join("");
  $("#archive-asset").disabled = selectedAsset.status === "archived";
  $("#asset-dialog").showModal();
}

$("#asset-search").addEventListener("input", renderAssets);
$("#asset-type").addEventListener("change", renderAssets);
$("#job-character").addEventListener("change", () => {
  $("#form-message").textContent = "";
  renderMaterials();
});
$("#assets-tab").addEventListener("click", () => selectTab("assets"));
$("#jobs-tab").addEventListener("click", () => selectTab("jobs"));
$("#assets").addEventListener("click", (event) => {
  const button = event.target.closest("[data-asset]");
  if (button) openAsset(button.dataset.asset);
});
$("#close-dialog").addEventListener("click", () => $("#asset-dialog").close());
$("#archive-asset").addEventListener("click", () => {
  if (!selectedAsset) return;
  selectedAsset.status = "archived";
  $("#asset-dialog").close();
  renderAssets();
  renderPeople();
  renderMaterials();
  toast("素材已在本次演示中归档，历史任务输入保留。");
});
$("#job-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const input = {
      kind: $("#job-kind").value,
      characterId: $("#job-character").value,
      materialId: $("#job-material").value,
      productId: $("#job-product").value,
      usage: $("#job-usage").value,
      prompt: $("#job-prompt").value,
    };
    const job = prepareMockJob(state, input, {
      id: `mock-job-${state.jobs.length + 1}`,
      createdAt: new Date().toISOString(),
    });
    state.jobs.unshift(job);
    $("#form-message").textContent = "";
    renderJobs();
    selectTab("jobs");
    toast("已建立模拟任务，尚未生成媒体。");
  } catch (error) {
    $("#form-message").textContent = error.message;
  }
});
$("#jobs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-complete]");
  if (!button) return;
  const index = state.jobs.findIndex(
    (job) => job.id === button.dataset.complete,
  );
  state.jobs[index] = completeMockJob(state.jobs[index]);
  renderJobs();
  toast("模拟流程已完成，没有生成视频。");
});

try {
  const response = await fetch("../data/fixtures.json");
  if (!response.ok) throw new Error("素材数据加载失败");
  Object.assign(state, await response.json());
  $("#job-character").innerHTML = state.characters
    .map(
      (character) =>
        `<option value="${escape(character.id)}">${escape(character.name)} · ${escape(rightsLabels[character.rights.status])}</option>`,
    )
    .join("");
  renderPeople();
  renderAssets();
  renderMaterials();
  renderJobs();
} catch (error) {
  $("#form-message").textContent =
    `${error.message}。请从 npm run demo 的本地地址打开。`;
  $("#job-form button").disabled = true;
}
