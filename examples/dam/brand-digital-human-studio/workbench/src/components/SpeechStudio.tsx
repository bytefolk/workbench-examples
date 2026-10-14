import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Mic,
  Volume2,
  Settings2,
  RefreshCw,
  Clapperboard,
} from "lucide-react";
import {
  api,
  type SpeechLibrary,
  type SpeechSample,
  type SpeechVoice,
  type SpeechAudio,
  type WanConfig,
} from "../api";
import type { Asset, Draft } from "../types";
import { WanSettings } from "./WanPanel";
const empty: SpeechLibrary = {
  samples: [],
  voices: [],
  utterances: [],
  bindings: {},
};
export function SpeechStudio({
  draft,
  assets,
  onChange,
  onUpdateAsset,
  onAddAsset,
  onSubmit,
  submitting,
}: {
  draft: Draft;
  assets: Asset[];
  onChange: (patch: Partial<Draft>) => void;
  onUpdateAsset: (id: string, patch: Partial<Asset>) => void;
  onAddAsset: (asset: Asset) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const [library, setLibrary] = useState<SpeechLibrary>(empty),
    [config, setConfig] = useState<WanConfig | null>(null);
  const [sampleId, setSampleId] = useState(""),
    [voiceName, setVoiceName] = useState("品牌人物声线"),
    [voiceChoice, setVoiceChoice] = useState("");
  const [settings, setSettings] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const blocked = useRef(false),
    refreshing = useRef(false);
  const ids = useRef<Record<string, { payload: string; id: string }>>({});
  const person = assets.find(
    (a) => a.id === draft.characterId && a.kind === "character",
  );
  const voice = library.voices.find(
    (v) => v.id === library.bindings[draft.characterId],
  );
  const sample = library.samples.find((s) => s.id === sampleId);
  const audio = library.utterances.find((a) => a.id === draft.speechAudioId);
  const enabled = !!config?.configured && config.enabled;
  const pending =
    library.voices.some((v) => v.status === "processing") ||
    library.utterances.some((a) => a.status === "processing");
  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const [c, l] = await Promise.all([
        api<WanConfig>("/api/wan/config"),
        api<SpeechLibrary>("/api/speech/library"),
      ]);
      setConfig(c);
      setLibrary(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : "声音状态读取失败。");
    } finally {
      refreshing.current = false;
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, [pending]);
  useEffect(() => {
    if (person && voice?.status === "completed" && voice.remoteVoiceId) {
      if (person.clonedVoiceId !== voice.remoteVoiceId)
        onUpdateAsset(person.id, {
          clonedVoiceId: voice.remoteVoiceId,
          clonedVoiceModel: voice.model,
          voiceStatus: "completed",
        });
      const source = assets.find((a) => a.id === voice.sampleId);
      if (source && source.clonedVoiceId !== voice.remoteVoiceId)
        onUpdateAsset(source.id, {
          clonedVoiceId: voice.remoteVoiceId,
          clonedVoiceModel: voice.model,
          voiceStatus: "completed",
        });
      if (draft.voiceId !== voice.sampleId)
        onChange({ voiceId: voice.sampleId });
    }
  }, [person, voice, assets, draft.voiceId, onUpdateAsset, onChange]);
  useEffect(() => {
    if (
      audio?.status === "completed" &&
      audio.duration !== undefined &&
      draft.duration !== audio.duration
    )
      onChange({ duration: audio.duration });
  }, [audio?.status, audio?.duration, draft.duration, onChange]);
  function idFor(kind: string, payload: unknown) {
    const text = JSON.stringify(payload);
    if (ids.current[kind]?.payload !== text)
      ids.current[kind] = { payload: text, id: crypto.randomUUID() };
    return ids.current[kind].id;
  }
  async function action(name: string, fn: () => Promise<void>) {
    if (blocked.current) return;
    blocked.current = true;
    setBusy(name);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败。");
    } finally {
      blocked.current = false;
      setBusy("");
    }
  }
  async function upload(file: File) {
    await action("upload", async () => {
      if (!/\.(wav|mp3)$/i.test(file.name) || file.size > 10 * 1024 * 1024)
        throw new Error("请选择 10MB 以内的 WAV 或 MP3。");
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("录音读取失败。"));
        reader.readAsDataURL(file);
      });
      const mime = /\.mp3$/i.test(file.name) ? "audio/mpeg" : "audio/wav";
      const normalized = `data:${mime};base64,${data.split(",")[1]}`;
      const saved = await api<SpeechSample>("/api/speech/samples", {
        name: file.name,
        audio: normalized,
      });
      setSampleId(saved.id);
      onAddAsset({
        id: saved.id,
        name: saved.name,
        kind: "voice",
        image: "",
        tags: ["上传录音", "真实音频"],
        description: "本机上传录音，可用于声线复刻和试听。",
        code: `VO-${saved.id.slice(0, 6)}`,
        updated: new Date().toISOString().slice(0, 10),
        uploaded: true,
        audioUrl: saved.audioUrl,
        audioDuration: saved.duration,
      });
    });
  }
  const canVideo =
    enabled &&
    !!person &&
    audio?.status === "completed" &&
    audio.canLipSync &&
    audio.voiceId === voice?.id &&
    audio.characterId === draft.characterId &&
    audio.text === draft.speechText?.trim();
  return (
    <section className="speech-studio" aria-label="声音复刻与口型工作室">
      <div className="integration-heading">
        <div>
          <Mic size={18} />
          <strong>声音与口型工作室</strong>
        </div>
        <div className="button-row">
          <button
            className="button secondary compact"
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} />
            刷新状态
          </button>
          <button
            className="button secondary compact"
            onClick={() => setSettings(true)}
          >
            <Settings2 size={15} />
            配置阿里云
          </button>
        </div>
      </div>
      <p className="helper">
        {enabled
          ? "本机已配置百炼 Key。复刻、合成语音和生成视频分别计费，均由你点击。"
          : "请先配置北京地域的百炼通用 API Key。录音可先上传到本机，配置保存不会生成。"}
      </p>
      <div className="field-grid">
        <label className="field">
          声音绑定人物
          <select
            aria-label="声音绑定人物"
            value={draft.characterId}
            onChange={(e) =>
              onChange({
                characterId: e.target.value,
                speechAudioId: undefined,
              })
            }
          >
            {assets
              .filter((a) => a.kind === "character")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          口播作品名称
          <input
            aria-label="口播作品名称"
            value={draft.title}
            maxLength={60}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="例如：品牌人物 · 帽子介绍"
          />
        </label>
      </div>
      <div className="speech-grid">
        <article className="speech-section">
          <h2>
            <span>01</span>上传并试听录音
          </h2>
          <p className="helper">
            10–20 秒清晰朗读，WAV/MP3，至少 16kHz，WAV 为
            16bit；无背景音乐、其他人声。上传只保存本机，不自动提交复刻。
          </p>
          <label className="speech-upload">
            <Upload size={20} />
            <span>{busy === "upload" ? "正在保存录音…" : "选择录音文件"}</span>
            <input
              aria-label="上传人物录音"
              type="file"
              accept=".wav,.mp3,audio/wav,audio/mpeg"
              disabled={!!busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
          <label className="field">
            已上传录音
            <select
              aria-label="已上传录音"
              value={sampleId}
              onChange={(e) => setSampleId(e.target.value)}
            >
              <option value="">请选择录音</option>
              {library.samples.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.duration.toFixed(1)} 秒
                </option>
              ))}
            </select>
          </label>
          {sample && (
            <audio
              controls
              preload="metadata"
              src={sample.audioUrl}
              aria-label="原始录音试听"
            />
          )}
        </article>
        <article className="speech-section">
          <h2>
            <span>02</span>复刻并绑定人物声线
          </h2>
          <label className="field">
            声线名称
            <input
              aria-label="声线名称"
              value={voiceName}
              maxLength={80}
              onChange={(e) => setVoiceName(e.target.value)}
            />
          </label>
          <button
            className="button full"
            disabled={!enabled || !sample || !person || !!busy || pending}
            onClick={() =>
              void action("clone", async () => {
                const body = {
                  sampleId,
                  characterId: draft.characterId,
                  name: voiceName,
                };
                await api<SpeechVoice>("/api/speech/voices", {
                  ...body,
                  submissionId: idFor("clone", body),
                });
              })
            }
          >
            <Mic size={16} />
            {busy === "clone" ? "正在提交复刻…" : "复刻并绑定声线 · 按次计费"}
          </button>
          <p className="helper">
            使用 Qwen-Audio TTS
            Flash。成功且平台确认就绪后自动绑定当前人物，不会继续合成或生成视频。
          </p>
          <label className="field">
            绑定已有复刻声线
            <select
              aria-label="绑定已有复刻声线"
              value={voiceChoice}
              onChange={(e) => setVoiceChoice(e.target.value)}
            >
              <option value="">选择已就绪声线</option>
              {library.voices
                .filter((v) => v.status === "completed")
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="button secondary compact"
            disabled={!voiceChoice || !!busy}
            onClick={() =>
              void action("bind", async () => {
                await api("/api/speech/bind", {
                  voiceId: voiceChoice,
                  characterId: draft.characterId,
                });
                onChange({ speechAudioId: undefined });
              })
            }
          >
            绑定所选声线
          </button>
          <p className="helper">
            当前绑定：
            {voice?.status === "completed" ? voice.name : "尚未绑定可用声线"}
          </p>
          {voice?.remoteVoiceId && (
            <p className="speech-id">平台音色 ID：{voice.remoteVoiceId}</p>
          )}
          {library.voices
            .filter(
              (v) =>
                v.characterId === draft.characterId && v.status !== "completed",
            )
            .map((v) => (
              <div className="speech-operation" key={v.id}>
                <strong>
                  {v.name} ·{" "}
                  {v.status === "processing"
                    ? "复刻处理中"
                    : v.status === "pending"
                      ? "等待平台就绪"
                      : "复刻未成功"}
                </strong>
                {v.error && <p>{v.error}</p>}
                {v.remoteVoiceId && v.status !== "processing" && (
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() =>
                      void action("check", async () => {
                        await api(`/api/speech/voices/${v.id}/check`, {});
                      })
                    }
                  >
                    检查声线状态
                  </button>
                )}
              </div>
            ))}
        </article>
        <article className="speech-section">
          <h2>
            <span>03</span>输入新台词生成语音
          </h2>
          <label className="field">
            新台词
            <textarea
              aria-label="新台词"
              value={draft.speechText || ""}
              maxLength={240}
              rows={3}
              placeholder="例如：这顶帽子，让普通的一天也有自己的风格。"
              onChange={(e) =>
                onChange({
                  speechText: e.target.value,
                  speechAudioId: undefined,
                })
              }
            />
          </label>
          <button
            className="button full"
            disabled={
              !enabled ||
              voice?.status !== "completed" ||
              !draft.speechText?.trim() ||
              !!busy ||
              pending
            }
            onClick={() =>
              void action("tts", async () => {
                const body = {
                  characterId: draft.characterId,
                  text: draft.speechText,
                };
                const result = await api<SpeechAudio>(
                  "/api/speech/utterances",
                  {
                    ...body,
                    submissionId: idFor("tts", { ...body, voiceId: voice?.id }),
                  },
                );
                onChange({ speechAudioId: result.id });
              })
            }
          >
            <Volume2 size={16} />
            {busy === "tts" ? "正在提交语音…" : "生成品牌语音 · 按字符计费"}
          </button>
          <label className="field">
            已生成语音
            <select
              aria-label="已生成语音"
              value={draft.speechAudioId || ""}
              onChange={(e) => {
                const a = library.utterances.find(
                  (a) => a.id === e.target.value,
                );
                onChange({
                  speechAudioId: a?.id,
                  speechText: a?.text || draft.speechText,
                  duration: a?.duration || draft.duration,
                });
              }}
            >
              <option value="">请选择语音结果</option>
              {library.utterances
                .filter((a) => a.characterId === draft.characterId)
                .sort((a, b) => b.createdAt - a.createdAt)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.text.slice(0, 20)} ·{" "}
                    {a.status === "completed"
                      ? `${a.duration?.toFixed(1)} 秒`
                      : a.status === "processing"
                        ? "合成中"
                        : "未成功"}
                  </option>
                ))}
            </select>
          </label>
          {audio?.status === "completed" && audio.audioUrl && (
            <>
              <audio
                controls
                preload="metadata"
                src={audio.audioUrl}
                aria-label="新台词语音试听"
              />
              <a
                className="text-button"
                href={`/api/speech/utterances/${audio.id}/download`}
                download
              >
                下载这段语音
              </a>
            </>
          )}
          {audio?.error && <p className="error-message">{audio.error}</p>}
          {audio?.canRecover && (
            <button
              className="button secondary"
              disabled={!!busy || pending}
              onClick={() =>
                void action("recover", async () => {
                  await api(`/api/speech/utterances/${audio.id}/recover`, {});
                })
              }
            >
              取回原语音 · 不重新合成
            </button>
          )}
          {audio?.status === "completed" && audio.voiceId !== voice?.id && (
            <p className="integration-warning">
              这段语音来自其他声线，请切回对应声线，或手动生成当前声线的新语音。
            </p>
          )}
          {audio?.status === "completed" && !audio.canLipSync && (
            <p className="integration-warning">
              语音为 {audio.duration?.toFixed(1)}{" "}
              秒，超出对口型单段限制。请缩短台词后手动生成新语音；不会自动裁剪或重做。
            </p>
          )}
        </article>
        <article className="speech-section">
          <h2>
            <span>04</span>生成对口型视频
          </h2>
          {person && (
            <img
              className="speech-person"
              src={person.image}
              alt="对口型人物参考"
            />
          )}
          <label className="field">
            对口型分辨率
            <select
              aria-label="对口型分辨率"
              value={draft.resolution || "480p"}
              onChange={(e) =>
                onChange({ resolution: e.target.value as Draft["resolution"] })
              }
            >
              <option value="480p">480P · 0.50 元/秒</option>
              <option value="720p">720P · 0.90 元/秒</option>
            </select>
          </label>
          <p className="helper">
            万相 wan2.2-s2v，视频时长跟随所选语音。
            {audio?.duration
              ? `按官方原价估算 ¥${(audio.duration * (draft.resolution === "720p" ? 0.9 : 0.5)).toFixed(2)}，以实际账单为准。`
              : "先生成并试听新台词语音。"}
          </p>
          <button
            className="button full"
            disabled={!canVideo || !!busy || submitting || !draft.title.trim()}
            onClick={onSubmit}
          >
            <Clapperboard size={16} />
            {submitting ? "正在提交…" : "提交对口型视频 · 按量计费"}
          </button>
          <p className="helper">
            只提交所选人物图片和新台词音频；不会提交独立帽子/场景参考图或分镜动作。该入口验证人物说话和口型，不代表已达到全身剧情、走动转身或产品细节要求。
          </p>
        </article>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <p className="helper">
        原录音、新语音和成片保存本机；临时云文件会在点击对应生成步骤时上传到阿里云。声线
        ID 属于云服务资产，不是可导出的模型权重。
      </p>
      {settings && (
        <WanSettings
          config={config}
          onClose={() => setSettings(false)}
          onSaved={(c) => {
            setConfig(c);
            setSettings(false);
          }}
        />
      )}
    </section>
  );
}
