/**
 * Client for the Open Idea search / paper / citations API at openidea.world.
 *
 * Lab only reads (and for Studio/citations, posts) via the public v1 surface.
 * Resource types mirror the platform's tabs. Additive Lab fields (doi, snippet,
 * venue, citationCount) come from platform Phase-4 contracts.
 */

import { env, keyFor, notConfigured, type Result } from './env';

export type ResourceType = 'paper' | 'dataset' | 'code' | 'model' | 'hardware' | 'video';

export interface Resource {
  id: string;
  type: ResourceType;
  title: string;
  url: string;
  description?: string;
  source?: string;
  authors?: string[];
  year?: number;
  license?: string;
  /** Additive Lab fields from platform v1 search / resolve. */
  doi?: string;
  citationCount?: number;
  snippet?: string;
  venue?: string;
  meta?: Record<string, unknown>;
}

export interface SearchOptions {
  types?: ResourceType[];
  limit?: number;
}

export interface PaperResolveInput {
  arxiv?: string;
  doi?: string;
  url?: string;
}

export interface PaperExtract extends PaperResolveInput {
  mode?: 'abstract' | 'pdf';
}

export interface ExtractedPaper {
  resource: Resource;
  text: string;
  sections: { heading: string; text: string }[];
  source: 'abstract' | 'pdf' | 'empty';
  pdfUrl: string | null;
  truncated: boolean;
}

export async function search(query: string, opts: SearchOptions = {}): Promise<Result<Resource[]>> {
  const key = keyFor('openidea');
  if (!key) return notConfigured('openidea');

  const params = new URLSearchParams({ q: query, limit: String(opts.limit ?? 20) });
  if (opts.types?.length) params.set('type', opts.types.join(','));

  const res = await fetch(`${env.openideaUrl}/search?${params}`, {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) return { ok: false, error: `OpenIdea search failed: ${res.status}` };

  const body = (await res.json()) as { results?: unknown[] };
  return { ok: true, value: (body.results ?? []).map(normalise).filter((r): r is Resource => !!r) };
}

/** Resolve arXiv / DOI / URL to a normalized Resource (+ pdfUrl when known). */
export async function resolvePaper(input: PaperResolveInput): Promise<Result<{ resource: Resource; pdfUrl: string | null }>> {
  const key = keyFor('openidea');
  if (!key) return notConfigured('openidea');

  const params = new URLSearchParams();
  if (input.arxiv) params.set('arxiv', input.arxiv);
  if (input.doi) params.set('doi', input.doi);
  if (input.url) params.set('url', input.url);
  if (![...params.keys()].length) return { ok: false, error: 'Provide arxiv, doi, or url' };

  const res = await fetch(`${env.openideaUrl}/papers/resolve?${params}`, {
    headers: { Authorization: `Bearer ${key}` },
    next: { revalidate: 0 },
  });
  if (res.status === 404) return { ok: false, error: 'Paper not found' };
  if (!res.ok) return { ok: false, error: `OpenIdea resolve failed: ${res.status}` };

  const body = (await res.json()) as { resource?: unknown; pdfUrl?: string | null };
  const resource = normalise(body.resource);
  if (!resource) return { ok: false, error: 'OpenIdea resolve returned no resource' };
  return { ok: true, value: { resource, pdfUrl: body.pdfUrl ?? null } };
}

/** Fetch paper text (abstract default; optional PDF) for the Lab paper path. */
export async function extractPaper(input: PaperExtract): Promise<Result<ExtractedPaper>> {
  const key = keyFor('openidea');
  if (!key) return notConfigured('openidea');

  const res = await fetch(`${env.openideaUrl}/papers/extract`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (res.status === 404) return { ok: false, error: 'Paper not found' };
  if (!res.ok) return { ok: false, error: `OpenIdea extract failed: ${res.status}` };

  const body = (await res.json()) as {
    resource?: unknown;
    text?: string;
    sections?: { heading: string; text: string }[];
    source?: ExtractedPaper['source'];
    pdfUrl?: string | null;
    truncated?: boolean;
  };
  const resource = normalise(body.resource);
  if (!resource) return { ok: false, error: 'OpenIdea extract returned no resource' };
  return {
    ok: true,
    value: {
      resource,
      text: typeof body.text === 'string' ? body.text : '',
      sections: Array.isArray(body.sections) ? body.sections : [],
      source: body.source ?? 'empty',
      pdfUrl: body.pdfUrl ?? null,
      truncated: Boolean(body.truncated),
    },
  };
}

/**
 * Platform BibTeX/RIS/CSL export. Paid platform plan required (402 otherwise).
 * Lab Pro fence is checked by the caller before invoking this.
 */
export async function exportCitations(
  resources: Resource[],
  format: 'bibtex' | 'ris' | 'csl-json' = 'bibtex',
): Promise<Result<string>> {
  const key = keyFor('openidea');
  if (!key) return notConfigured('openidea');

  const res = await fetch(`${env.openideaUrl}/citations/export`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format,
      ids: resources.map((r) => r.id).filter(Boolean),
      resources,
    }),
  });
  if (res.status === 402) return { ok: false, error: 'Platform plan does not include citation export (402)' };
  if (!res.ok) return { ok: false, error: `OpenIdea citations export failed: ${res.status}` };
  return { ok: true, value: await res.text() };
}

