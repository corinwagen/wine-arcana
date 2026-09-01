# Contributing

Wine Arcana is edited as a corpus of ordinary Markdown documents. A useful
change should remain understandable in a text editor and in a Git diff.

## Scope a change

Use one article as the default unit of work. A focused article change may fix
links or citations inside that article, but it should not silently expand into
a cluster of newly drafted pages.

If a useful destination does not exist yet, mention it in the change handoff
as follow-up work. Do not create an empty article, a one-paragraph placeholder,
or a broken internal link merely to reserve the topic.

Editorial policy, templates, validation, and site code are separate kinds of
changes and should normally be reviewed separately from article prose.

## Create an article

1. Choose the canonical subject and check for existing titles and aliases.
2. Copy the relevant file from `templates/` into the correct `content/`
   directory.
3. Name it with a stable, lowercase, kebab-case identifier.
4. Research before drafting. Keep track of which sources support consequential
   claims.
5. Write for an interested non-expert without flattening uncertainty or
   variation.
6. Link to existing canonical articles with relative Markdown links.
7. Remove template sections that add no value.
8. Review the rendered Markdown and the Git diff.
9. Run `npm run check`.

## Frontmatter

Every article requires a title:

```yaml
---
title: Baga
---
```

Aliases may be added when they are genuine names that should find the article:

```yaml
---
title: Grenache
aliases:
  - Garnacha
  - Cannonau
  - Garnatxa
---
```

Do not put flavors, structure, regions, parentage, numeric rankings, source
IDs, or other wine knowledge in frontmatter.

## Review checklist

- The title, filename, canonical identity, and aliases agree.
- The opening identifies the subject and explains why it matters.
- The article explains causes and variation, not just classifications.
- Sensory language is selective and contextual rather than a descriptor list.
- Quantitative and historical claims are appropriately sourced.
- Uncertain or disputed claims are clearly qualified.
- Every source listed was actually consulted for the article.
- Every internal link is relative, canonical, useful, and resolves.
- Optional template sections were omitted when they had nothing useful to say.
- The change contains no unrelated rewriting or generated metadata.

The detailed standards live in the guides under `docs/`. When a recurring
editorial decision is settled during review, update the relevant guide rather
than relying on memory or an unpublished prompt.
