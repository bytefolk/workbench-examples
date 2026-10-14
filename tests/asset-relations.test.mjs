import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  root,
  validateAssetRelations,
  validateCatalogManifest,
  validateDocument,
  validateEvidence,
} from "../scripts/validate.mjs";

function fixture() {
  const blueprint = (id, domain) => ({
    id,
    serviceModel: "saas",
    domain,
    title: id,
    summary: "参考设计",
    roles: ["主管"],
    entities: ["业务记录"],
    workflow: ["提交", "处理"],
    pages: ["记录列表"],
    extensionPoints: ["审批策略"],
  });
  return {
    serviceModels: {
      version: 1,
      serviceModels: [{ id: "saas" }, { id: "paas" }, { id: "iaas" }],
    },
    groups: {
      version: 1,
      groups: [
        {
          id: "operations",
          serviceModel: "saas",
          title: "运营",
          summary: "运营应用",
        },
        {
          id: "platforms",
          serviceModel: "paas",
          title: "平台",
          summary: "开发平台",
        },
      ],
    },
    domains: {
      version: 3,
      domains: [
        { id: "mes", serviceModel: "saas", groupId: "operations" },
        { id: "dam", serviceModel: "saas", groupId: "operations" },
        { id: "dbaas", serviceModel: "paas", groupId: "platforms" },
      ],
    },
    blueprints: {
      version: 1,
      blueprints: [
        blueprint("mes-standard", "mes"),
        blueprint("dam-standard", "dam"),
      ],
    },
    variants: {
      version: 1,
      variants: [
        {
          id: "garment",
          blueprintId: "mes-standard",
          title: "车间",
          summary: "现场协作",
          industries: ["服装"],
          adaptations: ["断针回收"],
        },
        {
          id: "media",
          blueprintId: "dam-standard",
          title: "内容生产",
          summary: "内容协作",
          industries: ["内容"],
          adaptations: ["授权记录"],
        },
      ],
    },
    catalog: {
      version: 3,
      cases: [
        {
          id: "example",
          title: "示例",
          summary: "参考实现",
          serviceModel: "saas",
          domain: "mes",
          path: "examples/saas/mes/example",
          caseKind: "reference-implementation",
          blueprintId: "mes-standard",
          variantId: "garment",
          status: "prototype",
          tags: [],
        },
      ],
    },
  };
}

test("主干和变体可独立存在，不要求实施目录或案例", () => {
  const data = fixture();
  data.catalog.cases = [];
  const result = validateAssetRelations(data);
  assert.equal(result.blueprintsById.size, 2);
  assert.equal(result.variantsById.size, 2);
});

test("分类族、主干、变体的重复ID被拒绝", () => {
  for (const [collection, field, expected] of [
    ["groups", "groups", /Duplicate domain group/],
    ["blueprints", "blueprints", /Duplicate blueprint/],
    ["variants", "variants", /Duplicate variant/],
  ]) {
    const data = fixture();
    data[collection][field].push(data[collection][field][0]);
    assert.throws(() => validateAssetRelations(data), expected);
  }
});

test("孤儿分类族、主干、变体和案例引用被拒绝", () => {
  const changes = [
    [
      (data) => {
        data.domains.domains[0].groupId = "missing";
      },
      /Unknown group/,
    ],
    [
      (data) => {
        data.groups.groups[0].serviceModel = "missing";
      },
      /Unknown service model for group/,
    ],
    [
      (data) => {
        data.blueprints.blueprints[0].domain = "missing";
      },
      /Unknown domain for blueprint/,
    ],
    [
      (data) => {
        data.variants.variants[0].blueprintId = "missing";
      },
      /Unknown blueprint for variant/,
    ],
    [
      (data) => {
        data.catalog.cases[0].blueprintId = "missing";
      },
      /Unknown blueprint for case/,
    ],
    [
      (data) => {
        data.catalog.cases[0].variantId = "missing";
      },
      /Unknown variant for case/,
    ],
  ];
  for (const [change, expected] of changes) {
    const data = fixture();
    change(data);
    assert.throws(() => validateAssetRelations(data), expected);
  }
});

