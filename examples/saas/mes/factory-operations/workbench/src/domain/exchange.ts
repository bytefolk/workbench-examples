import Ajv from "ajv";
import packageSchema from "../../../../../../../schemas/ledger-package.schema.json";
import type { Workspace } from "../data/contracts";
import {
  ledgerTables,
  type ContentOrigin,
  type ImportCount,
  type ImportIssue,
  type LedgerPackage,
  type LedgerRow,
  type LedgerTable,
  type RecognitionDraft,
  type RecognitionInput,
} from "../data/exchange-contracts";

export const maxPackageBytes = 5 * 1024 * 1024;
export const factoryDatasetContract = {
  id: "factory-operations",
  version: 1,
} as const;
const shape = new Ajv({ allErrors: true, strict: true }).compile(packageSchema);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapePointer = (value: string) =>
  value.replace(/~/g, "~0").replace(/\//g, "~1");
const issue = (
  table: string | null,
  row: number | null,
  field: string,
  code: string,
  message: string,
): ImportIssue => ({ table, row, field, code, message });
export class LedgerValidationError extends Error {
  constructor(public readonly issues: ImportIssue[]) {
    super(issues[0]?.message || "交换包无效。");
    this.name = "LedgerValidationError";
  }
}

/** JSON.parse 会丢失重复键；先按 JSON 文法遍历，拒绝重复键和过深输入。 */
function rejectDuplicateKeys(text: string): void {
  let position = 0;
  const whitespace = () => {
    while (/\s/.test(text[position] || "x")) position++;
  };
  const string = (): string => {
    const start = position++;
    while (position < text.length) {
      if (text[position] === "\\") {
        position += 2;
        continue;
      }
      if (text[position++] === '"')
        return JSON.parse(text.slice(start, position));
    }
    throw new Error("JSON 字符串未结束。");
  };
  const value = (path: string, depth: number): void => {
    if (depth > 40)
      throw new LedgerValidationError([
        issue(null, null, path, "depth", "JSON 嵌套层级过深。"),
      ]);
    whitespace();
    const char = text[position];
    if (char === "{") {
      position++;
      whitespace();
      const keys = new Set<string>();
      if (text[position] === "}") {
        position++;
        return;
      }
      for (;;) {
        whitespace();
        if (text[position] !== '"') throw new Error("JSON 对象键格式无效。");
        const key = string();
        const nextPath = `${path}/${escapePointer(key)}`;
        if (keys.has(key))
          throw new LedgerValidationError([
            issue(
              null,
              null,
              nextPath,
              "duplicate-key",
              `JSON 对象键重复：${key}。`,
            ),
          ]);
        keys.add(key);
        whitespace();
        if (text[position++] !== ":") throw new Error("JSON 缺少冒号。");
        value(nextPath, depth + 1);
        whitespace();
        const separator = text[position++];
        if (separator === "}") return;
        if (separator !== ",") throw new Error("JSON 对象分隔符无效。");
      }
    }
    if (char === "[") {
      position++;
      whitespace();
      if (text[position] === "]") {
        position++;
        return;
      }
      let index = 0;
      for (;;) {
        value(`${path}/${index++}`, depth + 1);
        whitespace();
        const separator = text[position++];
        if (separator === "]") return;
        if (separator !== ",") throw new Error("JSON 数组分隔符无效。");
      }
    }
    if (char === '"') {
      string();
      return;
    }
    const token =
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
        text.slice(position),
      );
    if (!token) throw new Error("JSON 值格式无效。");
    position += token[0].length;
  };
  value("", 0);
  whitespace();
  if (position !== text.length) throw new Error("JSON 结尾有多余内容。");
}