/**
 * Detect ALL arXiv ids / DOIs in free text, deduped and capped, so one paste
 * of several references resolves every paper (C1: the agent is not single-paper-only).
 * `detectPaperId` below stays the single-id fast path for the common case.
 */
export function detectPaperIds(text: string, max = 5): PaperResolveInput[] {
  const out: PaperResolveInput[] = [];
  const seen = new Set<string>();
  const arxivRe =
    /arxiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7})|arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/gi;
  for (const m of text.matchAll(arxivRe)) {
    const id = (m[1] ?? m[2] ?? '').replace(/v\d+$/i, '');
    if (!id) continue;
    const key = `arxiv:${id.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ arxiv: id });
    if (out.length >= max) return out;
  }
  const doiRe = /doi:\s*(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)|doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/gi;
  for (const m of text.matchAll(doiRe)) {
    const id = m[1] ?? m[2] ?? '';
    if (!id) continue;
    const key = `doi:${id.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ doi: id });
    if (out.length >= max) return out;
  }
  return out;
}

/** Detect arXiv id / DOI in free text (e.g. "Reproduce arXiv:1706.03762"). */
export function detectPaperId(text: string): PaperResolveInput | null {
  const arxiv =
    text.match(/\barxiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+\/\d{7})/i)?.[1] ||
    text.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i)?.[1];
  if (arxiv) return { arxiv: arxiv.replace(/v\d+$/i, '') };
  const doi =
    text.match(/\bdoi:\s*(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i)?.[1] ||
    text.match(/doi\.org\/(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i)?.[1];
  if (doi) return { doi };
  return null;
}

/** The platform's result shape varies a little by provider; keep only what Lab uses. */
export function normalise(raw: unknown): Resource | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.title !== 'string' || typeof r.url !== 'string') return null;
  const meta = r.meta && typeof r.meta === 'object' ? (r.meta as Record<string, unknown>) : undefined;
  const doi =
    typeof r.doi === 'string'
      ? r.doi
      : typeof meta?.doi === 'string'
        ? meta.doi
        : undefined;
  const citationCount =
    typeof r.citationCount === 'number'
      ? r.citationCount
      : typeof meta?.citations === 'number'
        ? meta.citations
        : undefined;
  const snippet =
    typeof r.snippet === 'string'
      ? r.snippet
      : typeof r.description === 'string'
        ? r.description.slice(0, 400)
        : undefined;
  const venue =
    typeof r.venue === 'string' ? r.venue : typeof meta?.venue === 'string' ? meta.venue : undefined;

  return {
    id: String(r.id ?? r.url),
    type: (r.type as ResourceType) ?? 'paper',
    title: r.title,
    url: r.url,
    description: typeof r.description === 'string' ? r.description : undefined,
    source: typeof r.source === 'string' ? r.source : undefined,
    authors: Array.isArray(r.authors) ? r.authors.map(String) : undefined,
    year: typeof r.year === 'number' ? r.year : undefined,
    license: typeof r.license === 'string' ? r.license : undefined,
    doi,
    citationCount,
    snippet,
    venue,
    meta,
  };
}
