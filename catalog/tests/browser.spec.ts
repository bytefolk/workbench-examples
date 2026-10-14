import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const readCatalog = (file: string) =>
  JSON.parse(readFileSync(new URL(`../${file}.json`, import.meta.url), "utf8"));
const { blueprints } = readCatalog("blueprints");
const { variants } = readCatalog("variants");
const mes = blueprints.find(
  (item: { id: string }) => item.id === "mes-production-operations",
);
const garment = variants.find(
  (item: { id: string }) => item.id === "garment-workshop-consumables",
);
const layer = (page: Page, name: "SaaS" | "PaaS" | "IaaS") =>
  page.getByRole("button", { name: new RegExp(`${name} ·`) });
const tab = (page: Page, name: string) =>
  page.getByRole("tab", { name: new RegExp(`^${name}`) });
const results = (page: Page) => page.locator("#cases");
const factory = (page: Page) =>
  page.locator('#cases [data-case="factory-operations"]');
async function expectQuery(
  page: Page,
  expected: Record<string, string | null>,
) {
  await expect
    .poll(() =>
      Object.fromEntries(
        Object.keys(expected).map((key) => [
          key,
          new URL(page.url()).searchParams.get(key),
        ]),
      ),
    )
    .toEqual(expected);
}
async function noOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

test("默认资产库无登录即可浏览，按真实类型统计60分类22主干44变体3参考实现0项目", async ({
  page,
}) => {
  await page.goto("/");
  await expect(layer(page, "SaaS")).toHaveAttribute("aria-pressed", "true");
  const counts = {
    domains: 60,
    blueprints: 22,
    variants: 44,
    "reference-implementation": 3,
    "project-case": 0,
  };
  for (const [key, count] of Object.entries(counts))
    await expect(page.locator(`[data-stat="${key}"] strong`)).toHaveText(
      String(count),
    );
  await expect(page.locator("#domains [data-group]")).toHaveCount(10);
  await expect(results(page).locator("[data-blueprint-card]")).toHaveCount(22);
  await expect(tab(page, "标准主干")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("link", { name: "体验工作台" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /登录|注册/ })).toHaveCount(0);
  await tab(page, "项目案例").click();
  await expect(
    page.getByRole("heading", { name: "项目案例待沉淀" }),
  ).toBeVisible();
  await expect(results(page).getByRole("article")).toHaveCount(0);
  await expect(
    page.getByText(
      "当前尚未收录有项目材料支撑的项目案例。参考实现可在相应类型下查阅。",
    ),
  ).toBeVisible();
});

test("按业务族进入MES主干，浏览五项规格、场景变体和关联参考材料", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByLabel("筛选业务族").selectOption("product-manufacturing");
  await page.locator('#domains [data-domain="mes"]').click();
  await expect(results(page).locator("[data-blueprint-card]")).toHaveCount(1);
  await expectQuery(page, { group: "product-manufacturing", domain: "mes" });
  await results(page).getByRole("button", { name: "查看主干" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: mes.title, exact: true }),
  ).toBeVisible();
  for (const name of ["业务角色", "业务对象", "标准流程", "页面组成", "扩展点"])
    await expect(
      dialog.getByRole("heading", { name: new RegExp(name) }),
    ).toBeVisible();
  await expect(dialog.locator(".standard-workflow li")).toHaveCount(
    mes.workflow.length,
  );
  await dialog.locator(`[data-variant="${garment.id}"]`).click();
  await expect(
    dialog.getByRole("heading", { name: garment.title, exact: true }),
  ).toBeVisible();
  await expectQuery(page, { blueprint: mes.id, variant: garment.id });
  await expect(dialog.locator(".variant-adaptations li")).toHaveCount(
    garment.adaptations.length,
  );
  await expect(
    dialog.getByText("参考实现 1 个 · 项目案例 0 个", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.locator('[data-case="factory-operations"]'),
  ).toBeVisible();
  await dialog.locator(".material-links summary").click();
  const evidence = dialog.getByRole("link", { name: /专用 QA 环境/ });
  await expect(evidence).toHaveAttribute(
    "href",
    "/examples/saas/mes/factory-operations/evidence/verification.md",
  );
  const response = await request.get(
    (await evidence.getAttribute("href")) as string,
  );
  expect(response.status()).toBe(200);
  await expect(dialog.getByRole("link", { name: "业务流程" })).toBeVisible();
  await page.getByRole("button", { name: "关闭资产详情" }).click();
  await expect(dialog).not.toBeVisible();
});

