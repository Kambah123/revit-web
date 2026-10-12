/** Type declarations for prompt.mjs (consumed by TypeScript tests and docs tooling). */
export declare const PLAN_OP_KINDS: string[];
export declare function buildSystemPrompt(): string;
export declare function buildUserMessage(input: {
  message: string;
  context?: object | null;
  selection?: object | null;
}): string;
