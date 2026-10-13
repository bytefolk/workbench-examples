import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  preflight,
  videoArgs,
  submittedTask,
  verifyVideoResult,
  generate,
  redact,
} from "./xyq-poc.mjs";
test("no auth never calls models, credit, upload or generation", async () => {
  const called = [];
  const result = await preflight(async (args) => {
    called.push(args);
    return { logged_in: false };
  });
  assert.equal(result.ready, false);
  assert.deepEqual(called, [["status"]]);
});
test("unknown credits stay unknown and identities are reduced to fingerprints", async () => {
  const result = await preflight(async (args) =>
    args[0] === "status"
      ? { logged_in: true, uid: "account-1" }
      : args[0] === "model"
        ? { models: [] }
        : {},
  );
  assert.equal(result.credits, null);
  assert.equal(result.accountFingerprint.length, 16);
  assert.equal(result.uid, undefined);
});
test("config must have an actual model and keeps prompt and source arguments exact", () => {
  assert.throws(() => videoArgs({ prompt: "原始需求" }), /模型/);
  const args = videoArgs({
    prompt: " 原始需求\n",
    model: "model-actual",
    duration: 5,
    ratio: "9:16",
    images: [],
    audios: [],
  });
  assert.equal(args[2], " 原始需求\n");
  assert.equal(args.at(-1), "codex");
  assert(!args.includes("--resolution"));
});
test("missing task identifiers cannot be interpreted as a successful generation", () => {
  assert.throws(() => submittedTask({ completed: true }), /不确定/);
  assert.deepEqual(
    submittedTask({ thread_id: "9007199254740993", run_id: "r1" }),
    { threadId: "9007199254740993", runId: "r1", webThreadLink: null },
  );
});
test("error_message wins even when exit code or completed indicates success", async () => {
  await assert.rejects(
    verifyVideoResult({
      completed: true,
      error_message: "permission denied",
      videos: [],
    }),
    /permission/,
  );
  await assert.rejects(
    verifyVideoResult({ completed: true, videos: [] }),
    /未返回视频/,
  );
  assert.equal(
    (await verifyVideoResult({ completed: false })).completed,
    false,
  );
});
test("wrong media and zero-byte downloads cannot pass delivery checks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xyq-poc-"));
  const path = join(dir, "result.mp4");
  try {
    await writeFile(path, "<html>failure</html>");
    await assert.rejects(
      verifyVideoResult({ completed: true, videos: [{ output_path: path }] }),
      /错误页/,
    );
    await writeFile(path, "");
    await assert.rejects(
      verifyVideoResult({ completed: true, videos: [{ output_path: path }] }),
      /为空/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("uncertain submission is recorded and cannot be automatically replayed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "xyq-poc-"));
  let submissions = 0;
  const call = async (args) => {
    if (args[0] === "status") return { logged_in: true };
    if (args[0] === "get-credit-balance") return { total_remain_amount: "100" };
    if (args[0] === "model") return { models: [{ key: "actual" }] };
    submissions++;
    throw new Error("timeout");
  };
  const config = {
    prompt: "test",
    model: "actual",
    duration: 5,
    ratio: "9:16",
    images: [],
    audios: [],
  };
  try {
    await assert.rejects(generate(config, dir, call), /timeout/);
    const receipt = JSON.parse(
      await readFile(join(dir, "submission-uncertain.json"), "utf8"),
    );
    assert.equal(receipt.automaticRetry, false);
    await assert.rejects(generate(config, dir, call), /禁止重复/);
    assert.equal(submissions, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("secrets never survive diagnostic redaction", () => {
  assert.deepEqual(
    redact({
      access_key: "hidden",
      message: "Bearer hidden access_key=hidden",
    }),
    {
      access_key: "[redacted]",
      message: "Bearer [redacted] access_key=[redacted]",
    },
  );
  assert.equal(
    redact('HTTP response: {"access_key":"hidden"}'),
    'HTTP response: {"access_key":"[redacted]"}',
  );
});
