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
const DEFAULT_BASE_URL = {
  dashscope: "https://dashscope.aliyuncs.com/api/v1",
  gateway: "https://ai.amaxsmp.com/v1",
} as const;

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
  const gateway = config?.protocol === "gateway";
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
  const durations = gateway ? [5] : model?.durations || [];
  const resolutions = gateway ? ["720p"] : model?.resolutions || [];
  const audioValid =
    !!model &&
    (model.audioMode === "toggle" ||
      (model.audioMode === "always" && draft.generateAudio === true) ||
      (model.audioMode === "none" && draft.generateAudio !== true));
  const ready =
    !busy &&
    !!config?.configured &&
    !!config.enabled &&
    !!frame &&
    !!model &&
    durations.includes(draft.duration) &&
    resolutions.includes(resolution) &&
    (gateway || audioValid) &&
    (gateway ||
      shotType === "single" ||
      (shotType === "multi" && model.multiShot));
  useEffect(() => {
    onReady(ready);
    return () => onReady(false);
  }, [ready, onReady]);
  const estimate = gateway ? null : wanEstimate(wanDraft);
  return (
    <div className="wan-panel" aria-label="阿里云万相配置与参数">
      <div className="integration-actions">
        <span className="helper">
          {busy
            ? "正在读取本机配置…"
            : config?.configured
              ? `配置已保存 · ${gateway ? "通用视频网关" : "百炼官方协议"} · ${config.enabled ? "允许手动生成" : "生成已关闭"}`
              : "尚未配置视频服务 API Key"}
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
            配置万相
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
              onChange(
                gateway
                  ? {
                      modelId: e.target.value,
                      duration: 5,
                      resolution: "720p",
                      generateAudio: false,
                      wanShotType: "single",
                    }
                  : normalizeWanDraft(wanDraft, e.target.value),
              )
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
            {!durations.includes(draft.duration) && (
              <option value={draft.duration}>请选择该模型支持的时长</option>
            )}
            {durations.map((n) => (
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
            {!resolutions.includes(resolution) && (
              <option value={resolution}>请选择该模型支持的分辨率</option>
            )}
            {resolutions.map((item) => (
              <option key={item} value={item}>
                {item.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        {!gateway && model?.multiShot ? (
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
            <div className="static-input">
              {gateway ? "单张首帧 · 不发送多镜头参数" : "连续单镜头"}
            </div>
          </div>
        )}
        <div className="field">
          <span>万相声音</span>
          {gateway ? (
            <div className="static-input">
              声音由网关模型决定 · 未接入克隆声线或口型驱动
            </div>
          ) : model?.audioMode === "toggle" ? (
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
      {gateway && (
        <p className="helper">
          当前通用视频网关只开放单图、5
          秒、720P，不发送音效开关或多镜头参数。实际模型 ID：
          {config?.gatewayModelId || draft.modelId || "请选择模型"}
          。模型是否可用及账号别名以服务控制台为准；本 Demo
          尚未验证实际账号效果。网关 Key
          不能用于声音复刻、语音合成或对口型，请恢复百炼官方协议及对应 Key
          后使用声音入口。
        </p>
      )}
      {!gateway && model && (
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
        {gateway
          ? "画面比例与声音由所选网关模型决定，不发送独立比例或音频参数。请使用符合所选模型要求的首帧图片；人物一致性、帽子细节及声音仍需人工验证。"
          : "画面比例随首帧确定，请上传所需横竖比例图片；不会按草稿的横竖屏按钮裁剪。图片宽高需 240–8000 像素，PNG 不得含透明通道。"}
      </p>
      <div className="integration-warning">
        {gateway
          ? "网关费用以服务控制台与实际账单为准，不套用阿里云官方报价。"
          : estimate === null
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
            if (c.protocol === "gateway")
              onChange({
                duration: 5,
                resolution: "720p",
                generateAudio: false,
                wanShotType: "single",
              });
            else if (gateway && model)
              onChange(normalizeWanDraft(wanDraft, model.id));
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
  const [protocol, setProtocol] = useState<WanConfig["protocol"]>(
    config?.protocol || "dashscope",
  );
  const [baseUrl, setBaseUrl] = useState(
    config?.baseUrl || DEFAULT_BASE_URL[config?.protocol || "dashscope"],
  );
  const [gatewayModelId, setGatewayModelId] = useState(
    config?.gatewayModelId || "",
  );
  const [workspace, setWorkspace] = useState(config?.workspaceId || "");
  const [enabled, setEnabled] = useState(
    config?.configured ? config.enabled : true,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const changedService =
    protocol !== (config?.protocol || "dashscope") ||
    baseUrl.trim().replace(/\/+$/, "") !==
      (
        config?.baseUrl || DEFAULT_BASE_URL[config?.protocol || "dashscope"]
      ).replace(/\/+$/, "") ||
    (protocol === "dashscope" &&
      workspace.trim() !== (config?.workspaceId || ""));
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
              protocol,
              baseUrl: baseUrl.trim(),
              gatewayModelId:
                protocol === "gateway" ? gatewayModelId.trim() : "",
              workspaceId: protocol === "dashscope" ? workspace.trim() : "",
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
          {protocol === "gateway"
            ? "使用兼容通用视频生成协议的服务地址及该服务的 Key，当前只接入单图、5 秒、720P。网关 Key 不适用于声音复刻、语音合成或对口型，需要恢复百炼官方协议配置。"
            : "使用百炼官方视频协议和对应 API Key。声音复刻、语音合成仍要求百炼官方服务与账号权限；填写其他网址不代表它兼容声音接口。"}{" "}
          不会购买会员、自动充值或自动生成。
        </p>
        <label className="field">
          对接协议
          <select
            aria-label="万相对接协议"
            value={protocol}
            onChange={(event) => {
              const next = event.target.value as WanConfig["protocol"];
              setProtocol(next);
              setBaseUrl(DEFAULT_BASE_URL[next]);
              setKey("");
            }}
          >
            <option value="dashscope">百炼官方视频协议</option>
            <option value="gateway">通用视频网关协议</option>
          </select>
        </label>
        <label className="field">
          接口地址（Base URL）
          <input
            type="url"
            value={baseUrl}
            maxLength={2048}
            required
            autoComplete="off"
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={DEFAULT_BASE_URL[protocol]}
          />
        </label>
        <p className="helper">
          {protocol === "gateway"
            ? "填写服务根地址或 /v1 API 前缀；需要兼容通用视频生成、任务查询和下载接口，不是任意平台网址都能使用。"
            : "填写兼容百炼官方协议的服务根地址或 /api/v1 API 前缀。"}{" "}
          HTTPS 服务可用；HTTP 仅限 localhost、127.0.0.1 或 [::1]
          本机开发。请勿填写具体生成端点、查询参数、片段或网址中的用户名密码。
        </p>
        <label className="field">
          视频服务 API Key
          <input
            type="password"
            autoComplete="new-password"
            value={key}
            maxLength={512}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              config?.configured && !changedService
                ? "同一服务已配置；留空保留，输入新 Key 替换"
                : "粘贴此服务对应的 API Key"
            }
            required={!config?.configured || changedService}
          />
        </label>
        <p className="helper">
          切换协议、实际接口地址或业务空间需要重新填写该服务的 Key；不会自动把旧
          Key 发到新服务。仅修改同一服务的启用开关或模型别名可留空保留 Key。
        </p>
        {protocol === "gateway" && (
          <label className="field">
            网关模型 ID 或别名（可选）
            <input
              value={gatewayModelId}
              maxLength={128}
              autoComplete="off"
              placeholder="留空使用创作页所选万相模型 ID"
              onChange={(event) => setGatewayModelId(event.target.value)}
            />
            <small className="helper">
              请填写万相视频模型对应的控制台 ID 或别名，并确认支持单图、5
              秒、720P。填写后会覆盖创作页模型 ID；系统只校验 ID
              格式，不能自动辨别别名对应的模型或账号权限。
            </small>
          </label>
        )}
        {protocol === "dashscope" && (
          <>
            <label className="field">
              业务空间 ID（可选）
              <input
                value={workspace}
                maxLength={100}
                onChange={(e) => {
                  const currentBase = baseUrl.trim().replace(/\/+$/, "");
                  const currentWorkspaceBase = workspace.trim()
                    ? `https://${workspace.trim()}.cn-beijing.maas.aliyuncs.com/api/v1`
                    : DEFAULT_BASE_URL.dashscope;
                  if (
                    currentBase === DEFAULT_BASE_URL.dashscope ||
                    currentBase === "https://dashscope.aliyuncs.com" ||
                    currentBase === currentWorkspaceBase
                  )
                    setBaseUrl(DEFAULT_BASE_URL.dashscope);
                  setWorkspace(e.target.value);
                }}
                placeholder="从百炼业务空间详情复制 ID，不填完整网址"
              />
            </label>
            <p className="helper">
              接口地址为百炼默认主域时，填写空间 ID
              会使用专属域名，保存后回显生效网址；清空 ID
              则使用北京公共域名。显式自定义其他网址时，以自定义网址为准，空间
              ID 不会覆盖它。修改空间仍需要重新填写 Key。
            </p>
          </>
        )}
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
          仅在保存时提交给本机后端，保存于项目忽略的本地文件；不写入浏览器持久存储，不回显，也不随创作配置导出。清除不会撤销服务账号中的
          Key，也不会删除已有成品。网关配置不提供品牌克隆声音或口型驱动。
        </p>
        <p className="helper">
          <a
            href={
              protocol === "gateway"
                ? "https://ai.amaxsmp.com/docs/zh/02-api/video-generation/"
                : "https://help.aliyun.com/zh/model-studio/get-api-key"
            }
            target="_blank"
            rel="noreferrer"
          >
            {protocol === "gateway"
              ? "查看视频接口说明"
              : "查看官方 API Key 获取说明"}
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
