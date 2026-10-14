import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

// 仅针对专用测试账号运行。账号必须已确认邮箱；配置文件不得提交到仓库。
const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const configPath = process.env.FACTORY_SMOKE_CONFIG;
if (!configPath)
  throw new Error(
    "请设置 FACTORY_SMOKE_CONFIG，指向包含 url、key、owner、outsider 的本地 JSON。",
  );
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
await build({
  configFile: false,
  root,
  logLevel: "error",
  build: {
    ssr: "src/data/supabase.ts",
    outDir: ".local",
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: "cloud-provider.mjs" } },
  },
});
const { createSupabaseServices } = await import(
  pathToFileURL(path.join(root, ".local/cloud-provider.mjs")).href
);
const owner = createSupabaseServices(config.url, config.key);
const outsider = createSupabaseServices(config.url, config.key);
const passed = [];
const result = {
  passed,
  workspaceId: null,
  assetId: null,
  reportId: null,
  ownerId: null,
  outsiderId: null,
};
const record = (name) => {
  passed.push(name);
  console.log(`PASS ${name}`);
};
try {
  const first = await owner.identity.signIn(
    config.owner.email,
    config.owner.password,
  );
  const second = await outsider.identity.signIn(
    config.outsider.email,
    config.outsider.password,
  );
  result.ownerId = first.id;
  result.outsiderId = second.id;
  record("两个独立测试账号真实登录");
  const workspace = await owner.operations.createWorkspace(
    `验收测试 ${new Date().toISOString()}`,
  );
  result.workspaceId = workspace.id;
  assert.equal(workspace.role, "owner");
  assert(
    (await owner.operations.listWorkspaces()).some(
      (item) => item.id === workspace.id,
    ),
  );
  record("工作区创建与回读");
  assert(
    !(await outsider.operations.listWorkspaces()).some(
      (item) => item.id === workspace.id,
    ),
  );
  assert.equal((await outsider.operations.listReports(workspace.id)).length, 0);
  await assert.rejects(() =>
    outsider.operations.createReport(workspace.id, {
      kind: "consumable",
      contractNumber: "QA-OTHER",
      materialNumber: "QA",
      station: "QA",
      reason: "越权验证",
      quantity: 1,
      assetIds: [],
    }),
  );
  record("非成员不能读取或写入其他工作区");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jM1sAAAAASUVORK5CYII=",
    "base64",
  );
  const asset = await owner.assets.upload(
    workspace.id,
    new File([png], "验收测试照片.png", { type: "image/png" }),
  );
  result.assetId = asset.id;
  assert(
    (await owner.assets.list(workspace.id)).some(
      (item) => item.id === asset.id,
    ),
  );
  const download = await fetch(await owner.assets.signedUrl(asset));
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
  await assert.rejects(() => outsider.assets.signedUrl(asset));
  record("私有文件上传、字节回读与跨工作区访问拒绝");
  const input = {
    kind: "broken_needle",
    contractNumber: "QA-CONTRACT-001",
    materialNumber: "QA-NEEDLE",
    station: "测试工位",
    reason: "合成验收：断针申请替换",
    quantity: 1,
    assetIds: [asset.id],
  };
  await assert.rejects(() =>
    owner.operations.createReport(workspace.id, { ...input, assetIds: [] }),
  );
  let report = await owner.operations.createReport(workspace.id, input);
  result.reportId = report.id;
  assert.equal(report.assets[0].id, asset.id);
  record("断针照片必填与上报落库");
  const approval = {
    reportId: report.id,
    expectedVersion: report.version,
    status: "approved",
    note: "验收：同意更换",
    requestId: crypto.randomUUID(),
  };
  console.log("CHECK 审批写入");
  report = await owner.operations.transitionReport(approval);
  console.log("CHECK 相同请求重试");
  const repeated = await owner.operations.transitionReport(approval);
  assert.equal(repeated.version, report.version);
  console.log("CHECK 过期版本拒绝");
  await assert.rejects(() =>
    owner.operations.transitionReport({
      ...approval,
      requestId: crypto.randomUUID(),
      status: "rejected",
    }),
  );
  record("审批幂等及过期版本冲突");
  report = await owner.operations.transitionReport({
    reportId: report.id,
    expectedVersion: report.version,
    status: "delivering",
    note: "验收：配送新针",
    requestId: crypto.randomUUID(),
  });
  await assert.rejects(() =>
    owner.operations.transitionReport({
      reportId: report.id,
      expectedVersion: report.version,
      status: "completed",
      note: "不应成功：未回收",
      requestId: crypto.randomUUID(),
    }),
  );
  report = await owner.operations.confirmRecovery({
    reportId: report.id,
    expectedVersion: report.version,
    note: "验收：全部碎片已回收",
    requestId: crypto.randomUUID(),
  });
  report = await owner.operations.transitionReport({
    reportId: report.id,
    expectedVersion: report.version,
    status: "completed",
    note: "验收：完成配送并结单",
    requestId: crypto.randomUUID(),
  });
  assert.equal(report.status, "completed");
  assert.equal((await owner.operations.listTimeline(report.id)).length, 5);
  record("回收约束、完整状态流与审计记录");
  const visit = await owner.operations.createVisit(workspace.id, {
    customer: "合成验收客户",
    visitedAt: new Date().toISOString(),
    summary: "测试沟通纪要",
    issues: "待确认交期",
    nextStep: "确认报价与交期",
    followUpDate: "2026-10-20",
  });
  assert(
    (await owner.operations.listVisits(workspace.id)).some(
      (item) => item.id === visit.id,
    ),
  );
  record("销售拜访写入与回读");
  await owner.operations.addMember(
    workspace.id,
    config.outsider.email,
    "operator",
  );
  assert.equal(
    (await outsider.operations.listWorkspaces()).find(
      (item) => item.id === workspace.id,
    )?.role,
    "operator",
  );
  await assert.rejects(() =>
    outsider.operations.addMember(workspace.id, config.owner.email, "manager"),
  );
  await assert.rejects(() =>
    outsider.operations.transitionReport({
      reportId: report.id,
      expectedVersion: report.version,
      status: "approved",
      note: "越权审批",
      requestId: crypto.randomUUID(),
    }),
  );
  assert.equal((await outsider.operations.listVisits(workspace.id)).length, 0);
  record("成员加入与员工权限边界");
  await owner.identity.signOut();
  await owner.identity.signIn(config.owner.email, config.owner.password);
  assert.equal(
    (await owner.operations.listReports(workspace.id)).find(
      (item) => item.id === report.id,
    )?.status,
    "completed",
  );
  record("退出重登后数据持久化");
} finally {
  await fs.mkdir(path.join(root, ".local"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".local/cloud-smoke-result.json"),
    JSON.stringify(result, null, 2),
  );
  await Promise.allSettled([
    owner.identity.signOut(),
    outsider.identity.signOut(),
  ]);
}
