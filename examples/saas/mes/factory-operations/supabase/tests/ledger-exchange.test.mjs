import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// 执行所有真实迁移；auth/storage 仅是本地平台边界夹具，不模拟业务 SQL。
const db = new PGlite();
const owner = "10000000-0000-4000-8000-000000000001";
const member = "10000000-0000-4000-8000-000000000002";
const outsider = "10000000-0000-4000-8000-000000000003";
let workspace, otherWorkspace, asset, report, baseline;
const scope = ["factory", "reports", "report-events", "visits"];
const clone = (value) => structuredClone(value);
const rpc = async (name, ...values) =>
  (
    await db.query(
      `select to_jsonb(public.${name}(${values.map((_, i) => `$${i + 1}`).join(",")})) as value`,
      values,
    )
  ).rows[0].value;
async function asUser(id) {
  await db.exec("reset role; set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
const snapshot = () => rpc("fo_export_snapshot", workspace.id);
const preview = (pack, tables = scope) =>
  rpc(
    "fo_preview_import",
    workspace.id,
    typeof pack === "string" ? pack : JSON.stringify(pack),
    tables,
  );
const commit = (plan, request = randomUUID()) =>
  rpc(
    "fo_commit_import",
    workspace.id,
    plan.planId,
    plan.expectedRevision,
    request,
  );
const business = (pack) => ({ tables: pack.tables, assets: pack.assets });
const newVisit = () =>
  rpc("fo_create_visit", workspace.id, {
    customer: "SQL 合成客户",
    visitedAt: "2026-10-15T08:00:00Z",
    summary: "本地回归",
    issues: "",
    nextStep: "核对",
    followUpDate: "2026-10-16",
  });
async function rejectsPreview(change, matcher) {
  const before = await snapshot(),
    pack = clone(before);
  change(pack);
  const result = await preview(pack);
  assert.equal(result.canCommit, false, JSON.stringify(result));
  assert.equal(result.planId, null);
  assert.ok(result.issues.length > 0);
  if (matcher)
    assert.ok(result.issues.some(matcher), JSON.stringify(result.issues));
  const after = await snapshot();
  assert.equal(after.dataRevision, before.dataRevision);
  assert.deepEqual(business(after), business(before));
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
  `);
  const migrations = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(migrations))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  for (const [id, email] of [
    [owner, "owner@example.test"],
    [member, "member@example.test"],
    [outsider, "outsider@example.test"],
  ])
    await db.query("insert into auth.users values($1,$2,now())", [id, email]);
  await asUser(owner);
  workspace = await rpc("fo_create_workspace", "SQL 合成工厂");
  otherWorkspace = await rpc("fo_create_workspace", "另一合成工厂");
  await db.query("select public.fo_add_member($1,$2,$3)", [
    workspace.id,
    "member@example.test",
    "operator",
  ]);
  const id = randomUUID(),
    path = `${workspace.id}/${owner}/${id}.png`;
  await db.exec("reset role");
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values('factory-operations-assets',$1,$2)",
    [path, { mimetype: "image/png", size: 4 }],
  );
  await asUser(owner);
  asset = await rpc(
    "fo_register_asset_with_hash",
    id,
    workspace.id,
    "SQL 照片.png",
    "image/png",
    4,
    path,
    "a".repeat(64),
  );
  report = await rpc("fo_create_report", workspace.id, {
    kind: "broken_needle",
    contractNumber: "SQL-001",
    materialNumber: "NEEDLE-01",
    station: "A1",
    reason: "合成断针",
    quantity: 1,
    assetIds: [id],
  });
  for (const action of ["approved", "recovery", "delivering", "completed"])
    report = await rpc(
      "fo_change_report",
      report.id,
      report.version,
      action,
      `  ${action} 合成说明  `,
      randomUUID(),
    );
  await newVisit();
  baseline = await snapshot();
});
after(async () => db.close());

test("资产登记同 ID 同内容幂等，不同内容拒绝且不改摘要", async () => {
  const before = await snapshot();
  const replay = await rpc(
    "fo_register_asset_with_hash",
    asset.id,
    workspace.id,
    asset.name,
    asset.media_type,
    asset.size,
    asset.storage_path,
    asset.sha256,
  );
  assert.equal(replay.id, asset.id);
  assert.equal((await snapshot()).dataRevision, before.dataRevision);
  await assert.rejects(
    rpc(
      "fo_register_asset_with_hash",
      asset.id,
      workspace.id,
      "其他文件.png",
      asset.media_type,
      asset.size,
      asset.storage_path,
      asset.sha256,
    ),
    { code: "PT409" },
  );
});

test("全部迁移可执行，导出覆盖业务、历史幂等信息、资产和来源", () => {
  assert.equal(baseline.tables.reports[0].data.status, "completed");
  assert.equal(baseline.tables.reports[0].data.fragmentsRecovered, true);
  assert.equal(baseline.tables["report-events"].length, 5);
  assert.equal(baseline.assets[0].sha256, "a".repeat(64));
  assert.equal(baseline.assets[0].reference.objectId, asset.storage_path);
  assert.equal(baseline.metadata.contentOrigin, "user-imported");
});
test("完整预览、原子恢复、持久化回读和同请求幂等", async () => {
  const before = await snapshot(),
    plan = await preview(before);
  assert.equal(plan.canCommit, true, JSON.stringify(plan.issues));
  const request = randomUUID(),
    result = await commit(plan, request);
  assert.deepEqual(await commit(plan, request), result);
  const after = await snapshot();
  assert.deepEqual(business(after), business(before));
  assert.ok(BigInt(after.dataRevision) > BigInt(before.dataRevision));
  assert.equal(result.revision, after.dataRevision);
  const another = await preview(after);
  await assert.rejects(commit(another, request), { code: "PT409" });
});
test("预览后普通业务写入使旧计划失效", async () => {
  const plan = await preview(await snapshot());
  await newVisit();
  const before = await snapshot();
  await assert.rejects(commit(plan), { code: "PT409" });
  assert.deepEqual(business(await snapshot()), business(before));
});
test("成员仅可读取来源，外部用户无来源访问且不能导出预览提交", async () => {
  const pack = await snapshot(),
    plan = await preview(pack);
  for (const id of [member, outsider]) {
    await asUser(id);
    if (id === member) {
      const state = await rpc("fo_dataset_state", workspace.id);
      assert.deepEqual(
        Object.keys(state).sort(),
        [
          "workspaceId",
          "label",
          "revision",
          "contentOrigin",
          "storage",
          "recognitionModes",
        ].sort(),
      );
    } else
      await assert.rejects(rpc("fo_dataset_state", workspace.id), {
        code: "42501",
      });
    await assert.rejects(snapshot(), { code: "42501" });
    await assert.rejects(preview(pack), { code: "42501" });
    await assert.rejects(commit(plan), { code: "42501" });
  }
  await asUser(owner);
});
test("私有计划和候选帮助函数不能绕过 RPC 授权", async () => {
  await assert.rejects(db.query("select * from fo_private.import_plans"), {
    code: "42501",
  });
  await assert.rejects(
    db.query("select fo_private.dataset_snapshot($1)", [otherWorkspace.id]),
    { code: "42501" },
  );
  await assert.rejects(
    db.query("update public.fo_workspaces set name='绕过' where id=$1", [
      workspace.id,
    ]),
    { code: "42501" },
  );
  await db.exec("reset role; set role anon");
  await assert.rejects(snapshot(), { code: "42501" });
  await asUser(owner);
});
test("重复 JSON 键、无效 JSON、深度和五 MiB 上限在转 jsonb 前拒绝", async () => {
  const pack = JSON.stringify(await snapshot()),
    revision = (await snapshot()).dataRevision;
  for (const raw of [
    pack.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
    "{",
    "[".repeat(42) + "0" + "]".repeat(42),
    " ".repeat(5242881),
  ]) {
    const result = await preview(raw);
    assert.equal(result.canCommit, false);
    assert.ok(result.issues.length);
  }
  assert.equal((await snapshot()).dataRevision, revision);
});
for (const [name, change] of [
  ["负数量", (p) => (p.tables.reports[0].data.quantity = -1)],
  [
    "纳秒时间拒绝避免舍入",
    (p) =>
      (p.tables.reports[0].data.createdAt = "2026-10-15T08:00:00.1234567Z"),
  ],
  [
    "超过14小时偏移拒绝",
    (p) => (p.tables.reports[0].data.createdAt = "2026-10-15T08:00:00+15:00"),
  ],
  ["文本数字不隐式转换", (p) => (p.tables.reports[0].data.quantity = "1")],
  ["分数数量", (p) => (p.tables.reports[0].data.quantity = 1.2)],
  ["不真实日期", (p) => (p.tables.visits[0].data.followUpDate = "2026-02-30")],
  [
    "无时区时间",
    (p) => (p.tables.reports[0].data.createdAt = "2026-10-15T08:00:00"),
  ],
  ["未知根字段", (p) => (p.extra = true)],
  ["未知行字段", (p) => (p.tables.visits[0].extra = true)],
  ["未知业务字段", (p) => (p.tables.reports[0].data.extra = true)],
  ["缺失表不视为空表", (p) => delete p.tables.visits],
  ["部分导出不能替换", (p) => (p.exportScope.completeness = "partial")],
  ["未知身份映射", (p) => (p.tables.visits[0].data.createdBy = randomUUID())],
  ["跨工作区恢复", (p) => (p.tables.factory[0].id = otherWorkspace.id)],
  ["资产清单缺失", (p) => (p.assets = [])],
  ["资产摘要不符", (p) => (p.assets[0].sha256 = "b".repeat(64))],
  ["资产稳定引用不符", (p) => (p.assets[0].reference.objectId = "other")],
  ["断针无照片", (p) => (p.tables.reports[0].data.assetIds = [])],
  [
    "重复行 UUID 大小写",
    (p) =>
      p.tables.reports.push({
        ...clone(p.tables.reports[0]),
        id: p.tables.reports[0].id.toUpperCase(),
      }),
  ],
  [
    "坏来源类型返回 issues",
    (p) =>
      (p.tables.reports[0].provenance.recognition = {
        mode: "mock",
        reviewStatus: "reviewed",
        sourceAssetIds: {},
      }),
  ],
  [
    "现有来源不能洗白",
    (p) => (p.tables.reports[0].provenance.contentOrigin = "synthetic"),
  ],
  ["来源元信息不符", (p) => (p.metadata.contentOrigin = "synthetic")],
  [
    "缺提交起点",
    (p) =>
      (p.tables["report-events"] = p.tables["report-events"].filter(
        (e) => e.data.action !== "submitted",
      )),
  ],
  [
    "事件引用孤儿",
    (p) => (p.tables["report-events"][0].data.reportId = randomUUID()),
  ],
  [
    "事件版本断层",
    (p) =>
      (p.tables["report-events"].find(
        (e) => e.data.payload,
      ).data.payload.version = 19),
  ],
  [
    "事件动作不符",
    (p) =>
      (p.tables["report-events"].find(
        (e) => e.data.payload,
      ).data.payload.action = "rejected"),
  ],
  [
    "回收事实与时间线不符",
    (p) => (p.tables.reports[0].data.fragmentsRecovered = false),
  ],
  [
    "一万行上限",
    (p) =>
      (p.tables.visits = Array.from(
        { length: 10001 },
        () => p.tables.visits[0],
      )),
  ],
])
  test(`逐行验证拒绝且无业务写入：${name}`, () => rejectsPreview(change));

test("局部替换仍检查最终库，删除上报不能留下旧事件", async () => {
  const pack = await snapshot();
  pack.tables = { factory: pack.tables.factory, reports: [] };
  pack.exportScope.tables = ["factory", "reports"];
  const plan = await preview(pack, ["factory", "reports"]);
  assert.equal(plan.canCommit, false);
  assert.ok(plan.issues.some((i) => i.code === "reference"));
});
test("空数组显式清除选定拜访表，保留未选表和资产正文", async () => {
  const before = await snapshot(),
    pack = clone(before);
  pack.tables = { factory: pack.tables.factory, visits: [] };
  pack.exportScope.tables = ["factory", "visits"];
  const plan = await preview(pack, ["factory", "visits"]);
  assert.equal(plan.canCommit, true, JSON.stringify(plan.issues));
  assert.ok(plan.counts.find((c) => c.table === "visits").removed > 0);
  await commit(plan);
  const after = await snapshot();
  assert.deepEqual(after.tables.reports, before.tables.reports);
  assert.deepEqual(
    after.tables["report-events"],
    before.tables["report-events"],
  );
  assert.deepEqual(after.tables.visits, []);
  assert.deepEqual(after.assets, before.assets);
});
test("1.0 JSON 语义整数可预览及提交，不能延迟到写入时报错", async () => {
  const pack = JSON.stringify(await snapshot()).replace(
    '"quantity":1',
    '"quantity":1.0',
  );
  const plan = await preview(pack);
  assert.equal(plan.canCommit, true, JSON.stringify(plan.issues));
  await commit(plan);
});
test("mock 核对后导入保持来源，后续日常事件继承来源，不能洗白", async () => {
  const pack = await snapshot(),
    rid = randomUUID(),
    eid = randomUUID(),
    now = "2026-10-15T00:00:00Z";
  const provenance = {
    contentOrigin: "synthetic",
    recognition: {
      mode: "mock",
      reviewStatus: "reviewed",
      sourceAssetIds: [asset.id],
    },
  };
  pack.tables.reports.push({
    id: rid,
    data: {
      ...pack.tables.reports[0].data,
      status: "submitted",
      version: 1,
      fragmentsRecovered: false,
      createdAt: now,
      updatedAt: now,
    },
    provenance,
  });
  pack.tables["report-events"].push({
    id: eid,
    data: {
      reportId: rid,
      actorId: owner,
      action: "submitted",
      note: "人工核对模拟草稿",
      createdAt: now,
      requestId: null,
      payload: null,
    },
    provenance,
  });
  pack.metadata.contentOrigin = "mixed";
  const draft = clone(pack);
  draft.tables.reports.at(-1).provenance.recognition.reviewStatus =
    "unreviewed";
  assert.equal((await preview(draft)).canCommit, false);
  const plan = await preview(pack);
  assert.equal(plan.canCommit, true, JSON.stringify(plan.issues));
  await commit(plan);
  await rpc("fo_change_report", rid, 1, "approved", "核对后批准", randomUUID());
  const after = await snapshot();
  assert.equal(after.metadata.contentOrigin, "mixed");
  const events = after.tables["report-events"].filter(
    (e) => e.data.reportId === rid,
  );
  assert.equal(events.length, 2);
  for (const event of events) assert.deepEqual(event.provenance, provenance);
  const washed = clone(after);
  washed.tables.reports.find((r) => r.id === rid).provenance = {
    contentOrigin: "user-imported",
  };
  assert.equal((await preview(washed)).canCommit, false);
});
test("登记资产摘要不可覆盖且必须存在 storage 对象，旧摘要缺失阻止 SQL 导出", async () => {
  await assert.rejects(rpc("fo_set_asset_hash", asset.id, "b".repeat(64)), {
    code: "PT409",
  });
  await db.exec("reset role");
  await db.query("update public.fo_assets set sha256=null where id=$1", [
    asset.id,
  ]);
  await asUser(owner);
  await assert.rejects(snapshot(), /资产缺少摘要/);
  await rpc("fo_set_asset_hash", asset.id, "a".repeat(64));
  await db.exec("reset role");
  await db.query(
    "update storage.objects set metadata=metadata||'{\"size\":5}'::jsonb where name=$1",
    [asset.storage_path],
  );
  await asUser(owner);
  await assert.rejects(snapshot(), /元信息不完整/);
  await db.exec("reset role");
  await db.query(
    "update storage.objects set metadata=metadata||'{\"size\":4}'::jsonb where name=$1",
    [asset.storage_path],
  );
  await asUser(owner);
});
test("提交阶段最后一表失败时前面的删除和插入全部回滚", async () => {
  const before = await snapshot(),
    plan = await preview(before);
  assert.equal(plan.canCommit, true, JSON.stringify(plan.issues));
  await db.exec("reset role");
  // 管理员注入末尾故障，模拟非客户端验证可发现的数据库约束/触发器故障。
  await db.exec(
    `create function fo_private.test_fail_event() returns trigger language plpgsql as $$begin raise exception 'SQL 回滚探针';end$$;create trigger test_fail_event before insert on public.fo_report_events for each row execute function fo_private.test_fail_event();`,
  );
  await asUser(owner);
  await assert.rejects(commit(plan), /SQL 回滚探针/);
  assert.equal((await snapshot()).dataRevision, before.dataRevision);
  assert.deepEqual(business(await snapshot()), business(before));
  await db.exec(
    "reset role;drop trigger test_fail_event on public.fo_report_events;drop function fo_private.test_fail_event()",
  );
  await asUser(owner);
});
test("备份后新增无关资产仍可恢复旧快照，新增资产与正文保留", async () => {
  const backup = await snapshot(),
    id = randomUUID(),
    path = `${workspace.id}/${owner}/${id}.png`;
  await db.exec("reset role");
  await db.query(
    "insert into storage.objects(bucket_id,name,metadata) values('factory-operations-assets',$1,$2)",
    [path, { mimetype: "image/png", size: 8 }],
  );
  await asUser(owner);
  await rpc(
    "fo_register_asset_with_hash",
    id,
    workspace.id,
    "新增无关照片.png",
    "image/png",
    8,
    path,
    "c".repeat(64),
  );
  const plan = await preview(backup);
  assert.equal(plan.canCommit, true, JSON.stringify(plan.issues));
  await commit(plan);
  const after = await snapshot();
  assert.deepEqual(after.tables, backup.tables);
  assert.equal(after.assets.length, backup.assets.length + 1);
  assert.ok(after.assets.some((a) => a.id === id));
  const undeclared = clone(backup);
  undeclared.tables.reports[0].data.assetIds = [id];
  const rejected = await preview(undeclared);
  assert.equal(rejected.canCommit, false);
  assert.ok(rejected.issues.some((i) => i.code === "reference"));
});
test("恶意字段类型全返回结构化 issues，不冒泡转换错误", async () => {
  const pack = await snapshot();
  for (const mutate of [
    (p) => (p.tables = null),
    (p) => (p.metadata = null),
    (p) => (p.exportScope = null),
    (p) => (p.assets = null),
    (p) => (p.tables.reports = null),
    (p) => (p.tables.reports[0].data = null),
    (p) => (p.tables.reports[0].provenance = null),
    (p) => (p.tables.reports[0].data.assetIds = [{}]),
    (p) => (p.tables.reports[0].provenance.recognition = null),
  ]) {
    const changed = clone(pack);
    mutate(changed);
    const result = await preview(changed);
    assert.equal(result.canCommit, false);
    assert.ok(result.issues.length > 0);
  }
});
