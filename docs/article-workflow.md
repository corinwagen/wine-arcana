# Article workflow

The Markdown article is the unit of research, writing, review, and change. A
focused workflow keeps agent context clean and makes Git diffs meaningful.

## One article per run

An article run has one named primary file. It may create that file or revise an
existing one, but it should not draft adjacent articles unless the assignment
explicitly says otherwise.

This boundary applies even when research exposes a natural cluster. A Baga
article may establish that Bairrada and Dão deserve pages; those pages still
receive their own research and writing runs. Until they exist, mention the
places naturally without creating broken links or thin stubs.

Maintenance work—such as resolving a renamed link across the corpus or adding
backlinks after several pages exist—can be performed as an explicitly scoped
maintenance run rather than disguised as article drafting.

## Before drafting

1. Read the editorial, sourcing, and linking guides.
2. Confirm the canonical subject, filename, title, and aliases.
3. Search the corpus for existing mentions, synonyms, and possible collisions.
4. Read directly related existing articles to avoid contradiction and
   unnecessary repetition.
5. Assemble a small source set appropriate to the claims the article needs.
6. Identify uncertainty, disputed history, and changing quantitative facts
   before writing confident prose.

Research notes may be kept outside the article during a run, but unpublished
notes and model output are not evidence and do not become an alternate corpus.

## Drafting

Start from the appropriate template. Write the overview after enough research
is complete to know what is central to the subject.

Develop each section around an explanatory purpose. Do not fill a template
heading with generic material simply because the heading exists. Remove
instructions and unused optional sections before review.

Use the editorial guide's soft depth budget as a prior toward selection. Build
from a small set of principal sources, synthesize stable knowledge, and omit
secondary details before expanding the article into a comprehensive literature
review. Going beyond the usual word or source range should reflect the needs of
the subject rather than the amount of research available.

Add links only after confirming their targets. Add citations while the source
of a consequential claim is still clear.

For an existing article, preserve sound prose and organization. Make the
smallest coherent change that accomplishes the assignment.

## Review and validation

Review in this order:

1. **Identity:** canonical title, aliases, path, and subject boundaries.
2. **Substance:** accuracy, explanation, meaningful variation, and omissions.
3. **Evidence:** source quality, claim-to-source fit, uncertainty, and dates.
4. **Style:** clarity, concision, terminology, and descriptor discipline.
5. **Connections:** useful canonical links with no broken destinations.
6. **Diff:** no unrelated edits, mass reformatting, or generated metadata.
7. **Checks:** run repository validation when available.

Do not merge a draft merely because it passes mechanical validation.

## Periodic link enrichment

After roughly 25–40 new articles, schedule an explicitly scoped maintenance
pass over the existing corpus. Search older prose for unlinked titles or aliases
that now resolve to canonical articles, then add only links that materially help
navigation or understanding. Review each candidate in context; do not turn
every name occurrence into a link or generate reciprocal links mechanically.

This pass edits Markdown connections. Derived backlinks and graph indexes
remain reproducible build artifacts and are not editorial authority.

## Handoff

The handoff should state:

- the article created or changed;
- the substantive editorial decisions made;
- the principal sources consulted;
- validation or other checks performed;
- missing related articles, disputed points, or future improvements worth a
  separate run.

Follow-up suggestions are a queue of editorial possibilities, not automatically
approved changes.

## Suggested agent assignment

A future Codex CLI run can be scoped with a prompt like:

```text
Create or revise content/grapes/baga.md as this run's only primary article.
Follow AGENTS.md and all repository editorial guides. Research authoritative
sources, qualify disputed or variable claims, link only to existing canonical
pages, run available validation, and report missing related articles in the
handoff rather than creating them.
```

Provide a more specific editorial goal when revising an existing article so
the agent can make a focused change instead of broadly rewriting it.

## Review-gated article queue

The pilot queue lives in `tasks/article-queue.json`. Preview the next fresh
Codex CLI run without executing it:

```sh
npm run article:next -- --dry-run
```

To work within one article type while preserving the overall queue order, add
`--kind grape`, `--kind region`, `--kind style`, or `--kind concept`:

```sh
npm run article:next -- --kind region --dry-run
```

After the repository baseline is committed and the worktree is clean, launch
one queued article run with:

```sh
npm run article:next
```

The runner:

- selects the first queued article whose file does not yet exist;
- optionally selects only entries of one requested article kind;
- chooses the matching template from the article path;
- requires a clean worktree;
- starts a fresh ephemeral `codex exec` with live web search and a
  workspace-write sandbox;
- refuses unrelated file changes;
- runs the complete repository check; and
- stops for human source review and a commit before the next article.

The queue deliberately has no automatic batch mode. Early articles should not
propagate an unreviewed voice, sourcing mistake, or prompt weakness through the
rest of the pilot corpus. Once the pilot process is stable, concurrency should
use separate Git worktrees and branches rather than multiple agents writing to
one worktree.