function shapeIssues(value: unknown): ImportIssue[] {
  if (shape(value)) return [];
  return (shape.errors || []).slice(0, 200).map((error) => {
    const match = /^\/tables\/([^/]+)\/(\d+)/.exec(error.instancePath);
    const field =
      error.keyword === "required"
        ? `${error.instancePath}/${escapePointer(String(error.params.missingProperty))}`
        : error.instancePath;
    return issue(
      match?.[1] || null,
      match ? Number(match[2]) + 1 : null,
      field,
      `shape-${error.keyword}`,
      `交换包结构无效：${field || "/"} ${error.message || ""}`,
    );
  });
}
export function parseLedgerPackage(text: string): LedgerPackage {
  if (new TextEncoder().encode(text).length > maxPackageBytes)
    throw new LedgerValidationError([
      issue(null, null, "", "size", "整包 JSON 不能超过 5 MB。"),
    ]);
  try {
    rejectDuplicateKeys(text);
    const value: unknown = JSON.parse(text);
    const issues = shapeIssues(value);
    if (issues.length) throw new LedgerValidationError(issues);
    return value as LedgerPackage;
  } catch (error) {
    if (error instanceof LedgerValidationError) throw error;
    throw new LedgerValidationError([
      issue(
        null,
        null,
        "",
        "json",
        error instanceof Error ? error.message : "JSON 格式无效。",
      ),
    ]);
  }
}
export function aggregateOrigin(rows: LedgerRow[]): ContentOrigin {
  const origins = new Set(rows.map((row) => row.provenance.contentOrigin));
  return origins.size > 1 || origins.has("mixed")
    ? "mixed"
    : origins.has("synthetic")
      ? "synthetic"
      : "user-imported";
}
function businessRows(pack: LedgerPackage): LedgerRow[] {
  return ledgerTables
    .filter((table) => table !== "factory")
    .flatMap((table) => pack.tables[table] || []);
}
function sameSet(left: string[], right: string[]): boolean {
  return (
    new Set(left).size === left.length &&
    left.length === right.length &&
    left.every((value) => right.includes(value))
  );
}
export function validCalendarDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() > 0 &&
    date.toISOString().slice(0, 10) === value
  );
}
export function validTimestamp(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(
      value,
    ) &&
    validCalendarDate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}
function timestampMicros(value: unknown): bigint | null {
  if (!validTimestamp(value)) return null;
  const text = String(value);
  const fraction = /\.(\d+)/.exec(text)?.[1] || "";
  return (
    BigInt(Date.parse(text)) * 1000n + BigInt(fraction.padEnd(6, "0").slice(3))
  );
}
const fields: Record<LedgerTable, string[]> = {
  factory: ["name"],
  reports: [
    "kind",
    "contractNumber",
    "materialNumber",
    "station",
    "reason",
    "quantity",
    "assetIds",
    "createdBy",
    "createdAt",
    "updatedAt",
    "status",
    "version",
    "fragmentsRecovered",
  ],
  "report-events": [
    "reportId",
    "actorId",
    "action",
    "note",
    "createdAt",
    "requestId",
    "payload",
  ],
  visits: [
    "customer",
    "visitedAt",
    "summary",
    "issues",
    "nextStep",
    "followUpDate",
    "createdBy",
    "createdAt",
  ],
};

/** UUID spelling is case-insensitive; normalize identities, never business text or storage paths. */
function normalizeIdentities(source: LedgerPackage): LedgerPackage {
  const pack = structuredClone(source);
  const id = (value: unknown) =>
    typeof value === "string" && uuid.test(value) ? value.toLowerCase() : value;
  for (const rows of Object.values(pack.tables)) {
    for (const row of rows) {
      row.id = id(row.id) as string;
      for (const key of ["createdBy", "reportId", "actorId", "requestId"])
        if (key in row.data) row.data[key] = id(row.data[key]);
      if (Array.isArray(row.data.assetIds))
        row.data.assetIds = row.data.assetIds.map(id);
      if (row.provenance.recognition)
        row.provenance.recognition.sourceAssetIds =
          row.provenance.recognition.sourceAssetIds.map(
            (value) => id(value) as string,
          );
    }
  }
  for (const asset of pack.assets) asset.id = id(asset.id) as string;
  return pack;
}

