import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createApp } from "./app.mjs";
import { buildVideoInput } from "./provider.mjs";
import { rankAssets } from "../shared/matching.mjs";
const requestId = "11111111-1111-4111-8111-111111111111";
const submissionId = "22222222-2222-4222-8222-222222222222";
const soulId = "33333333-3333-4333-8333-333333333333";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const assets = [
  {
    id: "person",
    kind: "character",
    name: "林知夏",
    code: "IP1",
    tags: ["知性"],
    image: png,
  },
  {
    id: "hat",
    kind: "product",
    name: "云朵帽",
    code: "H001",
    tags: ["羊毛"],
    image: png,
  },
  { id: "scene", kind: "scene", name: "秋日庭院", tags: ["户外"], image: png },
];
const draft = {
  title: "test",
  prompt: "林知夏戴着H001在庭院走动",
  characterId: "person",
  productId: "hat",
  sceneId: "scene",
  ratio: "9:16",
  duration: 12,
  mood: "自然",
  shots: [{ description: "人物走动", narration: "你好" }],
  modelId: "seedance-reference",
  resolution: "720p",
  generateAudio: false,
};
const json = (data) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
async function fixture(env, fetchImpl) {
  const app = await createApp({
    env,
    fetchImpl,
    dataDir: await mkdtemp(path.join(os.tmpdir(), "muse-test-")),
    checkMediaUrl: async (url) => url,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  return {
    server,
    async call(url, body, custom = {}) {
      const response = await fetch(base + url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Studio-Client": "1",
          Cookie: cookie,
          ...custom,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.headers.get("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      return { status: response.status, data: await response.json() };
    },
  };
}
test("model contracts retain references, legal duration, sound and ratio; Kling has no invented resolution", () => {
  const seed = buildVideoInput(draft, ["a", "b", "c"]);
  assert.equal(seed.input.duration, 12);
  assert.equal(seed.input.generate_audio, false);
  assert.equal(seed.input.aspect_ratio, "9:16");
  assert.deepEqual(seed.input.image_urls, ["a", "b", "c"]);
  const kling = buildVideoInput({ ...draft, modelId: "kling-reference" }, [
    "a",
    "b",
    "c",
  ]);
  assert.equal(kling.input.sound, "off");
  assert.equal(kling.input.resolution, undefined);
  assert.equal(kling.input.multi_prompt, undefined);
  assert.throws(() =>
    buildVideoInput({ ...draft, duration: 36 }, ["a", "b", "c"]),
  );
});
test("rules expose ambiguity and never invent asset IDs", () => {
  const result = rankAssets("云朵帽 H001", [
    ...assets,
    { ...assets[1], id: "hat-v2" },
  ]);
  const group = result.groups.find((g) => g.kind === "product");
  assert.equal(group.candidates.length, 2);
  assert.equal(group.needsConfirmation, true);
  assert(result.groups.find((g) => g.kind === "voice").candidates.length === 0);
});
test("missing key blocks before uploads or paid requests; external origin rejected", async (t) => {
  let calls = 0;
  const f = await fixture({}, async () => {
    calls++;
    throw new Error("must not call");
  });
  t.after(() => f.server.close());
  const cfg = await f.call("/api/config");
  assert.equal(cfg.data.configured, false);
  assert.equal(JSON.stringify(cfg.data).includes("HF_API_KEY"), false);
  assert.equal(
    (await f.call("/api/videos", { submissionId, draft, assets })).status,
    409,
  );
  assert.equal(calls, 0);
  assert.equal(
    (
      await f.call(
        "/api/assets/match",
        { prompt: "H001", assets },
        { Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
});
test("signed uploads omit credentials, references reused, submit is idempotent and cancellation is real", async (t) => {
  let uploadCount = 0,
    submitCount = 0,
    canceled = false;
  const calls = [];
  const f = await fixture(
    { HF_API_KEY: "test-id:test-secret", HF_ENABLE_REAL: "true" },
    async (url, options) => {
      calls.push({ url, options });
      if (url.includes("generate-upload-url")) {
        uploadCount++;
        return json({
          upload_url: "https://storage.example/upload",
          upload_headers: {
            "Content-Type": "image/png",
            "x-amz-tagging": "retention=temporary",
          },
          public_url: "https://media.example/ref.png",
        });
      }
      if (url.includes("storage.example")) {
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(options.headers["x-amz-tagging"], "retention=temporary");
        return new Response(null, { status: 200 });
      }
      if (url.endsWith("/cancel")) {
        canceled = true;
        return new Response(null, { status: 202 });
      }
      if (url.endsWith("/status"))
        return json({ status: canceled ? "canceled" : "queued" });
      if (url.endsWith("reference-to-video")) {
        submitCount++;
        assert.equal(options.headers["Idempotency-Key"], submissionId);
        return json({
          request_id: requestId,
          status: "queued",
          status_url: `https://api.higgsfield.ai/requests/${requestId}/status`,
          cancel_url: `https://api.higgsfield.ai/requests/${requestId}/cancel`,
        });
      }
      throw new Error(`Unexpected ${url}`);
    },
  );
  t.after(() => f.server.close());
  const body = { submissionId, draft, assets };
  const first = await f.call("/api/videos", body);
  assert.equal(first.status, 200);
  assert.equal(first.data.canCancel, true);
  assert.equal((await f.call("/api/videos", body)).data.requestId, requestId);
  assert.equal(submitCount, 1);
  assert.equal(uploadCount, 1);
  assert.equal(
    (await f.call(`/api/requests/${requestId}/cancel`, {})).data.status,
    "canceled",
  );
  assert(canceled);
  const mismatch = await f.call("/api/videos", {
    ...body,
    draft: { ...draft, duration: 5 },
  });
  assert.equal(mismatch.status, 409);
  const stolen = await f.call(`/api/requests/${requestId}`, undefined, {
    Cookie: "muse_demo_session=44444444-4444-4444-8444-444444444444",
  });
  assert.equal(stolen.status, 404);
});
test("Soul create explicitly requests v2 and cannot generate until completed", async (t) => {
  let trainPayload;
  const f = await fixture(
    { HF_API_KEY: "test-id:test-secret", HF_ENABLE_REAL: "true" },
    async (url, options) => {
      if (url.includes("generate-upload-url"))
        return json({
          upload_url: "https://storage.example/upload",
          upload_headers: { "Content-Type": "image/png" },
          public_url: "https://media.example/ref.png",
        });
      if (url.includes("storage.example"))
        return new Response(null, { status: 200 });
      if (url.endsWith("v1/custom-references")) {
        trainPayload = JSON.parse(options.body);
        return json({ id: soulId, status: "queued", name: "test" });
      }
      throw new Error("Unexpected request");
    },
  );
  t.after(() => f.server.close());
  assert.equal(
    (await f.call("/api/souls", { name: "test", images: [png] })).data.id,
    soulId,
  );
  assert.equal(trainPayload.model_version, "v2");
  assert.equal(trainPayload.input_images[0].type, "image_url");
  assert.equal(
    (await f.call("/api/images", { soulId, prompt: "test", ratio: "16:9" }))
      .status,
    400,
  );
});
test("Qwen JSON recommendations are grounded to same-kind IDs", async (t) => {
  const f = await fixture(
    { DASHSCOPE_API_KEY: "test", QWEN_BASE_URL: "https://llm.example/v1" },
    async () =>
      json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: { action: "走动" },
                groups: [
                  {
                    kind: "product",
                    candidates: [
                      { id: "unknown", score: 100 },
                      { id: "person", score: 100 },
                      { id: "hat", score: 88, reason: "提到H001" },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      }),
  );
  t.after(() => f.server.close());
  const result = await f.call("/api/assets/match", { prompt: "H001", assets });
  assert.equal(result.data.method, "qwen");
  assert.deepEqual(
    result.data.groups
      .find((g) => g.kind === "product")
      .candidates.map((c) => c.id),
    ["hat"],
  );
});
test("relative built-in media can be estimated without submitting generation; traversal is rejected", async (t) => {
  let estimates = 0;
  const f = await fixture(
    { HF_API_KEY: "test-id:test-secret", HF_ENABLE_REAL: "true" },
    async (url, options) => {
      if (url.includes("generate-upload-url"))
        return json({
          upload_url: "https://storage.example/upload",
          public_url: "https://media.example/ref.png",
        });
      if (url.includes("storage.example"))
        return new Response(null, { status: 200 });
      if (url.includes("/estimate/")) {
        estimates++;
        assert.equal(JSON.parse(options.body).image_urls.length, 3);
        return json({ usd: "1", credits: "10" });
      }
      throw new Error("Generation must not be submitted by estimation");
    },
  );
  t.after(() => f.server.close());
  const relativeAssets = assets.map((a) => ({
    ...a,
    image: "./media/portrait.png",
  }));
  assert.equal(
    (await f.call("/api/videos/estimate", { draft, assets: relativeAssets }))
      .status,
    200,
  );
  assert.equal(estimates, 1);
  relativeAssets[0].image = "./media/../../.env";
  assert.equal(
    (await f.call("/api/videos/estimate", { draft, assets: relativeAssets }))
      .status,
    400,
  );
  assert.equal(estimates, 1);
});