test("分类缩写、变体适配内容和行业都可检索，主干继承变体命中", async ({
  page,
}) => {
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "搜索案例资产" });
  for (const [query, id] of [
    ["CRM", "crm-sales-pipeline"],
    ["MES", mes.id],
    ["DAM", "dam-content-assets"],
  ]) {
    await search.fill(query);
    await expect(
      results(page).locator(`[data-blueprint-card="${id}"]`),
    ).toBeVisible();
  }
  await search.fill(garment.adaptations[0]);
  await expect(
    results(page).locator(`[data-blueprint-card="${mes.id}"]`),
  ).toBeVisible();
  await tab(page, "场景变体").click();
  await expect(
    results(page).locator(`[data-variant-card="${garment.id}"]`),
  ).toBeVisible();
  await search.clear();
  await page.getByLabel("筛选行业").selectOption(garment.industries[0]);
  const expected = variants.filter((variant: { industries: string[] }) =>
    variant.industries.includes(garment.industries[0]),
  );
  await expect(results(page).locator("[data-variant-card]")).toHaveCount(
    expected.length,
  );
  await expectQuery(page, {
    type: "variants",
    industry: garment.industries[0],
    search: null,
  });
});

test("分类搜索与资产搜索拥有可恢复的空态", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "查找子类" }).fill("MES");
  await expect(page.locator('#domains [data-domain="mes"]')).toBeVisible();
  await page.getByRole("searchbox", { name: "查找子类" }).fill("不存在的分类");
  await expect(page.locator("#no-domains")).toBeVisible();
  await expect(results(page).locator("[data-blueprint-card]")).toHaveCount(22);
  await page.getByRole("searchbox", { name: "查找子类" }).clear();
  await expect(page.locator("#domains [data-group]")).toHaveCount(10);
  await page
    .getByRole("searchbox", { name: "搜索案例资产" })
    .fill("没有这个资产关键词");
  await expect(
    page.getByRole("heading", { name: "没有找到匹配资产" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "清除检索条件" }).click();
  await expect(results(page).locator("[data-blueprint-card]")).toHaveCount(22);
});

test("行业与实现关键词必须来自同一变体分支，避免跨行业假命中", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("searchbox", { name: "搜索案例资产" })
    .fill("Persona Studio");
  await expect(
    results(page).locator('[data-blueprint-card="dam-content-assets"]'),
  ).toBeVisible();
  await page.getByLabel("筛选行业").selectOption("消费品");
  await expect(results(page).locator("[data-blueprint-card]")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "没有找到匹配资产" }),
  ).toBeVisible();
  await expect(tab(page, "场景变体").locator("span")).toHaveText("0");
  await expect(tab(page, "参考实现").locator("span")).toHaveText("0");
  await page.getByLabel("筛选行业").selectOption("企业营销");
  await expect(
    results(page).locator('[data-blueprint-card="dam-content-assets"]'),
  ).toBeVisible();
  await expect(tab(page, "参考实现").locator("span")).toHaveText("1");
});

test("直接URL恢复行业、类型、分类与变体详情，前进后退恢复选中关系", async ({
  page,
}) => {
  const query = new URLSearchParams({
    serviceModel: "saas",
    domain: "mes",
    type: "variants",
    industry: garment.industries[0],
    search: "断针",
    blueprint: mes.id,
    variant: garment.id,
  });
  await page.goto(`/?${query}`);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: garment.title, exact: true }),
  ).toBeVisible();
  await expectQuery(page, {
    group: "product-manufacturing",
    domain: "mes",
    type: "variants",
    industry: garment.industries[0],
    search: "断针",
    blueprint: mes.id,
    variant: garment.id,
  });
  await page.reload();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: garment.title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭资产详情" }).click();
  await expectQuery(page, { blueprint: null, variant: null });
  await page.goBack();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectQuery(page, { blueprint: mes.id, variant: garment.id });
  await page.goForward();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await layer(page, "PaaS").click();
  await expectQuery(page, {
    serviceModel: "paas",
    group: null,
    domain: null,
    industry: null,
    search: "断针",
    type: "variants",
  });
  await page.goBack();
  await expect(page.getByLabel("筛选行业")).toHaveValue(garment.industries[0]);
  await expect(tab(page, "场景变体")).toHaveAttribute("aria-selected", "true");
});

test("PaaS和IaaS保留分类，主干及项目数量为零且不伪装可运行内容", async ({
  page,
}) => {
  await page.goto("/");
  await layer(page, "PaaS").click();
  await expect(page.locator('[data-stat="domains"] strong')).toHaveText("8");
  await expect(page.locator('[data-stat="blueprints"] strong')).toHaveText("0");
  await expect(
    page.getByRole("heading", { name: "标准主干待沉淀" }),
  ).toBeVisible();
  await page.getByLabel("筛选业务族").selectOption("platform-capabilities");
  await expect(
    page.locator('#domains [data-domain]:not([data-domain="all"])'),
  ).toHaveCount(8);
  await layer(page, "IaaS").click();
  await expect(page.locator('[data-stat="domains"] strong')).toHaveText("5");
  await expect(page.locator('[data-stat="project-case"] strong')).toHaveText(
    "0",
  );
  await page.getByLabel("筛选业务族").selectOption("infrastructure-resources");
  await expect(
    page.locator('#domains [data-domain]:not([data-domain="all"])'),
  ).toHaveCount(5);
  await expect(page.getByRole("link", { name: "体验工作台" })).toHaveCount(0);
});

