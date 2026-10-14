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

/** 校验服务模型、产品领域和案例的父子关系，不依赖磁盘内容。 */
export function validateTaxonomy(serviceModels, domains, catalog) {
  const serviceModelIds = new Set(
    serviceModels.serviceModels.map((model) => model.id),
  );
  assert.equal(
    serviceModelIds.size,
    serviceModels.serviceModels.length,
    "Duplicate service model IDs",
  );
  assert.deepEqual(
    [...serviceModelIds].sort(),
    ["iaas", "paas", "saas"],
    "Expected SaaS, PaaS and IaaS service models",
  );
  const domainsById = new Map();
  for (const domain of domains.domains) {
    assert(!domainsById.has(domain.id), `Duplicate domain: ${domain.id}`);
    assert(
      serviceModelIds.has(domain.serviceModel),
      `Unknown service model for domain ${domain.id}: ${domain.serviceModel}`,
    );
    domainsById.set(domain.id, domain);
  }
  const caseIds = new Set();
  for (const entry of catalog.cases) {
    assert(!caseIds.has(entry.id), `Duplicate case: ${entry.id}`);
    caseIds.add(entry.id);
    assert(
      serviceModelIds.has(entry.serviceModel),
      `Unknown service model: ${entry.serviceModel}`,
    );
    assert(domainsById.has(entry.domain), `Unknown domain: ${entry.domain}`);
    assert.equal(
      domainsById.get(entry.domain).serviceModel,
      entry.serviceModel,
      `Domain ${entry.domain} does not belong to service model ${entry.serviceModel}`,
    );
    assert.equal(
      entry.path,
      `examples/${entry.serviceModel}/${entry.domain}/${entry.id}`,
      "Case path does not match service model/domain/ID",
    );
  }
  return { serviceModelIds, domainsById };
}

export function validateCatalogManifest(entry, manifest) {
  for (const field of [
    "id",
    "title",
    "summary",
    "serviceModel",
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
}

/** 只统计真实案例目录；未交付领域只在字典中声明，不建立空目录。 */
export async function collectCasePaths(
  repositoryRoot,
  serviceModelIds,
  domainsById,
) {
  const actualPaths = [];
  for (const model of await fs.readdir(path.join(repositoryRoot, "examples"), {
    withFileTypes: true,
  })) {
    if (!model.isDirectory()) continue;
    assert(
      serviceModelIds.has(model.name),
      `Unknown examples service model: ${model.name}`,
    );
    const modelPath = path.join(repositoryRoot, "examples", model.name);
    const domainDirectories = (
      await fs.readdir(modelPath, { withFileTypes: true })
    ).filter((entry) => entry.isDirectory());
    assert(
      domainDirectories.length,
      `Empty service model directory: ${model.name}`,
    );
    for (const domain of domainDirectories) {
      assert(
        domainsById.has(domain.name),
        `Unknown examples domain: ${domain.name}`,
      );
      assert.equal(
        domainsById.get(domain.name).serviceModel,
        model.name,
        `Examples domain ${domain.name} does not belong to service model ${model.name}`,
      );
      const domainPath = path.join(modelPath, domain.name);
      const cases = (
        await fs.readdir(domainPath, { withFileTypes: true })
      ).filter((entry) => entry.isDirectory());
      assert(
        cases.length,
        `Empty domain directory: ${model.name}/${domain.name}`,
      );
      for (const item of cases) {
        const casePath = `examples/${model.name}/${domain.name}/${item.name}`;
        const manifestPath = path.join(repositoryRoot, casePath, "case.json");
        assert(
          (await fs.stat(manifestPath)).isFile(),
          `Case manifest missing: ${casePath}`,
        );
        actualPaths.push(casePath);
      }
    }
  }
  return actualPaths;
}

export async function validateRepository() {
  const serviceModels = await json("catalog/service-models.json");
  const domains = await json("catalog/domains.json");
  const catalog = await json("catalog/cases.json");
  await validateDocument(serviceModels, "schemas/service-models.schema.json");
  await validateDocument(domains, "schemas/domains.schema.json");
  await validateDocument(catalog, "schemas/catalog.schema.json");
  const { serviceModelIds, domainsById } = validateTaxonomy(
    serviceModels,
    domains,
    catalog,
  );
  for (const entry of catalog.cases) {
    const manifest = await json(`${entry.path}/case.json`);
    await validateDocument(manifest, "schemas/case.schema.json");
    validateCatalogManifest(entry, manifest);
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
  const actualPaths = await collectCasePaths(
    root,
    serviceModelIds,
    domainsById,
  );
  assert.deepEqual(
    actualPaths.sort(),
    catalog.cases.map((entry) => entry.path).sort(),
    "Unindexed case directories",
  );

  const fixtures = await json(
    "examples/saas/dam/character-material-library/data/fixtures.json",
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
    serviceModels: serviceModels.serviceModels.length,
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
