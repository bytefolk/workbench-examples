import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "./app.mjs";
import { safeXyqError, validateXyqDraft } from "./xiaoyunque.mjs";
const id = "11111111-1111-4111-8111-111111111111";
const model = {
  key: "fixture-video",
  kind: "video",
  name: "隔离测试模型",
  duration: { min: 4, max: 15, step: 1 },
  ratio: { options: ["9:16", "16:9"] },
  resolution: { options: ["720p"] },
  material_limits: { image_total_limit: 3 },
  creation_modes: [
    { key: "reference_generation", enabled: true, task_type: "reference" },
  ],
};
const draft = {
  mode: "xiaoyunque",
  title: "隔离测试",
  prompt: "人物戴帽子走动",
  shots: [{ description: "固定全身镜头", narration: "" }],
  mood: "自然",
  modelId: model.key,
  duration: 5,
  ratio: "9:16",
  xyqResolution: "720p",
  characterId: "p",
  productId: "h",
  sceneId: "s",
};
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV8AAAAASUVORK5CYII=";
const assets = [
  ["p", "character"],
  ["h", "product"],
  ["s", "scene"],
].map(([id, kind]) => ({ id, kind, image: png }));
const body = { submissionId: id, draft, assets };
async function fixture(
  t,
  override = {},
  env = { XYQ_ENABLE_REAL: "true" },
  suppliedDir,
) {
  let generates = 0;
  const dataDir =
    suppliedDir || (await mkdtemp(path.join(os.tmpdir(), "muse-xyq-test-")));
  const call = async (args) => {
    if (override[args[0]]) return override[args[0]](args);
    if (args[0] === "status")
      return { logged_in: true, uid: "fake-account", source: "browser" };
    if (args[0] === "model")
      return args[1] === "list" ? { models: [model] } : model;
    if (args[0] === "get-credit-balance") return { total_remain_amount: "100" };
    if (args[0] === "generate-video") {
      generates++;
      const refs = args.filter((value, index) => args[index - 1] === "--image");
      assert.equal(refs.length, 3);
      for (const ref of refs) assert((await readFile(ref)).length > 8);
      return { thread_id: "thread-fixture", run_id: "run-fixture" };
    }
    if (args[0] === "query-result") {
      const output = path.join(
        args[args.indexOf("--download-dir") + 1],
        "fixture.mp4",
      );
      await writeFile(
        output,
        Buffer.concat([
          Buffer.from([0, 0, 0, 24]),
          Buffer.from("ftypisom"),
          Buffer.alloc(16),
        ]),
      );
      return {
        completed: true,
        thread_id: "thread-fixture",
        run_id: "run-fixture",
        videos: [{ output_path: output }],
      };
    }
    throw new Error("Unexpected fixture command");
  };
  const app = await createApp({ env, dataDir, xyqCli: call });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  let cookie = "";
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, value, options = {}) => {
    const res = await fetch(base + url, {
      method: value === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Studio-Client": "1",
        Cookie: cookie,
        ...options.headers,
      },
      body: value === undefined ? undefined : JSON.stringify(value),
    });
    if (res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    return res;
  };
  const json = async (url, value, opts) => {
    const res = await request(url, value, opts);
    return { status: res.status, data: await res.json() };
  };
  return {
    json,
    request,
    dataDir,
    count: () => generates,
    settle: async () => {
      for (let n = 0; n < 40; n++) {
        const r = await json(`/api/xyq/requests/${id}`);
        if (r.data.status !== "in_progress") return r;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("fixture did not finish");
    },
  };
}
test("authorization, disabled calls and zero credit block before generation", async (t) => {
  for (const [override, env] of [
    [
      { status: async () => ({ logged_in: false }) },
      { XYQ_ENABLE_REAL: "true" },
    ],
    [{}, {}],
    [
      { "get-credit-balance": async () => ({ total_remain_amount: "0" }) },
      { XYQ_ENABLE_REAL: "true" },
    ],
  ]) {
    const f = await fixture(t, override, env);
    assert.equal((await f.json("/api/xyq/videos", body)).status, 409);
    assert.equal(f.count(), 0);
  }
});
test("current model limits forbid invalid specs, unsupported references and draft two-stage calls", () => {
  assert.throws(() => validateXyqDraft({ ...draft, duration: 36 }, model));
  assert.throws(() =>
    validateXyqDraft({ ...draft, xyqResolution: "4k" }, model),
  );
  assert.throws(() =>
    validateXyqDraft(draft, {
      ...model,
      material_limits: { image_total_limit: 1 },
    }),
  );
  assert.throws(() =>
    validateXyqDraft(draft, {
      ...model,
      creation_modes: [{ key: "first_last_frame" }],
    }),
  );
  assert.throws(() =>
    validateXyqDraft(
      { ...draft, modelId: "Seedance_2.5_draft" },
      { ...model, key: "Seedance_2.5_draft" },
    ),
  );
});
test("full provider workflow archives media, ranges and downloads; no duplicate submission or stolen output", async (t) => {
  const f = await fixture(t);
  const first = await f.json("/api/xyq/videos", body);
  assert.equal(first.status, 200);
  assert.equal(first.data.canCancel, false);
  const finished = await f.settle();
  assert.equal(finished.data.status, "completed");
  assert.equal((await f.json("/api/xyq/videos", body)).data.requestId, id);
  assert.equal(f.count(), 1);
  assert.equal(
    (
      await f.json("/api/xyq/videos", {
        ...body,
        draft: { ...draft, duration: 6 },
      })
    ).status,
    409,
  );
  const media = await f.request(finished.data.video, undefined, {
    headers: { Range: "bytes=0-11" },
  });
  assert.equal(media.status, 206);
  assert.equal((await media.arrayBuffer()).byteLength, 12);
  const downloaded = await f.request(`/api/xyq/requests/${id}/download`);
  assert(downloaded.headers.get("content-disposition").includes("attachment"));
  const stolen = await f.request(finished.data.video, undefined, {
    headers: {
      Cookie: "muse_demo_session=22222222-2222-4222-8222-222222222222",
    },
  });
  assert.equal(stolen.status, 404);
  const archived = await readFile(
    path.join(f.dataDir, "xiaoyunque", id, "result.mp4"),
  );
  assert(archived.length > 12);
});
test("query completed true with error is failure; missing video does not substitute demo footage", async (t) => {
  for (const result of [
    { completed: true, error_message: "素材不符", videos: [] },
    { completed: true, videos: [] },
  ]) {
    const f = await fixture(t, { "query-result": async () => result });
    await f.json("/api/xyq/videos", body);
    const r = await f.settle();
    assert.equal(r.data.status, "failed");
    assert.equal(r.data.video, undefined);
  }
});
test("failed or ambiguous generation does not auto-resubmit; secrets are redacted", async (t) => {
  let attempts = 0;
  const f = await fixture(
    t,
    {
      "generate-video": async () => {
        attempts++;
        throw new Error("access_key=private-test-key timeout");
      },
    },
    { XYQ_ENABLE_REAL: "true", XYQ_ACCESS_KEY: "private-test-key" },
  );
  await f.json("/api/xyq/videos", body);
  const r = await f.settle();
  assert.equal(r.data.status, "failed");
  assert(!r.data.error.includes("private-test-key"));
  await f.json("/api/xyq/videos", body);
  assert.equal(attempts, 1);
  assert(
    !safeXyqError(
      "Bearer secret-token access_token=abc https://example.com/?key=foo",
    ).includes("secret-token"),
  );
});
test("download paths outside the current request directory are rejected", async (t) => {
  const f = await fixture(t, {
    "query-result": async () => ({
      completed: true,
      videos: [{ output_path: path.resolve("public/media/demo-wide.mp4") }],
    }),
  });
  await f.json("/api/xyq/videos", body);
  let result;
  for (let i = 0; i < 20; i++) {
    result = await f.json(`/api/xyq/requests/${id}`);
    if (result.status === 502) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(result.status, 502);
  assert(result.data.error.includes("路径"));
});
test("status exposes models and balance without credentials or account identifiers", async (t) => {
  const f = await fixture(t);
  const r = await f.json("/api/xyq/status");
  assert.equal(r.data.balance, "100");
  assert.equal(r.data.models[0].key, model.key);
  assert.equal(r.data.uid, undefined);
  assert.equal(r.data.source, undefined);
});
