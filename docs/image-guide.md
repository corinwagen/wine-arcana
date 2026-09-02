# Image guide

Wine Arcana uses images sparingly. An image should clarify a place, object, or
process that the article discusses; it is not decoration or a requirement for
every page.

## License boundary

Only works explicitly released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) may be added.
Public-domain marks, other Creative Commons licenses, stock-site labels, and
claims repeated by aggregators do not satisfy this rule.

[Openverse](https://openverse.org/) is a discovery tool, not licensing
evidence. Before downloading a candidate, open its original landing page and
confirm both that the source identifies the depicted subject and that the
individual file is marked CC0. Prefer established repositories such as
Wikimedia Commons, but still verify the file page: repositories do not warrant
every uploader's claims.

Avoid images whose usefulness depends on identifying an unverified cultivar,
person, producer, or technique. A generic grape bunch must not be captioned as
Baga or Nebbiolo merely because a search result associated the two. Consider
privacy, trademarks, and personality rights separately from copyright.

## Workflow

Search Openverse's CC0 results from the command line:

```sh
npm run images:search -- "Mosel vineyard" --limit 12
```

Then:

1. Inspect the image at useful size and open the original source page.
2. Confirm its identity and CC0 status on that page.
3. Download a local copy below `media/images/<article-type>/`.
4. Resize oversized photographs to no more than 1,600 pixels on the long edge
   and record any resizing, cropping, colour adjustment, or recompression.
5. Add a complete entry to `media/images.yml`, including the original and
   source URLs, dimensions, Openverse ID, and SHA-256 checksum.
6. Add the image to the article as ordinary Markdown. The alt text describes
   what is visible; the quoted title supplies the visible caption:

   ```md
   ![Steep vineyard.](../../media/images/regions/mosel.jpg "Mosel vineyard.")
   ```

7. Run `npm run check` and inspect the rendered page at desktop and mobile
   widths.

The build copies local images into the static site and generates consistent
creator, source, CC0, and modification credits from the catalog. Do not
hotlink remote images or type licensing credits into article prose.

## Selection

Use one strong image rather than a gallery of near-duplicates. Favour clear
geography, viticultural structures, cellar equipment, and observable
processes. Reject search-engine near-matches, heavily branded scenes, weak
compositions, and images that add no information beyond the prose.

CC0 does not legally require attribution, but Wine Arcana credits creators and
source repositories as an editorial practice. Preserve that credit even if an
asset is later replaced or transformed.
