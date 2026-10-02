(() => {
  const allowedUtmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  const clean = (value, max = 120) => String(value || "").trim().slice(0, max);
  const params = new URLSearchParams(window.location.search);
  const utm = Object.fromEntries(
    allowedUtmKeys
      .map((key) => [key, clean(params.get(key))])
      .filter(([, value]) => value)
  );
  const base = () => ({
    page_title: clean(document.title, 160),
    page_path: window.location.pathname,
    ...utm,
  });

  window.growlocalAnalytics = {
    track(name, properties = {}) {
      const event = {
        event: clean(name, 80),
        ...base(),
        ...properties,
        timestamp: new Date().toISOString(),
      };
      window.growlocalAnalytics.queue.push(event);
      if (Array.isArray(window.dataLayer)) window.dataLayer.push(event);
      document.dispatchEvent(new CustomEvent("growlocal:track", { detail: event }));
    },
    queue: [],
  };

  document.addEventListener("click", (event) => {
    const target = event.target?.closest?.("a,button");
    if (!target) return;
    const trackName = target.dataset.track || (target.getAttribute("href") === "#audit" ? "audit_entry" : "");
    if (!trackName) return;
    window.growlocalAnalytics.track("cta_clicked", {
      location: clean(target.dataset.location || "page", 80),
      label: clean(target.textContent, 120),
      cta: clean(trackName, 80),
    });
  });
})();
