export function normalize(value) {
  return value.normalize("NFKD").replace(/\p{Mark}/gu, "").toLowerCase();
}

export function searchArticles(records, query) {
  const phrase = normalize(query.trim()).replace(/\s+/g, " ");
  if (!phrase) return [];
  const words = phrase.split(" ");
  return records.flatMap((record) => {
    const names = [record.title, ...record.aliases].map(normalize);
    const body = normalize(record.text);
    const combined = `${names.join(" ")} ${body}`;
    if (!words.every((word) => combined.includes(word))) return [];
    const score = names.some((name) => name === phrase) ? 100 :
      names.some((name) => name.startsWith(phrase)) ? 80 :
        names.some((name) => name.includes(phrase)) ? 60 :
          words.every((word) => names.some((name) => name.includes(word))) ? 40 : 10;
    const position = Math.max(0, body.indexOf(words[0]) - 65);
    const start = position ? record.text.indexOf(" ", position) + 1 : 0;
    const excerpt = `${start ? "…" : ""}${record.text.slice(start, start + 220)}${record.text.length > start + 220 ? "…" : ""}`;
    return [{ ...record, score, excerpt }];
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

async function initializeSearch() {
  const input = document.querySelector("#wine-search");
  const form = input.closest("form");
  const status = document.querySelector("#search-status");
  const results = document.querySelector("#search-results");
  input.value = new URLSearchParams(location.search).get("q")?.slice(0, 200) ?? "";
  let records;
  let request;
  let revision = 0;
  async function update() {
    const current = ++revision;
    const query = input.value.trim();
    results.replaceChildren();
    if (!query) {
      status.textContent = "Search by name, alternative name, or words in an article.";
      return;
    }
    status.textContent = "Searching…";
    try {
      request ??= fetch(new URL("search-index.json", import.meta.url)).then((response) => {
        if (!response.ok) throw new Error("Search index unavailable");
        return response.json();
      });
      records ??= await request;
      if (current !== revision) return;
      const matches = searchArticles(records, query);
      status.textContent = matches.length
        ? `${matches.length} ${matches.length === 1 ? "article" : "articles"} found${matches.length > 50 ? "; showing the first 50" : ""}.`
        : "No articles found. Try another name or fewer words.";
      for (const match of matches.slice(0, 50)) {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.href = new URL(`${match.route}/`, new URL("./", import.meta.url)).href;
        link.textContent = match.title;
        const kind = document.createElement("span");
        kind.className = "result-kind";
        kind.textContent = match.type;
        const excerpt = document.createElement("p");
        excerpt.textContent = match.excerpt;
        item.append(link, kind, excerpt);
        results.append(item);
      }
    } catch {
      if (current !== revision) return;
      request = undefined;
      status.textContent = "Search could not load. Please try again or use the article directories above.";
    }
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = new URL(location.href);
    if (input.value.trim()) url.searchParams.set("q", input.value.trim());
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);
    update();
  });
  let debounce;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => form.requestSubmit(), 180);
  });
  window.addEventListener("popstate", () => {
    input.value = new URLSearchParams(location.search).get("q")?.slice(0, 200) ?? "";
    update();
  });
  await update();
}

if (typeof document !== "undefined") initializeSearch();
