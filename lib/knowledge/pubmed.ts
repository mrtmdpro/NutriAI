import "server-only";

/**
 * PubMed E-utilities client.
 *
 * Free, public, no key needed (3 req/s); with an NCBI API key the
 * limit is 10 req/s. We honor both. See
 * https://www.ncbi.nlm.nih.gov/books/NBK25500/.
 *
 * We use `esearch` to find PMIDs for a query, then `esummary` to fetch
 * lightweight metadata. For full abstracts we use `efetch` (XML).
 */

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export type PubmedSummary = {
  pmid: string;
  title: string;
  abstract?: string;
  publishedAt?: string;
  publicationTypes: string[];
  url: string;
};

async function eutilsFetch(path: string, attempt = 0): Promise<Response> {
  const res = await fetch(`${EUTILS_BASE}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 429 && attempt < 3) {
    // PubMed E-utilities is 3 req/s without an API key. Back off
    // linearly on 429s; we run far below the threshold in steady
    // state but cron + manual triggers can collide.
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    return eutilsFetch(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`PubMed ${path} → ${res.status}`);
  return res;
}

async function eutilsJson(path: string): Promise<unknown> {
  const res = await eutilsFetch(path);
  return res.json();
}

async function eutilsText(path: string): Promise<string> {
  const res = await eutilsFetch(path);
  return res.text();
}

/**
 * Search PubMed for the most relevant `count` PMIDs matching a query,
 * filtered to clinical trials, RCTs, meta-analyses, and systematic
 * reviews (i.e. evidence tiers A-B per our taxonomy).
 */
export async function searchPubmed(
  query: string,
  count = 5
): Promise<string[]> {
  const term = `(${query}) AND (clinical trial[pt] OR randomized controlled trial[pt] OR meta-analysis[pt] OR systematic review[pt])`;
  const params = new URLSearchParams({
    db: "pubmed",
    term,
    retmode: "json",
    retmax: String(count),
    sort: "relevance",
  });
  const json = (await eutilsJson(`/esearch.fcgi?${params.toString()}`)) as {
    esearchresult?: { idlist?: string[] };
  };
  return json.esearchresult?.idlist ?? [];
}

export async function fetchPubmedSummaries(
  pmids: readonly string[]
): Promise<PubmedSummary[]> {
  if (pmids.length === 0) return [];

  const sumParams = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    retmode: "json",
  });
  const json = (await eutilsJson(`/esummary.fcgi?${sumParams.toString()}`)) as {
    result?: Record<string, unknown>;
  };
  const result = json.result ?? {};

  // Abstracts come from efetch (text mode is simplest).
  const fetchParams = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    rettype: "abstract",
    retmode: "text",
  });
  const abstractText = await eutilsText(`/efetch.fcgi?${fetchParams.toString()}`);
  const abstractsByPmid = parseEfetchAbstractText(abstractText);

  return pmids
    .map((pmid): PubmedSummary | null => {
      const row = (result[pmid] ?? null) as Record<string, unknown> | null;
      if (!row) return null;
      const title = (row.title as string | undefined) ?? "";
      if (!title) return null;
      const pubTypesRaw = row.pubtype as string[] | undefined;
      return {
        pmid,
        title: title.trim(),
        abstract: abstractsByPmid.get(pmid),
        publishedAt: (row.pubdate as string | undefined) ?? undefined,
        publicationTypes: pubTypesRaw ?? [],
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      };
    })
    .filter((x): x is PubmedSummary => x !== null);
}

/**
 * efetch text output groups abstracts under "PMID-<id>" lines. This is
 * a deliberately simple parser — sufficient for our seed-and-summarize
 * pipeline. If we need higher fidelity later, switch to retmode=xml.
 */
function parseEfetchAbstractText(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const blocks = text.split(/\n\n(?=PMID-\s*\d+)/);
  for (const block of blocks) {
    const pmidMatch = /^PMID-\s*(\d+)/m.exec(block);
    if (!pmidMatch) continue;
    const pmid = pmidMatch[1];
    const abMatch = /AB\s*-\s*(.+?)(?:\n[A-Z]{2,4}\s*-|$)/s.exec(block);
    if (abMatch) {
      out.set(pmid, abMatch[1].replace(/\s+/g, " ").trim());
    }
  }
  return out;
}

export function inferEvidenceTier(
  publicationTypes: readonly string[]
): "A" | "B" | "C" | "D" {
  // PubMed pubtype values are case-sensitive variants like
  //   "Clinical Trial", "Clinical Trial, Phase III",
  //   "Randomized Controlled Trial", "Controlled Clinical Trial",
  //   "Multicenter Study", "Meta-Analysis", "Systematic Review",
  //   "Cohort Studies", "Case-Control Studies", "Observational Study".
  // We match by substring after lowercasing so subtypes don't fall
  // through to the default tier.
  const lower = publicationTypes.map((t) => t.toLowerCase());
  if (
    lower.some(
      (t) => t.includes("meta-analysis") || t.includes("systematic review")
    )
  ) {
    return "A";
  }
  if (
    lower.some(
      (t) => t.includes("randomized") || t.includes("clinical trial")
    )
  ) {
    return "B";
  }
  if (
    lower.some(
      (t) =>
        t.includes("cohort") ||
        t.includes("observational") ||
        t.includes("case-control")
    )
  ) {
    return "C";
  }
  return "D";
}
