export type WanResolution = "480p" | "720p" | "1080p";
export interface WanModel {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly durations: readonly number[];
  readonly resolutions: readonly WanResolution[];
  readonly audioMode: "toggle" | "always" | "none";
  readonly multiShot: boolean;
  readonly promptLimit: number;
  readonly defaultDuration: number;
  readonly defaultResolution: WanResolution;
  readonly rates: Readonly<
    Partial<
      Record<
        WanResolution,
        Readonly<{ silent: number | null; audio: number | null }>
      >
    >
  >;
}
export interface WanDraftFields {
  modelId: string;
  duration: number;
  resolution: WanResolution;
  generateAudio?: boolean;
  wanShotType?: "single" | "multi";
}
export const WAN_MODELS: readonly WanModel[];
export function wanModel(id: string | undefined): WanModel | undefined;
export function normalizeWanDraft<T extends WanDraftFields>(
  draft: T,
  modelId: string,
): T;
export function wanRate(draft: WanDraftFields): number | null;
export function wanEstimate(draft: WanDraftFields): number | null;
