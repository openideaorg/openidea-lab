/**
 * Lab agent run record — handbook-shaped state for the Muse-only tool loop.
 */

import type { Plan, GeneratedFile, LabelledPart } from '../muse';
import type { Resource } from '../openidea';
import type { UsageEntry } from '../usage-types';

export type LabRunKind = 'idea' | 'paper' | 'photo';

export type LabRunStatus =
  | 'running'
  | 'needs_input'
  | 'needs_client'
  | 'awaiting_signoff'
  | 'done'
  | 'failed'
  | 'paused';

export type ConsolePhase = 'plan' | 'act' | 'observe';

export interface ConsoleRow {
  turn: number;
  phase: ConsolePhase;
  text: string;
  tool?: string;
  at: number;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool?: string;
}

export interface Citation {
  title: string;
  url: string;
  type?: string;
  doi?: string;
  year?: number;
}

export interface LabVerdict {
  verdict: 'matches' | 'partial' | 'no';
  reason: string;
}

export interface LabRun {
  id: string;
  kind: LabRunKind;
  input: string;
  ownerId?: string;
  planTier: 'free' | 'pro';
  resources: Resource[];
  graphText?: string;
  plan?: Plan;
  planApproved?: boolean;
  files: GeneratedFile[];
  /** Testable claim the draft step extracted (paper runs). Judged, not the raw paste. */
  claim?: string;
  figures?: string[];
  /** Photo runs: the uploaded image (data URL) lives on the run so segment_photo can reuse it across turns. */
  photoImage?: string;
  /** SAM boxes without masks — masks are full-size PNG data URLs and would bloat the progress store. */
  photoSegments?: { index: number; bbox: [number, number, number, number]; score: number }[];
  /** Muse names for each segment, in segment order. */
  parts?: LabelledPart[];
  /** Enriched parts-list markdown (Muse + OpenIdea context). */
  partsMarkdown?: string;
  citations: Citation[];
  sandbox?: { ok: boolean; output?: string; error?: string; previewUrl?: string };
  verdict?: LabVerdict;
  usage: UsageEntry[];
  status: LabRunStatus;
  stopReason?: string;
  turn: number;
  messages: AgentMessage[];
  console: ConsoleRow[];
  fixCount: number;
  submitRefusals: number;
  pendingTool?: ToolCall;
  createdAt: number;
  updatedAt: number;
}

export interface AgentTurnResult {
  run: LabRun;
  /** When true, client must run the sandbox and POST the observation. */
  needsClientSandbox?: boolean;
  /** When true, UI should prompt for human input / sign-off. */
  needsHuman?: boolean;
}
