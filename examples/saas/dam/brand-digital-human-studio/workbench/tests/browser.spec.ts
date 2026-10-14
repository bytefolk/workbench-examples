import { test, expect } from "@playwright/test";
const entry =
  "/examples/saas/dam/brand-digital-human-studio/workbench/dist/index.html";
async function signIn(page: import("@playwright/test").Page) {
  await page.getByLabel("演示邮箱", { exact: true }).fill("admin@muse.demo");
  await page.getByLabel("演示密码", { exact: true }).fill("Muse2026!");
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
}

test("demo login rejects wrong credentials, preserves deep links and sessions, and signs out without losing the workspace", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.includes("/api/")) calls.push(r.url());
  });
  await page.goto(entry + "#create");
  await page.getByLabel("演示邮箱", { exact: true }).fill("admin@muse.demo");
  await page
    .getByLabel("演示密码", { exact: true })
    .fill("incorrect-demo-password");
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
  await expect(
    page.getByText("演示邮箱或密码不正确，请使用下方示例账号。", {
      exact: true,
    }),
  ).toBeVisible();
  expect(calls).toEqual([]);
  await page
    .getByRole("button", { name: "填入创作成员账号", exact: true })
    .click();
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "视频创作", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".profile").getByText("创作成员", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("创作名称", { exact: true }).fill("登录后保留的草稿");
  const saved = await page.evaluate(() => ({
    auth: sessionStorage.getItem("bytefolk-muse-demo-auth-v1"),
    persistent: localStorage.getItem("bytefolk-muse-demo-auth-v1"),
  }));
  expect(saved.auth).not.toContain("Muse2026!");
  expect(saved.persistent).toBeNull();
  const session = JSON.parse(saved.auth!);
  expect(session.expiresAt - session.issuedAt).toBe(8 * 60 * 60 * 1000);
  await page.reload();
  await expect(page.getByLabel("创作名称", { exact: true })).toHaveValue(
    "登录后保留的草稿",
  );
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "登录工作台", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("bytefolk-muse-demo-auth-v1"),
    ),
  ).toBeNull();
  await page
    .getByRole("button", { name: "填入管理员账号", exact: true })
    .click();
  await page.getByLabel("在此浏览器记住我 7 天").check();
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
  await expect(page.getByLabel("创作名称", { exact: true })).toHaveValue(
    "登录后保留的草稿",
  );
  const remembered = JSON.parse(
    (await page.evaluate(() =>
      localStorage.getItem("bytefolk-muse-demo-auth-v1"),
    ))!,
  );
  expect(remembered.expiresAt - remembered.issuedAt).toBe(
    7 * 24 * 60 * 60 * 1000,
  );
  remembered.issuedAt -= 8 * 24 * 60 * 60 * 1000;
  remembered.expiresAt -= 8 * 24 * 60 * 60 * 1000;
  await page.evaluate(
    (record) =>
      localStorage.setItem(
        "bytefolk-muse-demo-auth-v1",
        JSON.stringify(record),
      ),
    remembered,
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "登录工作台", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("演示登录已过期或失效，请重新登录。", { exact: true }),
  ).toBeVisible();
  expect(calls).toEqual([]);
});
test("public catalog excludes provider credentials and live generation controls", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.includes("/api/")) calls.push(r.url());
  });
  await page.goto(entry + "#create");
  await signIn(page);
  await expect(
    page.getByText("公开演示 · 仅模拟", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Seedance 真实视频生成|万相真实视频生成|Higgsfield 真实 API|声音复刻与对口型/,
    }),
  ).toHaveCount(0);
  await expect(page.getByLabel(/API Key/)).toHaveCount(0);
  expect(calls).toEqual([]);
});

test("full body preset changes the draft only and persists without model requests", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.includes("/api/")) calls.push(r.url());
  });
  await page.goto(entry + "#create");
  await signIn(page);
  await page.getByLabel("创作名称", { exact: true }).fill("原草稿");
  await page
    .getByLabel("示例案例", { exact: true })
    .selectOption("autumn-full-body");
  await expect(page.getByLabel("创作名称", { exact: true })).toHaveValue(
    "原草稿",
  );
  await page.getByRole("button", { name: "填入示例灵感", exact: true }).click();
  await expect(page.getByLabel("创作名称", { exact: true })).toHaveValue(
    "秋日赴约 · 全身表演与帽子展示",
  );
  await expect(page.getByLabel(/^创作需求/)).toHaveValue(/全身/);
  await page.getByRole("button", { name: "下一步：脚本与分镜" }).click();
  await expect(
    page.getByText("全身赴约 · 连续镜头", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("创作名称", { exact: true })).toHaveValue(
    "秋日赴约 · 全身表演与帽子展示",
  );
  expect(calls).toEqual([]);
});

test("v3 catalog retains three references; migrated MUSE assets stay scoped and live API stays disabled", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/api/"))
      calls.push(request.url());
  });
  await page.goto("/?serviceModel=saas&type=reference-implementation");
  await expect(page.locator("#cases [data-case]")).toHaveCount(3);
  await expect(
    page.locator("#cases [data-case]").filter({ hasText: "Persona Studio" }),
  ).toBeVisible();
  await page
    .locator("#cases [data-case]")
    .filter({ hasText: "MUSE" })
    .getByRole("link", { name: "体验工作台", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp("/examples/saas/dam/brand-digital-human-studio/workbench/dist/"),
  );
  await signIn(page);
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
  await expect(
    page.getByText("公开演示 · 仅模拟", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Higgsfield 真实 API/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "下一步：脚本与分镜" }).isVisible();
  expect(calls).toEqual([]);
});
test("candidate confirmation and mock generation produce playable sample and reuse", async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.goto(entry + "#create");
  await signIn(page);
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
  await signIn(page);
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
