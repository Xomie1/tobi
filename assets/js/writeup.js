/* ==========================================================================
   writeup.js — renders writeups/<slug>.md on writeup.html?p=<slug>.
   Metadata (title, date, tags, project) comes from content.js; the body
   is plain Markdown rendered with marked (assets/vendor/marked.min.js).
   ========================================================================== */
(function () {
  "use strict";

  const SITE = window.SITE;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const slug = new URLSearchParams(location.search).get("p") || "";
  const published = SITE.writeups.filter((w) => !w.draft);
  const w = published.find((x) => x.slug === slug);
  const body = $("#w-body");

  function fail(html) {
    $("#w-title").textContent = "404: write-up not found";
    body.innerHTML = `<div class="reader-error">${html}</div>`;
  }

  if (!w) {
    fail(
      `less: writeups/${esc(slug || "?")}.md: No such file or directory<br /><br />` +
        published.map((x) => `→ <a href="writeup.html?p=${esc(x.slug)}">${esc(x.title)}</a>`).join("<br />")
    );
    return;
  }

  const project = SITE.projects.find((p) => p.slug === w.project);
  document.title = `${w.title} · Tobi Akindele`;
  $("#w-file").textContent = `writeups/${w.slug}.md`;
  $("#w-title").textContent = w.title;
  $("#w-sub").textContent = w.summary;
  $("#sb-path").textContent = `~/portfolio/writeups/${w.slug}.md`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", w.summary);

  function frontMatter(minutes) {
    const k = (s) => `<span class="k">${s}</span><span class="p">:</span>`;
    const s = (v) => `<span class="s">${esc(v)}</span>`;
    const lines = [
      `${k("date")} ${s(w.date)}`,
      `${k("tags")} <span class="p">[</span>${w.tags.map(s).join('<span class="p">, </span>')}<span class="p">]</span>`,
    ];
    if (project)
      lines.push(`${k("project")} <a href="index.html#projects/${esc(project.slug)}">${esc(project.slug)}/</a>`);
    if (project?.repo) lines.push(`${k("source")} <a href="${esc(project.repo)}" target="_blank" rel="noopener">${esc(project.repo.replace("https://", ""))}</a>`);
    if (minutes) lines.push(`${k("reading_time")} <span class="n">${minutes}</span> <span class="c"># minutes</span>`);
    $("#w-front").innerHTML = lines.join("\n");
    $("#w-front-win").hidden = false;
  }

  // ---- tiny syntax highlighter for fenced code blocks ----------------------
  const KW = {
    python:
      "def class return if elif else for while in not and or is import from as with try except finally raise lambda None True False yield pass break continue async await",
    js: "const let var function return if else for while of in new class extends import from export default try catch finally throw async await null undefined true false this",
    bash: "if then fi for do done in echo export cd source",
    sql: "select from where join left right inner on group by order having as and or not null insert update delete create view table with case when then else end",
  };
  const COMMENT = { python: "#[^\\n]*", bash: "#[^\\n]*", js: "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/", sql: "--[^\\n]*" };

  function highlight(codeEl) {
    const m = (codeEl.className || "").match(/language-(\w+)/);
    let lang = m && m[1].toLowerCase();
    if (lang === "javascript") lang = "js";
    if (lang === "sh" || lang === "shell") lang = "bash";
    if (!lang || !KW[lang]) return;
    const words = new Set(KW[lang].split(" "));
    const re = new RegExp(
      `(${COMMENT[lang]})|("""[\\s\\S]*?"""|'''[\\s\\S]*?'''|"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*')|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_]\\w*)`,
      "g"
    );
    const src = codeEl.textContent;
    let html = "";
    let last = 0;
    for (const t of src.matchAll(re)) {
      html += esc(src.slice(last, t.index));
      if (t[1]) html += `<span class="tok-c">${esc(t[1])}</span>`;
      else if (t[2]) html += `<span class="tok-s">${esc(t[2])}</span>`;
      else if (t[3]) html += `<span class="tok-n">${esc(t[3])}</span>`;
      else if (words.has(lang === "sql" ? t[4].toLowerCase() : t[4])) html += `<span class="tok-k">${esc(t[4])}</span>`;
      else html += esc(t[4]);
      last = t.index + t[0].length;
    }
    codeEl.innerHTML = html + esc(src.slice(last));
  }

  // ---- prev / next ---------------------------------------------------------
  const i = published.indexOf(w);
  const prev = published[i - 1];
  const next = published[i + 1];
  $("#w-nav").innerHTML =
    (prev ? `<a class="box prev" href="writeup.html?p=${esc(prev.slug)}"><span class="box-label faint">← prev</span>${esc(prev.title)}</a>` : "") +
    (next ? `<a class="box next" href="writeup.html?p=${esc(next.slug)}"><span class="box-label faint">next →</span>${esc(next.title)}</a>` : "");

  // ---- load + render -------------------------------------------------------
  fetch(`writeups/${encodeURIComponent(w.slug)}.md`)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((md) => {
      const minutes = Math.max(1, Math.round(md.split(/\s+/).length / 220));
      frontMatter(minutes);
      $("#sb-read").textContent = `${minutes} min read · markdown`;
      body.innerHTML = window.marked ? window.marked.parse(md) : `<pre>${esc(md)}</pre>`;
      // the page already shows the title, so drop the Markdown H1
      const h1 = body.querySelector("h1");
      if (h1) h1.remove();
      body.querySelectorAll("pre code").forEach(highlight);
      body.querySelectorAll('a[href^="http"]').forEach((a) => {
        a.target = "_blank";
        a.rel = "noopener";
      });
    })
    .catch(() => {
      frontMatter();
      body.innerHTML = `<div class="reader-error">
        less: couldn't load <b>writeups/${esc(w.slug)}.md</b>.<br /><br />
        Opening this page straight from disk? Browsers block that. From the repo folder, run
        <code>python3 -m http.server</code> and open
        <code>http://localhost:8000/writeup.html?p=${esc(w.slug)}</code>.<br /><br />
        Or <a href="${esc(SITE.profile.source)}/blob/main/writeups/${esc(w.slug)}.md" target="_blank" rel="noopener">read it on GitHub ↗</a>
      </div>`;
    });
})();
