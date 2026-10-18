/* ==========================================================================
   main.js — renders the lists from content.js and wires up the UI:
   themes, clock, mobile menu, project filters + detail window, write-up
   list, roadmap, skills.json, command palette, scroll-spy status bar.
   Runs on index.html and writeup.html; each block skips itself when its
   elements aren't on the page.
   ========================================================================== */
(function () {
  "use strict";

  const SITE = window.SITE;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const onIndex = !!$("#projects");
  const home = onIndex ? "" : "index.html";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const projectsBySlug = new Map(SITE.projects.map((p) => [p.slug, p]));
  const writeupsBySlug = new Map(SITE.writeups.map((w) => [w.slug, w]));
  const writeupUrl = (slug) => `writeup.html?p=${encodeURIComponent(slug)}`;
  const projectUrl = (slug) => `${home}#projects/${slug}`;

  function safeStore(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) {
      return null;
    }
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  // ---------------------------------------------------------------- theme --
  const THEMES = ["midnight", "paper", "phosphor"];
  const THEME_COLOR = { midnight: "#0a0d12", paper: "#f4f1ea", phosphor: "#020702" };

  function setTheme(name) {
    if (!THEMES.includes(name)) return false;
    document.documentElement.setAttribute("data-theme", name);
    safeStore("theme", name);
    const label = $("#theme-name");
    if (label) label.textContent = name;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLOR[name]);
    return true;
  }
  const currentTheme = () => document.documentElement.getAttribute("data-theme") || "midnight";
  setTheme(currentTheme());
  $("#theme-btn")?.addEventListener("click", () => {
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
    setTheme(next);
  });

  // ---------------------------------------------------------------- clock --
  const clock = $("#clock");
  if (clock) {
    const pad = (n) => String(n).padStart(2, "0");
    const tick = () => {
      const d = new Date();
      clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    tick();
    setInterval(tick, 1000);
  }
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  // ---------------------------------------------------------- mobile menu --
  const menuBtn = $("#menu-btn");
  const menu = $("#mobile-menu");
  if (menuBtn && menu) {
    const setOpen = (open) => {
      menu.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
    };
    menuBtn.addEventListener("click", () => setOpen(!menu.classList.contains("open")));
    $$("a", menu).forEach((a) => a.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
  }

  // ------------------------------------------------------- education.yml --
  const eduEl = $("#education-yml");
  if (eduEl) {
    const k = (s) => `<span class="k">${esc(s)}</span><span class="p">:</span>`;
    const s = (v) => `<span class="s">${esc(v)}</span>`;
    const c = (v) => `<span class="c"># ${esc(v)}</span>`;
    const lines = [k("education")];
    SITE.education.forEach((e) => {
      lines.push(`  <span class="p">-</span> ${k("degree")} ${s(e.degree)}`);
      lines.push(`    ${k("school")} ${s(e.school)}`);
      lines.push(`    ${k("dates")} ${s(e.dates)}${e.note ? "  " + c(e.note) : ""}`);
      if (e.awards?.length) {
        lines.push(`    ${k("awards")}`);
        e.awards.forEach((a) => lines.push(`      <span class="p">-</span> ${s(a)}`));
      }
    });
    lines.push("");
    lines.push(k("certifications"));
    SITE.certifications.forEach((cert) => lines.push(`  <span class="p">-</span> ${s(cert)}`));
    eduEl.innerHTML = lines.join("\n");
  }

  // -------------------------------------------------------------- git log --
  function shortSha(str) {
    let h = 2166136261;
    for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return (h >>> 0).toString(16).padStart(8, "0").slice(0, 7);
  }

  const gitlog = $("#gitlog");
  if (gitlog) {
    const items = SITE.experience.map((x, i) => {
      const refs =
        i === 0
          ? `(<span class="head">HEAD -&gt; main</span>, <span class="tag">tag: ${esc(x.id)}</span>)`
          : `(<span class="tag">tag: ${esc(x.id)}</span>)`;
      const proj = x.project && projectsBySlug.get(x.project);
      return `
        <li class="commit">
          <div class="commit-head">
            <span class="sha">${shortSha(x.id + x.role)}</span>
            <span class="refs">${refs}</span>
            <span class="commit-date">${esc(x.dates)}</span>
          </div>
          <h3>${esc(x.role)}</h3>
          <div class="commit-org">${esc(x.org)}${x.note ? " · " + esc(x.note) : ""}</div>
          <ul class="commit-bullets">${x.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
          <ul class="stack-row" aria-label="Stack">${x.stack.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          ${
            proj
              ? `<p class="hint"><a href="${projectUrl(proj.slug)}" data-open="${esc(proj.slug)}">→ open ~/projects/${esc(proj.slug)}</a></p>`
              : ""
          }
        </li>`;
    });
    const first = SITE.education[SITE.education.length - 1];
    items.push(`
      <li class="commit">
        <div class="commit-head">
          <span class="sha">${shortSha("root")}</span>
          <span class="refs">(<span class="tag">tag: v0.1</span>)</span>
          <span class="commit-date">${esc(first.dates)}</span>
        </div>
        <h3>initial commit</h3>
        <div class="commit-org">${esc(first.degree)} · ${esc(first.school)}</div>
      </li>`);
    gitlog.innerHTML = items.join("");
  }

  // ------------------------------------------------------------- projects --
  const grid = $("#proj-grid");
  const list = $("#proj-list");
  const state = { tag: "all", q: "", archive: false, view: safeStore("projView") === "list" ? "list" : "grid" };

  const allProjects = [
    ...SITE.projects.filter((p) => p.featured && !p.archived),
    ...SITE.projects.filter((p) => !p.featured && !p.archived),
    ...SITE.projects.filter((p) => p.archived),
  ];
  const archivedCount = allProjects.filter((p) => p.archived).length;

  function matches(p) {
    if (p.archived && !state.archive) return false;
    if (state.tag !== "all" && !p.tags.includes(state.tag)) return false;
    if (state.q) {
      const hay = [p.name, p.slug, p.summary, p.context, ...(p.stack || []), ...(p.tags || [])].join(" ").toLowerCase();
      return state.q
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((term) => hay.includes(term));
    }
    return true;
  }

  function linkBits(p, cls = "") {
    const bits = [];
    if (p.repo) bits.push(`<a class="${cls}" href="${esc(p.repo)}" target="_blank" rel="noopener">src ↗</a>`);
    else if (p.private) bits.push(`<span class="muted">private repo</span>`);
    if (p.writeup && writeupsBySlug.has(p.writeup) && !writeupsBySlug.get(p.writeup).draft)
      bits.push(`<a class="${cls}" href="${writeupUrl(p.writeup)}">write-up</a>`);
    return bits.join("");
  }

  function cardHTML(p) {
    return `
      <article class="card${p.featured ? " featured" : ""}" data-slug="${esc(p.slug)}">
        <div class="card-top">
          <div>
            <div class="card-path">~/projects/${esc(p.slug)}</div>
            <h3><button type="button" data-open="${esc(p.slug)}">${esc(p.name)}</button></h3>
            ${p.context ? `<div class="card-ctx">${esc(p.context)}</div>` : ""}
          </div>
          <span class="status status-${esc(p.status)}">${esc(p.status)}</span>
        </div>
        <p>${esc(p.summary)}</p>
        <div class="card-stack">${(p.stack || []).map((s) => esc(s.toLowerCase())).join(" · ")}</div>
        <div class="card-foot">
          ${linkBits(p)}
          <button type="button" class="link-plain" data-open="${esc(p.slug)}">details →</button>
          <span class="year">${esc(p.year || "")}</span>
        </div>
      </article>`;
  }

  function rowHTML(p) {
    return `
      <tr data-slug="${esc(p.slug)}">
        <td class="perm"><span class="status status-${esc(p.status)}">${esc(p.status)}</span></td>
        <td class="yr">${esc(p.year || "—")}</td>
        <td class="nm"><button type="button" data-open="${esc(p.slug)}">${esc(p.slug)}/</button></td>
        <td class="sm">${esc(p.summary)}</td>
        <td class="st">${(p.stack || []).map((s) => esc(s.toLowerCase())).join(", ")}</td>
      </tr>`;
  }

  function renderProjects() {
    if (!grid) return;
    const shown = allProjects.filter(matches);
    grid.innerHTML = shown.map(cardHTML).join("");
    list.innerHTML = `
      <table class="ls-table">
        <thead><tr><th>status</th><th>year</th><th>name</th><th>summary</th><th>stack</th></tr></thead>
        <tbody>${shown.map(rowHTML).join("")}</tbody>
      </table>`;
    grid.hidden = state.view !== "grid" || !shown.length;
    list.hidden = state.view !== "list" || !shown.length;
    $("#proj-empty").hidden = shown.length > 0;
    $("#proj-count").textContent = `(${shown.length})`;

    let cmd = "ls" + (state.view === "list" ? " -l" : "") + (state.archive ? " -a" : "") + " projects/";
    if (state.tag !== "all") cmd += ` --tag=${state.tag}`;
    if (state.q) cmd += ` | grep -i "${state.q}"`;
    $("#ls-cmd").textContent = cmd;

    const hint = $("#archive-hint");
    hint.innerHTML = state.archive
      ? `showing ${archivedCount} archived builds too. <button type="button" class="link-btn" data-archive="off">hide them</button>`
      : `+ ${archivedCount} archived builds (small web sites, early experiments) are hidden, like dotfiles. <button type="button" class="link-btn" data-archive="on">ls -a</button>`;
  }

  // only offer tags that match something visible (e.g. --design lives in the archive)
  function renderFlags() {
    const pool = allProjects.filter((p) => state.archive || !p.archived);
    const used = new Set(pool.flatMap((p) => p.tags));
    if (state.tag !== "all" && !used.has(state.tag)) state.tag = "all";
    $("#tag-flags").innerHTML = ["all", ...SITE.TAGS.filter((t) => used.has(t))]
      .map(
        (t) =>
          `<button type="button" class="flag" data-tag="${t}" aria-pressed="${t === state.tag}">${t === "all" ? "all" : "--" + t}</button>`
      )
      .join("");
  }

  function setArchive(on) {
    if (!grid) return;
    state.archive = on;
    $("#archive-flag").setAttribute("aria-pressed", String(on));
    renderFlags();
    renderProjects();
  }

  function setView(view) {
    state.view = view;
    safeStore("projView", view);
    $$(".seg-btn").forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    renderProjects();
  }

  function setTag(tag) {
    state.tag = tag;
    $$("#tag-flags .flag").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tag === tag)));
    renderProjects();
  }

  if (grid) {
    renderFlags();
    $("#tag-flags").addEventListener("click", (e) => {
      const b = e.target.closest(".flag");
      if (b) setTag(b.dataset.tag);
    });
    $("#proj-search").addEventListener("input", (e) => {
      state.q = e.target.value.trim();
      renderProjects();
    });
    $("#archive-flag").addEventListener("click", () => setArchive(!state.archive));
    $("#archive-hint").addEventListener("click", (e) => {
      const b = e.target.closest("[data-archive]");
      if (b) setArchive(b.dataset.archive === "on");
    });
    $$(".seg-btn").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
    $("#proj-reset").addEventListener("click", () => {
      state.q = "";
      $("#proj-search").value = "";
      setTag("all");
    });
    setView(state.view);
  }

  // ------------------------------------------------------ project dialog --
  const dialog = $("#proj-dialog");

  function openProject(slug, { updateHash = true } = {}) {
    const p = projectsBySlug.get(slug);
    if (!p) return false;
    if (!dialog) {
      location.href = projectUrl(slug);
      return true;
    }
    const w = p.writeup && writeupsBySlug.get(p.writeup);
    const links = [];
    if (p.repo) links.push(`<a class="btn btn-primary" href="${esc(p.repo)}" target="_blank" rel="noopener">view source ↗</a>`);
    if (w && !w.draft) links.push(`<a class="btn" href="${writeupUrl(w.slug)}">read the write-up</a>`);
    (p.links || []).forEach((l) => links.push(`<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`));
    if (!p.repo && p.private)
      links.push(
        `<a class="btn" href="mailto:${esc(SITE.profile.email)}?subject=${encodeURIComponent("Walkthrough: " + p.name)}">private repo · ask me for a walkthrough</a>`
      );

    $("#proj-dialog-path").textContent = `~/projects/${p.slug}/README.md`;
    $("#proj-dialog-body").innerHTML = `
      <div class="pd-head">
        <div>
          <h2 id="proj-dialog-title">${esc(p.name)}</h2>
          <p class="pd-meta">${[p.year, p.context, p.tags.map((t) => "#" + t).join(" ")].filter(Boolean).map(esc).join(" · ")}</p>
        </div>
        <span class="status status-${esc(p.status)}">${esc(p.status)}</span>
      </div>
      <p class="pd-summary">${esc(p.summary)}</p>
      ${p.image ? `<figure class="pd-shot"><img src="${esc(p.image)}" alt="${esc(p.imageAlt || p.name)}" loading="lazy" /></figure>` : ""}
      ${p.details?.length ? `<ul class="pd-details">${p.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
      <p class="pd-label"># stack</p>
      <ul class="stack-row">${(p.stack || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
      <div class="pd-links">${links.join("")}</div>`;
    if (!dialog.open) dialog.showModal();
    $("#proj-dialog-body").scrollTop = 0;
    if (updateHash) history.replaceState(null, "", `#projects/${p.slug}`);
    return true;
  }

  function closeProject() {
    if (dialog?.open) dialog.close();
  }

  if (dialog) {
    $("#proj-dialog-close").addEventListener("click", closeProject);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeProject(); // backdrop click
    });
    dialog.addEventListener("close", () => {
      if (location.hash.startsWith("#projects/")) history.replaceState(null, "", "#projects");
    });
  }

  // any [data-open] anywhere opens a project; clicking a card does too
  document.addEventListener("click", (e) => {
    const opener = e.target.closest("[data-open]");
    if (opener && projectsBySlug.has(opener.dataset.open)) {
      e.preventDefault();
      openProject(opener.dataset.open);
      return;
    }
    if (e.target.closest("a, button, input")) return;
    const card = e.target.closest(".card[data-slug], .ls-table tr[data-slug]");
    if (card) openProject(card.dataset.slug);
  });

  function handleHash() {
    const m = location.hash.match(/^#projects\/([\w-]+)$/);
    if (m) openProject(m[1], { updateHash: false });
  }
  window.addEventListener("hashchange", handleHash);

  // ------------------------------------------------------------ write-ups --
  const wlist = $("#writeup-list");
  if (wlist) {
    const published = SITE.writeups.filter((w) => !w.draft).sort((a, b) => (a.date < b.date ? 1 : -1));
    const drafts = SITE.writeups.filter((w) => w.draft);
    wlist.innerHTML = [...published, ...drafts]
      .map((w) => {
        const proj = projectsBySlug.get(w.project);
        const title = w.draft
          ? `${esc(w.title)}<span class="badge-draft">coming soon</span>`
          : `<a href="${writeupUrl(w.slug)}">${esc(w.title)}</a>`;
        return `
          <li class="writeup-item${w.draft ? " draft" : ""}" data-slug="${esc(w.slug)}">
            <span class="wd">${w.draft ? "drafts/" : esc(w.date)}</span>
            <div>
              <h3>${title}</h3>
              <p>${esc(w.summary)}</p>
              <span class="wt">${w.tags.map((t) => "#" + esc(t)).join(" ")}</span>
              ${proj ? ` <span class="t-faint">·</span> <a href="${projectUrl(proj.slug)}" data-open="${esc(proj.slug)}" class="wt">${esc(proj.slug)}/</a>` : ""}
            </div>
            <span class="wr" data-read="${esc(w.slug)}">${w.draft ? "" : "…"}</span>
          </li>`;
      })
      .join("");

    // reading time, when the .md files are reachable (not on file://)
    published.forEach((w) => {
      const slot = $(`[data-read="${w.slug}"]`, wlist);
      fetch(`writeups/${w.slug}.md`)
        .then((r) => (r.ok ? r.text() : Promise.reject()))
        .then((md) => (slot.textContent = `${Math.max(1, Math.round(md.split(/\s+/).length / 220))} min read`))
        .catch(() => (slot.textContent = ""));
    });
  }

  // -------------------------------------------------------------- roadmap --
  const board = $("#roadmap-board");
  if (board) {
    const lanes = [
      { key: "now", label: "now", sub: "in progress", box: "[~]" },
      { key: "next", label: "next", sub: "up next", box: "[ ]" },
      { key: "later", label: "later", sub: "someday", box: "[ ]" },
    ];
    board.innerHTML =
      lanes
        .map((lane) => {
          const items = SITE.roadmap.filter((r) => r.status === lane.key);
          return `
            <div class="lane lane-${lane.key}">
              <h3><span><b>## ${lane.label}</b> · ${lane.sub}</span><span>${items.length}</span></h3>
              <ul>
                ${items
                  .map(
                    (r) => `
                  <li class="todo">
                    <span class="box" aria-hidden="true">${lane.box}</span>
                    <div>
                      <strong>${esc(r.title)}</strong>
                      ${r.project && projectsBySlug.has(r.project) ? `<a class="proj" href="${projectUrl(r.project)}" data-open="${esc(r.project)}">${esc(r.project)}/</a>` : ""}
                      <p>${esc(r.note)}</p>
                    </div>
                  </li>`
                  )
                  .join("")}
              </ul>
            </div>`;
        })
        .join("") +
      `<p class="roadmap-foot"># got an idea that belongs on this list? <a href="#contact">./contact.sh</a></p>`;
  }

  // ---------------------------------------------------------- skills.json --
  const skillsEl = $("#skills-json");
  if (skillsEl) {
    const entries = Object.entries(SITE.skills);
    skillsEl.innerHTML =
      `<span class="p">{</span>\n` +
      entries
        .map(([key, vals], i) => {
          const arr = vals.map((v) => `<span class="s">"${esc(v)}"</span>`).join('<span class="p">, </span>');
          return `  <span class="k">"${esc(key)}"</span><span class="p">: [</span>${arr}<span class="p">]${i < entries.length - 1 ? "," : ""}</span>`;
        })
        .join("\n") +
      `\n<span class="p">}</span>`;
  }

  // --------------------------------------------------------- copy email --
  function copyEmail() {
    const email = SITE.profile.email;
    const done = () => toast(`copied ${email} to clipboard`);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(email).then(done, () => toast(email));
    else toast(email);
  }
  $("#copy-email")?.addEventListener("click", copyEmail);

  // ----------------------------------------------------- scroll-spy + bar --
  const sbPath = $("#sb-path");
  const sbPos = $("#sb-pos");
  const sbMeta = $("#sb-meta");
  if (sbMeta) {
    const live = SITE.projects.filter((p) => !p.archived).length;
    const posts = SITE.writeups.filter((w) => !w.draft).length;
    sbMeta.textContent = `${live} projects · ${posts} write-ups · utf-8`;
  }

  const sections = $$("main section[id]");
  if (onIndex && "IntersectionObserver" in window) {
    const tabs = $$(".tabs a");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const id = en.target.id;
          const path = en.target.dataset.path;
          tabs.forEach((t) => t.classList.toggle("active", t.dataset.section === id));
          if (sbPath) sbPath.textContent = path ? `~/portfolio/${path}` : "~/portfolio";
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach((s) => io.observe(s));
  }

  let ticking = false;
  function updatePos() {
    ticking = false;
    if (!sbPos) return;
    const max = document.documentElement.scrollHeight - innerHeight;
    const y = scrollY;
    sbPos.textContent = y < 8 ? "Top" : y >= max - 8 ? "Bot" : `${Math.round((y / max) * 100)}%`;
  }
  addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updatePos);
      }
    },
    { passive: true }
  );
  updatePos();

  // ------------------------------------------------------ command palette --
  const palette = $("#palette");
  const pInput = $("#palette-input");
  const pList = $("#palette-list");
  let pItems = [];
  let pSel = 0;
  let lastFocus = null;

  function go(id) {
    if (!onIndex) {
      location.href = `index.html#${id}`;
      return;
    }
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }

  function allPaletteItems() {
    const sectionsMeta = [
      ["top", "~ (home)"],
      ["about", "about.md"],
      ["experience", "experience.log"],
      ["projects", "projects/"],
      ["writeups", "writeups/"],
      ["roadmap", "roadmap.todo"],
      ["skills", "skills.json"],
      ["contact", "contact.sh"],
    ];
    const items = sectionsMeta.map(([id, label]) => ({ kind: "cd", label, hint: "section", run: () => go(id) }));
    allProjects.forEach((p) =>
      items.push({ kind: "open", label: `${p.name}`, hint: p.slug + "/", run: () => openProject(p.slug), extra: p.stack?.join(" ") })
    );
    SITE.writeups
      .filter((w) => !w.draft)
      .forEach((w) => items.push({ kind: "read", label: w.title, hint: "write-up", run: () => (location.href = writeupUrl(w.slug)) }));
    THEMES.forEach((t) => items.push({ kind: "theme", label: `theme: ${t}`, hint: t === currentTheme() ? "current" : "", run: () => setTheme(t) }));
    items.push(
      { kind: "run", label: "copy email", hint: SITE.profile.email, run: copyEmail },
      { kind: "run", label: "send email", hint: "mailto", run: () => (location.href = `mailto:${SITE.profile.email}`) },
      { kind: "run", label: "download cv.pdf", hint: "google drive", run: () => (location.href = SITE.profile.cv) },
      { kind: "run", label: "open github", hint: "Xomie1", run: () => window.open(SITE.profile.github, "_blank", "noopener") },
      { kind: "run", label: "open linkedin", hint: "", run: () => window.open(SITE.profile.linkedin, "_blank", "noopener") }
    );
    if (onIndex)
      items.push({
        kind: "run",
        label: "focus terminal",
        hint: "type commands",
        run: () => {
          go("top");
          setTimeout(() => $("#term-input")?.focus({ preventScroll: true }), reduceMotion ? 0 : 400);
        },
      });
    return items;
  }

  function fuzzyScore(q, text) {
    if (!q) return 1;
    text = text.toLowerCase();
    const idx = text.indexOf(q);
    if (idx !== -1) return 100 - idx;
    let ti = 0;
    let score = 0;
    for (const ch of q) {
      const found = text.indexOf(ch, ti);
      if (found === -1) return 0;
      score += found === ti ? 3 : 1;
      ti = found + 1;
    }
    return score;
  }

  function renderPalette() {
    const q = pInput.value.trim().toLowerCase();
    pItems = allPaletteItems()
      .map((it) => ({ it, s: Math.max(fuzzyScore(q, it.label), fuzzyScore(q, `${it.kind} ${it.hint} ${it.extra || ""}`) * 0.6) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.it);
    if (!q) pItems = allPaletteItems().slice(0, 40);
    pSel = 0;
    pList.innerHTML = pItems.length
      ? pItems
          .map(
            (it, i) =>
              `<li role="option" id="pal-${i}" data-i="${i}" aria-selected="${i === 0}"><span class="pk">${esc(it.kind)}</span><span class="pl">${esc(it.label)}</span><span class="ph">${esc(it.hint)}</span></li>`
          )
          .join("")
      : `<li class="pe">no matches. try "rag", "theme" or "contact"</li>`;
    pInput.setAttribute("aria-activedescendant", pItems.length ? "pal-0" : "");
  }

  function selectPalette(i) {
    if (!pItems.length) return;
    pSel = (i + pItems.length) % pItems.length;
    $$("li[data-i]", pList).forEach((li) => li.setAttribute("aria-selected", String(+li.dataset.i === pSel)));
    $(`#pal-${pSel}`)?.scrollIntoView({ block: "nearest" });
    pInput.setAttribute("aria-activedescendant", `pal-${pSel}`);
  }

  function openPalette(prefill = "") {
    if (!palette) return;
    lastFocus = document.activeElement;
    palette.hidden = false;
    pInput.value = prefill;
    renderPalette();
    pInput.focus();
  }
  function closePalette() {
    if (!palette || palette.hidden) return;
    palette.hidden = true;
    lastFocus?.focus?.({ preventScroll: true });
  }
  function runPalette(i) {
    const it = pItems[i];
    if (!it) return;
    closePalette();
    it.run();
  }

  if (palette) {
    $("#palette-btn")?.addEventListener("click", () => openPalette());
    pInput.addEventListener("input", renderPalette);
    pInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectPalette(pSel + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectPalette(pSel - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        runPalette(pSel);
      } else if (e.key === "Escape") {
        e.preventDefault();
        closePalette();
      }
    });
    pList.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-i]");
      if (li) runPalette(+li.dataset.i);
    });
    palette.addEventListener("mousedown", (e) => {
      if (e.target === palette) closePalette();
    });
  }

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      palette?.hidden ? openPalette() : closePalette();
    } else if (e.key === "/" && !typing && palette?.hidden && !dialog?.open) {
      e.preventDefault();
      openPalette();
    }
  });

  // ------------------------------------------------------------ public api --
  window.Portfolio = {
    THEMES,
    setTheme,
    currentTheme,
    openProject,
    closeProject,
    openPalette,
    copyEmail,
    go,
    writeupUrl,
    projects: allProjects,
    setArchive,
  };

  handleHash();
})();
