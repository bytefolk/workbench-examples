import { useState } from "react";
import { Check, Search, X } from "lucide-react";
import type { MatchResult } from "../api";
import type { Asset, AssetKind } from "../types";
import { kindLabels } from "../types";
import { AssetImage } from "./UI";

interface Props {
  result: MatchResult;
  assets: Asset[];
  onApply: (selection: Partial<Record<AssetKind, string>>) => void;
  onClose: () => void;
}

export function MatchPanel({ result, assets, onApply, onClose }: Props) {
  const [selection, setSelection] = useState<
    Partial<Record<AssetKind, string>>
  >(() =>
    Object.fromEntries(
      result.groups
        .filter(
          (group) => !group.needsConfirmation && group.candidates.length === 1,
        )
        .map((group) => [group.kind, group.candidates[0].id]),
    ),
  );
  const [applied, setApplied] = useState(false);
  const intentLabels: Record<string, string> = {
    character: "人物",
    product: "商品",
    scene: "场景",
    action: "动作",
    mood: "情绪",
  };
  return (
    <section className="match-panel" aria-label="资产推荐与确认">
      <div className="integration-heading">
        <div>
          <Search size={16} />
          <strong>资产推荐，等待你确认</strong>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="关闭资产推荐"
        >
          <X size={17} />
        </button>
      </div>
      <p className="helper match-source">
        {result.method === "qwen"
          ? "来源：Qwen 解析需求 + 资产候选检索"
          : "来源：本地规则检索（名称、编号和标签，未调用 AI）"}
        。推荐不会自动覆盖当前资产。
      </p>
      <dl className="match-intent">
        {Object.entries(result.intent)
          .filter(([, value]) => value)
          .map(([key, value]) => (
            <div key={key}>
              <dt>{intentLabels[key] || key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      <div className="match-groups">
        {result.groups.map((group) => (
          <fieldset className="match-group" key={group.kind}>
            <legend>
              {kindLabels[group.kind]}
              {group.needsConfirmation && (
                <small>
                  {group.candidates.length > 1 ? "多候选 · 请确认" : "请确认"}
                </small>
              )}
            </legend>
            {group.candidates.length ? (
              group.candidates.map((candidate) => {
                const asset = assets.find((item) => item.id === candidate.id);
                if (!asset) return null;
                return (
                  <label
                    className={`match-candidate ${selection[group.kind] === asset.id ? "selected" : ""}`}
                    key={asset.id}
                  >
                    <input
                      type="radio"
                      name={`match-${group.kind}`}
                      checked={selection[group.kind] === asset.id}
                      onChange={() => {
                        setSelection((current) => ({
                          ...current,
                          [group.kind]: asset.id,
                        }));
                        setApplied(false);
                      }}
                    />
                    <AssetImage asset={asset} />
                    <span>
                      <strong>{asset.name}</strong>
                      <small>
                        {asset.code} · 更新 {asset.updated}
                        <br />
                        {candidate.reason}
                      </small>
                    </span>
                  </label>
                );
              })
            ) : (
              <p className="helper">
                未找到明确候选。保留当前选择，也可以在下方手动指定。
              </p>
            )}
            {group.candidates.length > 0 && (
              <label className="match-keep">
                <input
                  type="radio"
                  name={`match-${group.kind}`}
                  checked={!selection[group.kind]}
                  onChange={() => {
                    setSelection((current) => ({
                      ...current,
                      [group.kind]: undefined,
                    }));
                    setApplied(false);
                  }}
                />
                保留当前选择
              </label>
            )}
          </fieldset>
        ))}
      </div>
      {result.warnings.length > 0 && (
        <ul className="match-warnings">
          {result.warnings.map((warning, index) => (
            <li key={`${warning}-${index}`}>{warning}</li>
          ))}
        </ul>
      )}
      <div className="integration-actions">
        <span className="helper">
          {applied
            ? "已应用所选候选，可继续手动调整。"
            : "确认人物与商品，避免同名素材被误用。"}
        </span>
        <button
          className="button secondary compact"
          disabled={!Object.values(selection).some(Boolean)}
          onClick={() => {
            onApply(selection);
            setApplied(true);
          }}
        >
          <Check size={15} />
          应用所选资产
        </button>
      </div>
    </section>
  );
}
