import { test, expect } from "@playwright/test";
const entry =
  "/examples/dam/brand-digital-human-studio/workbench/dist/index.html";
test("catalog retains both entries; MUSE assets are scoped and live API stays disabled", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/api/"))
      calls.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator(".case-card")).toHaveCount(2);
  await expect(
    page.locator(".case-card").filter({ hasText: "Persona Studio" }),
  ).toBeVisible();
  await page
    .locator(".case-card")
    .filter({ hasText: "MUSE" })
    .getByRole("link", { name: "体验工作台 →" })
    .click();
  await expect(page).toHaveURL(
    new RegExp("brand-digital-human-studio/workbench/dist/"),
  );
  await expect(
    page.getByRole("heading", { name: "品牌资产库", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".collection-banner img")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "新建视频", exact: true }).click();
  await page.getByRole("button", { name: /Higgsfield 真实 API/ }).click();
  await expect(
    page.getByText(
      "此目录入口仅运行免费模拟。真实验证请按案例说明单独启动工作台和本机代理。",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "下一步：脚本与分镜" }).isVisible();
  expect(calls).toEqual([]);
});
test("candidate confirmation and mock generation produce playable sample and reuse", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.goto(entry + "#create");
  await page.getByLabel("创作名称", { exact: true }).fill("目录回归样片");
  await page
    .getByLabel(/^创作需求/)
    .fill("让苏遥戴着 S002 围巾，在午后窗边介绍商品");
  await page.getByRole("button", { name: "推荐品牌资产", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "资产推荐与确认" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /苏遥 · 生活方式/ }).check();
  await page.getByRole("radio", { name: /雾棕羊绒围巾 · S002/ }).check();
  await page.getByRole("radio", { name: /午后窗边/ }).check();
  await page.getByRole("button", { name: "应用所选资产", exact: true }).click();
  await page.getByRole("button", { name: "下一步：脚本与分镜" }).click();
  await page.getByRole("button", { name: "提交模拟生成", exact: true }).click();
  await expect(page.getByText("目录回归样片", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "成品库", exact: true }).click();
  await page
    .getByRole("button", { name: "预览 目录回归样片", exact: true })
    .click({ timeout: 30000 });
  await expect(
    page.getByRole("dialog", { name: "作品预览与审核" }),
  ).toBeVisible();
  const video = page.locator("video");
  await expect
    .poll(() => video.evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(1);
  const duration = await video.evaluate(
    (v) => (v as HTMLVideoElement).duration,
  );
  expect(duration).toBeGreaterThan(5);
  expect(duration).toBeLessThan(7);
  await page.getByRole("button", { name: "审核通过", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "已审核通过", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog", { name: "作品预览与审核" })
    .getByRole("button", { name: "复用创作", exact: true })
    .click();
  await expect(page.getByLabel("创作名称", { exact: true })).toHaveValue(
    "目录回归样片 · 新版本",
  );
});
test("mobile assets and navigation remain available", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(entry);
  await expect(
    page.getByRole("heading", { name: "品牌资产库", exact: true }),
  ).toBeVisible();
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
  await page.getByRole("button", { name: "上传资产", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "添加品牌资产" }),
  ).toBeVisible();
});
