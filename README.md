# Wine Arcana

Wine Arcana is a small, version-controlled wine encyclopedia. Its primary
artifact is a collection of readable Markdown articles connected by ordinary
relative links.

The project begins with grape varieties and will grow into regions, wine
styles, and explanatory concepts as the articles require them.

## Principles

- Keep the corpus useful without the website that renders it.
- Prefer explanation and qualified prose to rigid classification.
- Treat each article as a reviewable unit of work.
- Keep metadata shallow and knowledge in the article body.
- Cite important claims without creating an ornamental citation system.
- Generate search indexes, backlinks, and other graph-like data from Markdown;
  do not maintain them as a second source of truth.

## Repository layout

```text
content/
  grapes/       Grape varieties
  regions/      Regions and appellations
  styles/       Wine styles and production traditions
  concepts/     Viticultural and winemaking concepts
docs/           Editorial and contribution guidance
sources/        Shared bibliography
templates/      Starting points for new articles
site/           Source files used only by the static site
scripts/        Validation, queue, and site-generation tools
public/         Generated site output (ignored by Git)
```

The directory identifies an article's type. Its filename is its stable,
kebab-case identifier, so `content/grapes/chenin-blanc.md` corresponds to
`/grapes/chenin-blanc` on a future site.

## Writing an article

Before drafting, read:

1. [Editorial style](docs/editorial-style.md)
2. [Sourcing guide](docs/sourcing-guide.md)
3. [Naming and linking](docs/linking-and-naming.md)
4. [Article workflow](docs/article-workflow.md)

The planned mechanical checks are defined in
[Content validation](docs/content-validation.md).

Copy the appropriate file from `templates/`, then replace or remove every
instructional placeholder. Article frontmatter is deliberately limited to a
required `title` and optional `aliases`.

Each drafting or editing run should normally have one primary article. Related
articles that do not yet exist become follow-up work rather than thin stubs.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the review checklist.

## Local checks

Install the validator's dependencies once:

```sh
npm install
```

The complete check also requires
[RUMDL](https://github.com/rvben/rumdl) on `PATH` for general Markdown linting.
Then lint the Markdown, run the validator tests, and validate the real corpus:

```sh
npm run check
```

To validate the corpus without rerunning the validator tests, use
`npm run validate`. Use `npm run lint:markdown` for RUMDL alone, or
`npm run format:markdown` to apply its safe Markdown fixes.

## Static site

Build the complete static site from the Markdown corpus with:

```sh
npm run build:site
```

The build writes disposable output to `public/`. It renders footnotes, rewrites
relative article links to site routes, and fails if corpus validation finds an
error. Editorial changes belong in `content/` or `site/`, never solely in the
generated HTML.

The GitHub Pages workflow runs the full repository check and deploys `public/`
on pushes to `main`. The repository's Pages source must be set to **GitHub
Actions** before the first deployment.

## Pilot article queue

The review-gated pilot queue starts one fresh Codex CLI run at a time. Preview
the next assignment with `npm run article:next -- --dry-run`. Once the
repository baseline is committed and the worktree is clean, run it with
`npm run article:next`, then review and commit that article before advancing.

See the [article workflow](docs/article-workflow.md#review-gated-article-queue)
for the safety and scope guarantees.

## Project status

The editorial system, article queue, corpus validator, and minimal static site
are in place. Search and backlink generation remain possible later additions;
neither is required to read or navigate the corpus.

## License

The software and repository materials are available under the [MIT License](LICENSE).
