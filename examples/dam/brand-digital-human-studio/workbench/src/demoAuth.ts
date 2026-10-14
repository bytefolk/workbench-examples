export type DemoUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export const DEMO_AUTH_NAMESPACE = "bytefolk-muse-demo-auth-v1";
export const DEMO_SESSION_TTL = 8 * 60 * 60 * 1000;
export const DEMO_REMEMBER_TTL = 7 * 24 * 60 * 60 * 1000;

export const DEMO_USERS: readonly DemoUser[] = [
  {
    id: "muse-demo-admin",
    name: "林知夏",
    email: "admin@muse.demo",
    role: "品牌管理员",
  },
  {
    id: "muse-demo-creator",
    name: "苏遥",
    email: "creator@muse.demo",
    role: "创作成员",
  },
];

type StoredSession = {
  version: 1;
  userId: string;
  issuedAt: number;
  expiresAt: number;
};

export type DemoSessionResult = {
  user: DemoUser | null;
  expiresAt: number | null;
  notice: string;
};

// Fixed demonstration credentials are checked in memory; input passwords are never stored.
export function authenticateDemo(email: string, password: string) {
  if (password !== "Muse2026!") return null;
  return (
    DEMO_USERS.find((user) => user.email === email.trim().toLowerCase()) ?? null
  );
}

export function readDemoSession(now = Date.now()): DemoSessionResult {
  let notice = "";
  for (const kind of ["sessionStorage", "localStorage"] as const) {
    try {
      const storage = window[kind];
      const raw = storage.getItem(DEMO_AUTH_NAMESPACE);
      if (!raw) continue;
      const session = JSON.parse(raw) as Partial<StoredSession>;
      const user = DEMO_USERS.find(
        (candidate) => candidate.id === session.userId,
      );
      const ttl =
        kind === "localStorage" ? DEMO_REMEMBER_TTL : DEMO_SESSION_TTL;
      const valid =
        session.version === 1 &&
        user &&
        typeof session.issuedAt === "number" &&
        Number.isFinite(session.issuedAt) &&
        session.issuedAt <= now + 60_000 &&
        typeof session.expiresAt === "number" &&
        Number.isFinite(session.expiresAt) &&
        session.expiresAt > now &&
        session.expiresAt > session.issuedAt &&
        session.expiresAt <= session.issuedAt + ttl;
      if (valid) return { user, expiresAt: session.expiresAt!, notice: "" };
      storage.removeItem(DEMO_AUTH_NAMESPACE);
      notice = "演示登录已过期或失效，请重新登录。";
    } catch {
      notice = "浏览器无法读取演示登录状态，请检查本地存储权限。";
    }
  }
  return { user: null, expiresAt: null, notice };
}

export function clearDemoSession() {
  let failed = false;
  for (const kind of ["sessionStorage", "localStorage"] as const) {
    try {
      window[kind].removeItem(DEMO_AUTH_NAMESPACE);
    } catch {
      failed = true;
    }
  }
  return failed
    ? "已退出当前页面，但浏览器未允许清除保存的演示登录。请手动清除此站点的登录存储。"
    : "";
}

export function saveDemoSession(user: DemoUser, remember: boolean) {
  const clearError = clearDemoSession();
  if (clearError)
    throw new Error("浏览器无法更新演示登录存储，请检查本地存储权限后重试。");
  const issuedAt = Date.now();
  const session: StoredSession = {
    version: 1,
    userId: user.id,
    issuedAt,
    expiresAt: issuedAt + (remember ? DEMO_REMEMBER_TTL : DEMO_SESSION_TTL),
  };
  try {
    const storage = remember ? window.localStorage : window.sessionStorage;
    storage.setItem(DEMO_AUTH_NAMESPACE, JSON.stringify(session));
    if (storage.getItem(DEMO_AUTH_NAMESPACE) !== JSON.stringify(session)) {
      throw new Error("Storage write was not retained");
    }
  } catch {
    clearDemoSession();
    throw new Error(
      "浏览器无法保存演示登录状态，请允许此站点使用本地存储后重试。",
    );
  }
  return session.expiresAt;
}
