/* ==========================================================================
   main.js — renders the lists from content.js and wires up the UI:
   themes, clock, menus, project filters + man pages, write-ups (ls -lt),
   roadmap, skills.json, command palette, status line, and the window
   manager behind every traffic light (close / minimise / maximise).
   Keyboard: vim-ish keys (j k d u gg G 1-7 t i / : ? q) and a `:` command
   line in the status bar.
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
  const SECTIONS = ["about", "experience", "projects", "writeups", "roadmap", "skills", "contact"];

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
    $('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[name]);
    return true;
  }
  const currentTheme = () => document.documentElement.getAttribute("data-theme") || "midnight";
  const cycleTheme = () => setTheme(THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]);
  setTheme(currentTheme());
  $("#theme-btn")?.addEventListener("click", cycleTheme);

  // ---------------------------------------------------------------- clock --
  const clock = $("#clock");
  if (clock) {
    const pad = (n) => String(n).padStart(2, "0");
    const tick = () => {
      const d = new Date();
      clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}-${d.toLocaleString("en", { month: "short" })}`;
    };
    tick();
    setInterval(tick, 15000);
  }
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  // ---------------------------------------------------------- mobile menu --
  const menuBtn = $("#menu-btn");
  const menu = $("#mobile-menu");
  function setMenu(open) {
    if (!menu) return;
    menu.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  }
  if (menuBtn && menu) {
    menuBtn.addEventListener("click", () => setMenu(!menu.classList.contains("open")));
    $$("a", menu).forEach((a) => a.addEventListener("click", () => setMenu(false)));
  }

  // ---------------------------------------------------------- status line --
  const sbMode = $("#sb-mode");
  const sbMsg = $("#sb-msg");
  let msgTimer = null;

  function setMode(mode) {
    if (!sbMode) return;
    sbMode.textContent = mode.toUpperCase();
    sbMode.classList.toggle("insert", mode === "insert");
    sbMode.classList.toggle("command", mode === "command");
  }
  function message(text, isErr = false) {
    if (!sbMsg) return;
    sbMsg.textContent = text;
    sbMsg.classList.toggle("err", isErr);
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => (sbMsg.textContent = ""), 5000);
  }

  document.addEventListener("focusin", (e) => {
    if (e.target.id === "sb-ex-input") setMode("command");
    else if (e.target.matches?.("input")) setMode("insert");
  });
  document.addEventListener("focusout", (e) => {
    if (e.target.matches?.("input")) setMode(onIndex ? "normal" : "read");
  });
  setMode(onIndex ? "normal" : "read");

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
          ${proj ? `<p class="hint"><a class="tlink" href="${projectUrl(proj.slug)}" data-open="${esc(proj.slug)}">man ${esc(proj.slug)}</a></p>` : ""}
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

  function hasWriteup(p) {
    return p.writeup && writeupsBySlug.has(p.writeup) && !writeupsBySlug.get(p.writeup).draft;
  }

  function cardHTML(p) {
    const links = [];
    if (p.repo) links.push(`<a class="tlink" href="${esc(p.repo)}" target="_blank" rel="noopener">src ↗</a>`);
    if (hasWriteup(p)) links.push(`<a class="tlink" href="${writeupUrl(p.writeup)}">write-up</a>`);
    links.push(`<a class="tlink" href="${projectUrl(p.slug)}" data-open="${esc(p.slug)}">man ${esc(p.slug)}</a>`);
    if (!p.repo && p.private) links.push(`<span class="muted">(private repo)</span>`);
    return `
      <article class="box card${p.featured ? " featured" : ""}" data-slug="${esc(p.slug)}">
        <span class="box-label"><button type="button" data-open="${esc(p.slug)}">${esc(p.slug)}/</button></span>
        <span class="box-label right status status-${esc(p.status)}">${esc(p.status)}</span>
        <h3 class="card-name">${esc(p.name)}${p.year ? ` <span class="faint">· ${esc(p.year)}</span>` : ""}</h3>
        ${p.context ? `<p class="card-ctx">${esc(p.context)}</p>` : ""}
        <p class="card-sum">${esc(p.summary)}</p>
        <p class="card-stack">${(p.stack || []).map((s) => esc(s.toLowerCase())).join(" · ")}</p>
        <div class="card-links">${links.join("")}</div>
      </article>`;
  }

  function rowHTML(p) {
    return `
      <tr data-slug="${esc(p.slug)}">
        <td><span class="status status-${esc(p.status)}">${esc(p.status)}</span></td>
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

    $("#archive-hint").innerHTML = state.archive
      ? `<span class="faint">#</span> showing ${archivedCount} archived builds too. <button type="button" class="link-btn" data-archive="off">hide them</button>`
      : `<span class="faint">#</span> ${archivedCount} archived builds (small web sites, early experiments) are hidden, like dotfiles. <button type="button" class="link-btn" data-archive="on">ls -a</button>`;
  }

  // only offer tags that match something visible (e.g. --design lives in the archive)
  function renderFlags() {
    const pool = allProjects.filter((p) => state.archive || !p.archived);
    const used = new Set(pool.flatMap((p) => p.tags));
    if (state.tag !== "all" && !used.has(state.tag)) state.tag = "all";
    $("#tag-flags").innerHTML = ["all", ...SITE.TAGS.filter((t) => used.has(t))]
      .map((t) => `<button type="button" class="flag" data-tag="${t}" aria-pressed="${t === state.tag}">--${t}</button>`)
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

  // ------------------------------------------------- project man page --
  const dialog = $("#proj-dialog");
  let lastSlug = null;

  function manPage(p) {
    const up = esc(p.slug.toUpperCase()) + "(1)";
    const w = p.writeup && writeupsBySlug.get(p.writeup);
    const links = [];
    if (p.repo) links.push(`<a class="btn btn-primary" href="${esc(p.repo)}" target="_blank" rel="noopener">source ↗</a>`);
    if (w && !w.draft) links.push(`<a class="btn" href="${writeupUrl(w.slug)}">write-up</a>`);
    (p.links || []).forEach((l) => links.push(`<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`));
    if (!p.repo && p.private)
      links.push(
        `<a class="btn" href="mailto:${esc(SITE.profile.email)}?subject=${encodeURIComponent("Walkthrough: " + p.name)}">private repo · ask me for a walkthrough</a>`
      );
    const opt = (k, v) => (v ? ` <span class="opt">--${k}</span>=${esc(v)}` : "");
    return `
      <div class="man">
        <div class="man-head"><span>${up}</span><span>Tobi's Projects Manual</span><span>${up}</span></div>
        <h3>NAME</h3>
        <div class="ind"><p><b>${esc(p.slug)}</b> — ${esc(p.name)}</p></div>
        <h3>SYNOPSIS</h3>
        <div class="ind">
          <p><b>${esc(p.slug)}</b>${opt("status", p.status)}${opt("year", p.year)}${opt("tags", p.tags.join(","))}</p>
          ${p.context ? `<p class="dim">${esc(p.context)}</p>` : ""}
        </div>
        <h3>DESCRIPTION</h3>
        <div class="ind">
          <p>${esc(p.summary)}</p>
          ${p.details?.length ? `<ul style="margin-top:10px">${p.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
        </div>
        ${p.image ? `<h3>SCREENSHOT</h3><div class="ind"><figure class="man-shot"><img src="${esc(p.image)}" alt="${esc(p.imageAlt || p.name)}" loading="lazy" /></figure></div>` : ""}
        <h3>STACK</h3>
        <div class="ind"><p>${esc((p.stack || []).join(", "))}</p></div>
        <h3>SEE ALSO</h3>
        <div class="ind man-links">${links.join("") || '<span class="dim">nothing public yet</span>'}</div>
        <div class="man-foot"><span>Tobi Akindele</span><span>${esc(p.year || "")}</span><span>${up}</span></div>
      </div>`;
  }

  function openProject(slug, { updateHash = true } = {}) {
    const p = projectsBySlug.get(slug);
    if (!p) return false;
    if (!dialog) {
      location.href = projectUrl(slug);
      return true;
    }
    lastSlug = slug;
    undock(dialog);
    $("#proj-dialog-path").textContent = `man ${p.slug}`;
    $("#proj-dialog-body").innerHTML = manPage(p);
    if (!dialog.open) dialog.showModal();
    $("#proj-dialog-body").scrollTop = 0;
    if (updateHash) history.replaceState(null, "", `#projects/${p.slug}`);
    return true;
  }

  function closeProject() {
    if (dialog?.open) dialog.close();
  }

  if (dialog) {
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeProject(); // backdrop click
    });
    dialog.addEventListener("close", () => {
      dialog.classList.remove("is-max");
      if (location.hash.startsWith("#projects/")) history.replaceState(null, "", "#projects");
    });
  }

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
    const lsDate = (iso) => {
      const d = new Date(iso + "T12:00:00");
      const md = `${d.toLocaleString("en", { month: "short" })} ${String(d.getDate()).padStart(2, " ")}`;
      return d.getFullYear() === new Date().getFullYear() ? md : `${md} ${d.getFullYear()}`;
    };
    wlist.innerHTML =
      `<li class="total">total ${published.length + drafts.length}</li>` +
      [...published, ...drafts]
        .map((w) => {
          const proj = projectsBySlug.get(w.project);
          const name = w.draft
            ? `<span class="ls-name">drafts/${esc(w.slug)}.md</span>`
            : `<a class="ls-name" href="${writeupUrl(w.slug)}">${esc(w.slug)}.md</a>`;
          return `
            <li class="ls-row${w.draft ? " draft" : ""}">
              <span class="ls-perm">${w.draft ? "-rw-------" : "-rw-r--r--"}</span>
              <span class="ls-own">tobi</span>
              <span class="ls-size" data-read="${esc(w.slug)}">${w.draft ? "draft" : "…"}</span>
              <span class="ls-date">${w.draft ? "  -   -" : esc(lsDate(w.date))}</span>
              ${name}
              <div class="ls-detail">
                <h3>${esc(w.title)}${w.draft ? '<span class="badge-draft">(coming soon)</span>' : ""}</h3>
                <p>${esc(w.summary)}</p>
                <span class="wt">${w.tags.map((t) => "#" + esc(t)).join(" ")}</span>
                ${proj ? ` <span class="faint">·</span> <a class="wt" href="${projectUrl(proj.slug)}" data-open="${esc(proj.slug)}">${esc(proj.slug)}/</a>` : ""}
              </div>
            </li>`;
        })
        .join("");

    // reading time, when the .md files are reachable (not on file://)
    published.forEach((w) => {
      const slot = $(`[data-read="${w.slug}"]`, wlist);
      fetch(`writeups/${w.slug}.md`)
        .then((r) => (r.ok ? r.text() : Promise.reject()))
        .then((md) => (slot.textContent = `${Math.max(1, Math.round(md.split(/\s+/).length / 220))}min`))
        .catch(() => (slot.textContent = "-"));
    });
  }

  // -------------------------------------------------------------- roadmap --
  const board = $("#roadmap-board");
  if (board) {
    const lanes = [
      { key: "now", label: "now · in progress", tick: "[~]" },
      { key: "next", label: "next · up next", tick: "[ ]" },
      { key: "later", label: "later · someday", tick: "[ ]" },
    ];
    board.innerHTML =
      lanes
        .map((lane) => {
          const items = SITE.roadmap.filter((r) => r.status === lane.key);
          return `
            <div class="box lane lane-${lane.key}">
              <span class="box-label"><b>${lane.label}</b></span>
              <span class="box-label right faint">${items.length}</span>
              <ul>
                ${items
                  .map(
                    (r) => `
                  <li class="todo">
                    <span class="box-tick" aria-hidden="true">${lane.tick}</span>
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

  // ---------------------------------------------------------- copy email --
  function copyEmail() {
    const email = SITE.profile.email;
    const done = () => toast(`copied ${email} to clipboard`);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(email).then(done, () => toast(email));
    else toast(email);
  }
  $("#copy-email")?.addEventListener("click", copyEmail);

  // =========================================================================
  // Window manager: every .dots group becomes real close / minimise /
  // maximise buttons. The top-bar group controls the whole "session".
  // =========================================================================
  const dock = $("#sb-dock");
  const ACTIONS = [
    ["close", "Close"],
    ["minimize", "Minimise"],
    ["maximize", "Maximise"],
  ];
  let winSeq = 0;
  let maxWin = null;

  const winName = (win) => {
    const t = win.querySelector(".win-title")?.textContent.trim() || "window";
    return t.split(" — ")[0];
  };

  $$(".dots").forEach((d) => {
    const session = d.dataset.scope === "session";
    d.removeAttribute("aria-hidden");
    d.setAttribute("role", "group");
    d.setAttribute("aria-label", session ? "Session controls" : "Window controls");
    d.innerHTML = ACTIONS.map(
      ([a, label]) =>
        `<button type="button" class="tl tl-${a}" data-win-action="${a}" aria-label="${label} ${session ? "session" : "window"}"></button>`
    ).join("");
  });

  function dockChip(win, label, onRestore) {
    if (!dock) return;
    win.id ||= `win-${++winSeq}`;
    if (dock.querySelector(`[data-for="${win.id}"]`)) return;
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.for = win.id;
    b.textContent = label;
    b.title = `Restore ${label}`;
    b.addEventListener("click", () => {
      b.remove();
      onRestore();
    });
    dock.appendChild(b);
  }
  function undock(win) {
    if (win.id) dock?.querySelector(`[data-for="${win.id}"]`)?.remove();
  }

  function setMax(win, on) {
    win.classList.toggle("is-max", on);
    document.documentElement.classList.toggle("has-max", on);
    maxWin = on ? win : null;
    if (on && win.id === "terminal") setTimeout(() => $("#term-input")?.focus({ preventScroll: true }), 30);
  }

  function restoreWin(win) {
    win.classList.remove("is-min");
    undock(win);
    win.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }

  function closeWin(win) {
    if (win.classList.contains("is-max")) setMax(win, false);
    win.classList.remove("is-min");
    undock(win);
    let panel = win.querySelector(":scope > .win-closed");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "win-closed";
      win.appendChild(panel);
    }
    const isTerm = win.id === "terminal";
    panel.innerHTML = isTerm
      ? `logout\nSaving session...\n...copying shared history...\n...saving history...truncating history files...\n...completed.\n\n[Process completed]\n\n<button type="button" class="btn" data-win-reopen>restart shell</button>`
      : `[Process completed]\n\n<button type="button" class="btn" data-win-reopen>reopen ${esc(winName(win))}</button>`;
    win.classList.add("is-closed");
  }

  function reopenWin(win) {
    win.classList.remove("is-closed");
    if (win.id === "terminal") window.Shell?.restart();
  }

  function winAction(win, action) {
    if (win.tagName === "DIALOG") return dialogAction(win, action);
    if (action === "close") return closeWin(win);
    if (action === "minimize") {
      if (win.classList.contains("is-closed")) return;
      if (win.classList.contains("is-max")) setMax(win, false);
      win.classList.add("is-min");
      dockChip(win, winName(win), () => restoreWin(win));
      return;
    }
    if (action === "maximize") {
      if (win.classList.contains("is-closed")) reopenWin(win);
      if (win.classList.contains("is-min")) restoreWin(win);
      setMax(win, !win.classList.contains("is-max"));
    }
  }

  function dialogAction(dlg, action) {
    if (action === "close") return dlg.close();
    if (action === "maximize") return dlg.classList.toggle("is-max");
    if (action === "minimize") {
      const label = winName(dlg);
      const slug = lastSlug;
      dlg.close();
      dockChip(dlg, label, () => (dlg.id === "proj-dialog" ? openProject(slug) : dlg.showModal()));
    }
  }

  // --- the top bar's lights control the whole session ---
  let overlay = null;
  function sessionOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "session-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <pre id="session-msg"></pre>
      <button type="button" class="btn btn-primary" id="session-restart">restart session</button>
      <div class="session-dock" id="session-dock" hidden>
        <button type="button" id="session-dock-btn" aria-label="Restore tobi@dublin">&gt;_</button>
      </div>`;
    document.body.appendChild(overlay);
    const restore = () => {
      overlay.hidden = true;
      if (!maxWin) document.documentElement.classList.remove("has-max");
      document.activeElement?.blur();
    };
    $("#session-restart", overlay).addEventListener("click", () => {
      restore();
      scrollTo({ top: 0, behavior: "auto" });
      window.Shell?.restart();
    });
    $("#session-dock-btn", overlay).addEventListener("click", restore);
    return overlay;
  }

  function sessionAction(action) {
    if (action === "maximize") {
      if (!document.fullscreenEnabled) return toast("full screen isn't available in this browser");
      return document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    }
    const o = sessionOverlay();
    const closing = action === "close";
    $("#session-msg", o).textContent = closing
      ? `tobi@dublin:~$ exit\nlogout\nSaving session...\n...completed.\n\nConnection to dublin closed.\n\n[Process completed]`
      : "";
    $("#session-restart", o).hidden = !closing;
    $("#session-dock", o).hidden = closing;
    o.hidden = false;
    document.documentElement.classList.add("has-max");
    (closing ? $("#session-restart", o) : $("#session-dock-btn", o)).focus();
  }

  // --- one delegated listener for every window control ---
  document.addEventListener("click", (e) => {
    const ctl = e.target.closest("[data-win-action]");
    if (ctl) {
      e.preventDefault();
      if (ctl.closest(".dots")?.dataset.scope === "session") return sessionAction(ctl.dataset.winAction);
      const win = ctl.closest(".win");
      if (win) winAction(win, ctl.dataset.winAction);
      return;
    }
    const reopen = e.target.closest("[data-win-reopen]");
    if (reopen) return reopenWin(reopen.closest(".win"));
    // clicking a window-shaded title bar restores it
    const bar = e.target.closest(".win.is-min > .win-bar");
    if (bar) return restoreWin(bar.parentElement);
    // any [data-open] opens a project; clicking a card does too
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

  // ------------------------------------------------------- keybindings --
  const KEYS = [
    ["moving around", null],
    ["j / k", "scroll down / up"],
    ["d / u", "half a page down / up"],
    ["gg / G", "top / bottom"],
    ["1 – 7", "jump to section (about … contact)"],
    ["finding things", null],
    ["/ or ⌘K", "command palette"],
    [":", "command line, e.g. :3  :q  :colorscheme paper  :help"],
    ["i", "type in the terminal"],
    ["windows", null],
    ["● red", "close (restart from the window)"],
    ["● yellow", "minimise to the status bar"],
    ["● green", "maximise; Esc restores"],
    ["other", null],
    ["t", "cycle theme"],
    ["q", "close what's open (on a write-up: back to the list)"],
    ["?", "this page"],
  ];
  let keysDlg = null;
  function openKeys() {
    if (!keysDlg) {
      keysDlg = document.createElement("dialog");
      keysDlg.className = "win dlg";
      keysDlg.id = "keys-dialog";
      keysDlg.setAttribute("aria-label", "Keybindings");
      keysDlg.innerHTML = `
        <div class="win-bar">
          <span class="dots" role="group" aria-label="Window controls">${ACTIONS.map(
            ([a, l]) => `<button type="button" class="tl tl-${a}" data-win-action="${a}" aria-label="${l} window"></button>`
          ).join("")}</span>
          <span class="win-title">man tobi-keys</span>
          <button type="button" class="win-close" data-win-action="close" aria-label="Close">esc</button>
        </div>
        <div class="dlg-body">
          <div class="man">
            <div class="man-head"><span>TOBI-KEYS(7)</span><span>Miscellaneous</span><span>TOBI-KEYS(7)</span></div>
            <h3>NAME</h3><div class="ind"><p>tobi-keys — keyboard controls for this site</p></div>
            <h3>KEYS</h3>
            <div class="ind"><table class="keys-table">${KEYS.map(([k, d]) =>
              d === null ? `<tr class="group"><td colspan="2">${esc(k)}</td></tr>` : `<tr><td>${esc(k)}</td><td>${esc(d)}</td></tr>`
            ).join("")}</table></div>
            <h3>SEE ALSO</h3><div class="ind"><p>type <b>help</b> in the terminal for shell commands.</p></div>
          </div>
        </div>`;
      keysDlg.addEventListener("click", (e) => e.target === keysDlg && keysDlg.close());
      keysDlg.addEventListener("close", () => keysDlg.classList.remove("is-max"));
      document.body.appendChild(keysDlg);
    }
    undock(keysDlg);
    if (!keysDlg.open) keysDlg.showModal();
  }
  $("#keys-btn")?.addEventListener("click", openKeys);

  // ------------------------------------------------- `:` command line --
  const exForm = $("#sb-ex");
  const exInput = $("#sb-ex-input");

  function openEx(prefill = "") {
    if (!exForm) return;
    sbMsg.textContent = "";
    exForm.hidden = false;
    exInput.value = prefill;
    exInput.focus();
  }
  function closeEx() {
    if (!exForm || exForm.hidden) return;
    exForm.hidden = true;
    if (document.activeElement === exInput) exInput.blur();
  }

  function topmostOpenDialog() {
    return $$("dialog[open]").pop() || null;
  }

  function quit(force) {
    const dlg = topmostOpenDialog();
    if (dlg) return dlg.close();
    if (maxWin) return setMax(maxWin, false);
    if (!palette?.hidden) return closePalette();
    if (!onIndex) return (location.href = "index.html#writeups");
    if (force) return sessionAction("close");
    message("E37: No write since last change (add ! to override)", true);
  }

  function runEx(raw) {
    const c = raw.trim().replace(/^:/, "");
    if (!c) return;
    let m;
    if (/^\d+$/.test(c)) {
      const id = SECTIONS[+c - 1];
      return id ? go(id) : message(`E16: Invalid range: ${c}`, true);
    }
    if (/^(q|quit|wq|x|qa)(!)?$/.test(c)) return quit(c.endsWith("!"));
    if (/^(h|help)$/.test(c)) return openKeys();
    if ((m = c.match(/^(?:colo(?:rscheme)?|theme)\s+(\S+)$/)))
      return setTheme(m[1]) ? message(`colorscheme ${m[1]}`) : message(`E185: Cannot find color scheme '${m[1]}'`, true);
    if ((m = c.match(/^set\s+(?:bg|background)=(light|dark)$/))) return setTheme(m[1] === "light" ? "paper" : "midnight");
    if ((m = c.match(/^(?:e|edit|o|open|man)\s+(\S+)$/))) {
      const arg = m[1].replace(/\/$/, "").replace(/^projects\//, "");
      if (projectsBySlug.has(arg)) return openProject(arg);
      const w = writeupsBySlug.get(arg.replace(/\.md$/, "").replace(/^writeups\//, ""));
      if (w && !w.draft) return (location.href = writeupUrl(w.slug));
      if (SECTIONS.includes(arg)) return go(arg);
      return message(`E484: Can't open file ${arg}`, true);
    }
    if (/^noh(lsearch)?$/.test(c)) return;
    if (/^w(rite)?$/.test(c)) return message(`"portfolio" written. (it's read-only, but nice try)`);
    message(`E492: Not an editor command: ${c}`, true);
  }

  if (exForm) {
    exForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = exInput.value;
      closeEx();
      runEx(v);
    });
    exInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeEx();
      } else if (e.key === "Backspace" && !exInput.value) {
        closeEx();
      }
    });
    exInput.addEventListener("blur", () => setTimeout(closeEx, 0));
  }

  // ----------------------------------------------------- scroll-spy + bar --
  const sbPath = $("#sb-path");
  const sbPos = $("#sb-pos");
  const sbMeta = $("#sb-meta");
  if (sbMeta) {
    const live = SITE.projects.filter((p) => !p.archived).length;
    const posts = SITE.writeups.filter((w) => !w.draft).length;
    sbMeta.textContent = `${live} projects · ${posts} write-ups · utf-8`;
  }

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
    $$("main section[id]").forEach((s) => io.observe(s));

    // each section's command types itself out the first time you reach it
    if (!reduceMotion) {
      const typeOut = (el) => {
        const full = el.dataset.full;
        const cur = document.createElement("span");
        cur.className = "cursor";
        cur.textContent = "█";
        el.after(cur);
        let i = 0;
        const step = () => {
          el.textContent = full.slice(0, ++i);
          if (i < full.length) setTimeout(step, 24 + Math.random() * 34);
          else setTimeout(() => cur.remove(), 900);
        };
        step();
      };
      const tio = new IntersectionObserver(
        (entries) =>
          entries.forEach((en) => {
            if (!en.isIntersecting) return;
            tio.unobserve(en.target);
            typeOut(en.target.querySelector(".typed"));
          }),
        { threshold: 1 }
      );
      $$(".sec-cmd .typed").forEach((t) => {
        t.dataset.full = t.textContent;
        t.textContent = "";
        tio.observe(t.closest(".sec-cmd"));
      });
    }
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
      items.push({ kind: "man", label: p.name, hint: p.slug + "/", run: () => openProject(p.slug), extra: p.stack?.join(" ") })
    );
    SITE.writeups
      .filter((w) => !w.draft)
      .forEach((w) => items.push({ kind: "less", label: w.title, hint: "write-up", run: () => (location.href = writeupUrl(w.slug)) }));
    THEMES.forEach((t) => items.push({ kind: "theme", label: `theme: ${t}`, hint: t === currentTheme() ? "current" : "", run: () => setTheme(t) }));
    items.push(
      { kind: "run", label: "keybindings", hint: "?", run: openKeys },
      { kind: "run", label: "copy email", hint: SITE.profile.email, run: copyEmail },
      { kind: "run", label: "send email", hint: "mailto", run: () => (location.href = `mailto:${SITE.profile.email}`) },
      { kind: "run", label: "download cv.pdf", hint: "google drive", run: () => (location.href = SITE.profile.cv) },
      { kind: "run", label: "open github", hint: "Xomie1", run: () => window.open(SITE.profile.github, "_blank", "noopener") },
      { kind: "run", label: "open linkedin", hint: "", run: () => window.open(SITE.profile.linkedin, "_blank", "noopener") },
      { kind: "run", label: "toggle full screen", hint: "green light", run: () => sessionAction("maximize") }
    );
    if (onIndex)
      items.push({
        kind: "run",
        label: "focus terminal",
        hint: "i",
        run: focusTerminal,
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
    pItems = q
      ? allPaletteItems()
          .map((it) => ({ it, s: Math.max(fuzzyScore(q, it.label), fuzzyScore(q, `${it.kind} ${it.hint} ${it.extra || ""}`) * 0.6) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, 40)
          .map((x) => x.it)
      : allPaletteItems().slice(0, 40);
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
      if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
        e.preventDefault();
        selectPalette(pSel + 1);
      } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
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

  function focusTerminal() {
    const term = $("#terminal");
    if (!term) return;
    if (term.classList.contains("is-closed")) reopenWin(term);
    if (term.classList.contains("is-min")) restoreWin(term);
    term.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    setTimeout(() => $("#term-input")?.focus({ preventScroll: true }), reduceMotion ? 0 : 350);
  }

  // ------------------------------------------------------- global keys --
  let lastG = 0;
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(active?.tagName) || active?.isContentEditable;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      palette?.hidden ? openPalette() : closePalette();
      return;
    }
    if (e.key === "Escape") {
      setMenu(false);
      if (maxWin && !topmostOpenDialog()) {
        setMax(maxWin, false);
        e.preventDefault();
      }
      if (typing && active.id === "term-input") active.blur();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!palette?.hidden || (overlay && !overlay.hidden)) return;
    if (topmostOpenDialog()) {
      if (e.key === "q") topmostOpenDialog().close();
      return;
    }

    const half = innerHeight / 2;
    const scroll = (dy, smooth = false) => scrollBy({ top: dy, behavior: smooth && !reduceMotion ? "smooth" : "instant" });
    switch (e.key) {
      case "/":
        e.preventDefault();
        openPalette();
        break;
      case ":":
        e.preventDefault();
        openEx();
        break;
      case "?":
        e.preventDefault();
        openKeys();
        break;
      case "j":
        scroll(80);
        break;
      case "k":
        scroll(-80);
        break;
      case "d":
        scroll(half, true);
        break;
      case "u":
        scroll(-half, true);
        break;
      case "g":
        if (Date.now() - lastG < 500) {
          scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
          lastG = 0;
        } else lastG = Date.now();
        break;
      case "G":
        scrollTo({ top: document.documentElement.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
        break;
      case "t":
        cycleTheme();
        message(`colorscheme ${currentTheme()}`);
        break;
      case "i":
        if (onIndex) {
          e.preventDefault();
          focusTerminal();
        }
        break;
      case "q":
        quit(false);
        break;
      default:
        if (/^[1-7]$/.test(e.key)) go(SECTIONS[+e.key - 1]);
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
    openKeys,
    copyEmail,
    go,
    writeupUrl,
    projects: allProjects,
    setArchive,
    winAction,
    message,
  };

  handleHash();
})();