/** 纯函数只构造候选快照，绝不修改当前数据；权限、actor和对象存在性仍由服务器确认。 */
export function validateLedgerImport(
  pack: LedgerPackage,
  current: LedgerPackage,
  replaceScope: LedgerTable[],
): {
  candidate: LedgerPackage | null;
  issues: ImportIssue[];
  counts: ImportCount[];
} {
  const issues = shapeIssues(pack);
  if (issues.length) return { candidate: null, issues, counts: [] };
  pack = normalizeIdentities(pack);
  current = normalizeIdentities(current);
  const error = (field: string, code: string, message: string) =>
    issues.push(issue(null, null, field, code, message));
  if (pack.packageKind !== "snapshot")
    error(
      "/packageKind",
      "template",
      "空模板不能执行导入；请按填写说明准备快照数据包。",
    );
  if (
    pack.datasetContract.id !== factoryDatasetContract.id ||
    pack.datasetContract.version !== 1
  )
    error("/datasetContract", "contract", "不支持此业务数据契约或版本。");
  if (
    !sameSet(replaceScope, Object.keys(pack.tables)) ||
    !sameSet(replaceScope, pack.exportScope?.tables || []) ||
    !replaceScope.includes("factory") ||
    replaceScope.some((table) => !ledgerTables.includes(table))
  )
    error(
      "/exportScope/tables",
      "scope",
      "替换范围须与包中表名完全一致，且必须包含工厂档案。",
    );
  if (pack.exportScope?.completeness !== "full")
    error(
      "/exportScope/completeness",
      "partial",
      "局部筛选导出不能用于整表替换。",
    );
  if (!validTimestamp(pack.metadata.exportedAt))
    error(
      "/metadata/exportedAt",
      "date",
      "导出时间必须是真实日期及带时区的时间戳。",
    );
  const factory = pack.tables.factory;
  if (
    factory?.length !== 1 ||
    factory[0].id !== current.tables.factory?.[0]?.id
  )
    error(
      "/tables/factory",
      "workspace",
      "本版只支持当前工作区恢复；其他工作区需先完成身份和资产映射。",
    );
  if (pack.metadata.contentOrigin !== aggregateOrigin(businessRows(pack)))
    error(
      "/metadata/contentOrigin",
      "origin",
      "包的来源标注与业务记录不一致。",
    );
  if (pack.assets.length > 10000)
    error("/assets", "limit", "资产清单不能超过 10000 项。");
  const assetIds = new Set<string>();
  for (const [index, asset] of pack.assets.entries()) {
    if (assetIds.has(asset.id))
      error(`/assets/${index}/id`, "duplicate-id", "资产 ID 重复。");
    assetIds.add(asset.id);
    const original = current.assets.find((item) => item.id === asset.id);
    if (
      !original ||
      ["name", "mediaType", "size", "sha256"].some(
        (key) =>
          asset[key as keyof typeof asset] !==
          original[key as keyof typeof original],
      ) ||
      asset.reference.storeId !== original?.reference.storeId ||
      asset.reference.objectId !== original?.reference.objectId
    )
      error(
        `/assets/${index}`,
        "asset-reference",
        "资产必须是当前工作区已经登记、摘要一致的文件；JSON 不迁移文件正文。",
      );
  }
  // Restoring an older snapshot must not remove or require assets uploaded later.
  // Incoming rows must declare their own dependencies; untouched rows use current assets.
  const currentAssetIds = new Set(current.assets.map((asset) => asset.id));
  const candidate = structuredClone(current);
  for (const table of replaceScope)
    if (ledgerTables.includes(table))
      candidate.tables[table] = structuredClone(pack.tables[table] || []);
  const count = (table: LedgerTable, source: LedgerPackage) =>
    source.tables[table]?.length || 0;
  const counts: ImportCount[] = replaceScope
    .filter((table) => ledgerTables.includes(table))
    .map((table) => ({
      table,
      before: count(table, current),
      incoming: count(table, pack),
      after: count(table, candidate),
      removed: (current.tables[table] || []).filter(
        (row) =>
          !pack.tables[table]?.some((incoming) => incoming.id === row.id),
      ).length,
    }));
  if (issues.length) return { candidate: null, issues, counts };
  const rowsByTable = new Map<LedgerTable, Map<string, LedgerRow>>();
  for (const table of ledgerTables) {
    const rows = candidate.tables[table] || [];
    const seen = new Map<string, LedgerRow>();
    rowsByTable.set(table, seen);
    if (rows.length > 10000)
      error(`/tables/${table}`, "limit", "每张台账最多 10000 行。");
    for (const [index, row] of rows.entries()) {
      const inputRow = replaceScope.includes(table) ? index + 1 : null;
      const rowAssetIds = inputRow === null ? currentAssetIds : assetIds;
      const add = (field: string, code: string, message: string) =>
        issues.push(
          issue(
            table,
            inputRow,
            `/tables/${table}/${index}/${field}`,
            code,
            message,
          ),
        );
      if (!uuid.test(row.id)) add("id", "uuid", "记录 ID 必须是 UUID。");
      if (seen.has(row.id))
        add("id", "duplicate-id", "同一台账中记录 ID 重复。");
      seen.set(row.id, row);
      for (const key of Object.keys(row.data))
        if (!fields[table].includes(key))
          add(
            `data/${escapePointer(key)}`,
            "unknown-field",
            "存在未定义字段，不能静默丢弃。",
          );
      for (const key of fields[table])
        if (!(key in row.data))
          add(`data/${key}`, "required", "缺少必填字段。");
      const data = row.data;
      const oldRow = current.tables[table]?.find((old) => old.id === row.id);
      if (
        table !== "factory" &&
        oldRow &&
        (oldRow.provenance.contentOrigin !== row.provenance.contentOrigin ||
          oldRow.provenance.recognition?.mode !==
            row.provenance.recognition?.mode ||
          !sameSet(
            oldRow.provenance.recognition?.sourceAssetIds || [],
            row.provenance.recognition?.sourceAssetIds || [],
          ))
      )
        add(
          "provenance",
          "provenance-change",
          "已有记录的来源不可通过导入改写；模拟识别来源必须保留。",
        );
      const text = (key: string, max: number, empty = false) => {
        if (
          typeof data[key] !== "string" ||
          (!empty && !(data[key] as string).trim()) ||
          (data[key] as string).length > max
        )
          add(
            `data/${key}`,
            "text",
            `文本${empty ? "" : "不能为空且"}不能超过 ${max} 字。`,
          );
      };
      const id = (key: string) => {
        if (typeof data[key] !== "string" || !uuid.test(data[key] as string))
          add(`data/${key}`, "uuid", "必须是 UUID。");
      };
      const timestamp = (key: string) => {
        if (!validTimestamp(data[key]))
          add(`data/${key}`, "date", "须填写真实日期和带时区的时间戳。");
      };
      const recognition = row.provenance.recognition;
      if (recognition) {
        if (recognition.reviewStatus !== "reviewed")
          add(
            "provenance/recognition/reviewStatus",
            "unreviewed",
            "识别草稿必须先完成人工核对。",
          );
        if (
          recognition.mode === "mock" &&
          row.provenance.contentOrigin !== "synthetic"
        )
          add(
            "provenance/contentOrigin",
            "mock-origin",
            "模拟识别始终属于合成数据。",
          );
        if (
          new Set(recognition.sourceAssetIds).size !==
            recognition.sourceAssetIds.length ||
          recognition.sourceAssetIds.some(
            (assetId) => !rowAssetIds.has(assetId),
          )
        )
          add(
            "provenance/recognition/sourceAssetIds",
            "reference",
            "识别原图须属于当前工作区，传入记录的原图须在包的资产清单中声明。",
          );
      }
      if (table === "factory") {
        text("name", 120);
        continue;
      }
      timestamp("createdAt");
      if (table === "reports") {
        id("createdBy");
        timestamp("updatedAt");
        ["contractNumber", "materialNumber", "station"].forEach((key) =>
          text(key, 120),
        );
        text("reason", 2000);
        if (!["broken_needle", "consumable"].includes(String(data.kind)))
          add("data/kind", "enum", "申领类型无效。");
        if (
          ![
            "submitted",
            "approved",
            "delivering",
            "completed",
            "rejected",
          ].includes(String(data.status))
        )
          add("data/status", "enum", "申领状态无效。");
        if (
          !Number.isInteger(data.quantity) ||
          Number(data.quantity) < 1 ||
          Number(data.quantity) > 100000
        )
          add(
            "data/quantity",
            "number",
            "数量须为 1 至 100000 的整数，不能使用文本或默认值替代。",
          );
        if (
          !Number.isInteger(data.version) ||
          Number(data.version) < 1 ||
          Number(data.version) > 2147483647
        )
          add("data/version", "number", "版本须为正整数。");
        if (typeof data.fragmentsRecovered !== "boolean")
          add("data/fragmentsRecovered", "boolean", "回收状态须为布尔值。");
        if (
          !Array.isArray(data.assetIds) ||
          data.assetIds.length > 10 ||
          new Set(data.assetIds).size !== data.assetIds.length ||
          data.assetIds.some(
            (assetId) =>
              typeof assetId !== "string" || !rowAssetIds.has(assetId),
          )
        )
          add(
            "data/assetIds",
            "reference",
            "附件最多 10 个，不得重复且必须属于当前工作区；传入记录的附件须在包的资产清单中声明。",
          );
        if (
          data.kind === "broken_needle" &&
          !candidate.assets.some(
            (asset) =>
              Array.isArray(data.assetIds) &&
              data.assetIds.includes(asset.id) &&
              ["image/jpeg", "image/png", "image/webp"].includes(
                asset.mediaType,
              ),
          )
        )
          add("data/assetIds", "photo", "断针记录至少需要一份可用的图片资产。");
      } else if (table === "visits") {
        id("createdBy");
        timestamp("visitedAt");
        text("customer", 200);
        text("summary", 5000);
        text("issues", 5000, true);
        text("nextStep", 2000);
        if (data.followUpDate !== null && !validCalendarDate(data.followUpDate))
          add("data/followUpDate", "date", "跟进日期无效。");
      } else {
        id("reportId");
        id("actorId");
        text("note", 2000, data.action === "submitted");
        if (
          ![
            "submitted",
            "approved",
            "delivering",
            "completed",
            "rejected",
            "recovery",
          ].includes(String(data.action))
        )
          add("data/action", "enum", "流程事件类型无效。");
        if (data.action === "submitted") {
          if (data.requestId !== null || data.payload !== null)
            add("data/payload", "event", "提交起点不得携带后续操作请求。");
        } else {
          id("requestId");
          const payload = data.payload as Record<string, unknown> | null;
          if (
            !payload ||
            typeof payload !== "object" ||
            Array.isArray(payload) ||
            !sameSet(Object.keys(payload), ["version", "action", "note"]) ||
            !Number.isInteger(payload.version) ||
            Number(payload.version) < 1 ||
            payload.action !== data.action ||
            typeof payload.note !== "string" ||
            payload.note.trim() !== data.note
          )
            add(
              "data/payload",
              "event",
              "事件请求需保留匹配的版本、动作与说明。",
            );
        }
      }
    }
  }
  if (issues.length) return { candidate: null, issues, counts };
  const reports = rowsByTable.get("reports")!;
  const events = candidate.tables["report-events"] || [];
  const seenRequests = new Set<string>();
  for (const [index, row] of events.entries()) {
    const data = row.data;
    if (!reports.has(String(data.reportId)))
      issues.push(
        issue(
          "report-events",
          replaceScope.includes("report-events") ? index + 1 : null,
          `/tables/report-events/${index}/data/reportId`,
          "reference",
          "流程事件引用的申领在替换后的数据中不存在。",
        ),
      );
    if (data.requestId) {
      const key = `${data.reportId}/${data.requestId}`;
      if (seenRequests.has(key))
        issues.push(
          issue(
            "report-events",
            index + 1,
            `/tables/report-events/${index}/data/requestId`,
            "duplicate-request",
            "同一申领的请求编号重复。",
          ),
        );
      seenRequests.add(key);
    }
  }
  for (const [index, report] of (candidate.tables.reports || []).entries()) {
    const chain = events
      .filter((row) => row.data.reportId === report.id)
      .sort(
        (a, b) =>
          Number((a.data.payload as { version: number } | null)?.version || 0) -
          Number((b.data.payload as { version: number } | null)?.version || 0),
      );
    let status = "submitted",
      recovered = false,
      invalid = chain.length !== report.data.version;
    if (
      chain[0]?.data.action !== "submitted" ||
      timestampMicros(chain[0]?.data.createdAt) !==
        timestampMicros(report.data.createdAt)
    )
      invalid = true;
    for (let sequence = 1; sequence < chain.length; sequence++) {
      const event = chain[sequence].data;
      if (
        (event.payload as { version: number } | null)?.version !== sequence ||
        timestampMicros(event.createdAt)! <
          timestampMicros(chain[sequence - 1].data.createdAt)!
      )
        invalid = true;
      if (event.action === "recovery") {
        if (
          report.data.kind !== "broken_needle" ||
          recovered ||
          !["submitted", "approved", "delivering"].includes(status)
        )
          invalid = true;
        recovered = true;
      } else {
        const allowed: Record<string, string[]> = {
          submitted: ["approved", "rejected"],
          approved: ["delivering"],
          delivering: ["completed"],
        };
        if (!allowed[status]?.includes(String(event.action))) invalid = true;
        if (
          event.action === "completed" &&
          report.data.kind === "broken_needle" &&
          !recovered
        )
          invalid = true;
        status = String(event.action);
      }
    }
    if (
      status !== report.data.status ||
      recovered !== report.data.fragmentsRecovered ||
      timestampMicros(chain.at(-1)?.data.createdAt) !==
        timestampMicros(report.data.updatedAt)
    )
      invalid = true;
    if (invalid)
      issues.push(
        issue(
          "reports",
          replaceScope.includes("reports") ? index + 1 : null,
          `/tables/reports/${index}/data/status`,
          "history",
          "流程历史不能完整回放为该申领的状态、版本、回收事实和时间；禁止跳过审批或回收。",
        ),
      );
  }
  candidate.metadata.contentOrigin = aggregateOrigin(businessRows(candidate));
  return { candidate: issues.length ? null : candidate, issues, counts };
}

