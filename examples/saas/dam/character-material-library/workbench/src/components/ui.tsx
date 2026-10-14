import { useEffect, useRef, type ReactNode } from "react";
import {
  X,
  ArrowUpRight,
  Film,
  Image,
  AudioLines,
  FileText,
  UserRound,
  ScanFace,
  Clapperboard,
  ShieldCheck,
} from "lucide-react";
import {
  assetTypeNames,
  statusNames,
  type AssetType,
  type TaskStatus,
  type CharacterStatus,
} from "../domain/types";

export function Badge({ status }: { status: TaskStatus | CharacterStatus }) {
  return (
    <span className={`badge status-${status}`}>
      <i />
      {statusNames[status]}
    </span>
  );
}
export function MockBadge() {
  return <span className="mock-badge">MOCK</span>;
}
export function Portrait({
  index = 0,
  className = "",
  children,
}: {
  index?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`portrait portrait-${index} ${className}`}
      style={{
        backgroundPosition: `${Math.max(0, Math.min(2, index)) * 50}% 12%`,
      }}
    >
      {children}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="title-actions">{actions}</div>
    </div>
  );
}
export function SectionTitle({
  title,
  count,
  action,
  onClick,
}: {
  title: string;
  count?: number;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="section-title">
      <h2>
        {title}
        {count !== undefined && (
          <span className="count">{String(count).padStart(2, "0")}</span>
        )}
      </h2>
      {action && (
        <button className="text-button" onClick={onClick}>
          {action}
          <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <Film size={32} strokeWidth={1.2} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
  drawer = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const oldFocus = document.activeElement as HTMLElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", handler);
      oldFocus?.focus();
    };
  }, []);
  return (
    <div
      className={`overlay ${drawer ? "drawer-overlay" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`dialog ${wide ? "wide" : ""} ${drawer ? "drawer" : ""}`}
      >
        <div className="dialog-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="关闭窗口"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function AssetIcon({
  type,
  size = 18,
}: {
  type: AssetType;
  size?: number;
}) {
  const Icon = {
    image: Image,
    video: Clapperboard,
    audio: AudioLines,
    voice: UserRound,
    action: Film,
    expression: ScanFace,
    script: FileText,
    license: ShieldCheck,
  }[type];
  return <Icon size={size} aria-label={assetTypeNames[type]} />;
}
export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
export function shortId(id: string) {
  return id.startsWith("TASK-") && id.length <= 8
    ? id
    : id.slice(0, 13).toUpperCase();
}