test("390像素手机下分组、主干、变体详情与长搜索均无横向溢出", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(results(page).locator("[data-blueprint-card]")).toHaveCount(22);
  await noOverflow(page);
  await page.getByRole("searchbox", { name: "查找子类" }).fill("MES");
  await page.locator('#domains [data-domain="mes"]').click();
  await results(page).getByRole("button", { name: "查看主干" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await page
    .getByRole("dialog")
    .locator(`[data-variant="${garment.id}"]`)
    .click();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await noOverflow(page);
  await page.getByRole("button", { name: "关闭资产详情" }).click();
  await page
    .getByRole("searchbox", { name: "搜索案例资产" })
    .fill("long-unmatched-asset-without-spaces-".repeat(4));
  await expect(
    page.getByRole("heading", { name: "没有找到匹配资产" }),
  ).toBeVisible();
  await noOverflow(page);
});

test("三个参考实现保留运行入口，规格与证据无需进入业务登录", async ({
  page,
}) => {
  await page.goto("/?serviceModel=saas&type=reference-implementation");
  await expect(results(page).locator("[data-case]")).toHaveCount(3);
  await expect(
    results(page).getByText("参考实现", { exact: true }),
  ).toHaveCount(3);
  const factoryLink = factory(page).getByRole("link", { name: "体验工作台" });
  await expect(factoryLink).toHaveAttribute(
    "href",
    "/examples/saas/mes/factory-operations/workbench/dist/index.html",
  );
  await factoryLink.click();
  await expect(
    page.getByRole("heading", { name: /欢迎回到工作台|连接你的数据平台/ }),
  ).toBeVisible();
  await page.goto("/?serviceModel=saas&type=reference-implementation");
  const personaLink = results(page)
    .locator('[data-case="character-material-library"]')
    .getByRole("link", { name: "体验工作台" });
  await expect(personaLink).toHaveAttribute(
    "href",
    "/examples/saas/dam/character-material-library/workbench/dist/index.html",
  );
  await personaLink.click();
  await expect(page).toHaveTitle("本色 · Persona Studio");
  await expect(page.locator("#root")).toContainText("人物");
  await page.goto("/?serviceModel=saas&type=reference-implementation");
  const museLink = results(page)
    .locator('[data-case="brand-digital-human-studio"]')
    .getByRole("link", { name: "体验工作台" });
  await expect(museLink).toHaveAttribute(
    "href",
    "/examples/saas/dam/brand-digital-human-studio/workbench/dist/index.html",
  );
  await museLink.click();
  await expect(
    page.getByRole("button", { name: "登录工作台", exact: true }),
  ).toBeVisible();
});

test("关系目录加载失败可以重试，单个实现manifest失败仍可浏览规格", async ({
  page,
}) => {
  const resource = "**/catalog/variants.json";
  await page.route(resource, (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("资产目录暂时无法加载");
  await page.unroute(resource);
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(page.getByRole("alert")).toBeHidden();
  await expect(results(page).locator("[data-blueprint-card]")).toHaveCount(22);
  await page.route(
    "**/examples/saas/mes/factory-operations/case.json",
    (route) => route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/?serviceModel=saas&type=reference-implementation");
  await expect(factory(page)).toContainText(
    "运行信息暂不可用，可先查看案例说明。",
  );
  await expect(
    factory(page).getByRole("link", { name: "体验工作台" }),
  ).toHaveCount(0);
  await expect(
    factory(page).getByRole("link", { name: "查看案例", exact: true }),
  ).toHaveAttribute("href", "/examples/saas/mes/factory-operations/README.md");
  await factory(page).locator(".material-links summary").click();
  await expect(
    factory(page).getByRole("link", { name: "业务流程" }),
  ).toBeVisible();
});

test("无效URL类型与错配变体安全回落，键盘可切换资产类型", async ({ page }) => {
  await page.goto("/?serviceModel=saas&type=toString");
  await expect(tab(page, "标准主干")).toHaveAttribute("aria-selected", "true");
  await expectQuery(page, { type: null });
  await page.goto(
    `/?serviceModel=saas&type=__proto__&blueprint=${mes.id}&variant=industrial-account-visits`,
  );
  await expect(tab(page, "标准主干")).toHaveAttribute("aria-selected", "true");
  await expectQuery(page, { type: null, blueprint: mes.id, variant: null });
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: mes.title, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await tab(page, "标准主干").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, "场景变体")).toBeFocused();
  await expect(results(page).locator("[data-variant-card]")).toHaveCount(44);
});
