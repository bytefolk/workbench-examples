import { expect, test, type Page } from "@playwright/test";
import type {
  DatasetState,
  ImportPreview,
  LedgerPackage,
} from "../src/data/exchange-contracts";
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

const sourceState = (id = workspace.id): DatasetState => ({
  workspaceId: id,
  label: `当前台账 ${id}`,
  revision: "7",
  contentOrigin: "user-imported",
  storage: "shared",
  recognitionModes: [],
});
const snapshotFixture = (): LedgerPackage => ({
  schemaVersion: 1,
  packageKind: "snapshot",
  packageId: "00000000-0000-4000-8000-000000000071",
  datasetContract: { id: "factory-operations", version: 1 },
  dataRevision: "7",
  metadata: {
    label: "当前台账",
    contentOrigin: "user-imported",
    storage: "shared",
    exportedAt: "2026-10-15T08:00:00.000Z",
  },
  exportScope: {
    completeness: "full",
    tables: ["factory", "reports", "report-events", "visits"],
  },
  tables: {
    factory: [
      {
        id: workspace.id,
        data: { name: workspace.name },
        provenance: { contentOrigin: "user-imported" },
      },
    ],
    reports: [],
    "report-events": [],
    visits: [],
  },
  assets: [],
});
const previewFixture = (id = workspace.id): ImportPreview => ({
  planId: "preview-plan-7",
  expectedRevision: "7",
  sourceWorkspaceId: id,
  targetWorkspaceId: id,
  sourceLabel: "待导入合成台账",
  targetLabel: `当前台账 ${id}`,
  counts: [
    { table: "factory", before: 1, incoming: 1, after: 1, removed: 0 },
    { table: "reports", before: 1, incoming: 0, after: 0, removed: 1 },
    { table: "report-events", before: 2, incoming: 0, after: 0, removed: 2 },
    { table: "visits", before: 0, incoming: 0, after: 0, removed: 0 },
  ],
  issues: [],
  warnings: ["仅恢复当前工作区，资产正文保留在原平台。"],
  canCommit: true,
});
async function choosePackage(page: Page, text: string) {
  await page
    .getByLabel("选择 JSON 数据包")
    .evaluate((element: HTMLInputElement, content) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([content], "ledger.json", { type: "application/json" }),
      );
      element.files = transfer.files;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, text);
}
function exchangeAction(path: string) {
  // API route assertions belong to the adapter tests; here exercise the UI through its HTTP port.
  if (path.endsWith("/ledger/source")) return "state";
  if (/snapshot$|export$/.test(path)) return "export";
  if (/preview$|preview-import$/.test(path)) return "preview";
  if (/commit$|commit-import$/.test(path)) return "commit";
  return null;
}

test("整包导出与错误预览不写业务数据，确认失败保留来源且复用同一提交标识", async ({
  page,
}) => {
  await configure(page);
  const state = sourceState();
  let previewCalls = 0;
  const commits: { requestId: string }[] = [];
  const previewTexts: string[] = [];
  await page.route("**/test-api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/test-api",
      "",
    );
    const json = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path === "/session") return json(user);
    if (path === "/workspaces")
      return json([
        {
          ...workspace,
          name: state.revision === "8" ? "导入后的工厂" : workspace.name,
        },
      ]);
    if (path.endsWith("/reports"))
      return json([
        { ...makeReport(), provenance: { contentOrigin: "user-imported" } },
      ]);
    switch (exchangeAction(path)) {
      case "state":
        return json(state);
      case "export":
        return json(snapshotFixture());
      case "preview": {
        previewCalls++;
        previewTexts.push(route.request().postDataJSON().packageText);
        return json(
          previewCalls === 1
            ? {
                ...previewFixture(),
                canCommit: false,
                planId: null,
                issues: [
                  {
                    table: "reports",
                    row: 2,
                    field: "/quantity",
                    code: "INVALID_NUMBER",
                    message: "数量必须为正整数",
                  },
                ],
              }
            : previewFixture(),
        );
      }
      case "commit": {
        commits.push(route.request().postDataJSON());
        if (commits.length === 1)
          return json({ message: "合成网络响应失败" }, 503);
        Object.assign(state, {
          label: "发布后的合成台账",
          contentOrigin: "synthetic",
          revision: "8",
        });
        return json({
          revision: "8",
          contentOrigin: "synthetic",
          counts: previewFixture().counts,
        });
      }
      default:
        return json([]);
    }
  });
  await page.goto("/");
  const source = page.getByRole("region", { name: "当前数据来源" });
  await expect(source).toContainText("当前台账 workspace-a");
  await page.getByRole("button", { name: "数据接入", exact: true }).click();
  await page.evaluate(() => {
    const create = URL.createObjectURL;
    URL.createObjectURL = (object) => {
      if (object instanceof Blob)
        void object
          .text()
          .then((text) => sessionStorage.setItem("test-export", text));
      return create(object);
    };
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出完整快照" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("factory-workspace-a-7.json");
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem("test-export")))
    .not.toBeNull();
  const exported = JSON.parse(
    (await page.evaluate(() => sessionStorage.getItem("test-export")))!,
  );
  expect(exported.exportScope.completeness).toBe("full");
  expect(exported.tables.factory[0].id).toBe(workspace.id);
  expect(exported.metadata.contentOrigin).toBe("user-imported");
  const originalText =
    '{"schemaVersion":1,"schemaVersion":2,"invalid":"kept verbatim"}';
  await choosePackage(page, originalText);
  await page.getByRole("button", { name: "预览并校验", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("第 2 行 · /quantity");
  expect(previewTexts[0]).toBe(originalText);
  expect(commits).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "确认替换当前数据" }),
  ).toHaveCount(0);
  await choosePackage(page, JSON.stringify(snapshotFixture()));
  await page.getByRole("button", { name: "预览并校验", exact: true }).click();
  const preview = page.getByRole("region", { name: "导入预览" });
  await expect(
    preview.getByRole("row").filter({ hasText: "生产申领" }),
  ).toContainText("1");
  await expect(
    page.getByRole("button", { name: "确认替换当前数据" }),
  ).toBeDisabled();
  await page.getByLabel("确认整包替换").check();
  await page.getByRole("button", { name: "确认替换当前数据" }).click();
  await expect(page.getByRole("alert")).toContainText("合成网络响应失败");
  await expect(source).toContainText("当前台账 workspace-a");
  await expect(source).not.toContainText("发布后的合成台账");
  await page.getByRole("button", { name: "确认替换当前数据" }).click();
  await expect(page.getByText("整包替换已完成", { exact: true })).toBeVisible();
  await expect(source).toContainText("发布后的合成台账");
  await expect(page.getByLabel("切换工作区")).toContainText("导入后的工厂");
  expect(commits).toHaveLength(2);
  expect(commits[0].requestId).toBe(commits[1].requestId);
});

