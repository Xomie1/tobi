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

  let cwd = []; // path segments below ~, e.g. ["projects", "vibe-dj"]
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
    `<span class="ps-user">${esc(prof.user)}</span>@<span class="ps-host">${esc(prof.host)}</span>:<span class="ps-dir">${esc(pathStr(cwd))}</span><span class="ps-sym">$</span> `;
  const scrollDown = () => (body.scrollTop = body.scrollHeight);
  const pad = (s, n) => String(s).padEnd(n, " ");

  // ------------------------------------------------------- file system --
  // A small virtual tree over content.js:
  //   ~/about.md  experience.log  roadmap.todo  skills.json  contact.sh  cv.pdf
  //   ~/projects/<slug>/README.md  [writeup.md]     (archived ones: ls -a)
  //   ~/writeups/<slug>.md   ~/writeups/drafts/<slug>.md
  const HOME = "/home/" + prof.user;
  const SECTION_FILES = {
    "about.md": "about",
    "experience.log": "experience",
    "roadmap.todo": "roadmap",
    "skills.json": "skills",
    "contact.sh": "contact",
  };
  const published = writeups.filter((w) => !w.draft);
  const drafts = writeups.filter((w) => w.draft);
  const projectWriteup = (p) => p.writeup && published.find((w) => w.slug === p.writeup);
  const pathStr = (segs) => (segs.length ? "~/" + segs.join("/") : "~");

  function setCwd(segs) {
    cwd = segs;
    cwdLabel.textContent = pathStr(segs);
  }

  // "../x", "~/x", "/home/tobi/x", "x" -> segments below ~, or null if it leaves ~
  function toSegs(arg) {
    let a = String(arg ?? "").trim();
    let segs;
    if (!a || a === "~" || a === HOME || a === HOME + "/") return [];
    if (a.startsWith("~/")) (segs = []), (a = a.slice(2));
    else if (a.startsWith(HOME + "/")) (segs = []), (a = a.slice(HOME.length + 1));
    else if (a.startsWith("/")) return null;
    else segs = [...cwd];
    for (const part of a.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") {
        if (!segs.length) return null;
        segs.pop();
      } else segs.push(part);
    }
    return segs;
  }

  function nodeAt(segs) {
    if (!segs) return null;
    const [a, b, c] = segs;
    if (!segs.length) return { dir: true, kind: "home" };
    if (segs.length === 1) {
      if (a === "projects") return { dir: true, kind: "projects" };
      if (a === "writeups") return { dir: true, kind: "writeups" };
      if (SECTION_FILES[a]) return { kind: "section", id: SECTION_FILES[a] };
      if (a === "cv.pdf") return { kind: "cv" };
      if (a === ".secrets") return { kind: "secrets" };
      return null;
    }
    if (a === "projects") {
      const p = projects.find((x) => x.slug === b);
      if (!p) return null;
      if (segs.length === 2) return { dir: true, kind: "project", p };
      if (segs.length === 3 && c === "README.md") return { kind: "readme", p };
      if (segs.length === 3 && c === "writeup.md" && projectWriteup(p)) return { kind: "writeup", w: projectWriteup(p) };
      return null;
    }
    if (a === "writeups") {
      if (segs.length === 2 && b === "drafts") return { dir: true, kind: "drafts" };
      if (segs.length === 2) {
        const w = published.find((x) => x.slug + ".md" === b);
        return w ? { kind: "writeup", w } : null;
      }
      if (segs.length === 3 && b === "drafts") {
        const w = drafts.find((x) => x.slug + ".md" === c);
        return w ? { kind: "draft", w } : null;
      }
    }
    return null;
  }

  // entries of a directory: { name, dir, hidden }
  function children(segs) {
    const n = nodeAt(segs);
    if (!n?.dir) return [];
    switch (n.kind) {
      case "home":
        return [
          { name: "projects", dir: true },
          { name: "writeups", dir: true },
          ...Object.keys(SECTION_FILES).map((name) => ({ name })),
          { name: "cv.pdf" },
          { name: ".secrets", hidden: true },
        ];
      case "projects":
        return projects.map((p) => ({ name: p.slug, dir: true, hidden: !!p.archived }));
      case "project":
        return [{ name: "README.md" }, ...(projectWriteup(n.p) ? [{ name: "writeup.md" }] : [])];
      case "writeups":
        return [...published.map((w) => ({ name: w.slug + ".md" })), { name: "drafts", dir: true }];
      case "drafts":
        return drafts.map((w) => ({ name: w.slug + ".md" }));
    }
    return [];
  }

  // `cat vibe-dj`, `open about` and friends keep working from anywhere
  function findByName(arg) {
    const name = String(arg || "").replace(/\/$/, "").replace(/\.md$/, "");
    const p = projects.find((x) => x.slug === name);
    if (p) return { dir: true, kind: "project", p, segs: ["projects", p.slug] };
    const w = writeups.find((x) => x.slug === name);
    if (w) return { kind: w.draft ? "draft" : "writeup", w };
    const file = Object.keys(SECTION_FILES).find((f) => f === arg || f.split(".")[0] === name);
    if (file) return { kind: "section", id: SECTION_FILES[file], segs: [file] };
    if (name === "projects" || name === "writeups") return { dir: true, kind: name, segs: [name] };
    return null;
  }

  function resolve(arg) {
    const segs = toSegs(arg);
    const n = nodeAt(segs);
    if (n) return { ...n, segs };
    return findByName(arg);
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
        <div class="nf-photo"><canvas class="nf-pixel" width="48" height="64" role="img" aria-label="Pixel-art portrait of Tobi" title="click to redraw"></canvas></div>
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
    pixelReveal(out.lastElementChild.querySelector(".nf-pixel"));
  }

  // draws the 48x64 portrait coarse-to-fine, like an image decoding over a slow link
  function pixelReveal(canvas) {
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      const tmp = document.createElement("canvas");
      const steps = reduceMotion ? [W] : [3, 6, 12, 24, W];
      let i = 0;
      const draw = () => {
        const s = steps[i];
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, W, H);
        if (s >= W) ctx.drawImage(img, 0, 0);
        else {
          const sh = Math.max(1, Math.round((s * H) / W));
          tmp.width = s;
          tmp.height = sh;
          const t = tmp.getContext("2d");
          t.imageSmoothingEnabled = false;
          t.drawImage(img, 0, 0, s, sh);
          ctx.drawImage(tmp, 0, 0, s, sh, 0, 0, W, H);
        }
        if (++i < steps.length) setTimeout(draw, 160);
      };
      draw();
    };
    img.src = prof.pixel;
    if (!canvas.dataset.wired) {
      canvas.dataset.wired = "1";
      canvas.addEventListener("click", (e) => {
        e.stopPropagation();
        pixelReveal(canvas);
      });
    }
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
      `<span class="t-faint">${items.length} items${!opts.all && hidden ? ` · ${hidden} archived hidden (${run("ls -a projects", "ls -a")})` : ""} · click one, or try ${run("cd ~/projects/vibe-dj", "cd vibe-dj")}</span>`
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
        line(run("open about", "→ read the full about.md"));
        break;
      case "experience":
        SITE.experience.forEach((x) => {
          line(`<span class="t-warn">${esc(x.dates)}</span>  <b>${esc(x.role)}</b> <span class="t-dim">@ ${esc(x.org)}</span>`);
          (x.phases || [{ bullets: x.bullets }]).forEach((g) => {
            if (g.title) line(`  <span class="t-info">↳ ${esc(g.title)}</span> <span class="t-faint">${esc(g.dates)}</span>`);
            g.bullets.forEach((b) => line(`    <span class="t-ok">+</span> ${esc(b)}`, "t-dim"));
          });
        });
        SITE.education.forEach((e) => line(`<span class="t-mag">${esc(e.dates)}</span>  <b>${esc(e.degree)}</b> <span class="t-dim">@ ${esc(e.school)}</span>`));
        line(run("open experience", "→ see it as a graph"));
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
    ["ls [path]", "list a directory (ls -a shows hidden and archived)"],
    ["cd <dir>", "move around: cd projects, cd vibe-dj, cd .., cd ~"],
    ["pwd", "where am I?"],
    ["cat <file>", "print a file: cat about.md, cat README.md"],
    ["open <name>", "show it on the page: open about, open vibe-dj, open ."],
    ["man <name>", "a project's manual page, e.g. man vibe-dj"],
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
      const all = args.some((a) => /^-\w*a/.test(a));
      const long = args.some((a) => /^-\w*l/.test(a));
      const target = args.find((a) => !a.startsWith("-"));
      const r = target ? resolve(target) : { ...nodeAt(cwd), segs: cwd };
      if (!r) return line(`ls: cannot access '${esc(target)}': No such file or directory`, "t-err");
      if (!r.dir) return line(esc(target));
      if (r.kind === "projects") {
        if (all) P.setArchive?.(true);
        return listProjects({ all, long });
      }
      const entries = children(r.segs).filter((e) => all || !e.hidden);
      const item = (e) => {
        const abs = pathStr([...r.segs, e.name]);
        const label = e.name + (e.dir ? "/" : "");
        if (e.name === "cv.pdf") return run("cv", label);
        if (e.name === ".secrets") return `<span class="t-faint">${label}</span>`;
        return run((e.dir ? "cd " : "cat ") + abs, label);
      };
      if (long) entries.forEach((e) => line(`<span class="t-faint">${e.dir ? "drwxr-xr-x" : "-rw-r--r--"}  ${esc(prof.user)}  </span>${item(e)}`));
      else line(entries.map(item).join("  "));
      if (r.kind === "project" && r.p.repo) line(`<span class="t-faint"># source:</span> ${link(r.p.repo, r.p.repo.replace("https://", ""))}`);
    },
    cd(args) {
      const target = args[0];
      if (!target || target === "~") return setCwd([]);
      const segs = toSegs(target);
      if (segs === null) return line(`cd: ${esc(target)}: this machine only has ~ (${HOME})`, "t-err");
      let n = nodeAt(segs) && { ...nodeAt(segs), segs };
      if (!n) {
        // a project name works from anywhere: cd vibe-dj
        const f = findByName(target);
        if (f?.dir) n = f;
        else if (f) n = { ...f, segs: f.segs || [] };
      }
      if (!n) return line(`cd: no such file or directory: ${esc(target)}`, "t-err");
      if (!n.dir) {
        const hint = n.kind === "section" ? `${run("cat ~/" + n.segs[0], "cat " + n.segs[0])} or ${run("open " + n.id)}` : run("cat " + target);
        return line(`cd: not a directory: ${esc(target)}. try ${hint}`, "t-err");
      }
      setCwd(n.segs);
      if (n.kind === "project") {
        const files = children(n.segs).map((e) => e.name).join("  ");
        line(
          `<span class="t-faint">${esc(files)}   # try</span> ${run(`cat ~/projects/${n.p.slug}/README.md`, "cat README.md")} <span class="t-faint">or</span> ${run("open " + n.p.slug, "open .")}`
        );
      }
    },
    cat(args) {
      if (!args.length) return line("usage: cat &lt;file&gt;   e.g. " + run("cat ~/about.md", "cat about.md"), "t-dim");
      const r = resolve(args[0]);
      if (!r) return line(`cat: ${esc(args[0])}: No such file or directory`, "t-err");
      switch (r.kind) {
        case "project":
          line(`<span class="t-faint">(${esc(r.p.slug)}/ is a directory, showing its README.md)</span>`);
          return catProject(r.p);
        case "readme":
          return catProject(r.p);
        case "section":
          return catSection(r.id);
        case "cv":
          return line(`cat: cv.pdf: binary file. try ${run("cv")} instead`, "t-warn");
        case "secrets":
          return line("there are no secrets. only side projects.", "t-warn");
        case "writeup":
          line(`<span class="t-ok"># ${esc(r.w.title)}</span>`);
          line(esc(r.w.summary), "t-dim");
          return line(run("open " + r.w.slug, "→ read it"));
        case "draft":
          line(`<span class="t-ok"># ${esc(r.w.title)}</span>  <span class="t-warn">(draft)</span>`);
          return line(esc(r.w.summary), "t-dim");
        default:
          return line(`cat: ${esc(args[0])}: Is a directory. try ${run("ls " + args[0])}`, "t-err");
      }
    },
    open(args) {
      const target = args[0] ?? ".";
      const r = resolve(target);
      if (!r) return line(`open: ${esc(target)}: not found. try ${run("ls ~/projects", "ls projects")}`, "t-err");
      switch (r.kind) {
        case "project":
        case "readme":
          P.openProject(r.p.slug);
          return line(`<span class="t-faint">opened man ${esc(r.p.slug)}</span>`);
        case "writeup":
          line(`<span class="t-faint">opening ${esc(r.w.slug)}.md…</span>`);
          location.href = P.writeupUrl(r.w.slug);
          return;
        case "draft":
          return line("that one is still a draft.", "t-warn");
        case "section":
          P.go(r.id);
          return line(`<span class="t-faint">→ scrolled to ${esc(r.id)}</span>`);
        case "projects":
        case "writeups":
          P.go(r.kind);
          return line(`<span class="t-faint">→ scrolled to ${esc(r.kind)}</span>`);
        case "drafts":
          return P.go("writeups");
        case "cv":
          return COMMANDS.cv();
        default:
          return P.go("top");
      }
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
    pwd: () => line(HOME + (cwd.length ? "/" + cwd.join("/") : "")),
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
  // completes paths relative to the current directory, like a real shell
  function pathCandidates(cur, dirsOnly = false) {
    const i = cur.lastIndexOf("/");
    const dirPart = i >= 0 ? cur.slice(0, i + 1) : "";
    const segs = dirPart ? toSegs(dirPart) : [...cwd];
    if (!nodeAt(segs)?.dir) return [];
    const showHidden = cur.slice(i + 1).startsWith(".");
    return children(segs)
      .filter((e) => (!dirsOnly || e.dir) && (showHidden || !e.hidden))
      .map((e) => dirPart + e.name + (e.dir ? "/" : ""));
  }

  function candidates(words) {
    if (words.length <= 1) return Object.keys(COMMANDS).filter((c) => !["vi", "nano", "emacs", "logout", "copy-email"].includes(c));
    const cmd = words[0];
    const cur = words[words.length - 1];
    const slugs = projects.map((p) => p.slug);
    switch (cmd) {
      case "cd":
        return [...pathCandidates(cur, true), "..", "~"];
      case "ls":
      case "cat":
        return pathCandidates(cur);
      case "open":
        return [...pathCandidates(cur), ...slugs, ...published.map((w) => w.slug), "about", "experience", "roadmap", "skills", "contact"];
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
    const opts = [...new Set(candidates(words))].filter((c) => c.startsWith(cur));
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
      setCwd([]);
      boot();
    },
    exec: execute,
    focus: () => input.focus({ preventScroll: true }),
  };

  boot();
})();
