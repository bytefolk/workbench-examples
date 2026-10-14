export interface CreationExample {
  id: string;
  label: string;
  title: string;
  duration?: number;
  hint: string;
  prompt: string;
  shots: {
    id: string;
    title: string;
    description: string;
    narration: string;
  }[];
}
export const CREATION_EXAMPLES: CreationExample[];
