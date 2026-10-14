import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  installSeedance,
  buildSeedanceInput,
  seedanceStatus,
  seedanceError,
  seedanceBase,
  SEEDANCE_DEFAULT_BASE_URL,
} from "./seedance.mjs";
import {
  SEEDANCE_MODELS,
  normalizeSeedanceDraft,
} from "../shared/seedance-models.mjs";

const id = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const key = "isolated-seedance-test-key";
const origin = "https://ai.amaxsmp.com";
const mp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from("ftypisom"),
  Buffer.alloc(20),
]);
const png = "data:image/png;base64,iVBORw0KGgo=";
const draft = {
  modelId: SEEDANCE_MODELS[0].id,
  seedanceInputMode: "image",
  seedanceFrameAssetId: "p",
  duration: 5,
  resolution: "720p",
  prompt: "人物保持相同脸部，微笑",
  shots: [{ description: "人物微笑" }],
};
const assets = [
  { id: "p", kind: "character", image: png },
  { id: "h", kind: "product", image: "data:image/png;base64,do-not-send" },
];
const body = { submissionId: id, draft, assets };
const jsonResponse = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function fixture(t, impl, options = {}) {
  const dataDir =
    options.dataDir ||
    (await mkdtemp(path.join(os.tmpdir(), "muse-seedance-test-")));
  const requests = [];
  const app = express();
  app.use(express.json({ limit: "40mb" }));
  app.use((req, res, next) => {
    req.demoOwner = req.headers["x-owner"] || owner;
    next();
  });
  await installSeedance(app, {
    env: options.env || {},
    dataDir,
    publicDir: path.resolve("public"),
    checkMediaUrl: async (v) => v,
    fetchImpl: async (url, opts = {}) => {
      requests.push({ url, opts });
      if (impl) return impl(url, opts);
      if (opts.method === "POST")
        return jsonResponse({
          data: { id: "task_seedance_fixture", status: "queued" },
          code: "SUCCESS",
        });
      if (url.endsWith("/content"))
        return new Response(mp4, { headers: { "Content-Type": "video/mp4" } });
      return jsonResponse({
        data: {
          task_id: "task_seedance_fixture",
          status: "SUCCESS",
          result_url: "https://media.fixture/video.mp4",
        },
        code: "SUCCESS",
      });
    },
  });
  app.use((error, req, res, next) =>
    res.status(error.status || 400).json({ error: error.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, value, clientOwner = owner, headers = {}) =>
    fetch(base + url, {
      method: value === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "x-owner": clientOwner,
        ...headers,
      },
      body: value === undefined ? undefined : JSON.stringify(value),
    });
  const json = async (url, value, clientOwner = owner) => {
    const res = await request(url, value, clientOwner);
    return { status: res.status, data: await res.json() };
  };
  const settle = async () => {
    for (let i = 0; i < 100; i++) {
      const state = JSON.parse(
        await readFile(path.join(dataDir, "seedance/state.json"), "utf8"),
      );
      if (state[id]?.providerStatus !== "submitting") return state[id];
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error("Fixture submission did not finish");
  };
  return {
    request,
    json,
    requests,
    dataDir,
    settle,
    configure: () =>
      json("/api/seedance/config", { apiKey: key, enabled: true }),
  };
}

test("registry is conservative and request contains only documented fields", () => {
  assert.deepEqual(SEEDANCE_MODELS[0].durations, [5]);
  assert.deepEqual(SEEDANCE_MODELS[0].resolutions, ["720p"]);
  const payload = buildSeedanceInput(draft, png);
  assert.deepEqual(Object.keys(payload), [
    "model",
    "prompt",
    "duration",
    "resolution",
    "image",
  ]);
  assert.equal(payload.resolution, "720P");
  assert.equal(
    buildSeedanceInput({ ...draft, seedanceInputMode: "text" }).image,
    undefined,
  );
  assert.throws(() => buildSeedanceInput({ ...draft, duration: 10 }, png));
  assert.throws(() =>
    buildSeedanceInput({ ...draft, resolution: "1080p" }, png),
  );
  assert.throws(() =>
    buildSeedanceInput({ ...draft, prompt: "x".repeat(1501) }, png),
  );
  assert.equal(
    normalizeSeedanceDraft({ ...draft, duration: 15, resolution: "1080p" })
      .duration,
    5,
  );
  assert.equal(seedanceStatus("SUCCESS"), "completed");
  assert.equal(seedanceStatus("succeeded"), "completed");
  assert.equal(seedanceStatus("NOT_START"), "queued");
  assert.equal(seedanceStatus("SUBMITTED"), "queued");
  assert.equal(seedanceStatus("made-up"), undefined);
  assert.equal(seedanceError(`AMAX Bearer ${key}`, key).includes(key), false);
  assert.equal(seedanceError("AMAX failed").includes("AMAX"), false);
  const portraitError = seedanceError(
    `Input may contain real person; Bearer ${key}`,
    key,
  );
  assert.match(portraitError, /这不证明图片是真人照片/);
  assert.match(portraitError, /尚未接入可信素材库/);
  assert.equal(portraitError.includes(key), false);
  assert.equal(seedanceError(portraitError), portraitError);
});

test("Base URL normalizes root, v1, proxy prefixes and local HTTP", () => {
  assert.equal(seedanceBase(), SEEDANCE_DEFAULT_BASE_URL);
  for (const input of [
    "https://video.fixture",
    "https://video.fixture/",
    "https://video.fixture/v1",
    "https://video.fixture/v1/",
    " https://video.fixture/v1/ ",
  ])
    assert.equal(seedanceBase(input), "https://video.fixture/v1");
  assert.equal(
    seedanceBase("https://video.fixture/proxy/api/v1/"),
    "https://video.fixture/proxy/api/v1",
  );
  assert.equal(
    seedanceBase("http://localhost:9000"),
    "http://localhost:9000/v1",
  );
  assert.equal(
    seedanceBase("http://127.0.0.1:9000/v1/"),
    "http://127.0.0.1:9000/v1",
  );
  assert.equal(
    seedanceBase("http://[::1]:9000/proxy/v1/"),
    "http://[::1]:9000/proxy/v1",
  );
});

test("invalid Base URLs reject without overwriting settings or network requests", async (t) => {
  const f = await fixture(t);
  await f.configure();
  for (const baseUrl of [
    null,
    "",
    "not-url",
    "https:video.fixture",
    "http://video.fixture/v1",
    "http://192.168.1.1/v1",
    "https://user:pass@video.fixture/v1",
    "https://video.fixture/v1?key=secret",
    "https://video.fixture/v1#fragment",
    "https://video.fixture/v1?",
    "https://video.fixture/v1#",
    "https://video.fixture/v1/video/generations",
    "https://video.fixture/v1/videos/id/content",
    "https://video.fixture/proxy",
    "https://video.fixture/v1/v1",
    "https://video.fixture/proxy//v1",
    "https://video.fixture/v1\n/a",
    "ftp://video.fixture/v1",
  ])
    assert.equal(
      (
        await f.json("/api/seedance/config", {
          apiKey: key,
          baseUrl,
          enabled: true,
        })
      ).status,
      400,
      String(baseUrl),
    );
  assert.equal(
    (await f.json("/api/seedance/config")).data.baseUrl,
    SEEDANCE_DEFAULT_BASE_URL,
  );
  assert.equal(f.requests.length, 0);
});

test("custom Base URL is used for submit, query and download with Bearer", async (t) => {
  const f = await fixture(t);
  const baseUrl = "https://video.fixture/reverse/api/v1";
  const saved = await f.json("/api/seedance/config", {
    apiKey: key,
    baseUrl: `${baseUrl}/`,
    enabled: true,
  });
  assert.equal(saved.data.baseUrl, baseUrl);
  assert.equal(f.requests.length, 0);
  assert.equal(JSON.stringify(saved.data).includes(key), false);
  assert.equal((await f.json("/api/seedance/config")).data.baseUrl, baseUrl);
  await f.json("/api/seedance/videos", body);
  await f.settle();
  assert.equal(
    (await f.json(`/api/seedance/requests/${id}`)).data.status,
    "completed",
  );
  assert.deepEqual(
    f.requests.map((r) => r.url),
    [
      `${baseUrl}/video/generations`,
      `${baseUrl}/video/generations/task_seedance_fixture`,
      `${baseUrl}/videos/task_seedance_fixture/content`,
    ],
  );
  for (const request of f.requests) {
    assert.equal(request.opts.headers.Authorization, `Bearer ${key}`);
    assert.equal(request.opts.redirect, "error");
  }
  const state = JSON.parse(
    await readFile(path.join(f.dataDir, "seedance/state.json"), "utf8"),
  );
  assert.equal(state[id].baseUrl, baseUrl);
  assert.equal(typeof state[id].baseUrlHash, "string");
  await f.json("/api/seedance/config/clear", {});
  assert.equal(
    (await f.json("/api/seedance/config")).data.baseUrl,
    SEEDANCE_DEFAULT_BASE_URL,
  );
  assert.equal(
    (await f.request(`/api/seedance/requests/${id}/media`)).status,
    200,
  );
  assert.equal(f.requests.length, 3);
});

test("changing Base URL blocks old tasks, restoring canonical original permits query", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.json("/api/seedance/videos", body);
  await f.settle();
  await f.json("/api/seedance/config", {
    baseUrl: "https://different.fixture/v1",
    enabled: true,
  });
  const blocked = await f.json(`/api/seedance/requests/${id}`);
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.error, /对接网址/);
  assert.equal(f.requests.length, 1);
  await f.json("/api/seedance/config", {
    baseUrl: `${origin}/`,
    enabled: true,
  });
  assert.equal(
    (await f.json(`/api/seedance/requests/${id}`)).data.status,
    "completed",
  );
  assert.equal(f.requests.length, 3);
});

