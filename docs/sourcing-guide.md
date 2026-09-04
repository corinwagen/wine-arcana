# Sourcing guide

Sources exist to make the encyclopedia more reliable and to help a reader
follow consequential claims. They are not decoration, and a long source list
does not compensate for weak research.

## Source hierarchy

Prefer the most direct, authoritative source reasonably available for the
claim:

1. Peer-reviewed research and primary scientific publications.
2. Official laws, regulations, statistics, appellation documents, and public
   viticultural institutions.
3. Maintained specialist databases, including genetic and varietal databases.
4. Scholarly books and high-quality reference works with clear authorship.
5. Serious specialist reporting and historically informed regional sources.

Producer, merchant, tourism, and trade-association pages may be useful for
documenting a practice or local account. Treat promotional claims cautiously
and do not use them as the sole support for broad statements of history,
quality, or uniqueness.

Search snippets, unattributed summaries, AI output, and copied citation lists
are discovery aids, not sources. Consult the underlying material before citing
it.

The hierarchy is claim-specific, not a recipe for maximizing the number of
studies in an article. A strong, current varietal database or authoritative
reference work is often the best foundation for established identity,
viticulture, and regional context. Use individual experiments when they test a
mechanism, resolve a disputed claim, or reveal meaningful limits to a
generalization; do not assemble isolated studies merely to give every paragraph
the appearance of scientific rigor.

## Match the source to the claim

Different questions need different evidence:

- Use genetic research or a maintained genetic database for parentage and
  identity.
- Use official texts for current appellation rules and legal definitions.
- Use dated official statistics for planted area and production.
- Use historical scholarship or documents for origins and early names.
- Use strong reference works to synthesize viticulture and established wine
  characteristics.

A source can be generally reputable and still be wrong for a particular
claim. Watch for references that repeat an older account without examining its
evidence.

## Sourcing producer reference points

A producer's own material can establish its vineyards, methods, bottlings,
ownership, and dates. It cannot by itself establish that the producer is
important, representative, or a quality benchmark. Support that editorial
judgment with serious independent reporting, a strong reference work, or
documented historical evidence, then state the specific reason for including
the producer rather than invoking an undefined consensus.

Prefer durable records and a sustained body of work to novelty or current
hype. Verify that the producer and relevant wine remain active when the prose
uses the present tense. The purpose is orientation, not buying advice.

## Claims that need special care

Use direct inline attribution or a footnote when a claim is consequential,
surprising, disputed, unusually precise, or likely to change. Examples include:

- genetic identity and parentage;
- a first documented appearance;
- disputed geographical origin;
- current legal requirements;
- planted-area statistics;
- a direct quotation;
- a claim for which authoritative sources disagree.

Stable, broadly supported background can rely on the article's source list
when the support is unambiguous. Do not footnote every sentence merely to create
the appearance of rigor.

## Uncertainty and disagreement

Report what a source actually establishes. Distinguish among documented fact,
scientific inference, oral tradition, and a repeated but unverified story.
During copyediting, preserve the strength of the evidence: do not change
*suggests*, *indicates*, or *describes as related* to *establishes* unless the
underlying source warrants the stronger claim.

When sources disagree:

1. Prefer evidence closer to the underlying record or research.
2. Check whether the disagreement reflects publication date, terminology, or
   a genuine scholarly dispute.
3. Describe material uncertainty in the prose.
4. Avoid manufacturing balance between evidence of very different quality.

## Article source lists

Every finished article ends with `## Sources` and a Markdown list. Include only
sources actually consulted while researching or verifying that article.

Default to three to six principal sources that together support the article's
important claims. This is a soft budget rather than a hard limit. Prefer a small
set that permits confident synthesis to a long bibliography assembled through
topic-by-topic accumulation. Add sources beyond it when distinct legal,
historical, genetic, or scientific questions genuinely require different
evidence.

Give enough information for a reader to identify the source. As applicable,
include author or institution, title, edition or publication, year, and a
stable direct URL. Add an access date for changeable web material when the date
matters to the claim.

Examples of shape, not mandatory citation syntax:

```md
## Sources

- Jancis Robinson, Julia Harding & José Vouillamoz, *Wine Grapes*, 2012.
- Julius Kühn Institute, Vitis International Variety Catalogue, “Baga.”
- Organização Internacional da Vinha e do Vinho, *Distribution of the World's
  Grapevine Varieties*, 2017.
```

Use ordinary Markdown footnotes for claim-level attribution:

```md
The modern name is documented by the late eighteenth century.[^1]

[^1]: Full source details and, when useful, the relevant page or section.
```

Do not create formal source IDs, citation metadata in frontmatter, or a custom
citation engine. The shared [bibliography](../sources/bibliography.md) is a
convenience for commonly used references, not a substitute for the article's
own source list.

## Verification checklist

- Open and read the cited source rather than trusting a secondary citation.
- Confirm that names, dates, units, and geographical scope match the prose.
- Give changing figures an as-of year.
- Check whether a source is describing a grape, a region, a wine category, or
  a particular producer before generalizing.
- Verify quotations exactly and keep them brief.
- Remove sources that did not materially inform or verify the article.
