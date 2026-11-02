/**
 * The one interface every sandbox implements.
 *
 * Browser runners (WebContainer, Pyodide) implement it today. A Modal runner
 * would implement the same interface server-side, which is the whole reason
 * the interface exists: the fix loop in the flows never knows where code ran.
 */

import type { GeneratedFile } from '../muse';

export interface RunResult {
  ok: boolean;
  /** stdout, or the rendered page's console, trimmed to what a model should read. */
  output: string;
  /** The first error worth fixing, phrased for the model; empty when ok. */
  error: string;
  /** For Python: PNG data URLs of any figures produced. */
  figures?: string[];
  /** For web prototypes: URL of the running dev server, to show in an iframe. */
  previewUrl?: string;
}

export interface Runner {
  readonly name: 'webcontainer' | 'pyodide' | 'modal';
  /** True in environments where this runner can work (SharedArrayBuffer, WASM, …). */
  available(): boolean;
  run(files: GeneratedFile[], onLog?: (line: string) => void): Promise<RunResult>;
}

/** Trim a long log to the part a model needs: the tail, where the error is. */
export function tail(log: string, max = 4000): string {
  return log.length > max ? `…${log.slice(-max)}` : log;
}

/**
 * First meaningful line of a sandbox error, normalised for comparison.
 * Absolute paths, ports and timings change between runs while the message
 * stays the same; normalising them keeps "same error twice" detection from
 * missing. The fix loop stops on a repeated fingerprint: the model already
 * saw this error, so another paid call would likely buy the same patch back.
 */
export function errorFingerprint(error: string, max = 300): string {
  // cleanLog only collapses all-spinner chunks; multi-line logs still need
  // spinner-only lines skipped so the fingerprint lands on the real message.
  const line =
    cleanLog(error)
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !/^[\s\\|/-]+$/.test(l)) ?? '';
  return line
    .replace(/\/[^\s:]*/g, '<path>')
    .replace(/:\d+/g, ':<n>')
    .replace(/\b\d+(\.\d+)?\s?(ms|s)\b/g, '<t>')
    .slice(0, max);
}

/**
 * Terminal output without the cursor-control sequences and spinner frames that
 * npm prints. In a log box they show up as "[1G", "[0K" and a rotating - \\ | /.
 */
export function cleanLog(chunk: string): string {
  const text = chunk.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '');
  return /^[\s\\|/-]*$/.test(text) ? '' : text;
}
