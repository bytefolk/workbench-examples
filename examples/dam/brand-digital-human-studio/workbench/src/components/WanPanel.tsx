import { useEffect, useState } from "react";
import { Settings2, RefreshCw, Save, Trash2 } from "lucide-react";
import { api, type WanConfig } from "../api";
import type { Asset, Draft } from "../types";
import { Modal } from "./UI";
import {
  WAN_MODELS,
  wanModel,
  normalizeWanDraft,
  wanEstimate,
} from "../../shared/wan-models.mjs";

export function WanPanel({
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
  const [config, setConfig] = useState<WanConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    setError("");
    setBusy(true);
    try {
      setConfig(await api<WanConfig>("/api/wan/config"));
    } catch (e) {
      setConfig(null);
      setError(e instanceof Error ? e.message : "本地配置查询失败。");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const frame = assets.find(
    (a) =>
      a.id === (draft.wanFrameAssetId || draft.characterId) &&
      a.kind !== "voice",
  );
  const model = wanModel(draft.modelId || "");
  const resolution = draft.resolution || "720p";
  const wanDraft = { ...draft, modelId: draft.modelId || "", resolution };
  const shotType = draft.wanShotType || "single";
  const audioValid =
    !!model &&
    (model.audioMode === "toggle" ||
      (model.audioMode === "always" && draft.generateAudio === true) ||
      (model.audioMode === "none" && draft.generateAudio !== true));
  const ready =
    !!config?.configured &&
    !!config.enabled &&
    !!frame &&
    !!model &&
    model.durations.includes(draft.duration) &&
    model.resolutions.includes(resolution) &&
    audioValid &&
    (shotType === "single" || (shotType === "multi" && model.multiShot));
  useEffect(() => {
    onReady(ready);
    return () => onReady(false);
  }, [ready, onReady]);
  const estimate = wanEstimate(wanDraft);
  return (
    <div className="wan-panel" aria-label="阿里云万相配置与参数">
      <div className="integration-actions">
        <span className="helper">
          {busy
            ? "正在读取本机配置…"
            : config?.configured
              ? `配置已保存 · 北京地域 · ${config.enabled ? "允许手动生成" : "生成已关闭"}`
              : "尚未配置百炼 API Key"}
        </span>
        <div className="button-row">
          <button
            className="button secondary compact"
            disabled={busy}
            onClick={() => void refresh()}
            aria-label="刷新万相配置"
          >
            <RefreshCw size={15} />
          </button>
          <button
            className="button secondary compact"
            onClick={() => setOpen(true)}
          >
            <Settings2 size={15} />
            配置阿里云
          </button>
        </div>
      </div>
      <p className="helper">
        页面保存配置后立即生效，不用修改代码或重启。保存只检查格式，不调用生成接口，也不能证明密钥、免费额度或模型权限有效。
      </p>
      <div className="field-grid">
        <label className="field">
          首帧参考图
          <select
            value={frame?.id || ""}
            onChange={(e) => onChange({ wanFrameAssetId: e.target.value })}
          >
            <option value="">请选择实际提交的首帧图片</option>
            {assets
              .filter((a) => a.kind !== "voice")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          视频模型
          <select
            aria-label="万相视频模型"
            value={draft.modelId || ""}
            onChange={(e) =>
              onChange(normalizeWanDraft(wanDraft, e.target.value))
            }
          >
            {!model && (
              <option value={draft.modelId || ""}>请选择支持的模型</option>
            )}
            {WAN_MODELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          万相目标时长
          <select
            value={draft.duration}
            disabled={!model}
            onChange={(e) => onChange({ duration: Number(e.target.value) })}
          >
            {!model?.durations.includes(draft.duration) && (
              <option value={draft.duration}>请选择该模型支持的时长</option>
            )}
            {model?.durations.map((n) => (
              <option key={n} value={n}>
                {n} 秒
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          万相分辨率
          <select
            value={resolution}
            disabled={!model}
            onChange={(e) =>
              onChange({ resolution: e.target.value as Draft["resolution"] })
            }
          >
            {!model?.resolutions.includes(resolution) && (
              <option value={resolution}>请选择该模型支持的分辨率</option>
            )}
            {model?.resolutions.map((item) => (
              <option key={item} value={item}>
                {item.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        {model?.multiShot ? (
          <label className="field">
            万相镜头方式
            <select
              value={shotType}
              onChange={(e) =>
                onChange({
                  wanShotType: e.target.value as Draft["wanShotType"],
                })
              }
            >
              <option value="single">连续单镜头</option>
              <option value="multi">模型自动多镜头</option>
            </select>
          </label>
        ) : (
          <div className="field">
            <span>万相镜头方式</span>
            <div className="static-input">连续单镜头</div>
          </div>
        )}
        <div className="field">
          <span>万相声音</span>
          {model?.audioMode === "toggle" ? (
            <label className="integration-check">
              <input
                type="checkbox"
                checked={draft.generateAudio ?? false}
                onChange={(e) => onChange({ generateAudio: e.target.checked })}
              />
              生成模型原生音频
            </label>
          ) : (
            <div className="static-input">
              {model?.audioMode === "always"
                ? "模型原生有声 · 不等于克隆人物声线"
                : "无声视频"}
            </div>
          )}
        </div>
      </div>
      {model && (
        <p className="helper">
          {model.description} 输入需求、情绪和分镜拼接后合计不超过{" "}
          {model.promptLimit}
          字符。是否支持当前模型以你的账号权限为准，目前未验证。
        </p>
      )}
      {frame && (
        <div className="wan-frame">
          <img src={frame.image} alt="万相实际首帧参考图" />
          <div>
            <strong>实际提交：{frame.name}</strong>
            <p>
              本接口只发送这一张图片。请使用人物已经戴着帽子的画面；独立商品图、场景图和声音档案仅保留创作记录，不会作为额外参考传入。
            </p>
          </div>
        </div>
      )}
      <p className="helper">
        画面比例随首帧确定，请上传所需横竖比例图片；不会按草稿的横竖屏按钮裁剪。图片宽高需
        240–8000 像素，PNG 不得含透明通道。
      </p>
      <div className="integration-warning">
        {estimate === null
          ? "当前参数暂无可用费用预估，请以平台账单为准。"
          : `按北京地域官方原价预估 ¥${estimate.toFixed(2)} / 条，实际以账单和账号剩余免费额度为准。`}
        点击提交才生成；切换模型和保存配置不会扣生成费用。原生音频不等于品牌声线克隆。
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {open && (
        <WanSettings
          config={config}
          onClose={() => setOpen(false)}
          onSaved={(c) => {
            setConfig(c);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
export function WanSettings({
  config,
  onClose,
  onSaved,
}: {
  config: WanConfig | null;
  onClose: () => void;
  onSaved: (c: WanConfig) => void;
}) {
  const [key, setKey] = useState("");
  const [workspace, setWorkspace] = useState(config?.workspaceId || "");
  const [enabled, setEnabled] = useState(
    config?.configured ? config.enabled : true,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(clear = false) {
    setBusy(true);
    setError("");
    try {
      const c = await api<WanConfig>(
        clear ? "/api/wan/config/clear" : "/api/wan/config",
        clear
          ? {}
          : {
              ...(key.trim() ? { apiKey: key.trim() } : {}),
              workspaceId: workspace.trim(),
              enabled,
            },
      );
      setKey("");
      onSaved(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "配置保存失败。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="配置阿里云万相"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="helper">
          使用阿里云百炼北京地域的通用 API
          Key，供视频、声音复刻和语音合成使用。不会购买会员或自动充值。
        </p>
        <label className="field">
          百炼 API Key
          <input
            type="password"
            autoComplete="new-password"
            value={key}
            maxLength={512}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              config?.configured
                ? "已配置；留空保留，输入新 Key 替换"
                : "粘贴你的百炼 API Key"
            }
            required={!config?.configured}
          />
        </label>
        <label className="field">
          业务空间 ID（可选）
          <input
            value={workspace}
            maxLength={100}
            onChange={(e) => setWorkspace(e.target.value)}
            placeholder="从百炼业务空间详情复制 ID，不填完整网址"
          />
        </label>
        <p className="helper">
          填写后使用官方业务空间专属域名；留空使用仍可用的北京公共域名。
        </p>
        <label className="integration-check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          允许我在页面手动提交真实生成
        </label>
        <p className="helper">
          Key
          仅在保存时提交给本机后端，保存于项目忽略的本地文件；不写入浏览器持久存储，不回显，也不随创作配置导出。此设置属于当前浏览器会话，清除不会撤销阿里云账号中的
          Key。
        </p>
        <p className="helper">
          <a
            href="https://help.aliyun.com/zh/model-studio/get-api-key"
            target="_blank"
            rel="noreferrer"
          >
            查看官方 API Key 获取说明
          </a>
        </p>
        {error && (
          <p role="alert" className="error-message">
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
