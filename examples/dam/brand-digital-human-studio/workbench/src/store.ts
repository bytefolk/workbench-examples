import { mediaAsset } from "./media";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSeed } from "./data";
import type { StudioState, Task } from "./types";
import { api, providerApiRoot, type RemoteGeneration } from "./api";
const KEY = "bytefolk-brand-digital-human-studio-v1";
function readState(): StudioState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      s?.version === 1 &&
      Array.isArray(s.assets) &&
      Array.isArray(s.tasks) &&
      s.draft
    )
      return s;
  } catch {
    /* Fall back to recoverable demo data. */
  }
  return createSeed();
}
export const isActive = (task: Task) =>
  task.status === "queued" || task.status === "generating";
export const getProgress = (task: Task, now: number) =>
  task.status === "completed"
    ? 100
    : task.status === "queued"
      ? 0
      : Math.min(98, Math.max(3, Math.floor((now - task.startedAt) / 220)));
export function useStudio() {
  const [state, setState] = useState<StudioState>(readState);
  const current = useRef(state);
  const [now, setNow] = useState(Date.now());
  const [storageError, setStorageError] = useState("");
  const update = useCallback((fn: (prev: StudioState) => StudioState) => {
    const next = fn(current.current);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      current.current = next;
      setState(next);
      setStorageError("");
      return true;
    } catch {
      setStorageError(
        "本地存储不可用或空间不足，刚才的修改未保存。请减少上传图片大小，或检查浏览器存储设置。",
      );
      return false;
    }
  }, []);
  useEffect(() => {
    const id = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      const prev = current.current;
      let changed = false;
      const tasks = prev.tasks.map((t) => {
        if (!isActive(t) || t.provider) return t;
        const age = time - t.startedAt;
        const status =
          age >= 22000 ? "completed" : age >= 1800 ? "generating" : "queued";
        if (t.status === status) return t;
        changed = true;
        return { ...t, status } as Task;
      });
      if (changed) update(() => ({ ...prev, tasks }));
    }, 650);
    return () => window.clearInterval(id);
  }, [update]);
  useEffect(() => {
    let canceled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const pending = current.current.tasks.filter(
        (t) => t.provider && t.remoteRequestId && isActive(t),
      );
      await Promise.allSettled(
        pending.map(async (task) => {
          try {
            const result = await api<RemoteGeneration>(
              `${providerApiRoot(task.provider)}/requests/${task.remoteRequestId}`,
            );
            if (canceled) return;
            update((s) => ({
              ...s,
              tasks: s.tasks.map((t) =>
                t.id !== task.id
                  ? t
                  : {
                      ...t,
                      status:
                        result.status === "in_progress"
                          ? "generating"
                          : result.status === "nsfw"
                            ? "failed"
                            : [
                                  "completed",
                                  "failed",
                                  "canceled",
                                  "queued",
                                ].includes(result.status)
                              ? (result.status as Task["status"])
                              : t.status,
                      providerStatus: result.providerStatus || result.status,
                      resultUrl: result.video,
                      canCancel: result.canCancel,
                      error: result.error,
                    },
              ),
            }));
          } catch (error) {
            if (!canceled)
              update((s) => ({
                ...s,
                tasks: s.tasks.map((t) =>
                  t.id === task.id
                    ? {
                        ...t,
                        error: `状态查询未成功：${error instanceof Error ? error.message : "请稍后重试"}`,
                      }
                    : t,
                ),
              }));
          }
        }),
      );
      if (!canceled) timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [update]);
  return { state, update, now, storageError };
}
export function dateLabel(time: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(time);
}
export function downloadJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function mediaPath(task: Task) {
  if (task.provider) return task.resultUrl || "";
  return mediaAsset(
    `demo-${task.draft.ratio === "9:16" ? "portrait" : "wide"}.mp4`,
  );
}
export function downloadPath(task: Task) {
  return task.provider && task.remoteRequestId
    ? `${providerApiRoot(task.provider)}/requests/${task.remoteRequestId}/download`
    : mediaPath(task);
}
