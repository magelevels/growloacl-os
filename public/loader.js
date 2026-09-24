(() => {
  const loader = document.getElementById("site-loader");
  if (!loader) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const started = performance.now();
  let hidden = false;

  const hide = () => {
    if (hidden) return;
    hidden = true;
    const wait = reduced ? 0 : Math.max(0, 520 - (performance.now() - started));
    window.setTimeout(() => {
      loader.classList.add("is-ready");
      loader.setAttribute("aria-hidden", "true");
      loader.removeAttribute("role");
      loader.removeAttribute("aria-label");
      window.setTimeout(() => loader.remove(), reduced ? 50 : 500);
    }, wait);
  };

  if (document.readyState === "complete") hide();
  else window.addEventListener("load", hide, { once: true });
  window.setTimeout(hide, 2200);
})();