test("照片先上传资产再生成可编辑模拟草稿，人工核对经同一预检且保留mock来源", async ({
  page,
}) => {
  await configure(page);
  let uploads = 0;
  let photoPreviews = 0;
  let previewed: LedgerPackage | null = null;
  const calls: string[] = [];
  const asset: AssetRef = {
    id: "mock-photo-asset",
    workspaceId: workspace.id,
    name: "ledger.png",
    mediaType: "image/png",
    size: 68,
    sha256: "a".repeat(64),
    storagePath: "fixture/ledger.png",
    createdAt: "2026-10-15T08:00:00.000Z",
  };
  await page.route("**/test-api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/test-api",
      "",
    );
    const json = (value: unknown) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path === "/session") return json(user);
    if (path === "/workspaces") return json([workspace]);
    if (path.endsWith("/assets") && route.request().method() === "POST") {
      uploads++;
      calls.push("upload");
      return json(asset);
    }
    switch (exchangeAction(path)) {
      case "state":
        return json(sourceState());
      case "export":
        calls.push("snapshot");
        return json({
          ...snapshotFixture(),
          assets: [
            {
              id: asset.id,
              name: asset.name,
              mediaType: asset.mediaType,
              size: asset.size,
              sha256: asset.sha256,
              reference: { storeId: "http", objectId: asset.storagePath },
            },
          ],
        });
      case "preview":
        previewed = JSON.parse(route.request().postDataJSON().packageText);
        return json({
          ...previewFixture(),
          expectedRevision: ++photoPreviews === 1 ? "7" : "8",
        });
      case "commit":
        throw new Error("This draft test must not publish");
      default:
        return json([]);
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "数据接入", exact: true }).click();
  await page
    .getByRole("button", { name: "拍照台账 · 模拟", exact: true })
    .click();
  await expect(page.getByText(/当前使用固定规则生成合成草稿/)).toBeVisible();
  await page
    .getByLabel("选择台账照片")
    .evaluate((element: HTMLInputElement) => {
      const bytes = Uint8Array.from(
        atob(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNGsAAAAASUVORK5CYII=",
        ),
        (char) => char.charCodeAt(0),
      );
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([bytes], "ledger.png", { type: "image/png" }),
      );
      element.files = transfer.files;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await page.getByRole("button", { name: "上传并生成模拟草稿" }).click();
  await expect(
    page.getByText("模拟识别草稿 · 待人工核对", { exact: true }),
  ).toBeVisible();
  expect(uploads).toBe(1);
  expect(calls.slice(0, 2)).toEqual(["upload", "snapshot"]);
  await expect(
    page.getByRole("button", { name: "核对后预览整包" }),
  ).toBeDisabled();
  await page.getByLabel("草稿 1 物料编号", { exact: true }).fill("MOCK-EDITED");
  await page.getByLabel(/我已逐项核对并编辑这些草稿/).check();
  await page.getByRole("button", { name: "核对后预览整包" }).click();
  await expect(page.getByRole("region", { name: "导入预览" })).toBeVisible();
  expect(previewed).not.toBeNull();
  const row = (previewed as unknown as LedgerPackage).tables.reports!.find(
    (item) => item.data.materialNumber === "MOCK-EDITED",
  )!;
  expect(row.provenance.contentOrigin).toBe("synthetic");
  expect(row.provenance.recognition).toMatchObject({
    mode: "mock",
    reviewStatus: "reviewed",
    sourceAssetIds: [asset.id],
  });
  await expect(
    page.getByRole("region", { name: "当前数据来源" }),
  ).toContainText("当前台账 workspace-a");
  await expect(
    page.getByRole("img", { name: "待核对的台账原图" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重新预览", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "生成草稿后工作区已有新数据",
  );
  await expect(
    page.getByRole("button", { name: "确认替换当前数据" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("切换工作区丢弃旧导入预览，非所有者仅看到来源与只读权限说明", async ({
  page,
}) => {
  await configure(page);
  const other = {
    ...workspace,
    id: "workspace-b",
    name: "只读测试 B",
    role: "operator",
  };
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let previews = 0;
  await page.route("**/test-api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/test-api",
      "",
    );
    const json = (value: unknown) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path === "/session") return json(user);
    if (path === "/workspaces") return json([workspace, other]);
    if (exchangeAction(path) === "state")
      return json(
        sourceState(path.includes(other.id) ? other.id : workspace.id),
      );
    if (exchangeAction(path) === "preview") {
      previews++;
      await pending;
      return json(previewFixture());
    }
    if (path.endsWith("/reports"))
      return json([
        {
          ...makeReport(path.includes(other.id) ? other.id : workspace.id),
          provenance: {
            contentOrigin: "synthetic",
            recognition: {
              mode: "mock",
              reviewStatus: "reviewed",
              sourceAssetIds: ["photo"],
            },
          },
        },
      ]);
    return json([]);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "数据接入", exact: true }).click();
  await choosePackage(page, JSON.stringify(snapshotFixture()));
  await page.getByRole("button", { name: "预览并校验", exact: true }).click();
  await expect.poll(() => previews).toBe(1);
  await page.getByLabel("切换工作区").selectOption(other.id);
  await expect(
    page.getByText("数据替换由工作区所有者执行", { exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole("region", { name: "当前数据来源" }),
  ).toContainText("当前台账 workspace-b");
  await expect(page.getByRole("region", { name: "导入预览" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "导出完整快照" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: /^工厂申领/ }).click();
  await expect(page.locator(".report-table")).toContainText(
    /模拟识别\s*· 已人工核对/,
  );
  await expect(
    page.getByRole("region", { name: "当前数据来源" }),
  ).toContainText("当前台账 workspace-b");
});

test("同工作区读取跨版本时重读，连续冲突保留旧的一致来源与列表", async ({
  page,
}) => {
  await configure(page);
  let sourceReads = 0;
  let reportReads = 0;
  let continuousConflict = false;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/test-api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/test-api",
      "",
    );
    const json = (value: unknown) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path === "/session") return json(user);
    if (path === "/workspaces") return json([workspace]);
    if (path.endsWith("/ledger/source")) {
      sourceReads++;
      return json({
        ...sourceState(),
        label: sourceReads === 1 ? "导入前的台账" : "新发布的合成台账",
        revision: continuousConflict
          ? String(100 + sourceReads)
          : sourceReads === 1
            ? "7"
            : "8",
        contentOrigin: sourceReads === 1 ? "user-imported" : "synthetic",
      });
    }
    if (path.endsWith("/reports")) {
      reportReads++;
      if (reportReads === 2) await pending;
      return json([
        {
          ...makeReport(),
          materialNumber: continuousConflict
            ? "UNSTABLE-ROW"
            : reportReads === 1
              ? "OLD-USER-ROW"
              : "NEW-SYNTHETIC-ROW",
          provenance: {
            contentOrigin: reportReads === 1 ? "user-imported" : "synthetic",
          },
        },
      ]);
    }
    return json([]);
  });
  await page.goto("/");
  await expect.poll(() => reportReads).toBe(2);
  const source = page.getByRole("region", { name: "当前数据来源" });
  await expect(source).not.toContainText("新发布的合成台账");
  await expect(page.getByText("OLD-USER-ROW", { exact: false })).toHaveCount(0);
  release();
  await expect(
    page.getByRole("button", { name: /断针补领 NEW-SYNTHETIC-ROW/ }),
  ).toBeVisible();
  await expect(source).toContainText("新发布的合成台账");
  await expect(source).toContainText("数据版本 8");
  continuousConflict = true;
  await page.getByRole("button", { name: "刷新数据", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("暂时无法读取一致数据");
  expect(reportReads).toBe(5);
  await expect(source).toContainText("数据版本 8");
  await expect(
    page.getByRole("button", { name: /断针补领 NEW-SYNTHETIC-ROW/ }),
  ).toBeVisible();
  await expect(page.getByText("UNSTABLE-ROW", { exact: false })).toHaveCount(0);
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
    if (path.endsWith("/ledger/source"))
      return json({ message: "旧后端未提供来源端口" }, 404);
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
  await expect(
    page.getByRole("region", { name: "当前数据来源" }),
  ).toContainText("来源信息暂时无法读取");
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
