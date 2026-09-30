(() => {
  const loader = document.getElementById("site-loader");
  if (!loader) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const started = performance.now();
  const minimumDisplay = 320;
  let hidden = false;

  const hide = () => {
    if (hidden) return;
    hidden = true;
    const wait = reduced ? 0 : Math.max(0, minimumDisplay - (performance.now() - started));
    window.setTimeout(() => {
      loader.classList.add("is-ready");
      loader.setAttribute("aria-hidden", "true");
      loader.removeAttribute("role");
      loader.removeAttribute("aria-label");
      window.setTimeout(() => loader.remove(), reduced ? 50 : 500);
    }, wait);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hide, { once: true });
  else hide();
  window.setTimeout(hide, 1600);
})();
