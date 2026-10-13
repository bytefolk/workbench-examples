import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createSeed, defaultConfig, demoPrompt } from "./domain/seed";
import * as model from "./domain/model";
import { upgradeProviderCatalog } from "./domain/catalog";
import type { Database, GenerationConfig, Role } from "./domain/types";

export type Page =
  | "overview"
  | "characters"
  | "generate"
  | "tasks"
  | "library"
  | "settings";
const storageKey = "bytefolk-character-material-library-v1";
function load(): Database {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed.schemaVersion === 1 &&
        [
          "characters",
          "versions",
          "requests",
          "tasks",
          "results",
          "providers",
          "audit",
        ].every((k) => Array.isArray(parsed[k]))
      ) {
        parsed.providers = parsed.providers.map(
          (p: Database["providers"][number]) => ({
            ...p,
            rate: p.mode === "mock" ? p.rate : null,
          }),
        );
        parsed.tasks = parsed.tasks.map((t: Database["tasks"][number]) => ({
          ...t,
          config: { ...t.config, purpose: t.config.purpose || "商品试戴" },
        }));
        return upgradeProviderCatalog(parsed);
      }
    }
  } catch {
    /* Corrupt state is reported in the UI. */
  }
  return createSeed();
}
function useStore() {
  const [db, setDb] = useState(load);
  const [role, setRoleState] = useState<Role>("creator");
  const [page, setPageState] = useState<Page>(() =>
    [
      "overview",
      "characters",
      "generate",
      "tasks",
      "library",
      "settings",
    ].includes(location.hash.slice(1))
      ? (location.hash.slice(1) as Page)
      : "overview",
  );
  const [auto, setAuto] = useState(true);
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [draft, setDraft] = useState({
    prompt: demoPrompt,
    config: { ...defaultConfig },
    id: undefined as string | undefined,
  });
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(db));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [db]);
  useEffect(() => {
    const changed = () => {
      const p = location.hash.slice(1);
      if (
        [
          "overview",
          "characters",
          "generate",
          "tasks",
          "library",
          "settings",
        ].includes(p)
      )
        setPageState(p as Page);
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    if (!auto) return;
    const interval = window.setInterval(
      () => setDb((prev) => model.tickTasks(prev)),
      700,
    );
    return () => clearInterval(interval);
  }, [auto]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const setPage = (page: Page) => {
    setPageState(page);
    location.hash = page;
  };
  const setRole = (role: Role) => {
    setRoleState(role);
    setSelectedTask(null);
    setToast("已切换演示角色，权限已同步");
  };
  const run = (fn: (db: Database) => Database, message?: string) => {
    try {
      setDb(fn(db));
      if (message) setToast(message);
      return true;
    } catch (e) {
      setToast((e as Error).message);
      return false;
    }
  };
  const saveDraft = (
    prompt: string,
    config: GenerationConfig,
    id?: string,
  ): string | undefined => {
    try {
      let next: Database,
        savedId = id;
      if (id) next = model.updateDraft(db, role, id, prompt, config);
      else [next, savedId] = model.createDraft(db, role, prompt, config);
      setDb(next);
      setDraft({ prompt, config, id: savedId });
      setToast("草稿已保存，下次可以继续编辑");
      return savedId;
    } catch (e) {
      setToast((e as Error).message);
    }
  };
  const submit = (prompt: string, config: GenerationConfig, id?: string) => {
    try {
      let next: Database,
        taskId = id;
      if (id) next = model.updateDraft(db, role, id, prompt, config);
      else [next, taskId] = model.createDraft(db, role, prompt, config);
      next = model.submitTask(next, role, taskId!);
      setDb(next);
      setDraft({
        prompt: demoPrompt,
        config: { ...defaultConfig },
        id: undefined,
      });
      setPage("tasks");
      setSelectedTask(taskId!);
      setToast("Mock 任务已提交，约 11 秒后进入审核");
      return true;
    } catch (e) {
      setToast((e as Error).message);
      return false;
    }
  };
  const openGenerate = (
    characterId?: string,
    taskId?: string,
    prompt?: string,
  ) => {
    if (taskId) {
      const task = db.tasks.find((t) => t.id === taskId)!;
      if (!model.visibleTasks(db, role).some((t) => t.id === taskId)) return;
      setDraft({
        prompt: db.requests.find((r) => r.id === task.requestId)!.rawPrompt,
        config: { ...task.config },
        id: task.status === "draft" ? task.id : undefined,
      });
    } else
      setDraft({
        prompt: prompt || demoPrompt,
        config: { ...defaultConfig, characterId: characterId || "founder" },
        id: undefined,
      });
    setSelectedTask(null);
    setPage("generate");
  };
  const advance = (id?: string) => {
    const tasks = db.tasks.filter(
      (t) =>
        ["queued", "generating"].includes(t.status) && (!id || t.id === id),
    );
    if (!tasks.length) {
      setToast("当前没有进行中的 Mock 任务");
      return;
    }
    const time = Math.max(
      Date.now(),
      ...tasks.map((t) => (t.startedAt || Date.now()) + 12000),
    );
    // A bounded advance applies to the selected task only; unrelated timers retain their own schedule.
    if (id) {
      const selectedDb = { ...db, tasks: db.tasks.filter((t) => t.id === id) };
      const advanced = model.tickTasks(selectedDb, time);
      setDb({
        ...advanced,
        tasks: db.tasks.map((t) => (t.id === id ? advanced.tasks[0] : t)),
      });
    } else setDb(model.tickTasks(db, time));
    setToast("已推进 Mock 流程");
  };
  return {
    db,
    role,
    setRole,
    page,
    setPage,
    auto,
    setAuto,
    toast,
    setToast,
    run,
    draft,
    saveDraft,
    submit,
    openGenerate,
    selectedTask,
    setSelectedTask,
    advance,
    storageError,
    reset: () => {
      setDb(createSeed());
      setRoleState("creator");
      setDraft({
        prompt: demoPrompt,
        config: { ...defaultConfig },
        id: undefined,
      });
      setSelectedTask(null);
      setPage("overview");
      setToast("已恢复初始示例数据");
    },
  };
}
type Store = ReturnType<typeof useStore>;
const Context = createContext<Store | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const value = useStore();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("Store unavailable");
  return value;
}
