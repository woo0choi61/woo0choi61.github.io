document.addEventListener("DOMContentLoaded", () => {
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  const body = document.body;

  if (!navToggle || !nav) {
    return;
  }

  const closeNav = () => {
    body.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
  };

  navToggle.addEventListener("click", () => {
    const isOpen = body.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      closeNav();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      closeNav();
    }
  });
});
