import { expect, test, type Page } from "@playwright/test";
import type {
  AssetRef,
  OperationReport,
  Workspace,
} from "../src/data/contracts";

test.beforeEach(({ page }) => {
  page.on("pageerror", (error) => {
    console.error(error.message);
  });
});

// Synthetic HTTP responses exercise the public adapter contract. They are test-only;
// the application never imports these fixtures or starts in a simulated data mode.
const user = { id: "test-user", email: "fixture@example.test" };
const workspace: Workspace = {
  id: "workspace-a",
  name: "测试生产工作区",
  role: "owner",
  createdAt: "2026-10-14T01:00:00Z",
};
const makeReport = (workspaceId = workspace.id): OperationReport => ({
  id: `report-${workspaceId}`,
  workspaceId,
  kind: "broken_needle",
  contractNumber: `CONTRACT-${workspaceId}`,
  materialNumber: "NEEDLE-TEST",
  station: "测试 A 线",
  reason: "合成测试断针记录",
  quantity: 1,
  assetIds: ["test-asset"],
  createdBy: user.id,
  createdAt: "2026-10-14T01:00:00Z",
  updatedAt: "2026-10-14T01:00:00Z",
  status: "delivering",
  version: 1,
  fragmentsRecovered: false,
  assets: [],
});

async function configure(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "factory-operations-provider-config",
      JSON.stringify({ provider: "http", apiBaseUrl: "/test-api" }),
    );
  });
}