test("跨服务模型、跨领域及主干变体不匹配被拒绝", () => {
  const changes = [
    (data) => {
      data.domains.domains[0].groupId = "platforms";
    },
    (data) => {
      data.blueprints.blueprints[0].serviceModel = "paas";
    },
    (data) => {
      data.catalog.cases[0].blueprintId = "dam-standard";
    },
    (data) => {
      data.catalog.cases[0].variantId = "media";
    },
  ];
  for (const change of changes) {
    const data = fixture();
    change(data);
    assert.throws(() => validateAssetRelations(data), /does not belong/);
  }
});

test("目录与manifest的类型和复用关系必须一致", () => {
  const entry = fixture().catalog.cases[0];
  for (const [field, value] of [
    ["caseKind", "project-case"],
    ["blueprintId", "dam-standard"],
    ["variantId", "media"],
  ]) {
    assert.throws(
      () => validateCatalogManifest(entry, { ...entry, [field]: value }),
      new RegExp(`Catalog drift.*${field}`),
    );
  }
});

test("新资产schema要求完整主干说明和适配点", async () => {
  const data = fixture();
  await validateDocument(data.groups, "schemas/domain-groups.schema.json");
  await validateDocument(data.blueprints, "schemas/blueprints.schema.json");
  await validateDocument(data.variants, "schemas/variants.schema.json");
  delete data.blueprints.blueprints[0].extensionPoints;
  await assert.rejects(
    validateDocument(data.blueprints, "schemas/blueprints.schema.json"),
    /extensionPoints/,
  );
  data.variants.variants[0].adaptations = [];
  await assert.rejects(
    validateDocument(data.variants, "schemas/variants.schema.json"),
    /minItems/,
  );
});

test("project-case必须有证据，但不要求客户已验收", async () => {
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(root, "examples/saas/dam/character-material-library/case.json"),
      "utf8",
    ),
  );
  manifest.caseKind = "project-case";
  manifest.evidence = [];
  await assert.rejects(
    validateDocument(manifest, "schemas/case.schema.json"),
    /minItems/,
  );
  manifest.evidence = [{ title: "脱敏联调记录", path: "evidence/project.md" }];
  assert.equal(manifest.source.customerConfirmed, false);
  await validateDocument(manifest, "schemas/case.schema.json");
});

async function evidenceDirectory(t) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "workbench-evidence-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const base = path.join(directory, "case");
  await fs.mkdir(path.join(base, "evidence"), { recursive: true });
  return { base, directory };
}

test("证据必须存在、非空且不是模板；参考实现可不附证据", async (t) => {
  const { base } = await evidenceDirectory(t);
  await validateEvidence(
    { caseKind: "reference-implementation", evidence: [] },
    base,
  );
  await assert.rejects(
    validateEvidence({ caseKind: "project-case", evidence: [] }, base),
    /requires actual project evidence/,
  );
  const manifest = {
    caseKind: "project-case",
    evidence: [{ title: "联调记录", path: "evidence/project.md" }],
  };
  await assert.rejects(validateEvidence(manifest, base), /ENOENT/);
  await fs.writeFile(path.join(base, "evidence/project.md"), "");
  await assert.rejects(validateEvidence(manifest, base), /nonempty file/);
  await fs.writeFile(
    path.join(base, "evidence/project.md"),
    "REPLACE_PROJECT_EVIDENCE",
  );
  await assert.rejects(validateEvidence(manifest, base), /Unfilled evidence/);
  await fs.writeFile(
    path.join(base, "evidence/project.md"),
    "测试夹具：实际收录需人工核验脱敏联调记录的来源和结果。",
  );
  await validateEvidence(manifest, base);
  manifest.evidence.push(manifest.evidence[0]);
  await assert.rejects(
    validateEvidence(manifest, base),
    /Duplicate evidence paths/,
  );
});

test("证据不能引用案例外文件或目录", async (t) => {
  const { base, directory } = await evidenceDirectory(t);
  await fs.writeFile(path.join(directory, "outside.md"), "外部文件");
  await assert.rejects(
    validateEvidence(
      {
        caseKind: "project-case",
        evidence: [{ title: "错误引用", path: "../outside.md" }],
      },
      base,
    ),
    /escapes case/,
  );
  await assert.rejects(
    validateEvidence(
      {
        caseKind: "project-case",
        evidence: [{ title: "错误引用", path: "evidence" }],
      },
      base,
    ),
    /nonempty file/,
  );
});
