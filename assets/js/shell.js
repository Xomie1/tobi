/* ==========================================================================
   shell.js — the interactive terminal in the hero.
   A tiny fake shell over content.js: ls, cd, cat, open, theme, … with
   history (↑/↓), tab completion and clickable output for touch screens.
   Uses window.Portfolio (main.js) to open project windows, switch themes
   and scroll to sections.
   ========================================================================== */
(function () {
  "use strict";

  const SITE = window.SITE;
  const P = window.Portfolio;
  const body = document.getElementById("term-body");
  const out = document.getElementById("term-out");
  const form = document.getElementById("term-form");
  const input = document.getElementById("term-input");
  const cwdLabel = document.getElementById("term-cwd");
  if (!body || !out || !form || !input || !P) return;

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const prof = SITE.profile;
  const projects = SITE.projects;
  const writeups = SITE.writeups;
  const live = projects.filter((p) => !p.archived);

  let cwd = "~";
  const history = [];
  let hIndex = 0;
  let booting = false;
  let finishBoot = null;

  // ------------------------------------------------------------ output --
  function line(html = "", cls = "") {
    const div = document.createElement("div");
    div.className = "t-line" + (cls ? " " + cls : "");
    div.innerHTML = html;
    out.appendChild(div);
    return div;
  }
  const run = (cmd, label = cmd) => `<button type="button" class="t-run" data-cmd="${esc(cmd)}">${esc(label)}</button>`;
  const link = (href, label, ext = true) =>
    `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${esc(label)}</a>`;
  const prompt = () =>
    `<span class="ps-user">${esc(prof.user)}</span>@<span class="ps-host">${esc(prof.host)}</span>:<span class="ps-dir">${esc(cwd)}</span><span class="ps-sym">$</span> `;
  const scrollDown = () => (body.scrollTop = body.scrollHeight);
  const pad = (s, n) => String(s).padEnd(n, " ");

  function setCwd(dir) {
    cwd = dir;
    cwdLabel.textContent = dir;
  }

  // ------------------------------------------------------- file system --
  const DIRS = { "~": "top", "~/projects": "projects", "~/writeups": "writeups" };
  const SECTION_FILES = {
    "about.md": "about",
    "experience.log": "experience",
    "roadmap.todo": "roadmap",
    "skills.json": "skills",
    "contact.sh": "contact",
  };

  function normPath(arg) {
    if (!arg || arg === "~" || arg === "/" || arg === "~/") return "~";
    let a = arg.replace(/^\.\//, "").replace(/\/+$/, "");
    if (a === ".") return cwd;
    if (a === "..") return "~";
    if (a.startsWith("~/")) return a;
    if (cwd !== "~") return `${cwd}/${a}`;
    return `~/${a}`;
  }

  function resolve(arg) {
    const path = normPath(arg);
    if (DIRS[path]) return { type: "dir", path };
    const rel = path.replace(/^~\//, "");
    if (SECTION_FILES[rel]) return { type: "section", file: rel, id: SECTION_FILES[rel] };
    let m = rel.match(/^projects\/([\w-]+)$/);
    if (m) {
      const p = projects.find((x) => x.slug === m[1]);
      if (p) return { type: "project", p };
    }
    m = rel.match(/^writeups\/([\w-]+?)(\.md)?$/);
    if (m) {
      const w = writeups.find((x) => x.slug === m[1]);
      if (w) return { type: "writeup", w };
    }
    // bare slug from anywhere
    const p = projects.find((x) => x.slug === arg.replace(/\/$/, ""));
    if (p) return { type: "project", p };
    const w = writeups.find((x) => x.slug === arg.replace(/\.md$/, ""));
    if (w) return { type: "writeup", w };
    if (rel === "cv.pdf") return { type: "cv" };
    return null;
  }

  // ---------------------------------------------------------- printers --
  function neofetch() {
    const count = (s) => live.filter((p) => p.status === s).length;
    const years = new Date().getFullYear() - prof.since;
    const pub = writeups.filter((w) => !w.draft).length;
    const drafts = writeups.length - pub;
    const row = (k, v) => `<div class="nf-row"><b>${esc(k)}</b><span>${v}</span></div>`;
    const sw = ["--red", "--amber", "--green", "--cyan", "--magenta", "--fg-dim", "--fg"]
      .map((v) => `<i style="background:var(${v})"></i>`)
      .join("");
    // trimmed: .t-line is pre-wrap, so template indentation would render as blank lines
    line(`<div class="neofetch">
        <div class="nf-photo"><img src="${esc(prof.photo)}" alt="Photo of Tobi" width="132" height="176" /></div>
        <div class="nf-info">
          <div class="nf-title">${esc(prof.user)}<span>@</span>${esc(prof.host)}</div>
          <div class="nf-rule">${"-".repeat(prof.user.length + prof.host.length + 1)}</div>
          ${row("name", esc(prof.name))}
          ${row("role", esc(prof.role))}
          ${row("location", esc(prof.location))}
          ${row("study", esc(prof.study))}
          ${row("stack", esc(prof.stack))}
          ${row("projects", `${count("shipped")} shipped · ${count("active")} active · ${count("research")} research`)}
          ${row("writeups", `${pub} published · ${drafts} drafts`)}
          ${row("uptime", `${years} years (since ${prof.since})`)}
          ${row("status", `<span class="t-ok">●</span> open to work`)}
          <div class="nf-swatches" aria-hidden="true">${sw}</div>
        </div>
      </div>`.trim());
  }

  function listProjects(opts = {}) {
    const items = projects.filter((p) => (opts.all || !p.archived) && (!opts.tag || p.tags.includes(opts.tag)));
    if (!items.length) return line(`no projects tagged <span class="t-warn">${esc(opts.tag)}</span>. tags: ${SITE.TAGS.join(", ")}`, "t-dim");
    if (opts.long) {
      items.forEach((p) =>
        line(
          `<span class="t-faint">${pad(p.status, 9)}</span>${pad(p.year || "—", 6)}${run("open " + p.slug, p.slug + "/")}  <span class="t-dim">${esc(p.summary)}</span>`
        )
      );
    } else {
      line(items.map((p) => run("open " + p.slug, p.slug + "/")).join("  "));
    }
    const hidden = projects.filter((p) => p.archived).length;
    line(
      `<span class="t-faint">${items.length} items${!opts.all && hidden ? ` · ${hidden} archived hidden (${run("ls -a projects", "ls -a")})` : ""} · click one, or try ${run("open vibe-dj")}</span>`
    );
  }

  function listWriteups() {
    writeups.forEach((w) => {
      const label = w.draft ? `<span class="t-faint">${esc(w.slug)}.md  (draft)</span>` : run("open " + w.slug, w.slug + ".md");
      line(`<span class="t-faint">${pad(w.draft ? "draft" : w.date, 11)}</span>${label}`);
    });
  }

  function catProject(p) {
    line(`<span class="t-ok"># ${esc(p.name)}</span>  <span class="t-faint">${esc(p.year || "")} · ${esc(p.status)}</span>`);
    if (p.context) line(esc(p.context), "t-faint");
    line(esc(p.summary));
    (p.details || []).forEach((d) => line(`  <span class="t-ok">›</span> ${esc(d)}`, "t-dim"));
    line(`<span class="t-info">stack:</span> ${esc((p.stack || []).join(", "))}`);
    const bits = [run("man " + p.slug)];
    if (p.repo) bits.push(link(p.repo, "source ↗"));
    if (p.writeup && writeups.find((w) => w.slug === p.writeup && !w.draft)) bits.push(run("open " + p.writeup, "read write-up"));
    line(bits.join("  "));
  }

  function catSection(id) {
    switch (id) {
      case "about":
        line(`<span class="t-ok"># about</span>`);
        line("I build backend systems and AI pipelines, and I turn messy operational data into automated reporting that people actually trust.");
        line("Started by pulling Excel sheets apart, which grew into automation and then full applications: FastAPI services, RAG assistants and desktop tools.", "t-dim");
        line(`${run("cd about", "→ read the full about.md")}`);
        break;
      case "experience":
        SITE.experience.forEach((x) => {
          line(`<span class="t-warn">${esc(x.dates)}</span>  <b>${esc(x.role)}</b> <span class="t-dim">@ ${esc(x.org)}</span>`);
          x.bullets.forEach((b) => line(`  <span class="t-ok">+</span> ${esc(b)}`, "t-dim"));
        });
        break;
      case "roadmap":
        roadmap();
        break;
      case "skills":
        Object.entries(SITE.skills).forEach(([k, v]) => line(`<span class="t-info">${pad(k, 11)}</span>${esc(v.join(", "))}`));
        break;
      case "contact":
        contact();
        break;
    }
  }

  function roadmap() {
    const box = { now: "[~]", next: "[ ]", later: "[ ]" };
    ["now", "next", "later"].forEach((s) => {
      line(`<span class="t-ok">## ${s}</span>`);
      SITE.roadmap
        .filter((r) => r.status === s)
        .forEach((r) =>
          line(
            `<span class="${s === "now" ? "t-ok" : "t-warn"}">${box[s]}</span> ${esc(r.title)} <span class="t-faint">(${r.project ? run("open " + r.project, r.project) : "new"})</span>`
          )
        );
    });
  }

  function contact() {
    line(`<span class="t-info">email   </span>${link("mailto:" + prof.email, prof.email, false)}  ${run("copy-email", "[copy]")}`);
    line(`<span class="t-info">github  </span>${link(prof.github, prof.github.replace("https://", ""))}`);
    line(`<span class="t-info">linkedin</span> ${link(prof.linkedin, "linkedin.com/in/tobi-akindele")}`);
    line(`<span class="t-info">cv      </span>${run("cv", "download cv.pdf")}`);
    line(esc(prof.status), "t-dim");
  }

  // ---------------------------------------------------------- commands --
  const HELP = [
    ["help", "show this list"],
    ["whoami", "the short version"],
    ["neofetch", "system info, the classic"],
    ["ls [dir]", "list ~, projects/ or writeups/  (ls -a shows the archive)"],
    ["cd <dir>", "jump to a section: about, projects, writeups, roadmap, contact…"],
    ["cat <file>", "print about.md, roadmap.todo, a project or a write-up"],
    ["man <name>", "a project's manual page, e.g. man vibe-dj"],
    ["open <name>", "open a project or a write-up"],
    ["projects [tag]", "list projects, e.g. projects ai"],
    ["writeups", "list write-ups"],
    ["roadmap", "projects yet to come"],
    ["contact", "how to reach me"],
    ["cv", "download my CV"],
    ["theme [name]", "midnight | paper | phosphor"],
    ["clear", "clear the screen (Ctrl+L)"],
    ["exit", "close this window (the red light does too)"],
  ];

  const COMMANDS = {
    help() {
      HELP.forEach(([c, d]) => line(`${run(c.split(" ")[0], c)}${" ".repeat(Math.max(2, 16 - c.length))}<span class="t-dim">${esc(d)}</span>`));
      line(`<span class="t-faint">tab completes · ↑/↓ history · esc leaves the prompt · press ? outside it for keybindings</span>`);
    },
    whoami() {
      line(`<b>${esc(prof.short)}</b>, ${esc(prof.role)} in ${esc(prof.location)}.`);
      line(
        "Shipped an offline RAG assistant for a real client, automated KPI reporting at Nigeria's air navigation agency, and I'm doing an MSc in Computer Science at Griffith College Dublin.",
        "t-dim"
      );
      line(`${run("ls projects", "see projects")}  ${run("contact")}`);
    },
    neofetch,
    ls(args) {
      const all = args.includes("-a") || args.includes("-la") || args.includes("-al");
      const long = args.some((a) => /^-\w*l/.test(a));
      const target = args.find((a) => !a.startsWith("-"));
      const path = target ? normPath(target) : cwd;
      if (path === "~/projects") {
        if (all) P.setArchive?.(true);
        return listProjects({ all, long });
      }
      if (path === "~/writeups") return listWriteups();
      if (path === "~") {
        const dirs = [run("cd projects", "projects/"), run("cd writeups", "writeups/")];
        const files = Object.keys(SECTION_FILES).map((f) => run("cat " + f, f));
        files.push(run("cv", "cv.pdf"));
        if (all) files.unshift(`<span class="t-faint">.secrets</span>`);
        return line([...dirs, ...files].join("  "));
      }
      const r = resolve(target || "");
      if (r?.type === "project") return line(`${run("open " + r.p.slug, "README.md")}  <span class="t-faint">(${esc(r.p.stack?.join(", "))})</span>`);
      line(`ls: cannot access '${esc(target)}': No such file or directory`, "t-err");
    },
    cd(args) {
      const target = args[0];
      const path = normPath(target);
      if (DIRS[path]) {
        setCwd(path);
        P.go(DIRS[path]);
        return;
      }
      // sections are files in ~, so `cd about` works from any directory
      const name = String(target).replace(/^(~|\.)\//, "").replace(/\/$/, "").replace(/\.\w+$/, "");
      const ids = ["about", "experience", "projects", "writeups", "roadmap", "skills", "contact"];
      const id = ids.find((x) => x === name || x.startsWith(name));
      if (name && id) {
        setCwd("~");
        P.go(id);
        line(`<span class="t-faint">→ scrolled to ${esc(id)}</span>`);
        return;
      }
      line(`cd: no such file or directory: ${esc(target)}`, "t-err");
    },
    cat(args) {
      if (!args.length) return line("usage: cat &lt;file&gt;   e.g. " + run("cat about.md"), "t-dim");
      if (args[0] === ".secrets") return line("there are no secrets. only side projects.", "t-warn");
      const r = resolve(args[0]);
      if (!r) return line(`cat: ${esc(args[0])}: No such file or directory`, "t-err");
      if (r.type === "dir") return line(`cat: ${esc(args[0])}: Is a directory. try ${run("ls " + args[0])}`, "t-err");
      if (r.type === "section") return catSection(r.id);
      if (r.type === "project") return catProject(r.p);
      if (r.type === "cv") return line(`cat: cv.pdf: binary file. try ${run("cv")} instead`, "t-warn");
      if (r.type === "writeup") {
        line(`<span class="t-ok"># ${esc(r.w.title)}</span>`);
        line(esc(r.w.summary), "t-dim");
        line(r.w.draft ? `<span class="t-warn">still a draft. check back soon.</span>` : run("open " + r.w.slug, "→ read it"));
      }
    },
    open(args) {
      if (!args.length) return line("usage: open &lt;project|write-up&gt;", "t-dim");
      const r = resolve(args[0]);
      if (r?.type === "project") {
        P.openProject(r.p.slug);
        return line(`<span class="t-faint">opened ~/projects/${esc(r.p.slug)}</span>`);
      }
      if (r?.type === "writeup") {
        if (r.w.draft) return line("that one is still a draft.", "t-warn");
        line(`<span class="t-faint">opening ${esc(r.w.slug)}.md…</span>`);
        location.href = P.writeupUrl(r.w.slug);
        return;
      }
      if (r?.type === "section") return P.go(r.id);
      line(`open: ${esc(args[0])}: not found. try ${run("ls projects")}`, "t-err");
    },
    projects(args) {
      listProjects({ tag: args[0] });
    },
    writeups: listWriteups,
    roadmap,
    todo: roadmap,
    skills: () => catSection("skills"),
    contact,
    email: contact,
    "copy-email"() {
      P.copyEmail();
      line("copied.", "t-ok");
    },
    cv() {
      line(`fetching cv.pdf… ${link(prof.cv, "click here if it doesn't start")}`, "t-dim");
      window.open(prof.cv, "_blank", "noopener");
    },
    resume: (a) => COMMANDS.cv(a),
    github() {
      line(link(prof.github, prof.github));
      window.open(prof.github, "_blank", "noopener");
    },
    linkedin() {
      line(link(prof.linkedin, prof.linkedin));
      window.open(prof.linkedin, "_blank", "noopener");
    },
    theme(args) {
      if (!args.length) {
        line(
          P.THEMES.map((t) => (t === P.currentTheme() ? `<span class="t-ok">* ${t}</span>` : "  " + run("theme " + t, t))).join("\n")
        );
        return;
      }
      if (P.setTheme(args[0])) line(`theme → ${esc(args[0])}`, "t-ok");
      else line(`theme: unknown theme '${esc(args[0])}'. options: ${P.THEMES.join(", ")}`, "t-err");
    },
    matrix() {
      P.setTheme("phosphor");
      line("wake up, neo… (theme → phosphor)", "t-ok");
    },
    pwd: () => line(cwd.replace("~", "/home/" + prof.user)),
    date: () => line(new Date().toString()),
    echo: (args) => line(esc(args.join(" "))),
    uptime() {
      const y = new Date().getFullYear() - prof.since;
      line(`up ${y} years, 1 user, load average: coffee, curiosity, MSc coursework`);
    },
    history: () => history.forEach((h, i) => line(`<span class="t-faint">${pad(i + 1, 4)}</span>${esc(h)}`)),
    clear: () => (out.innerHTML = ""),
    sudo(args) {
      const what = args.join(" ");
      if (/^hire[- ]?(tobi|me)?$/.test(what)) {
        line("[sudo] password for recruiter: ********", "t-dim");
        line("✓ access granted.", "t-ok");
        line(
          `${link(`mailto:${prof.email}?subject=${encodeURIComponent("Let's talk")}`, "→ compose the email", false)}  <span class="t-faint">or</span> ${run("cv", "grab the cv first")}`
        );
        return;
      }
      line(`${esc(prof.user)} is not in the sudoers file. This incident will be reported.`, "t-err");
      line(`<span class="t-faint">(psst: try ${run("sudo hire-tobi")})</span>`);
    },
    rm: () => line("rm: permission denied. this portfolio is read-only (and version-controlled).", "t-err"),
    exit() {
      const win = document.getElementById("terminal");
      if (win && P.winAction) P.winAction(win, "close");
      else line("there's no exit, only more projects. " + run("ls projects"));
    },
    logout: () => COMMANDS.exit(),
    man(args) {
      if (!args.length) return line("What manual page do you want?\nFor example, try " + run("man vibe-dj") + " or " + run("man keys"));
      const what = args[0].replace(/\/$/, "");
      if (/^(keys|tobi-keys|tobi)$/.test(what)) return P.openKeys?.();
      const p = projects.find((x) => x.slug === what);
      if (p) {
        P.openProject(p.slug);
        return line(`<span class="t-faint">opened man ${esc(p.slug)}</span>`);
      }
      line(`No manual entry for ${esc(what)}`, "t-err");
    },
    vim: () => line(`opened vim. just kidding, you'd never get out. the source is on ${link(prof.source, "GitHub")}`, "t-dim"),
    git: (args) =>
      args[0] === "log"
        ? catSection("experience")
        : line(`git: try ${run("git log")}, or browse ${link(prof.source, "the repo")}`, "t-dim"),
  };
  COMMANDS.vi = COMMANDS.nano = COMMANDS.emacs = COMMANDS.vim;
  COMMANDS.hire = () => COMMANDS.sudo(["hire-tobi"]);

  function execute(raw) {
    const text = raw.trim();
    const echo = line(`${prompt()}<span class="t-typed">${esc(text)}</span>`, "t-cmdline");
    echo.setAttribute("aria-hidden", "true");
    if (!text) return scrollDown();
    history.push(text);
    hIndex = history.length;
    const [name, ...args] = text.split(/\s+/);
    const fn = COMMANDS[name.toLowerCase()];
    if (fn) fn(args);
    else line(`zsh: command not found: ${esc(name)}. try ${run("help")}`, "t-err");
    scrollDown();
  }

  // ---------------------------------------------------- tab completion --
  function candidates(words) {
    if (words.length <= 1) return Object.keys(COMMANDS).filter((c) => !["vi", "nano", "emacs", "logout", "copy-email"].includes(c));
    const cmd = words[0];
    const slugs = projects.map((p) => p.slug);
    const posts = writeups.map((w) => w.slug);
    const files = Object.keys(SECTION_FILES);
    switch (cmd) {
      case "cd":
      case "ls":
        return ["projects/", "writeups/", "about", "experience", "roadmap", "skills", "contact", "~"];
      case "cat":
        return [...files, ...slugs.map((s) => "projects/" + s), ...posts.map((s) => "writeups/" + s + ".md")];
      case "open":
        return [...slugs, ...posts];
      case "man":
        return [...slugs, "keys"];
      case "theme":
        return P.THEMES;
      case "projects":
        return SITE.TAGS;
      case "sudo":
        return ["hire-tobi"];
      default:
        return [];
    }
  }

  function complete() {
    const val = input.value;
    const words = val.split(/\s+/);
    const cur = words[words.length - 1];
    const opts = candidates(words).filter((c) => c.startsWith(cur));
    if (!opts.length) return;
    if (opts.length === 1) {
      words[words.length - 1] = opts[0] + (words.length === 1 ? " " : "");
      input.value = words.join(" ");
      return;
    }
    let prefix = opts[0];
    opts.forEach((o) => {
      while (!o.startsWith(prefix)) prefix = prefix.slice(0, -1);
    });
    if (prefix.length > cur.length) {
      words[words.length - 1] = prefix;
      input.value = words.join(" ");
    } else {
      line(`${prompt()}${esc(val)}`, "t-cmdline");
      line(opts.map(esc).join("  "), "t-dim");
      scrollDown();
    }
  }

  // ------------------------------------------------------------- input --
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (booting && finishBoot) finishBoot();
    const v = input.value;
    input.value = "";
    execute(v);
  });

  input.addEventListener("keydown", (e) => {
    if (booting && finishBoot) finishBoot();
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hIndex > 0) input.value = history[--hIndex] ?? "";
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      hIndex = Math.min(history.length, hIndex + 1);
      input.value = history[hIndex] ?? "";
    } else if (e.key === "Tab") {
      if (input.value.trim()) {
        e.preventDefault();
        complete();
      }
    } else if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      out.innerHTML = "";
    } else if (e.ctrlKey && e.key.toLowerCase() === "c") {
      if (input.selectionStart !== input.selectionEnd) return; // allow real copy
      e.preventDefault();
      line(`${prompt()}${esc(input.value)}^C`, "t-cmdline");
      input.value = "";
      scrollDown();
    }
  });

  // click anywhere in the terminal (not on a link/button, not selecting) to type
  body.addEventListener("click", (e) => {
    const btn = e.target.closest(".t-run");
    if (btn) {
      if (booting && finishBoot) finishBoot();
      execute(btn.dataset.cmd);
      return;
    }
    if (e.target.closest("a, button")) return;
    if (String(getSelection())) return;
    input.focus({ preventScroll: true });
  });

  document.getElementById("term-suggest")?.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-cmd]");
    if (!b) return;
    if (booting && finishBoot) finishBoot();
    execute(b.dataset.cmd);
  });

  // -------------------------------------------------------------- boot --
  function boot() {
    const d = new Date();
    const ok = (msg) => line(`[  <span class="t-ok">OK</span>  ] ${msg}`, "t-dim");
    ok(`Mounted <b>/home/tobi/projects</b> (${live.length} projects).`);
    ok(`Started <b>writeups.service</b> (${writeups.filter((w) => !w.draft).length} published).`);
    ok(`Reached target <b>open-to-work.target</b>.`);
    line(`Last login: ${d.toDateString()} ${d.toTimeString().slice(0, 8)} on ttys001`, "t-faint");

    const steps = [{ cmd: "neofetch", then: neofetch }];
    const hint = () =>
      line(
        `<span class="t-dim">Type ${run("help")} to look around, or just scroll. It's a normal web page too.</span>`
      );

    if (reduceMotion) {
      steps.forEach((s) => {
        line(`${prompt()}<span class="t-typed">${s.cmd}</span>`, "t-cmdline");
        s.then();
      });
      hint();
      return;
    }

    booting = true;
    let timer = null;
    let si = 0;
    let typedEl = null;
    let ci = 0;

    finishBoot = () => {
      if (!booting) return;
      booting = false;
      clearTimeout(timer);
      for (; si < steps.length; si++) {
        if (!typedEl) typedEl = line(`${prompt()}<span class="t-typed"></span>`, "t-cmdline").querySelector(".t-typed");
        typedEl.textContent = steps[si].cmd;
        steps[si].then();
        typedEl = null;
      }
      hint();
      scrollDown();
    };

    function typeNext() {
      if (!booting) return;
      const step = steps[si];
      if (!step) return finishBoot();
      if (!typedEl) {
        typedEl = line(`${prompt()}<span class="t-typed"></span>`, "t-cmdline").querySelector(".t-typed");
        ci = 0;
      }
      if (ci < step.cmd.length) {
        typedEl.textContent += step.cmd[ci++];
        timer = setTimeout(typeNext, 70 + Math.random() * 60);
      } else {
        step.then();
        typedEl = null;
        si++;
        scrollDown();
        timer = setTimeout(typeNext, 350);
      }
    }
    timer = setTimeout(typeNext, 500);
  }

  // used by the traffic lights: red closes the window, "restart shell" brings it back
  window.Shell = {
    restart() {
      if (finishBoot) finishBoot();
      out.innerHTML = "";
      setCwd("~");
      boot();
    },
    exec: execute,
    focus: () => input.focus({ preventScroll: true }),
  };

  boot();
})();