export function createLedgerTemplate(workspace: Workspace): LedgerPackage {
  return {
    schemaVersion: 1,
    packageKind: "template",
    packageId: "empty-template",
    datasetContract: factoryDatasetContract,
    dataRevision: null,
    metadata: {
      contentOrigin: "user-imported",
      storage: "shared",
      label: workspace.name,
    },
    exportScope: null,
    tables: {},
    assets: [],
  };
}

/** 模拟器不读取照片内容，不使用文件名生成事实。固定草稿必须人工修改及核对。 */
export function createMockRecognitionDraft(
  input: RecognitionInput,
): RecognitionDraft {
  if (!input.asset.mediaType.startsWith("image/") || !input.asset.sha256)
    throw new Error("请选择已经上传并登记摘要的图片资产。");
  if (
    input.asset.workspaceId !== input.workspace.id ||
    input.snapshot.tables.factory?.[0]?.id !== input.workspace.id ||
    !input.snapshot.assets.some((asset) => asset.id === input.asset.id)
  )
    throw new Error("照片和快照必须来自当前工作区。");
  const pack = structuredClone(input.snapshot),
    rowId = crypto.randomUUID(),
    now = new Date().toISOString();
  const provenance = {
    contentOrigin: "synthetic" as const,
    recognition: {
      mode: "mock" as const,
      reviewStatus: "unreviewed" as const,
      sourceAssetIds: [input.asset.id],
    },
  };
  let data: Record<string, unknown>;
  if (input.ledgerType === "reports") {
    data = {
      kind: "consumable",
      contractNumber: "待核对合同",
      materialNumber: "待核对物料",
      station: "待核对工位",
      reason: "模拟识别示例，请按原图逐项修改",
      quantity: 1,
      assetIds: [input.asset.id],
      createdBy: input.user.id,
      createdAt: now,
      updatedAt: now,
      status: "submitted",
      version: 1,
      fragmentsRecovered: false,
    };
    pack.tables["report-events"]!.push({
      id: crypto.randomUUID(),
      data: {
        reportId: rowId,
        actorId: input.user.id,
        action: "submitted",
        note: "模拟识别草稿经人工核对后导入",
        createdAt: now,
        requestId: null,
        payload: null,
      },
      provenance: structuredClone(provenance),
    });
  } else {
    data = {
      customer: "待核对客户",
      visitedAt: now,
      summary: "模拟识别示例，请按原图逐项修改",
      issues: "",
      nextStep: "待核对跟进事项",
      followUpDate: null,
      createdBy: input.user.id,
      createdAt: now,
    };
  }
  pack.tables[input.ledgerType]!.push({ id: rowId, data, provenance });
  pack.packageId = crypto.randomUUID();
  pack.metadata.exportedAt = now;
  pack.metadata.contentOrigin = aggregateOrigin(businessRows(pack));
  return {
    draftId: crypto.randomUUID(),
    mode: "mock",
    sourceAssetId: input.asset.id,
    ledgerType: input.ledgerType,
    rowIds: [rowId],
    package: pack,
    warnings: [
      "模拟识别，不分析照片内容。所有草稿字段必须对照原图人工核对。",
      "确认后仍保留合成数据与模拟识别来源；不会自动批准、完成或确认回收。",
    ],
  };
}
export function markDraftReviewed(draft: RecognitionDraft): LedgerPackage {
  const pack = structuredClone(draft.package);
  for (const table of ledgerTables)
    for (const row of pack.tables[table] || []) {
      const belongs =
        draft.rowIds.includes(row.id) ||
        (table === "report-events" &&
          draft.rowIds.includes(String(row.data.reportId)));
      if (!belongs) continue;
      if (
        !row.provenance.recognition ||
        row.provenance.recognition.mode !== "mock"
      )
        throw new Error("识别来源已变更，请重新生成草稿。");
      row.provenance.recognition.reviewStatus = "reviewed";
      row.provenance.contentOrigin = "synthetic";
    }
  pack.metadata.contentOrigin = aggregateOrigin(businessRows(pack));
  return pack;
}
