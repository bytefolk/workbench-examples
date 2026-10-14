import { Database, FileCheck2, FlaskConical, Info } from "lucide-react";
import type { ContentOrigin, Provenance } from "./data/exchange-contracts";

const originLabels: Record<ContentOrigin, string> = {
  synthetic: "合成示例",
  "user-imported": "用户提供",
  mixed: "混合来源",
};

export function SourceBadge({ source }: { source?: Provenance | null }) {
  const recognition = source?.recognition;
  return (
    <span
      className={`source-badge source-${source?.contentOrigin ?? "unknown"}`}
    >
      {source?.contentOrigin === "synthetic" || recognition?.mode === "mock" ? (
        <FlaskConical size={12} />
      ) : (
        <FileCheck2 size={12} />
      )}
      {source ? originLabels[source.contentOrigin] : "来源未标注"}
      {recognition && (
        <span>
          · {recognition.mode === "mock" ? "模拟识别" : "服务识别"}·{" "}
          {recognition.reviewStatus === "reviewed" ? "已人工核对" : "待核对"}
        </span>
      )}
    </span>
  );
}

export function DatasetSourceBar({
  label,
  source,
  storage,
  revision,
  recognitionModes,
  loading,
  issue,
}: {
  label?: string;
  source?: Provenance | null;
  storage?: "local" | "shared";
  revision?: string | number | null;
  recognitionModes?: ("mock" | "connected")[];
  loading?: boolean;
  issue?: string;
}) {
  return (
    <section className="dataset-source-bar" aria-label="当前数据来源">
      <span className="dataset-source-icon">
        <Database size={18} />
      </span>
      <div className="dataset-source-copy">
        <strong>
          {label || (loading ? "正在读取数据来源…" : "数据来源待确认")}
        </strong>
        <span>
          {storage === "shared"
            ? "工作区共享"
            : storage === "local"
              ? "本机存储"
              : "存储范围未确认"}
          {revision != null && <> · 数据版本 {revision}</>}
        </span>
      </div>
      <SourceBadge source={source} />
      {recognitionModes?.includes("mock") && (
        <span className="source-badge source-synthetic">
          <FlaskConical size={12} />
          含模拟识别记录
        </span>
      )}
      {issue && (
        <span className="source-issue">
          <Info size={14} />
          {issue}
        </span>
      )}
    </section>
  );
}
