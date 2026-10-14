import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, type XyqStatus, type XyqModel } from "../api";
import type { Draft } from "../types";
export function XyqPanel({
  draft,
  onChange,
  onReady,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onReady: (ready: boolean) => void;
}) {
  const [status, setStatus] = useState<XyqStatus | null>(null);
  const [model, setModel] = useState<XyqModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const version = useRef(0);
  async function refresh() {
    setLoading(true);
    setError("");
    onReady(false);
    setModel(null);
    try {
      setStatus(await api<XyqStatus>("/api/xyq/status"));
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : "连接查询失败。");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    const current = ++version.current;
    setModel(null);
    onReady(false);
    if (
      !status?.loggedIn ||
      !draft.modelId ||
      !status.models.some((m) => m.key === draft.modelId)
    )
      return;
    api<XyqModel>(`/api/xyq/model?key=${encodeURIComponent(draft.modelId)}`)
      .then((m) => {
        if (version.current === current) setModel(m);
      })
      .catch((e) => {
        if (version.current === current) setError(e.message);
      });
    return () => {
      version.current += 1;
    };
  }, [status, draft.modelId]);
  const referenceBlocked =
    !!model?.creation_modes?.length &&
    !model.creation_modes.some(
      (m) => m.key === "reference_generation" && m.enabled !== false,
    );
  const limitBlocked =
    model?.material_limits?.image_total_limit !== undefined &&
    model.material_limits.image_total_limit < 3;
  const duration = model?.duration;
  const validDuration =
    Number.isInteger(draft.duration) &&
    draft.duration >= (duration?.min ?? 1) &&
    draft.duration <= Math.min(30, duration?.max ?? 30) &&
    (!duration?.options?.length || duration.options.includes(draft.duration)) &&
    (!duration?.step ||
      (draft.duration - (duration.min ?? 0)) % duration.step === 0);
  const validRatio =
    !model?.ratio?.options?.length || model.ratio.options.includes(draft.ratio);
  const validResolution =
    !model?.resolution?.options?.length ||
    model.resolution.options.includes(draft.xyqResolution || "");
  const ready =
    !!model &&
    !!status?.loggedIn &&
    !!status.enabled &&
    Number(status.balance) > 0 &&
    validDuration &&
    validRatio &&
    validResolution &&
    !referenceBlocked &&
    !limitBlocked &&
    model.key !== "Seedance_2.5_draft";
  useEffect(() => {
    onReady(ready);
  }, [ready, onReady]);
  return (
    <div className="xyq-panel" aria-label="小云雀连接与生成参数">
      <div className="integration-actions">
        <span className="helper">
          {loading
            ? "正在查询授权与余额…"
            : status?.loggedIn
              ? `已找到授权 · 当前个人余额 ${status.balance ?? "未知"} 积分`
              : "小云雀尚未授权"}
        </span>
        <button
          className="button secondary compact"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} />
          刷新连接与余额
        </button>
      </div>
      {!status?.loggedIn && (
        <div className="integration-warning">
          <p>
            用你自己的小云雀账号，在本机终端运行 <code>npm run xyq:login</code>
            ，在官方浏览器页面完成登录授权，再点「刷新连接与余额」。无需把密码或密钥填到页面。
          </p>
          {status && !status.installed && (
            <p>
              首次安装：<code>npm run xyq:install</code>
            </p>
          )}
        </div>
      )}
      {status?.loggedIn && !status.enabled && (
        <p className="integration-warning">
          请在 .env 设置 XYQ_ENABLE_REAL=true 并重启服务。
        </p>
      )}
      {status?.loggedIn && (
        <>
          <div className="field-grid">
            <label className="field">
              小云雀视频模型
              <select
                value={
                  status.models.some((m) => m.key === draft.modelId)
                    ? draft.modelId
                    : ""
                }
                onChange={(e) => {
                  setError("");
                  onChange({ modelId: e.target.value, xyqResolution: "" });
                }}
              >
                <option value="">请从当前账号目录选择模型</option>
                {status.models.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name} · {m.key}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              小云雀目标时长（秒）
              {duration?.options?.length ? (
                <select
                  value={draft.duration}
                  onChange={(e) =>
                    onChange({ duration: Number(e.target.value) })
                  }
                >
                  <option value="">请选择时长</option>
                  {duration.options
                    .filter((n) => n <= 30)
                    .map((n) => (
                      <option key={n} value={n}>
                        {n} 秒
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  type="number"
                  min={duration?.min ?? 1}
                  max={Math.min(30, duration?.max ?? 30)}
                  step={duration?.step ?? 1}
                  value={draft.duration}
                  onChange={(e) =>
                    onChange({ duration: Number(e.target.value) })
                  }
                />
              )}
            </label>
            <label className="field">
              小云雀画面比例
              <select
                value={draft.ratio}
                onChange={(e) =>
                  onChange({ ratio: e.target.value as Draft["ratio"] })
                }
              >
                <option value="16:9">横屏 16:9</option>
                <option value="9:16">竖屏 9:16</option>
              </select>
            </label>
            <label className="field">
              小云雀分辨率
              <select
                value={draft.xyqResolution || ""}
                onChange={(e) => onChange({ xyqResolution: e.target.value })}
              >
                <option value="">
                  {model?.resolution?.options?.length
                    ? "请选择模型支持的档位"
                    : "使用平台缺省档位"}
                </option>
                {model?.resolution?.options?.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {(referenceBlocked ||
            limitBlocked ||
            model?.key === "Seedance_2.5_draft") && (
            <p className="integration-warning">
              此模型不适合本次三图参考流程，或需要尚未接入的样片转成片步骤，请换模型。
            </p>
          )}
          {model && (!validDuration || !validRatio || !validResolution) && (
            <p className="integration-warning">
              请按当前模型配置调整时长、比例或分辨率。
            </p>
          )}
          {model?.warnings?.map((w, i) => (
            <p className="helper" key={i}>
              {w}
            </p>
          ))}
        </>
      )}
      <p className="helper">
        提交会上传人物、商品和场景图片，消耗小云雀积分；余额不等于本次费用估算，赠送积分的模型适用范围以账号为准。本
        Demo 不自动充值、不支持小云雀任务取消，也未接入品牌声线克隆。
      </p>
      <p className="helper">
        成功成片会下载到本机并进入成品库。删除本地文件或换电脑后不可直接访问，正式多人使用需增加公司存储。
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </div>
  );
}