test("未配置时显示连接说明，手机不产生横向滚动", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "factory-operations-provider-config",
      JSON.stringify({
        provider: "supabase",
        supabaseUrl: "",
        supabasePublishableKey: "",
      }),
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "连接你的数据平台" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /自有数据平台/ }),
  ).toBeVisible();
  await expect(page.getByText("待处理申领", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("断针回收是闭环前置条件，网络重试保留同一操作ID", async ({ page }) => {
  await configure(page);
  let report = makeReport();
  const requestIds: string[] = [];
  let recoveryAttempts = 0;
  await page.route("**/test-api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/test-api",
      "",
    );
    const json = async (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path === "/session") return json(user);
    if (path === "/workspaces") return json([workspace]);
    if (path.endsWith("/recovery")) {
      requestIds.push(route.request().postDataJSON().requestId);
      recoveryAttempts += 1;
      if (recoveryAttempts === 1)
        return json({ message: "测试网络失败，请重试" }, 503);
      report = { ...report, fragmentsRecovered: true, version: 2 };
      return json(report);
    }
    if (path.endsWith("/transitions")) {
      report = { ...report, status: "completed", version: 3 };
      return json(report);
    }
    if (path.endsWith("/reports")) return json([report]);
    return json([]);
  });
  await page.goto("/");
  await page.getByRole("button", { name: /断针补领 NEEDLE-TEST/ }).click();
  await expect(
    page.getByRole("button", { name: "完成闭环", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "确认回收", exact: true }).click();
  await page
    .getByLabel("确认断针回收 · 处理说明")
    .fill("合成测试：检查碎片已全部回收");
  await page.getByRole("button", { name: "确认断针回收", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("测试网络失败");
  await page.getByRole("button", { name: "确认断针回收", exact: true }).click();
  await expect(
    page.getByText("已确认断针碎片回收", { exact: true }),
  ).toBeVisible();
  expect(requestIds).toHaveLength(2);
  expect(requestIds[0]).toBe(requestIds[1]);
  await expect(
    page.getByRole("button", { name: "完成闭环", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "完成闭环", exact: true }).click();
  await page.getByLabel("完成闭环 · 处理说明").fill("测试：发放和回收均已确认");
  await page.getByRole("button", { name: "完成闭环", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("已完成", { exact: true }),
  ).toBeVisible();
});

test("切换工作区后忽略旧工作区迟到响应，主管不能新增成员", async ({ page }) => {
  await configure(page);
  let releaseA!: () => void;
  const pendingA = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  const other: Workspace = {
    ...workspace,
    id: "workspace-b",
    name: "测试 B 工作区",
    role: "manager",
  };
  await page.route("**/test-api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/test-api",
      "",
    );
    const json = async (value: unknown) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path === "/session") return json(user);
    if (path === "/workspaces") return json([workspace, other]);
    if (path === `/workspaces/${workspace.id}/reports`) {
      await pendingA;
      return json([makeReport(workspace.id)]);
    }
    if (path === `/workspaces/${other.id}/reports`)
      return json([
        { ...makeReport(other.id), materialNumber: "ONLY-B-MATERIAL" },
      ]);
    return json([]);
  });
  await page.goto("/");
  await page.getByLabel("切换工作区").selectOption(other.id);
  await expect(
    page.getByRole("button", { name: /断针补领 ONLY-B-MATERIAL/ }),
  ).toBeVisible();
  releaseA();
  await page.getByRole("button", { name: "刷新数据" }).click();
  await expect(
    page.getByRole("button", { name: /断针补领 ONLY-B-MATERIAL/ }),
  ).toBeVisible();
  await expect(
    page.getByText(`CONTRACT-${workspace.id}`, { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "工作区设置", exact: true }).click();
  await expect(page.getByRole("heading", { name: "工作区成员" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "添加成员", exact: true }),
  ).toHaveCount(0);
});

test("生产人员不请求销售拜访，403销售接口不影响申领和资产加载", async ({
  page,
}) => {
  await configure(page);
  let visitRequests = 0;
  const operatorWorkspace: Workspace = { ...workspace, role: "operator" };
  const asset: AssetRef = {
    id: "operator-readable-asset",
    workspaceId: workspace.id,
    name: "合成工位说明.pdf",
    mediaType: "application/pdf",
    size: 128,
    storagePath: "test/operator-guide.pdf",
    createdAt: "2026-10-14T01:00:00Z",
  };
  await page.route("**/test-api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/test-api",
      "",
    );
    const json = async (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path === "/session") return json(user);
    if (path === "/workspaces") return json([operatorWorkspace]);
    if (path.endsWith("/visits")) {
      visitRequests += 1;
      return json({ message: "生产人员无权访问销售拜访" }, 403);
    }
    if (path.endsWith("/reports")) return json([makeReport()]);
    if (path.endsWith("/assets")) return json([asset]);
    return json([]);
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /断针补领 NEEDLE-TEST/ }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "刷新数据" }).click();
  await page.getByRole("button", { name: "资产资料", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /合成工位说明.pdf/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "销售拜访", exact: true }).click();
  await expect(
    page.getByText("当前角色没有销售拜访权限，联系工作区管理人员调整。"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "记录拜访", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(visitRequests).toBe(0);
});

test("提交前验证现场照片；创建失败后重试复用已上传资产", async ({ page }) => {
  await configure(page);
  const assets: AssetRef[] = [];
  const reports: OperationReport[] = [];
  let uploads = 0;
  let creates = 0;
  await page.route("**/test-api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/test-api",
      "",
    );
    const json = async (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path === "/session") return json(user);
    if (path === "/workspaces") return json([workspace]);
    if (path.endsWith("/assets")) {
      if (route.request().method() === "POST") {
        uploads += 1;
        const asset: AssetRef = {
          id: `asset-${uploads}`,
          workspaceId: workspace.id,
          name: "test.png",
          mediaType: "image/png",
          size: 100,
          storagePath: "test/test.png",
          createdAt: new Date().toISOString(),
        };
        assets.push(asset);
        return json(asset);
      }
      return json(assets);
    }
    if (path.endsWith("/reports")) {
      if (route.request().method() === "POST") {
        creates += 1;
        if (creates === 1) return json({ message: "测试保存失败" }, 503);
        const report = {
          ...makeReport(),
          ...route.request().postDataJSON(),
          status: "submitted",
          assets,
        };
        reports.push(report);
        return json(report);
      }
      return json(reports);
    }
    return json([]);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "发起现场申领" }).click();
  await page.getByLabel("合同号", { exact: true }).fill("TEST-CONTRACT");
  await page.getByLabel("物料编号", { exact: true }).fill("NEEDLE-RETRY");
  await page.getByLabel("工位", { exact: true }).fill("测试 A 线");
  await page.getByLabel("断针情况 / 申领原因").fill("合成测试上报原因");
  await page.getByRole("button", { name: "提交申领", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("至少需要一张现场照片");
  expect(uploads).toBe(0);
  expect(creates).toBe(0);
  await page
    .locator('input[type="file"]')
    .evaluate((input: HTMLInputElement) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File(["synthetic image bytes for HTTP contract test"], "test.png", {
          type: "image/png",
        }),
      );
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await page.getByRole("button", { name: "提交申领", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("测试保存失败");
  await page.getByRole("button", { name: "提交申领", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(uploads).toBe(1);
  expect(creates).toBe(2);
  await expect(
    page.getByRole("button", { name: /断针补领 NEEDLE-RETRY/ }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "打开导航" })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("button", { name: /^工厂申领/ }).click();
  await expect(page.getByRole("heading", { name: "工厂申领" })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
