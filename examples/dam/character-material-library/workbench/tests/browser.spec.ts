import { expect, test } from "@playwright/test";

test("PRD seven-step journey: parse, edit, confirm, generate, review, archive with provenance", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "每一个品牌，都有自己的本色。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "视频生成", exact: true }).click();
  await page
    .getByLabel("视频创作需求")
    .fill("用品牌主理人生成 30 秒秋季帽子试戴短片，温柔克制，竖屏");
  await page.getByRole("button", { name: "解析需求", exact: true }).click();
  await expect(page.getByLabel("选择生成的人物")).toHaveValue("founder");
  await page.getByLabel("视频时长").fill("45");
  await page
    .getByLabel("视频脚本")
    .fill("人工确认的品牌脚本：把喜欢的样子，戴进日常。");
  await page.getByRole("button", { name: "确认生成配置" }).click();
  const confirmation = page.getByRole("dialog", { name: "确认这次创作" });
  await expect(confirmation).toContainText("林知秋 · v2.0");
  await expect(confirmation).toContainText("人工确认的品牌脚本");
  await confirmation.getByRole("button", { name: "确认并提交" }).click();
  let detail = page.getByRole("dialog", {
    name: "秋季羊毛帽 · 45 秒短片",
    exact: true,
  });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "立即推进模拟" }).click();
  await expect(detail.locator(".task-status-line")).toContainText("待审核");
  await expect(detail).toContainText("等待审核人确认");
  await detail.getByRole("button", { name: "关闭窗口" }).click();
  await page.getByLabel("切换演示角色").selectOption("reviewer");
  await page
    .getByRole("button", { name: "秋季羊毛帽 · 45 秒短片", exact: true })
    .click();
  detail = page.getByRole("dialog", {
    name: "秋季羊毛帽 · 45 秒短片",
    exact: true,
  });
  await detail
    .getByLabel("审核意见")
    .fill("品牌语气与脚本配置已确认，演示审核通过。");
  await detail.getByRole("button", { name: "通过并归档" }).click();
  await expect(detail.locator(".task-status-line")).toContainText("已完成");
  await detail.getByRole("button", { name: "关闭窗口" }).click();
  await page.getByRole("button", { name: "成片库", exact: true }).click();
  await page
    .locator(".film-card")
    .filter({ hasText: "秋季羊毛帽 · 45 秒短片" })
    .click();
  detail = page.getByRole("dialog", {
    name: "秋季羊毛帽 · 45 秒短片",
    exact: true,
  });
  await expect(detail).toContainText("人工确认的品牌脚本");
  await expect(detail).toContainText("品牌语气与脚本配置已确认");
  await detail.getByRole("button", { name: "素材快照 · 8" }).click();
  await expect(detail.locator(".asset-row")).toHaveCount(8);
  const download = page.waitForEvent("download");
  await detail.getByRole("button", { name: "导出 Mock 清单" }).click();
  expect((await download).suggestedFilename()).toContain("mock-manifest.json");
  await detail.getByRole("button", { name: "关闭窗口" }).click();
  await page.reload();
  await expect(
    page.locator(".film-card").filter({ hasText: "秋季羊毛帽 · 45 秒短片" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("authorization, incomplete assets, scopes and provider configuration block submission", async ({
  page,
}) => {
  await page.goto("/#generate");
  await page.getByLabel("选择生成的人物").selectOption("lifestyle");
  await expect(
    page.getByRole("button", { name: "确认生成配置" }),
  ).toBeDisabled();
  await expect(page.locator(".submit-issues")).toContainText("声线");
  await page.getByLabel("选择生成的人物").selectOption("virtual");
  await expect(page.locator(".submit-issues")).toContainText("过期");
  await page.getByLabel("选择生成的人物").selectOption("founder");
  await page.getByLabel("使用范围", { exact: true }).selectOption("campaign");
  await expect(page.locator(".submit-issues")).toContainText("范围");
  await page.getByLabel("使用范围", { exact: true }).selectOption("social");
  await page.getByLabel("模型渠道", { exact: true }).selectOption("awaiting");
  await expect(page.locator(".submit-issues")).toContainText("尚未配置");
  await expect(page.locator(".estimate-value")).toContainText("待确认");
  await page.getByLabel("模型渠道", { exact: true }).selectOption("mock");
  await expect(
    page.getByRole("button", { name: "确认生成配置" }),
  ).toBeEnabled();
  await page.getByLabel("切换演示角色").selectOption("assetManager");
  await expect(
    page.getByRole("button", { name: "确认生成配置" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "人物资产", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "新建人物资产", exact: true }),
  ).toBeVisible();
  await page.getByLabel("切换演示角色").selectOption("creator");
  await expect(
    page.getByRole("button", { name: "新建人物资产", exact: true }),
  ).toHaveCount(0);
});

test("controlled mock failure, retry creates a separate record and keeps the failed record", async ({
  page,
}) => {
  await page.goto("/#generate");
  await page.getByLabel("失败", { exact: true }).check();
  await page.getByRole("button", { name: "确认生成配置" }).click();
  await page.getByRole("button", { name: "确认并提交" }).click();
  let detail = page.getByRole("dialog", {
    name: "秋季羊毛帽 · 30 秒短片",
    exact: true,
  });
  await detail.getByRole("button", { name: "立即推进模拟" }).click();
  await expect(detail.locator(".task-status-line")).toContainText("失败");
  await expect(detail).toContainText("模型渠道返回生成超时");
  const firstId = await page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("bytefolk-character-material-library-v1")!,
      ).tasks[0].id,
  );
  await detail.getByRole("button", { name: "调整并重新生成" }).click();
  await page.getByLabel("成功", { exact: true }).check();
  await page.getByRole("button", { name: "确认生成配置" }).click();
  await page.getByRole("button", { name: "确认并提交" }).click();
  detail = page.getByRole("dialog", {
    name: "秋季羊毛帽 · 30 秒短片",
    exact: true,
  });
  await detail.getByRole("button", { name: "立即推进模拟" }).click();
  await expect(detail.locator(".task-status-line")).toContainText("待审核");
  const persisted = await page.evaluate((id: string) => {
    const db = JSON.parse(
      localStorage.getItem("bytefolk-character-material-library-v1")!,
    );
    return {
      first: db.tasks.find((t: { id: string }) => t.id === id).status,
      latestId: db.tasks[0].id,
    };
  }, firstId);
  expect(persisted.first).toBe("failed");
  expect(persisted.latestId).not.toBe(firstId);
});

test("asset manager creates an asset, registers metadata, and cannot mark incomplete persona usable", async ({
  page,
}) => {
  await page.goto("/#characters");
  await page.getByLabel("切换演示角色").selectOption("assetManager");
  await page.getByRole("button", { name: "新建人物资产", exact: true }).click();
  let form = page.getByRole("dialog", { name: "新建人物资产", exact: true });
  await form.getByLabel("人物名称", { exact: true }).fill("演示人物");
  await form.getByLabel("负责人", { exact: true }).fill("示例管理员");
  await form.getByRole("button", { name: "保存人物档案" }).click();
  await page.locator(".character-card").filter({ hasText: "演示人物" }).click();
  const detail = page.getByRole("dialog", { name: "人物资产详情" });
  await detail.getByRole("button", { name: "素材 · 0" }).click();
  await detail.getByRole("button", { name: "登记素材", exact: true }).click();
  const asset = page.getByRole("dialog", { name: "登记素材元数据" });
  await asset.getByLabel("素材名称", { exact: true }).fill("正面形象照片");
  await asset.getByLabel("来源", { exact: true }).fill("Demo 示例来源");
  await asset.getByLabel("授权状态", { exact: true }).selectOption("valid");
  await asset.getByRole("button", { name: "保存素材元数据" }).click();
  await expect(detail).toContainText("正面形象照片");
  await detail.getByRole("button", { name: "编辑档案" }).click();
  form = page.getByRole("dialog", { name: "编辑人物档案" });
  await form.getByLabel("资产状态", { exact: true }).selectOption("available");
  await form.getByRole("button", { name: "保存人物档案" }).click();
  await expect(page.getByRole("status")).toContainText("缺少关键素材");
  await expect(form).toBeVisible();
  await form.getByLabel("资产状态", { exact: true }).selectOption("incomplete");
  await form
    .getByRole("checkbox", { name: "内容创作者", exact: true })
    .uncheck();
  await form.getByRole("button", { name: "保存人物档案" }).click();
  await detail.getByRole("button", { name: "版本记录" }).click();
  await expect(detail).toContainText("v1.0");
  await expect(detail).toContainText("v3.0");
  await detail.getByRole("button", { name: "关闭窗口" }).click();
  await page.getByLabel("切换演示角色").selectOption("creator");
  await expect(
    page.locator(".character-card").filter({ hasText: "演示人物" }),
  ).toHaveCount(0);
});

test("draft can be edited and persists through refresh; admin changes are audited", async ({
  page,
}) => {
  await page.goto("/#generate");
  await page.getByLabel("视频时长").fill("60");
  await page.getByRole("button", { name: "保存为草稿" }).click();
  await page.getByRole("button", { name: "生成任务", exact: true }).click();
  await page
    .getByRole("button", { name: "草稿", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "秋季羊毛帽 · 60 秒短片", exact: true })
    .click();
  await page.getByRole("button", { name: "编辑草稿" }).click();
  await expect(page.getByLabel("视频时长")).toHaveValue("60");
  await page.getByLabel("视频时长").fill("50");
  await page.getByRole("button", { name: "保存为草稿" }).click();
  await page.reload();
  const drafts = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("bytefolk-character-material-library-v1")!,
    ).tasks.filter((t: { status: string }) => t.status === "draft"),
  );
  expect(drafts).toHaveLength(1);
  expect(drafts[0].config.duration).toBe(50);
  await page.getByLabel("切换演示角色").selectOption("admin");
  await page.getByRole("button", { name: "管理设置", exact: true }).click();
  await page
    .locator(".provider-card")
    .filter({ hasText: "Persona Mock" })
    .getByRole("button", { name: "停用渠道" })
    .click();
  await page.getByRole("button", { name: "操作审计" }).click();
  await expect(page.locator(".audit-table")).toContainText("修改模型配置");
  await expect(page.locator(".audit-table")).toContainText(
    "enabled=true → enabled=false",
  );
});

