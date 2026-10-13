import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

export const root = fileURLToPath(new URL("../", import.meta.url));
const ajv = new Ajv({ allErrors: true, strict: true });
const json = async (relative) =>
  JSON.parse(await fs.readFile(path.join(root, relative), "utf8"));

export async function validateDocument(document, schemaPath) {
  const validate = ajv.compile(await json(schemaPath));
  assert(
    validate(document),
    `${schemaPath}: ${JSON.stringify(validate.errors)}`,
  );
}

async function existsInside(base, relative) {
  assert(
    relative && !path.isAbsolute(relative),
    `Expected relative path: ${relative}`,
  );
  const target = path.resolve(base, relative);
  const resolvedBase = await fs.realpath(base);
  const resolvedTarget = await fs.realpath(target);
  const difference = path.relative(resolvedBase, resolvedTarget);
  assert(
    difference !== ".." &&
      !difference.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(difference),
    `Path escapes case: ${relative}`,
  );
  return target;
}

export async function validateRepository() {
  const domains = await json("catalog/domains.json");
  const catalog = await json("catalog/cases.json");
  await validateDocument(domains, "schemas/domains.schema.json");
  await validateDocument(catalog, "schemas/catalog.schema.json");
  const domainIds = new Set(domains.domains.map((domain) => domain.id));
  assert.equal(domainIds.size, domains.domains.length, "Duplicate domain IDs");
  const caseIds = new Set();
  for (const entry of catalog.cases) {
    assert(!caseIds.has(entry.id), `Duplicate case: ${entry.id}`);
    caseIds.add(entry.id);
    assert(domainIds.has(entry.domain), `Unknown domain: ${entry.domain}`);
    assert.equal(
      entry.path,
      `examples/${entry.domain}/${entry.id}`,
      "Case path does not match ID/domain",
    );
    const manifest = await json(`${entry.path}/case.json`);
    await validateDocument(manifest, "schemas/case.schema.json");
    for (const field of [
      "id",
      "title",
      "summary",
      "domain",
      "status",
      "tags",
    ]) {
      assert.deepEqual(
        manifest[field],
        entry[field],
        `Catalog drift in ${entry.id}.${field}`,
      );
    }
    assert.equal(
      new Set(manifest.capabilities.map((cap) => cap.id)).size,
      manifest.capabilities.length,
      "Duplicate capability IDs",
    );
    const base = path.join(root, entry.path);
    for (const relative of Object.values(manifest.deliverables)) {
      const target = await existsInside(base, relative);
      assert(
        (await fs.stat(target)).isFile(),
        `Deliverable is not a file: ${relative}`,
      );
      assert(
        !(await fs.readFile(target, "utf8")).includes("REPLACE_"),
        `Unfilled template: ${relative}`,
      );
    }
    assert((await fs.stat(await existsInside(base, "data"))).isDirectory());
    if (["prototype", "integrated", "verified"].includes(manifest.status)) {
      assert.notEqual(
        manifest.runtime.mode,
        "none",
        "Runnable stage requires runtime",
      );
      assert(manifest.runtime.command.trim(), "Runtime command missing");
      assert(
        (
          await fs.stat(await existsInside(base, manifest.runtime.entry))
        ).isFile(),
      );
    }
    if (manifest.dataMode !== "synthetic") {
      assert(
        manifest.source.summary.includes("发布"),
        "Non-synthetic data requires release-scope explanation",
      );
    }
    if (["integrated", "verified"].includes(manifest.status)) {
      assert(
        manifest.capabilities.some((cap) => cap.mode === "connected"),
        "Integrated stage needs connected capability",
      );
    }
    if (manifest.status === "verified")
      assert(
        manifest.source.customerConfirmed,
        "Verified stage requires customer confirmation",
      );
    for (const filename of await fs.readdir(path.join(base, "data"))) {
      if (!filename.endsWith(".json") || filename.endsWith(".schema.json"))
        continue;
      const schemaName = filename.replace(/\.json$/, ".schema.json");
      await existsInside(base, `data/${schemaName}`);
      await validateDocument(
        await json(`${entry.path}/data/${filename}`),
        `${entry.path}/data/${schemaName}`,
      );
    }
  }
  // Every actual case must appear in the index; templates live outside examples/.
  const actualPaths = [];
  for (const domain of await fs.readdir(path.join(root, "examples"), {
    withFileTypes: true,
  })) {
    if (!domain.isDirectory()) continue;
    assert(
      domainIds.has(domain.name),
      `Unknown examples domain: ${domain.name}`,
    );
    for (const item of await fs.readdir(
      path.join(root, "examples", domain.name),
      { withFileTypes: true },
    )) {
      if (item.isDirectory())
        actualPaths.push(`examples/${domain.name}/${item.name}`);
    }
  }
  assert.deepEqual(
    actualPaths.sort(),
    catalog.cases.map((entry) => entry.path).sort(),
    "Unindexed case directories",
  );

  const fixtures = await json(
    "examples/dam/character-material-library/data/fixtures.json",
  );
  const characters = new Set(
    fixtures.characters.map((character) => character.id),
  );
  assert.equal(
    characters.size,
    fixtures.characters.length,
    "Duplicate character IDs",
  );
  assert.equal(
    new Set(fixtures.assets.map((asset) => asset.id)).size,
    fixtures.assets.length,
    "Duplicate asset IDs",
  );
  for (const asset of fixtures.assets) {
    assert(
      asset.type === "product"
        ? asset.characterId === null
        : characters.has(asset.characterId),
      `Invalid character link: ${asset.id}`,
    );
  }
  return {
    domains: domains.domains.length,
    cases: catalog.cases.length,
    legacyDemoAssets: fixtures.assets.length,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      JSON.stringify({ status: "passed", ...(await validateRepository()) }),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
