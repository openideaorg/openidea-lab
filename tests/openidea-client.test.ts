import { describe, expect, it } from 'vitest';
import { detectPaperId, normalise } from '@/lib/openidea';

describe('detectPaperId', () => {
  it('finds Transformer arXiv id in free text', () => {
    expect(detectPaperId('Reproduce arXiv:1706.03762 attention')).toEqual({ arxiv: '1706.03762' });
    expect(detectPaperId('https://arxiv.org/abs/1706.03762v7')).toEqual({ arxiv: '1706.03762' });
  });

  it('finds DOIs', () => {
    expect(detectPaperId('See doi:10.48550/arXiv.1706.03762')).toEqual({
      doi: '10.48550/arXiv.1706.03762',
    });
  });
});

describe('normalise Lab fields', () => {
  it('lifts doi, snippet, venue, citationCount', () => {
    const r = normalise({
      id: 'arxiv:1706.03762',
      type: 'paper',
      title: 'Attention Is All You Need',
      url: 'https://arxiv.org/abs/1706.03762',
      description: 'The dominant sequence transduction models are based on complex recurrent networks.',
      doi: '10.48550/arXiv.1706.03762',
      citationCount: 100000,
      snippet: 'The dominant sequence transduction models…',
      venue: 'arXiv',
      year: 2017,
      authors: ['Ashish Vaswani'],
      source: 'arxiv',
    });
    expect(r).toMatchObject({
      id: 'arxiv:1706.03762',
      doi: '10.48550/arXiv.1706.03762',
      citationCount: 100000,
      venue: 'arXiv',
      year: 2017,
    });
    expect(r?.snippet).toMatch(/sequence transduction/i);
  });

  it('falls back to meta.doi / meta.citations', () => {
    const r = normalise({
      id: 'x',
      title: 'T',
      url: 'https://example.com',
      meta: { doi: '10.1/xyz', citations: 12, venue: 'ICML' },
    });
    expect(r?.doi).toBe('10.1/xyz');
    expect(r?.citationCount).toBe(12);
    expect(r?.venue).toBe('ICML');
  });
});
