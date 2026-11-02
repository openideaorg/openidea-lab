import { describe, expect, it } from 'vitest';
import { cleanLog, errorFingerprint, tail } from '@/lib/runner/types';

describe('cleanLog', () => {
  it('drops cursor-control sequences', () => {
    expect(cleanLog('\u001b[1G\u001b[0K')).toBe('');
  });

  it('drops npm spinner frames', () => {
    for (const frame of ['\\', '|', '/', '-', ' \\ \n']) expect(cleanLog(frame)).toBe('');
  });

  it('keeps real output and strips colour codes from it', () => {
    expect(cleanLog('\u001b[32mready\u001b[39m in 312 ms')).toBe('ready in 312 ms');
    expect(cleanLog('added 5 packages in 2s')).toBe('added 5 packages in 2s');
  });

  it('keeps lines that merely start with a dash', () => {
    expect(cleanLog('- Local: http://localhost:3000')).toBe('- Local: http://localhost:3000');
  });
});

describe('tail', () => {
  it('keeps the end of a long log, where the error is', () => {
    const t = tail('a'.repeat(10) + 'ERROR', 5);
    expect(t.endsWith('ERROR')).toBe(true);
    expect(t.startsWith('…')).toBe(true);
  });
});

describe('errorFingerprint', () => {
  it('matches the same error across runs despite paths, ports and timings', () => {
    const a = errorFingerprint('Error: cannot find module /tmp/wc-abc123/node_modules/x\ntook 312 ms');
    const b = errorFingerprint('Error: cannot find module /tmp/wc-xyz789/node_modules/x\ntook 1.2 s');
    expect(a).toBe(b);
  });

  it('differs for different errors', () => {
    expect(errorFingerprint('TypeError: undefined is not a function')).not.toBe(
      errorFingerprint('SyntaxError: unexpected token'),
    );
  });

  it('skips blank and spinner lines to find the message', () => {
    expect(errorFingerprint('\n- \\ | /\nReferenceError: foo is not defined')).toBe(
      errorFingerprint('ReferenceError: foo is not defined'),
    );
  });
});
