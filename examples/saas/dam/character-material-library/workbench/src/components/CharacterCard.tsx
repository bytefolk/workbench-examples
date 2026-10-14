import { ArrowUpRight, Image, ShieldCheck } from "lucide-react";
import type { Character } from "../domain/types";
import {
  completeness,
  displayCharacterStatus,
  versionOf,
} from "../domain/model";
import { useApp } from "../store";
import { Badge, Portrait } from "./ui";
export function CharacterCard({
  character,
  onOpen,
  compact = false,
}: {
  character: Character;
  onOpen: () => void;
  compact?: boolean;
}) {
  const { db } = useApp();
  const v = versionOf(db, character);
  const status = displayCharacterStatus(character, v);
  return (
    <button
      className={`character-card ${compact ? "compact" : ""}`}
      onClick={onOpen}
    >
      <Portrait index={character.portrait} className="card-portrait">
        <div className="photo-top">
          <span className="photo-version">v{v.version}.0</span>
          <span className="photo-ai">AI 示意图</span>
        </div>
        <div className="portrait-bottom">
          <span>{character.subtitle}</span>
          <span className="photo-arrow">
            <ArrowUpRight size={18} />
          </span>
        </div>
      </Portrait>
      <div className="character-card-body">
        <div className="card-title">
          <h3>{character.name}</h3>
          <Badge status={status} />
        </div>
        <div className="tags">
          {character.tags.slice(0, 2).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="card-meta">
          <span>
            <Image size={13} />
            {v.assets.length} 份素材
          </span>
          <span>
            <ShieldCheck size={13} />
            完整度 {completeness(v)}%
          </span>
        </div>
        <div className="completeness-track">
          <i style={{ width: `${completeness(v)}%` }} />
        </div>
      </div>
    </button>
  );
}
