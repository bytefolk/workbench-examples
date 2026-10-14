import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  prepareMockJob,
  completeMockJob,
  findAssets,
  emotionCoverage,
} from "../examples/saas/dam/character-material-library/demo/model.mjs";

const fixture = JSON.parse(
  await fs.readFile(
    new URL(
      "../examples/saas/dam/character-material-library/data/fixtures.json",
      import.meta.url,
    ),
  ),
);
const input = {
  kind: "video",
  characterId: "char-linxia",
  materialId: "asset-neutral",
  productId: "asset-product-glasses",
  usage: "marketing",
  prompt: "为新品准备讲解视频",
};
const context = { id: "test-job", createdAt: "2026-10-13T00:00:00.000Z" };

test("approved inputs produce an immutable version handoff, never a video", () => {
  const data = structuredClone(fixture);
  const job = prepareMockJob(data, input, context);
  data.assets[0].version = 9;
  data.assets[0].status = "archived";
  assert.equal(job.inputs[0].version, 1);
  assert.equal(job.status, "mock-queued");
  assert.equal(job.output, null);
  assert.equal(completeMockJob(job).status, "mock-complete");
  assert.equal(completeMockJob(job).output, null);
  assert.throws(() => completeMockJob(completeMockJob(job)), /排队/);
});

test("pending characters and pending or restricted inputs block tasks", () => {
  assert.throws(
    () =>
      prepareMockJob(
        fixture,
        {
          ...input,
          characterId: "char-zhouning",
          materialId: "asset-portrait",
        },
        context,
      ),
    /待确认/,
  );
  for (const status of ["pending", "restricted"]) {
    const data = structuredClone(fixture);
    data.assets[0].rights.status = status;
    assert.throws(() => prepareMockJob(data, input, context), /待确认或受限/);
  }
});

test("character and both materials must permit the requested usage", () => {
  assert.throws(
    () =>
      prepareMockJob(fixture, { ...input, materialId: "asset-angry" }, context),
    /不允许/,
  );
  const data = structuredClone(fixture);
  data.assets.find(
    (asset) => asset.id === input.productId,
  ).rights.allowedUsages = ["internal-demo"];
  assert.throws(() => prepareMockJob(data, input, context), /不允许/);
  const characterData = structuredClone(fixture);
  characterData.characters[0].rights.allowedUsages = ["internal-demo"];
  assert.throws(() => prepareMockJob(characterData, input, context), /不允许/);
  assert.equal(
    prepareMockJob(
      fixture,
      { ...input, materialId: "asset-angry", usage: "internal-demo" },
      context,
    ).usage,
    "internal-demo",
  );
});

test("archived or mismatched materials cannot enter new tasks", () => {
  const data = structuredClone(fixture);
  data.assets[0].status = "archived";
  assert.throws(() => prepareMockJob(data, input, context), /归档/);
  assert(
    !findAssets(data.assets).some((asset) => asset.id === "asset-neutral"),
  );
  assert.throws(
    () =>
      prepareMockJob(
        fixture,
        { ...input, materialId: "asset-portrait" },
        context,
      ),
    /关联/,
  );
  assert.throws(
    () =>
      prepareMockJob(
        fixture,
        { ...input, productId: "asset-neutral" },
        context,
      ),
    /关联/,
  );
});

test("unavailable generation types never produce a mock success", () => {
  for (const kind of ["digital-human", "virtual-try-on"]) {
    assert.throws(
      () => prepareMockJob(fixture, { ...input, kind }, context),
      /尚未接入/,
    );
  }
});

test("missing inputs and blank prompts cannot create a task", () => {
  assert.throws(
    () => prepareMockJob(fixture, { ...input, materialId: "" }, context),
    /请选择/,
  );
  assert.throws(
    () => prepareMockJob(fixture, { ...input, prompt: " " }, context),
    /说明/,
  );
  assert.throws(
    () => prepareMockJob(fixture, { ...input, usage: "unknown" }, context),
    /用途/,
  );
});

test("combined search and emotional coverage match active materials", () => {
  assert.equal(
    findAssets(fixture.assets, { query: "林夏", type: "video" }).length,
    5,
  );
  assert.equal(findAssets(fixture.assets, { query: "no-result" }).length, 0);
  assert(
    emotionCoverage(fixture.assets, "char-linxia").every(
      (item) => item.present,
    ),
  );
  assert(
    emotionCoverage(fixture.assets, "char-zhouning").every(
      (item) => !item.present,
    ),
  );
});
