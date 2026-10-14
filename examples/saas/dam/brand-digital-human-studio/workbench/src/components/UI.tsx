import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X, Search, AudioLines, ArrowUpRight, Check } from "lucide-react";
import type { Asset, TaskStatus } from "../types";
import { statusLabels } from "../types";
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="关闭弹窗">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "搜索资产名称、编号或标签",
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search">
      <Search size={17} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="清除搜索">
          <X size={15} />
        </button>
      )}
    </label>
  );
}
export function AssetImage({
  asset,
  className = "",
}: {
  asset: Asset;
  className?: string;
}) {
  return asset.kind === "voice" ? (
    <div className={`voice-art ${className}`}>
      <AudioLines size={38} strokeWidth={1} />
      <div className="waveform">
        {Array.from({ length: 34 }, (_, i) => (
          <i
            key={i}
            style={{ height: `${14 + Math.abs(Math.sin(i * 1.7)) * 44}px` }}
          />
        ))}
      </div>
      <span>声音档案 · 演示</span>
    </div>
  ) : (
    <img
      className={className}
      src={asset.image}
      alt={asset.name}
      style={{ objectPosition: asset.position || "center" }}
      loading="lazy"
    />
  );
}
export function Status({
  status,
  label,
}: {
  status: TaskStatus;
  label?: string;
}) {
  return (
    <span className={`status ${status}`}>
      <i />
      {label || statusLabels[status]}
    </span>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Search size={32} strokeWidth={1} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function SmallAsset({
  asset,
  selected = false,
  onClick,
}: {
  asset: Asset;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`small-asset ${selected ? "selected" : ""}`}
      onClick={onClick}
      type="button"
      aria-pressed={selected}
    >
      <AssetImage asset={asset} />
      <span>
        <strong>{asset.name.split(" · ")[0]}</strong>
        <small>{asset.code}</small>
      </span>
      {selected ? <Check size={17} /> : <ArrowUpRight size={16} />}
    </button>
  );
}
