# Instructions for coding and writing agents

Wine Arcana's source of truth is the Markdown corpus. Preserve its readability
outside any renderer, index, or agent workflow.

## Read before article work

Read all four guides before drafting or substantially editing an article:

- `docs/editorial-style.md`
- `docs/sourcing-guide.md`
- `docs/linking-and-naming.md`
- `docs/article-workflow.md`

Also inspect the appropriate template and any existing articles directly
related to the assigned subject.

Before adding or replacing an image, read `docs/image-guide.md`.

## Default scope

- Treat one article as one run's primary unit of work unless explicitly asked
  for a broader change.
- Do not create related articles, placeholder pages, or speculative links to
  satisfy the primary article.
- Report worthwhile missing articles and cross-links in the handoff.
- Do not revise project-wide policy or templates during article work unless
  the task explicitly includes that change.
- Make surgical edits to existing articles. Do not regenerate a page wholesale
  when a focused revision will do.
- Preserve unrelated changes already present in the worktree.

## Content constraints

- Use only ordinary Markdown, shallow YAML frontmatter, and relative Markdown
  links. Do not introduce MDX, wiki links, embedded components, or structured
  claim metadata.
- Frontmatter contains `title` and, when useful, `aliases`. Do not add new keys
  without an explicit repository-wide decision.
- Keep claims in qualified prose. Do not invent scores or fixed rankings for
  acidity, tannin, body, aroma, quality, or similar properties.
- Prefer causal explanation, meaningful comparison, and regional variation to
  lists of facts or tasting descriptors.
- State uncertainty and distinguish evidence from tradition or interpretation.
- Never fabricate a source, quotation, date, legal rule, genetic relationship,
  or precise measurement. Do not cite a search result or an AI-generated
  summary as evidence.
- List only sources actually consulted. Use an inline footnote when a specific
  consequential claim needs direct attribution.
- Link only to canonical articles that already exist. A missing destination is
  follow-up work, not permission to leave a broken link.
- Add only locally stored, source-verified CC0 images cataloged in
  `media/images.yml`. Do not infer a cultivar, person, place, or process from a
  search result alone.

## Completion

Before handing off article work:

1. Review the full article, not only the edited passage.
2. Check the diff for unrelated or wholesale rewriting.
3. Run the repository's validation command when one is present.
4. Summarize the substantive change, sources used, checks run, and useful
   follow-up topics.

Derived search indexes, backlinks, embeddings, and knowledge graphs are build
artifacts. They must remain reproducible from the Markdown corpus and must not
be treated as editorial authority.
