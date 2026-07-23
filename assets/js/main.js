document.addEventListener("DOMContentLoaded", () => {
  // --- Live clock ---
  const clockEl = document.getElementById("clock");
  if (clockEl) {
    const pad = (n) => n.toString().padStart(2, "0");
    const tick = () => {
      const now = new Date();
      clockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    };
    tick();
    setInterval(tick, 1000);
  }

  // --- Mobile nav toggle ---
  const navToggle = document.getElementById("mobile-nav-toggle");
  const mobileMenu = document.getElementById("mobile-menu");
  if (navToggle && mobileMenu) {
    navToggle.addEventListener("click", () => {
      const isOpen = mobileMenu.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });
    mobileMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        mobileMenu.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // --- Smooth scroll for in-page nav links ---
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const target = document.querySelector(this.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth" });
    });
  });

  // --- Project filter ---
  const filterChips = document.querySelectorAll(".filter-chip");
  const projectCards = document.querySelectorAll(".project-card");
  filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      filterChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      const filter = chip.dataset.filter;
      projectCards.forEach((card) => {
        const cats = card.dataset.cats ? card.dataset.cats.split(",") : [];
        const show = filter === "All" || cats.includes(filter);
        card.hidden = !show;
      });
    });
  });
});