test("desktop and mobile presentation has loaded images, no overflow or console exceptions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => document.querySelector(".character-card"));
  const image = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/images/portraits.png";
    await image.decode();
    return image.naturalWidth;
  });
  expect(image).toBeGreaterThan(1000);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    animations: "disabled",
    path: "docs/overview-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    animations: "disabled",
    path: "docs/overview-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "视频生成", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    animations: "disabled",
    path: "docs/generation-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("automatic mock generation resumes across refresh without manual advancement", async ({
  page,
}) => {
  await page.goto("/#generate");
  await page
    .getByLabel("内容用途", { exact: true })
    .selectOption("生活方式独白");
  await page.getByRole("button", { name: "确认生成配置" }).click();
  await page.getByRole("button", { name: "确认并提交" }).click();
  const submitted = await page.evaluate(() => {
    const db = JSON.parse(
      localStorage.getItem("bytefolk-character-material-library-v1")!,
    );
    return { id: db.tasks[0].id, startedAt: db.tasks[0].startedAt };
  });
  await page.reload();
  await page
    .getByRole("button", { name: "秋季羊毛帽 · 30 秒短片", exact: true })
    .click();
  const detail = page.getByRole("dialog", {
    name: "秋季羊毛帽 · 30 秒短片",
    exact: true,
  });
  await expect(detail.locator(".task-status-line")).toContainText("待审核", {
    timeout: 15000,
  });
  const persisted = await page.evaluate((id: string) => {
    const db = JSON.parse(
      localStorage.getItem("bytefolk-character-material-library-v1")!,
    );
    return {
      task: db.tasks.find((t: { id: string }) => t.id === id),
      result: db.results.find((r: { taskId: string }) => r.taskId === id),
    };
  }, submitted.id);
  expect(persisted.task.startedAt).toBe(submitted.startedAt);
  expect(persisted.result.genre).toBe("生活方式独白");
});

