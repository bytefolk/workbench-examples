import { expect, test, type Page } from "@playwright/test";

const layer = (page: Page, name: "SaaS" | "PaaS" | "IaaS") =>
  page.getByRole("button", { name: new RegExp(`${name} ·`) });
const domainOptions = (page: Page) =>
  page.locator('#domains [data-domain]:not([data-domain="all"])');
const factory = (page: Page) =>
  page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "工厂运营工作台", exact: true }),
  });

async function expectQuery(
  page: Page,
  expected: { serviceModel: string; domain?: string; search?: string },
) {
  await expect
    .poll(() => {
      const query = new URL(page.url()).searchParams;
      return {
        serviceModel: query.get("serviceModel"),
        domain: query.get("domain"),
        search: query.get("search"),
      };
    })
    .toEqual({
      serviceModel: expected.serviceModel,
      domain: expected.domain ?? null,
      search: expected.search ?? null,
    });
}

async function expectNoHorizontalOverflow(page: Page) {
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

test("默认 SaaS 展示 22 个分类与两个真实案例，MES 筛选只保留工厂", async ({
  page,
}) => {
  await page.goto("/");
  await expect(layer(page, "SaaS")).toHaveAttribute("aria-pressed", "true");
  await expect(domainOptions(page)).toHaveCount(22);
  await expect(page.locator("#domain-total")).toHaveText("22 类");
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(page.locator("#results-count")).toHaveText("2 个案例");

  await page.getByRole("button", { name: /制造执行 MES/ }).click();
  await expect(
    page.getByRole("heading", { name: "制造执行 MES" }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(factory(page)).toBeVisible();
  await expectQuery(page, { serviceModel: "saas", domain: "mes" });
});

test("切换 PaaS 与 IaaS 展示 8 和 5 个分类，并清除前一层分类", async ({
  page,
}) => {
  await page.goto("/?serviceModel=saas&domain=mes");
  await expect(factory(page)).toBeVisible();
  await page.getByRole("searchbox", { name: "查找子类" }).fill("MES");

  await layer(page, "PaaS").click();
  await expect(layer(page, "PaaS")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("searchbox", { name: "查找子类" })).toHaveValue(
    "",
  );
  await expect(domainOptions(page)).toHaveCount(8);
  await expect(
    page.getByRole("heading", { name: "全部开发与数据平台" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "PaaS 暂无收录案例" }),
  ).toBeVisible();
  await expectQuery(page, { serviceModel: "paas" });

  await page.getByRole("button", { name: /数据库服务 DBaaS/ }).click();
  await expectQuery(page, { serviceModel: "paas", domain: "dbaas" });
  await layer(page, "IaaS").click();
  await expect(domainOptions(page)).toHaveCount(5);
  await expect(
    page.getByRole("heading", { name: "全部基础设施" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "IaaS 暂无收录案例" }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expectQuery(page, { serviceModel: "iaas" });
});

test("分类搜索与案例搜索各有可恢复的无结果状态", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(2);
  const categorySearch = page.getByRole("searchbox", { name: "查找子类" });
  await categorySearch.fill("MES");
  await expect(domainOptions(page)).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: /制造执行 MES/ }),
  ).toBeVisible();
  await categorySearch.fill("不存在的分类");
  await expect(domainOptions(page)).toHaveCount(0);
  await expect(
    page.getByText("没有匹配的分类，换个关键词试试。", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(2);
  await categorySearch.clear();
  await expect(domainOptions(page)).toHaveCount(22);

  await page.getByRole("searchbox", { name: "搜索案例" }).fill("没有这个案例");
  await expect(
    page.getByRole("heading", { name: "没有找到匹配案例" }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.getByRole("button", { name: "清除搜索", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "搜索案例" })).toHaveValue(
    "",
  );
  await expect(page.getByRole("article")).toHaveCount(2);
});

test("URL 保存服务层、领域和搜索，刷新及前进后退恢复同一视图", async ({
  page,
}) => {
  await page.goto("/?serviceModel=saas&domain=mes");
  await expect(factory(page)).toBeVisible();
  await page.getByRole("searchbox", { name: "搜索案例" }).fill("断针");
  await expectQuery(page, {
    serviceModel: "saas",
    domain: "mes",
    search: "断针",
  });
  await page.reload();
  await expect(page.getByRole("searchbox", { name: "搜索案例" })).toHaveValue(
    "断针",
  );
  await expect(
    page.getByRole("button", { name: /制造执行 MES/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(factory(page)).toBeVisible();

  await layer(page, "PaaS").click();
  await expectQuery(page, { serviceModel: "paas", search: "断针" });
  await layer(page, "IaaS").click();
  await expectQuery(page, { serviceModel: "iaas", search: "断针" });
  await page.goBack();
  await expect(layer(page, "PaaS")).toHaveAttribute("aria-pressed", "true");
  await expect(domainOptions(page)).toHaveCount(8);
  await page.goBack();
  await expectQuery(page, {
    serviceModel: "saas",
    domain: "mes",
    search: "断针",
  });
  await expect(factory(page)).toBeVisible();
  await page.goForward();
  await expectQuery(page, { serviceModel: "paas", search: "断针" });
  await expect(
    page.getByRole("heading", { name: "全部开发与数据平台" }),
  ).toBeVisible();
});

test("390 像素手机视图的案例、分类和长搜索空态均无横向溢出", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(2);
  await expectNoHorizontalOverflow(page);
  await layer(page, "PaaS").click();
  await expect(domainOptions(page)).toHaveCount(8);
  await expectNoHorizontalOverflow(page);
  await layer(page, "IaaS").click();
  await expect(domainOptions(page)).toHaveCount(5);
  await page
    .getByRole("searchbox", { name: "搜索案例" })
    .fill("long-search-without-a-matching-workbench-".repeat(3));
  await expect(
    page.getByRole("heading", { name: "没有找到匹配案例" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("两个体验链接使用迁移后的 SaaS 路径并加载实际工作台", async ({ page }) => {
  await page.goto("/");
  await expect(factory(page)).toBeVisible();
  const factoryLink = factory(page).getByRole("link", { name: "体验工作台" });
  await expect(factoryLink).toHaveAttribute(
    "href",
    "/examples/saas/mes/factory-operations/workbench/dist/index.html",
  );
  await factoryLink.click();
  await expect(page).toHaveURL(
    /\/examples\/saas\/mes\/factory-operations\/workbench\/dist\/index\.html$/,
  );
  await expect(
    page.getByRole("heading", { name: /欢迎回到工作台|连接你的数据平台/ }),
  ).toBeVisible();

  await page.goto("/");
  const persona = page.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: "本色 Persona Studio · 企业数字人工作台",
      exact: true,
    }),
  });
  const personaLink = persona.getByRole("link", { name: "体验工作台" });
  await expect(personaLink).toHaveAttribute(
    "href",
    "/examples/saas/dam/character-material-library/workbench/dist/index.html",
  );
  await personaLink.click();
  await expect(page).toHaveURL(
    /\/examples\/saas\/dam\/character-material-library\/workbench\/dist\/index\.html$/,
  );
  await expect(page).toHaveTitle("本色 · Persona Studio");
  await expect(page.locator("#root")).toContainText("人物");
});

test("目录数据加载失败显示原因，重新加载后恢复完整目录", async ({ page }) => {
  const pattern = "**/catalog/cases.json";
  await page.route(pattern, (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("目录暂时无法加载");
  await expect(page.getByRole("alert")).toContainText("目录数据读取失败");
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.unroute(pattern);
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(page.getByRole("alert")).toBeHidden();
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(domainOptions(page)).toHaveCount(22);
});

test("单个案例运行信息失败保留说明入口，不影响其他案例体验", async ({
  page,
}) => {
  await page.route(
    "**/examples/saas/mes/factory-operations/case.json",
    (route) => route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(factory(page)).toContainText(
    "运行信息暂不可用，可先查看案例说明。",
  );
  await expect(
    factory(page).getByRole("link", { name: "查看案例", exact: true }),
  ).toHaveAttribute("href", "/examples/saas/mes/factory-operations/README.md");
  await expect(
    factory(page).getByRole("link", { name: "体验工作台" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "体验工作台" })).toHaveCount(1);
});
