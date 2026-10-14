export interface SeedanceModel {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly durations: readonly number[];
  readonly resolutions: readonly "720p"[];
  readonly inputModes: readonly ("text" | "image")[];
  readonly promptLimit: number;
  readonly defaultDuration: number;
  readonly defaultResolution: "720p";
}
export interface SeedanceDraftFields {
  modelId: string;
  duration: number;
  resolution: string;
  generateAudio?: boolean;
  seedanceInputMode?: "text" | "image";
}
export const SEEDANCE_MODELS: readonly SeedanceModel[];
export function seedanceModel(
  id: string | undefined,
): SeedanceModel | undefined;
export function normalizeSeedanceDraft<T extends SeedanceDraftFields>(
  draft: T,
  modelId?: string,
): T;
