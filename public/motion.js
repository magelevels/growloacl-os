// Decorative motion never hides content or delays a click, form submission or save.
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Set();
  let observer;
  function enter(element, delay = 0) {
    if (reduced.matches || typeof element.animate !== 'function') return;
    const animation = element.animate([
      { opacity: 0.75, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 480, delay, easing: 'cubic-bezier(.2,.7,.3,1)' });
    active.add(animation);
    animation.finished.catch(() => {}).finally(() => active.delete(animation));
  }
  if (!reduced.matches) {
    document.querySelectorAll('.hero > .wrap > .eyebrow, .hero h1, .hero > .wrap > p, .hero-actions').forEach((el, i) => enter(el, Math.min(i * 55, 165)));
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          enter(entry.target);
        }
      }, { threshold: 0.08 });
      document.querySelectorAll('.studio-audit-strip, .section-head, .grid-4 > .card, .price-card, .audit-copy, .form-card').forEach(el => observer.observe(el));
    }
  }
  function cancelMotion() {
    if (!reduced.matches) return;
    observer?.disconnect();
    active.forEach(animation => animation.cancel());
    active.clear();
  }
  reduced.addEventListener('change', cancelMotion);
  window.addEventListener('pagehide', () => { observer?.disconnect(); active.forEach(animation => animation.cancel()); reduced.removeEventListener('change', cancelMotion); }, { once: true });
})();
