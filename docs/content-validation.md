# Content validation

Validation protects the small set of mechanical rules that keep the Markdown
corpus durable. It does not grade prose, determine whether a claim is true, or
replace editorial review.

[RUMDL](https://github.com/rvben/rumdl) handles general Markdown style and
syntax conventions. The repository validator handles corpus-specific rules
that a general-purpose linter cannot know, including canonical names, aliases,
article paths, internal content links, and source-section placement.

This document records the first validator's contract. Its implementation stays
independent of the eventual website framework.

## Scope

The validator scans Markdown files directly inside these entity directories:

```text
content/grapes/
content/regions/
content/styles/
content/concepts/
```

Templates, guides, and research notes are not articles and are outside content
validation. Nested content directories are rejected rather than interpreted as
a taxonomy.

## Errors

A validation run fails when:

- a content file cannot be parsed as Markdown with YAML frontmatter;
- frontmatter is missing, has no nonempty string `title`, or contains keys
  other than `title` and `aliases`;
- `aliases` is not a list of nonempty, unique strings;
- an alias repeats its own canonical title after normalization;
- a filename is not lowercase ASCII kebab-case ending in `.md`;
- two files of the same entity type have the same normalized canonical title;
- canonical titles or aliases create a normalized collision within an entity
  type;
- the article lacks exactly one level-one heading matching its title;
- a relative Markdown link from an article escapes `content/`, targets a
  non-Markdown file, or does not resolve to an existing article;
- an article has no final `## Sources` section or that section is empty.

Title and alias comparison should normalize Unicode and case without removing
meaningful punctuation or diacritics. The diagnostic should show every file
involved in a collision rather than choosing a winner.

## Review diagnostics

Some conditions deserve attention but can be legitimate. The first validator
should report them separately without failing the run:

- a canonical title or alias collides across different entity types;
- an alias occurs on more than one article across different entity types;
- an article contains a link fragment, since headings are less stable than
  filenames.

Cross-type collisions matter to search but can be real—for example, a region
and a wine style may share a name. They require editorial review rather than an
automatic suffix or metadata scheme.

## Deliberate omissions

The normal validation command does not:

- fetch external URLs;
- assess source quality or factual accuracy;
- impose word counts or require every template section;
- assign style, quality, or completeness scores;
- require reciprocal links or hand-maintained backlinks;
- create redirects or mutate content;
- generate search indexes, embeddings, or graph data.

External link health can become a separate periodic check. Site-specific URL
conversion, backlinks, and search indexes remain derived build steps.

## Command behavior

Run the tests and validate the corpus with:

```sh
npm run check
```

Run content validation alone with `npm run validate`, or Markdown linting alone
with `npm run lint:markdown`. The validation command is suitable for local use
and CI. It is:

- deterministic and offline;
- read-only;
- fast enough to run after every article edit;
- explicit about errors versus review diagnostics;
- concise, with relative file paths and line numbers where available;
- nonzero on errors and zero when only review diagnostics remain.

Do not make the website build the only way to validate content. The website may
invoke the validator, but article authors should be able to check the corpus
without running a development server.

## Test fixtures

The test suite covers:

- a minimal valid article and an article with aliases;
- malformed and missing frontmatter;
- unexpected frontmatter keys;
- invalid filenames and nested paths;
- title and alias collisions, including Unicode and case variants;
- valid same-directory and cross-directory links;
- missing, escaping, absolute, and non-Markdown internal targets;
- Markdown-like links inside code spans and fenced code blocks;
- one missing, mismatched, or duplicated level-one heading;
- missing, misplaced, and empty source sections;
- a legitimate cross-entity title collision reported for review.

Fixture articles should be isolated from the real corpus so deliberately broken
examples never become published content.
