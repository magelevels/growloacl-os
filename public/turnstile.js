// Load the audit challenge only when the form is close to view or receives focus.
// The widget still auto-renders once the Cloudflare script arrives.
(() => {
  const form = document.querySelector("#audit-form");
  const widget = document.querySelector(".cf-turnstile");
  if (!form || !widget) return;

  let started = false;
  let observer;
  const load = () => {
    if (started) return;
    started = true;
    observer?.disconnect();
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  };

  form.addEventListener("focusin", load, { once: true });
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) load();
    }, { rootMargin: "320px 0px" });
    observer.observe(widget);
  } else {
    window.setTimeout(load, 1200);
  }
})();
