const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const $ = (selector) => document.querySelector(selector);
try {
  const responses = await Promise.all([
    fetch("/catalog/domains.json"),
    fetch("/catalog/cases.json"),
  ]);
  if (responses.some((response) => !response.ok))
    throw new Error("目录数据加载失败");
  const [domains, catalog] = await Promise.all(
    responses.map((response) => response.json()),
  );
  const manifests = new Map(
    await Promise.all(
      catalog.cases.map(async (entry) => {
        const response = await fetch(`/${entry.path}/case.json`);
        if (!response.ok) throw new Error(`案例信息加载失败：${entry.id}`);
        return [entry.id, await response.json()];
      }),
    ),
  );
  const labels = {
    proposal: "需求提议",
    specified: "规格已整理",
    prototype: "可交互原型",
    integrated: "已接入服务",
    verified: "已验收",
  };
  let selected = "all";
  const options = [{ id: "all", title: "全部场景" }, ...domains.domains];
  $("#domain-select").innerHTML = options
    .map(
      (domain) =>
        `<option value="${escape(domain.id)}">${escape(domain.title)}</option>`,
    )
    .join("");
  $("#domains").innerHTML = options
    .map(
      (domain) =>
        `<button data-domain="${escape(domain.id)}">${escape(domain.title)}<span>${domain.id === "all" ? catalog.cases.length : catalog.cases.filter((entry) => entry.domain === domain.id).length}</span></button>`,
    )
    .join("");
  const render = () => {
    const query = $("#search").value.trim().toLowerCase();
    const matches = catalog.cases.filter(
      (entry) =>
        (selected === "all" || entry.domain === selected) &&
        `${entry.title} ${entry.summary} ${entry.tags.join(" ")} ${entry.domain}`
          .toLowerCase()
          .includes(query),
    );
    $("#summary").textContent =
      `${domains.domains.length} 个业务领域 · ${catalog.cases.length} 个已收录案例 · 当前显示 ${matches.length} 个`;
    $("#cases").innerHTML = matches
      .map((entry) => {
        const manifest = manifests.get(entry.id);
        const playable =
          ["prototype", "integrated", "verified"].includes(manifest.status) &&
          manifest.runtime.mode !== "none";
        const primary = playable
          ? `<a class="button primary" href="/${escape(entry.path)}/${escape(manifest.runtime.entry)}">体验工作台 →</a>`
          : `<a class="button primary" href="/${escape(entry.path)}/README.md">查看案例 →</a>`;
        return `<article class="case-card"><div class="case-visual"><span class="visual-person">业务</span><span class="visual-person">流程</span><span class="visual-person">工作台</span></div><div class="case-body"><span class="badge blue">${escape(labels[entry.status])}</span><h2 style="margin-top:15px">${escape(entry.title)}</h2><p>${escape(entry.summary)}</p><div>${entry.tags.map((tag) => `<span class="tag">${escape(tag)}</span>`).join("")}</div><div class="case-footer">${primary}<a href="/${escape(entry.path)}/README.md">案例说明</a></div></div></article>`;
      })
      .join("");
    $("#empty").hidden = matches.length > 0;
    $("#empty h3").textContent = query
      ? "没有找到匹配案例"
      : "这个领域还没有案例";
    document.querySelectorAll("[data-domain]").forEach((button) => {
      button.classList.toggle("active", button.dataset.domain === selected);
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.domain === selected),
      );
    });
  };
  $("#domains").addEventListener("click", (event) => {
    const button = event.target.closest("[data-domain]");
    if (button) {
      selected = button.dataset.domain;
      $("#domain-select").value = selected;
      render();
    }
  });
  $("#domain-select").addEventListener("change", () => {
    selected = $("#domain-select").value;
    render();
  });
  $("#search").addEventListener("input", render);
  render();
} catch (error) {
  $("#summary").textContent =
    `无法加载案例目录：${error.message}。请通过 npm run demo 启动。`;
}
