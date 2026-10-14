import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  root,
  collectCasePaths,
  validateCatalogManifest,
  validateDocument,
  validateRepository,
  validateTaxonomy,
} from "../scripts/validate.mjs";

const readJson = async (relative) =>
  JSON.parse(await fs.readFile(path.join(root, relative), "utf8"));
const serviceModels = await readJson("catalog/service-models.json");
const domains = await readJson("catalog/domains.json");
const catalog = await readJson("catalog/cases.json");
const clone = (value) => structuredClone(value);

test("分类字典包含三个服务模型，案例保持真实的三级归属", async () => {
  const result = await validateRepository();
  assert.equal(result.serviceModels, 3);
  assert.equal(result.domains, 35);
  assert.deepEqual(
    Object.fromEntries(
      serviceModels.serviceModels.map((model) => [
        model.id,
        domains.domains.filter((domain) => domain.serviceModel === model.id)
          .length,
      ]),
    ),
    { saas: 22, paas: 8, iaas: 5 },
  );
  assert(catalog.cases.every((entry) => entry.serviceModel === "saas"));
  assert(catalog.cases.some((entry) => entry.domain === "mes"));
  assert(catalog.cases.some((entry) => entry.domain === "dam"));
});

test("未知服务模型、未知领域和跨父级案例均拒绝", () => {
  const unknownDomainParent = clone(domains);
  unknownDomainParent.domains[0].serviceModel = "unknown";
  assert.throws(
    () => validateTaxonomy(serviceModels, unknownDomainParent, catalog),
    /Unknown service model/,
  );
  const unknownCaseDomain = clone(catalog);
  unknownCaseDomain.cases[0].domain = "unknown";
  assert.throws(
    () => validateTaxonomy(serviceModels, domains, unknownCaseDomain),
    /Unknown domain/,
  );
  const crossed = clone(catalog);
  crossed.cases[0].serviceModel = "paas";
  crossed.cases[0].path = `examples/paas/${crossed.cases[0].domain}/${crossed.cases[0].id}`;
  assert.throws(
    () => validateTaxonomy(serviceModels, domains, crossed),
    /does not belong/,
  );
});

test("模型、领域、案例ID重复均拒绝", () => {
  const duplicateModels = clone(serviceModels);
  duplicateModels.serviceModels.push(duplicateModels.serviceModels[0]);
  assert.throws(
    () => validateTaxonomy(duplicateModels, domains, catalog),
    /Duplicate service model/,
  );
  const duplicateDomains = clone(domains);
  duplicateDomains.domains.push(duplicateDomains.domains[0]);
  assert.throws(
    () => validateTaxonomy(serviceModels, duplicateDomains, catalog),
    /Duplicate domain/,
  );
  const duplicateCases = clone(catalog);
  duplicateCases.cases.push(duplicateCases.cases[0]);
  assert.throws(
    () => validateTaxonomy(serviceModels, domains, duplicateCases),
    /Duplicate case/,
  );
});

test("目录路径必须同时匹配服务模型、领域和案例ID", () => {
  for (const path of [
    "examples/dam/character-material-library",
    "examples/saas/mes/character-material-library",
    "examples/saas/dam/another-case",
    "../examples/saas/dam/character-material-library",
  ]) {
    const invalid = clone(catalog);
    invalid.cases[0].path = path;
    assert.throws(
      () => validateTaxonomy(serviceModels, domains, invalid),
      /Case path/,
    );
  }
});

test("v2 schema拒绝旧版本、缺失父级和旧两级路径", async () => {
  const missingDomainParent = clone(domains);
  delete missingDomainParent.domains[0].serviceModel;
  await assert.rejects(
    validateDocument(missingDomainParent, "schemas/domains.schema.json"),
    /serviceModel/,
  );
  const oldCatalog = clone(catalog);
  oldCatalog.version = 1;
  await assert.rejects(
    validateDocument(oldCatalog, "schemas/catalog.schema.json"),
    /const/,
  );
  const oldPath = clone(catalog);
  oldPath.cases[0].path = "examples/dam/character-material-library";
  await assert.rejects(
    validateDocument(oldPath, "schemas/catalog.schema.json"),
    /pattern/,
  );
  const manifest = await readJson(`${catalog.cases[0].path}/case.json`);
  delete manifest.serviceModel;
  await assert.rejects(
    validateDocument(manifest, "schemas/case.schema.json"),
    /serviceModel/,
  );
});

test("manifest的服务模型与目录条目必须一致", async () => {
  const entry = catalog.cases[0],
    manifest = await readJson(`${entry.path}/case.json`);
  validateCatalogManifest(entry, manifest);
  assert.throws(
    () => validateCatalogManifest(entry, { ...manifest, serviceModel: "iaas" }),
    /Catalog drift.*serviceModel/,
  );
});

async function temporaryRepository(t) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "workbench-taxonomy-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, "examples"));
  return directory;
}

test("真实目录不接受旧平面领域或跨父级领域", async (t) => {
  const directory = await temporaryRepository(t),
    lookup = validateTaxonomy(serviceModels, domains, catalog);
  await fs.mkdir(path.join(directory, "examples", "dam"));
  await assert.rejects(
    collectCasePaths(directory, lookup.serviceModelIds, lookup.domainsById),
    /Unknown examples service model/,
  );
  await fs.rmdir(path.join(directory, "examples", "dam"));
  await fs.mkdir(path.join(directory, "examples", "paas", "mes", "example"), {
    recursive: true,
  });
  await assert.rejects(
    collectCasePaths(directory, lookup.serviceModelIds, lookup.domainsById),
    /does not belong/,
  );
});

test("空领域与未放manifest的案例目录不能冒充已交付案例", async (t) => {
  const directory = await temporaryRepository(t),
    lookup = validateTaxonomy(serviceModels, domains, catalog);
  const domainPath = path.join(directory, "examples", "saas", "mes");
  await fs.mkdir(domainPath, { recursive: true });
  await assert.rejects(
    collectCasePaths(directory, lookup.serviceModelIds, lookup.domainsById),
    /Empty domain/,
  );
  await fs.mkdir(path.join(domainPath, "example"));
  await assert.rejects(
    collectCasePaths(directory, lookup.serviceModelIds, lookup.domainsById),
    /ENOENT/,
  );
  await fs.writeFile(path.join(domainPath, "example", "case.json"), "{}");
  assert.deepEqual(
    await collectCasePaths(
      directory,
      lookup.serviceModelIds,
      lookup.domainsById,
    ),
    ["examples/saas/mes/example"],
  );
});