test("Xiaoyunque channel updates existing browser data and links official docs while staying unconnected", async ({
  page,
}) => {
  await page.goto("/#generate");
  await page.getByLabel("商品或内容主题").fill("保留的演示商品");
  await page.getByRole("button", { name: "保存为草稿" }).click();
  await page.evaluate(() => {
    const db = JSON.parse(
      localStorage.getItem("bytefolk-character-material-library-v1")!,
    );
    const provider = db.providers.find(
      (p: { id: string }) => p.id === "awaiting",
    );
    provider.name = "视频 API · 待接入";
    provider.description = "旧说明";
    provider.enabled = false;
    delete provider.websiteUrl;
    delete provider.documentationUrl;
    localStorage.setItem(
      "bytefolk-character-material-library-v1",
      JSON.stringify(db),
    );
  });
  await page.reload();
  await page.getByRole("button", { name: "管理设置", exact: true }).click();
  const channel = page
    .locator(".provider-card")
    .filter({ hasText: "小云雀 · 短剧/漫剧" });
  await expect(channel).toBeVisible();
  await expect(channel).toContainText("已停用");
  await expect(
    channel.getByRole("link", { name: "官方 API 文档" }),
  ).toHaveAttribute("href", /docs\.volcengine\.com\/docs\/JimengAI/);
  await expect(channel).toContainText("尚无可验证价格");
  await page.reload();
  const persisted = await page.evaluate(() => {
    const db = JSON.parse(
      localStorage.getItem("bytefolk-character-material-library-v1")!,
    );
    return {
      draft: db.tasks.find((t: { status: string }) => t.status === "draft"),
      updates: db.audit.filter(
        (a: { action: string }) => a.action === "补充客户生成平台",
      ).length,
    };
  });
  expect(persisted.draft.config.product).toBe("保留的演示商品");
  expect(persisted.updates).toBe(1);
});