test("environment Base URL, clear override and legacy settings/tasks remain compatible", async (t) => {
  const f = await fixture(t, undefined, {
    env: {
      SEEDANCE_API_KEY: key,
      SEEDANCE_ENABLE_REAL: "true",
      SEEDANCE_BASE_URL: "https://env.fixture/proxy/v1/",
    },
  });
  assert.equal(
    (await f.json("/api/seedance/config")).data.baseUrl,
    "https://env.fixture/proxy/v1",
  );
  await f.json("/api/seedance/config/clear", {});
  const cleared = (await f.json("/api/seedance/config")).data;
  assert.equal(cleared.configured, false);
  assert.equal(cleared.enabled, false);
  assert.equal(cleared.baseUrl, SEEDANCE_DEFAULT_BASE_URL);
  assert.equal(f.requests.length, 0);
  const g = await fixture(t);
  await g.configure();
  await g.json("/api/seedance/videos", body);
  await g.settle();
  const settingsPath = path.join(g.dataDir, "seedance/settings.json"),
    statePath = path.join(g.dataDir, "seedance/state.json");
  const settings = JSON.parse(await readFile(settingsPath, "utf8")),
    state = JSON.parse(await readFile(statePath, "utf8"));
  delete settings[owner].baseUrl;
  delete state[id].baseUrl;
  delete state[id].baseUrlHash;
  await writeFile(settingsPath, JSON.stringify(settings));
  await writeFile(statePath, JSON.stringify(state));
  const legacy = await fixture(t, undefined, {
    dataDir: g.dataDir,
    env: { SEEDANCE_BASE_URL: "https://unrelated-env.fixture/v1" },
  });
  assert.equal(
    (await legacy.json("/api/seedance/config")).data.baseUrl,
    SEEDANCE_DEFAULT_BASE_URL,
  );
  assert.equal(
    (await legacy.json(`/api/seedance/requests/${id}`)).data.status,
    "completed",
  );
  assert.equal(
    legacy.requests[0].url,
    `${origin}/v1/video/generations/task_seedance_fixture`,
  );
});
test("settings remain local, are owner isolated, and clearing blocks env fallback", async (t) => {
  const f = await fixture(t, undefined, {
    env: { SEEDANCE_API_KEY: "environment-key", SEEDANCE_ENABLE_REAL: "true" },
  });
  assert.equal(
    (await f.json("/api/seedance/config")).data.source,
    "environment",
  );
  const configured = await f.configure();
  assert.equal(configured.data.configured, true);
  assert.equal(configured.data.credentialVerified, false);
  assert.equal(JSON.stringify(configured).includes(key), false);
  assert.equal(f.requests.length, 0);
  assert.equal(
    (await f.json("/api/seedance/config", undefined, other)).data.source,
    "environment",
  );
  await f.json("/api/seedance/config/clear", {});
  assert.equal((await f.json("/api/seedance/config")).data.configured, false);
  assert.equal((await f.json("/api/seedance/videos", body)).status, 409);
  assert.equal(f.requests.length, 0);
});
test("image submit, task polling, download, range media and idempotency", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const started = await f.json("/api/seedance/videos", body);
  assert.equal(started.status, 200);
  assert.equal(started.data.requestId, id);
  await f.settle();
  const posted = f.requests.find((r) => r.opts.method === "POST");
  assert.equal(posted.url, origin + "/v1/video/generations");
  assert.equal(posted.opts.headers.Authorization, `Bearer ${key}`);
  assert.equal(JSON.parse(posted.opts.body).image, png);
  assert.equal(posted.opts.body.includes("do-not-send"), false);
  const replay = await f.json("/api/seedance/videos", body);
  assert.equal(replay.status, 200);
  assert.equal(f.requests.filter((r) => r.opts.method === "POST").length, 1);
  assert.equal(
    (
      await f.json("/api/seedance/videos", {
        ...body,
        draft: { ...draft, prompt: "different" },
      })
    ).status,
    409,
  );
  const done = await f.json(`/api/seedance/requests/${id}`);
  assert.equal(done.data.status, "completed");
  assert.equal(done.data.video, `/api/seedance/requests/${id}/media`);
  assert.equal(JSON.stringify(done).includes(key), false);
  const media = await f.request(done.data.video, undefined, owner, {
    Range: "bytes=0-11",
  });
  assert.equal(media.status, 206);
  assert.equal((await media.arrayBuffer()).byteLength, 12);
  assert.equal(
    (await f.request(done.data.video, undefined, other)).status,
    404,
  );
  assert.equal(
    (await f.request(`/api/seedance/requests/${id}/download`, undefined, other))
      .status,
    404,
  );
  assert.equal(
    (await f.json(`/api/seedance/requests/${id}`, undefined, other)).status,
    404,
  );
  const state = await readFile(
    path.join(f.dataDir, "seedance/state.json"),
    "utf8",
  );
  assert.equal(state.includes(key), false);
  assert.equal(state.includes(png), false);
});
test("text mode uploads no image; HTTPS override replaces local Base64", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.json("/api/seedance/videos", {
    ...body,
    draft: { ...draft, seedanceInputMode: "text" },
  });
  await f.settle();
  assert.equal(JSON.parse(f.requests[0].opts.body).image, undefined);
  const g = await fixture(t);
  await g.configure();
  await g.json("/api/seedance/videos", {
    ...body,
    draft: {
      ...draft,
      seedanceReferenceUrl: "https://images.fixture/person.png",
    },
  });
  await g.settle();
  assert.equal(
    JSON.parse(g.requests[0].opts.body).image,
    "https://images.fixture/person.png",
  );
});
test("invalid parameters and unsafe images reject before any provider call", async (t) => {
  const f = await fixture(t);
  await f.configure();
  for (const change of [
    { duration: 10 },
    { resolution: "1080p" },
    { seedanceInputMode: "other" },
    { seedanceReferenceUrl: "https://127.0.0.1/x.png" },
    { seedanceReferenceUrl: "http://images.fixture/x.png" },
    { seedanceReferenceUrl: "https://user:pass@images.fixture/x.png" },
  ]) {
    assert.equal(
      (
        await f.json("/api/seedance/videos", {
          ...body,
          draft: { ...draft, ...change },
        })
      ).status,
      400,
    );
  }
  assert.equal(f.requests.length, 0);
});
test("submission timeout is durable unknown, restart and replay never resubmit", async (t) => {
  const f = await fixture(t, async () => {
    throw new Error("network timeout");
  });
  await f.configure();
  await f.json("/api/seedance/videos", body);
  const record = await f.settle();
  assert.equal(record.providerStatus, "submission_unknown");
  assert.equal(record.status, "in_progress");
  await f.json("/api/seedance/videos", body);
  await f.json(`/api/seedance/requests/${id}`);
  assert.equal(f.requests.length, 1);
  const g = await fixture(t, undefined, { dataDir: f.dataDir });
  assert.equal(
    (await g.json("/api/seedance/videos", body)).data.providerStatus,
    "submission_unknown",
  );
  assert.equal(g.requests.length, 0);
});
test("definite 401 is failed, errors redact key and gateway branding", async (t) => {
  const f = await fixture(t, async () =>
    jsonResponse({ error: { message: `AMAX invalid ${key}` } }, 401),
  );
  await f.configure();
  await f.json("/api/seedance/videos", body);
  const r = await f.settle();
  assert.equal(r.status, "failed");
  assert.equal(r.error.includes(key), false);
  assert.equal(r.error.includes("AMAX"), false);
});
test("SUCCESS wrapper code with queued task status cannot complete a video", async (t) => {
  const f = await fixture(t, async (url, opts) =>
    opts.method === "POST"
      ? jsonResponse({ id: "task_fixture", status: "queued" })
      : jsonResponse({
          code: "SUCCESS",
          data: {
            id: "task_fixture",
            status: "queued",
            url: "https://media.fixture/x.mp4",
          },
        }),
  );
  await f.configure();
  await f.json("/api/seedance/videos", body);
  await f.settle();
  const queried = await f.json(`/api/seedance/requests/${id}`);
  assert.equal(queried.data.status, "queued");
  assert.equal(queried.data.video, undefined);
  await f.json(`/api/seedance/requests/${id}`);
  assert.equal(f.requests.length, 2);
});
test("changed Key blocks old remote task access", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.json("/api/seedance/videos", body);
  await f.settle();
  await f.json("/api/seedance/config", {
    apiKey: "another-account-test-key",
    enabled: true,
  });
  const result = await f.json(`/api/seedance/requests/${id}`);
  assert.equal(result.status, 409);
  assert.equal(f.requests.length, 1);
});
test("gateway JSON fallback downloads upstream MP4 without Key or redirect following", async (t) => {
  const f = await fixture(t, async (url, opts) => {
    if (opts.method === "POST")
      return jsonResponse({ id: "task_fixture", status: "queued" });
    if (url.endsWith("/content"))
      return jsonResponse({ error: { message: "binary unavailable" } }, 502);
    if (url.startsWith("https://media.fixture"))
      return new Response(mp4, { headers: { "Content-Type": "video/mp4" } });
    return jsonResponse({
      data: {
        id: "task_fixture",
        status: "succeeded",
        url: "https://media.fixture/result.mp4",
      },
    });
  });
  await f.configure();
  await f.json("/api/seedance/videos", body);
  await f.settle();
  assert.equal(
    (await f.json(`/api/seedance/requests/${id}`)).data.status,
    "completed",
  );
  const external = f.requests.find((r) =>
    r.url.startsWith("https://media.fixture"),
  );
  assert.equal(external.opts.headers, undefined);
  assert.equal(external.opts.redirect, "error");
});
test("bad media never completes; retry downloads same result without new generation", async (t) => {
  let ready = false;
  const impl = async (url, opts) => {
    if (opts.method === "POST")
      return jsonResponse({ id: "task_fixture", status: "queued" });
    if (url.endsWith("/content"))
      return ready
        ? new Response(mp4, { headers: { "Content-Type": "video/mp4" } })
        : jsonResponse({ message: "unavailable" });
    return jsonResponse({ id: "task_fixture", status: "SUCCESS" });
  };
  const f = await fixture(t, impl);
  await f.configure();
  await f.json("/api/seedance/videos", body);
  await f.settle();
  assert.equal((await f.json(`/api/seedance/requests/${id}`)).status, 502);
  const state = JSON.parse(
    await readFile(path.join(f.dataDir, "seedance/state.json"), "utf8"),
  );
  assert.equal(state[id].status, "in_progress");
  assert.equal(state[id].mediaFile, undefined);
  state[id].nextPoll = 0;
  await writeFile(
    path.join(f.dataDir, "seedance/state.json"),
    JSON.stringify(state),
  );
  ready = true;
  const g = await fixture(t, impl, { dataDir: f.dataDir });
  assert.equal(
    (await g.json(`/api/seedance/requests/${id}`)).data.status,
    "completed",
  );
  assert.equal(g.requests.length, 1);
  assert.equal(g.requests[0].url.endsWith("/content"), true);
});
test("private upstream URL and non-MP4 content cannot be archived", async (t) => {
  const f = await fixture(t, async (url, opts) => {
    if (opts.method === "POST")
      return jsonResponse({ id: "task_fixture", status: "queued" });
    if (url.endsWith("/content"))
      return new Response("not mp4", {
        headers: { "Content-Type": "video/mp4" },
      });
    return jsonResponse({
      id: "task_fixture",
      status: "SUCCESS",
      result_url: "https://127.0.0.1/private.mp4",
    });
  });
  await f.configure();
  await f.json("/api/seedance/videos", body);
  await f.settle();
  assert.equal((await f.json(`/api/seedance/requests/${id}`)).status, 400);
  assert.equal(f.requests.length, 3);
});
