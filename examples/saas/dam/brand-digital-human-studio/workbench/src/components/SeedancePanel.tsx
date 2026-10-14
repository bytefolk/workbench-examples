import { useEffect, useState } from "react";
import { RefreshCw, Save, Settings2, Trash2 } from "lucide-react";
import { api, type SeedanceConfig } from "../api";
import type { Asset, Draft } from "../types";
import { Modal } from "./UI";
import {
  SEEDANCE_MODELS,
  seedanceModel,
} from "../../shared/seedance-models.mjs";

function publicReference(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      host !== "localhost" &&
      !host.endsWith(".localhost") &&
      host !== "[::1]" &&
      !/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        host,
      )
    );
  } catch {
    return false;
  }
}

export function SeedancePanel({
  draft,
  assets,
  onChange,
  onReady,
}: {
  draft: Draft;
  assets: Asset[];
  onChange: (patch: Partial<Draft>) => void;
  onReady: (ready: boolean) => void;
}) {
  const [config, setConfig] = useState<SeedanceConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setConfig(await api<SeedanceConfig>("/api/seedance/config"));
    } catch (failure) {
      setConfig(null);
      setError(
        failure instanceof Error ? failure.message : "本机配置查询失败。",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const inputMode = draft.seedanceInputMode || "image";
  const referenceUrl = draft.seedanceReferenceUrl?.trim() || "";
  const frame = assets.find(
    (asset) =>
      asset.id === (draft.seedanceFrameAssetId || draft.characterId) &&
      asset.kind !== "voice",
  );
  const model = seedanceModel(draft.modelId);
  const resolution = draft.resolution || "720p";
  const urlValid = publicReference(referenceUrl);
  const ready =
    !busy &&
    !!config?.configured &&
    !!config.enabled &&
    !!model &&
    model.durations.includes(draft.duration) &&
    model.resolutions.some((item) => item === resolution) &&
    model.inputModes.includes(inputMode) &&
    (inputMode === "text" || (urlValid && (!!referenceUrl || !!frame)));
  useEffect(() => {
    onReady(ready);
    return () => onReady(false);
  }, [ready, onReady]);
  return (
    <div className="wan-panel" aria-label="Seedance 配置与参数">
      <div className="integration-actions">
        <span className="helper">
          {busy
            ? "正在读取本机配置…"
            : config?.configured
              ? `配置已保存 · ${config.enabled ? "允许手动生成" : "生成已关闭"}`
              : "尚未配置视频服务 API Key"}
        </span>
        <div className="button-row">
          <button
            className="button secondary compact"
            disabled={busy}
            onClick={() => void refresh()}
            aria-label="刷新 Seedance 配置"
          >
            <RefreshCw size={15} />
          </button>
          <button
            className="button secondary compact"
            onClick={() => setOpen(true)}
          >
            <Settings2 size={15} />
            配置 Seedance
          </button>
        </div>
      </div>
      <p className="helper">
        保存配置立即生效，不会生成视频或扣生成费用。保存只检查格式，不代表
        Key、余额或模型权限已经验证。
      </p>
      <div className="field-grid">
        <label className="field">
          Seedance 视频模型
          <select
            value={draft.modelId || ""}
            onChange={(event) => {
              const chosen = seedanceModel(event.target.value);
              if (chosen)
                onChange({
                  modelId: chosen.id,
                  duration: chosen.defaultDuration,
                  resolution: chosen.defaultResolution,
                  generateAudio: false,
                });
            }}
          >
            {!model && (
              <option value={draft.modelId || ""}>请选择支持的模型</option>
            )}
            {SEEDANCE_MODELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Seedance 输入方式
          <select
            value={inputMode}
            onChange={(event) =>
              onChange({
                seedanceInputMode: event.target
                  .value as Draft["seedanceInputMode"],
              })
            }
          >
            <option value="image">图生视频 · 首帧参考</option>
            <option value="text">文生视频 · 仅文字</option>
          </select>
        </label>
        <label className="field">
          Seedance 目标时长
          <select
            value={draft.duration}
            disabled={!model}
            onChange={(event) =>
              onChange({ duration: Number(event.target.value) })
            }
          >
            {!model?.durations.includes(draft.duration) && (
              <option value={draft.duration}>请选择支持的时长</option>
            )}
            {model?.durations.map((duration) => (
              <option key={duration} value={duration}>
                {duration} 秒
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Seedance 分辨率
          <select
            value={resolution}
            disabled={!model}
            onChange={(event) =>
              onChange({
                resolution: event.target.value as Draft["resolution"],
              })
            }
          >
            {!model?.resolutions.some((item) => item === resolution) && (
              <option value={resolution}>请选择支持的分辨率</option>
            )}
            {model?.resolutions.map((item) => (
              <option key={item} value={item}>
                {item.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        {inputMode === "image" && (
          <>
            <label className="field">
              Seedance 首帧参考图
              <select
                value={frame?.id || ""}
                disabled={!!referenceUrl}
                onChange={(event) =>
                  onChange({ seedanceFrameAssetId: event.target.value })
                }
              >
                <option value="">请选择实际提交的首帧图片</option>
                {assets
                  .filter((asset) => asset.kind !== "voice")
                  .map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              首帧 HTTPS 地址（可选，优先使用）
              <input
                type="url"
                value={draft.seedanceReferenceUrl || ""}
                maxLength={2048}
                placeholder="https://… 留空使用所选资产"
                onChange={(event) =>
                  onChange({ seedanceReferenceUrl: event.target.value })
                }
                aria-invalid={!urlValid}
              />
              <small className="helper">
                需云端可以访问的 HTTPS 图片链接；localhost、127.0.0.1
                和内网链接不能使用。请勿填写带私人访问凭证的链接。
              </small>
            </label>
          </>
        )}
      </div>
      {inputMode === "image" ? (
        referenceUrl ? (
          <p className="helper">
            实际首帧来源：你填写的 HTTPS 地址。资产库图片不会同时提交。
          </p>
        ) : (
          frame && (
            <div className="wan-frame">
              <img src={frame.image} alt="Seedance 实际首帧参考图" />
              <div>
                <strong>实际提交：{frame.name}</strong>
                <p>
                  本机后端会将所选图片转换为首帧输入。建议使用人物已经戴着帽子的图片。
                </p>
              </div>
            </div>
          )
        )
      ) : (
        <p className="helper">
          文生视频只提交需求与文字分镜，不发送人物参考图，不能据此验证同人物一致性。
        </p>
      )}
      {model && (
        <p className="helper">
          {model.description} 需求、情绪和文字分镜合计最多 {model.promptLimit}{" "}
          字符。当前 Demo 首先开放 5 秒、720P；可用性以账号模型权限为准。
        </p>
      )}
      <p className="helper">
        独立商品图、场景图及声音档案只保留创作关联，不会作为额外参考发送。此入口没有接入克隆声音或音频驱动口型；视频声音以实际返回结果为准。
      </p>
      <div className="integration-warning">
        费用以视频服务控制台与实际账单为准，目前没有可用的账号费用预估。仅点击提交才创建生成任务；失败后的再次生成可能重新计费。
      </div>
      {!urlValid && inputMode === "image" && (
        <p className="error-message" role="alert">
          请填写云端可访问的 HTTPS 图片地址，或留空使用所选资产。
        </p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {open && (
        <SeedanceSettings
          config={config}
          onClose={() => setOpen(false)}
          onSaved={(next) => {
            setConfig(next);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SeedanceSettings({
  config,
  onClose,
  onSaved,
}: {
  config: SeedanceConfig | null;
  onClose: () => void;
  onSaved: (config: SeedanceConfig) => void;
}) {
  const [key, setKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    config?.baseUrl || "https://ai.amaxsmp.com/v1",
  );
  const [enabled, setEnabled] = useState(
    config?.configured ? config.enabled : true,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(clear = false) {
    setBusy(true);
    setError("");
    try {
      const next = await api<SeedanceConfig>(
        clear ? "/api/seedance/config/clear" : "/api/seedance/config",
        clear
          ? {}
          : {
              ...(key.trim() ? { apiKey: key.trim() } : {}),
              baseUrl: baseUrl.trim(),
              enabled,
            },
      );
      setKey("");
      onSaved(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "配置保存失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="配置 Seedance 视频"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="modal-body"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <p className="helper">
          填写本次视频服务的 API Key。需你的账号已经开通 Seedance
          模型调用权限；不会自动开通、充值或提交生成。
        </p>
        <label className="field">
          接口地址（Base URL）
          <input
            type="url"
            value={baseUrl}
            maxLength={2048}
            required
            placeholder="https://你的服务地址/v1"
            autoComplete="off"
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </label>
        <p className="helper">
          可填写服务根地址或 /v1 API
          前缀，需兼容本入口的视频生成接口协议；填写网址不代表任意平台都能接入。HTTPS
          服务可用；HTTP 仅支持 localhost、127.0.0.1 或 [::1]
          本机开发。请勿填写具体生成端点、查询参数、片段或用户名密码。
        </p>
        <label className="field">
          视频服务 API Key
          <input
            type="password"
            autoComplete="new-password"
            value={key}
            maxLength={512}
            required={!config?.configured}
            placeholder={
              config?.configured
                ? "已配置；留空保留，输入新 Key 替换"
                : "粘贴你的视频服务 API Key"
            }
            onChange={(event) => setKey(event.target.value)}
          />
        </label>
        <label className="integration-check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          允许我在页面手动提交真实生成
        </label>
        <p className="helper">
          Key
          仅在保存时提交给本机后端，保存在项目忽略的本地文件；不写入浏览器持久存储，不回显，也不随创作配置导出。本地配置文件属于
          Demo 存储，需保护电脑访问权限。
        </p>
        <p className="helper">
          清除只影响当前浏览器的 Seedance 本机配置，不撤销服务账号中的
          Key，也不会清除万相和声音配置或已有成品。
        </p>
        <p className="helper">
          更换接口地址时请填写新服务的
          Key；旧任务仍绑定提交时的服务和凭证，需要恢复原配置后查询，不能自动跨服务迁移。
        </p>
        <p className="helper">
          <a
            href="https://ai.amaxsmp.com/docs/zh/02-api/video-generation/"
            target="_blank"
            rel="noreferrer"
          >
            查看视频接口说明
          </a>
        </p>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button className="button" type="submit" disabled={busy}>
            <Save size={15} />
            {busy ? "处理中…" : "保存配置"}
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={busy || !config?.configured}
            onClick={() => void save(true)}
          >
            <Trash2 size={15} />
            清除本机配置
          </button>
        </div>
      </form>
    </Modal>
  );
}
