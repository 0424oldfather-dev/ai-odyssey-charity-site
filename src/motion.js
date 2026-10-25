(function () {
  'use strict';

  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let initialized = false;
  let frame = 0;
  let numberObserver = null;
  let revealObserver = null;
  let current = null;
  const fields = [
    ['total-commission', 'commissionCents'],
    ['total-allocation', 'allocationCents'],
    ['total-donation', 'donationCents'],
    ['reserve-balance', 'balanceCents']
  ];

  function showFinal() {
    if (!current) return;
    cancelAnimationFrame(frame);
    for (const [id, key] of fields) {
      document.getElementById(id).textContent = current.formatMoney(current.totals[key], current.language);
    }
    document.getElementById('progress-fill').style.width = (current.totals.progress * 100) + '%';
  }

  function animateNumbers() {
    if (!current || preference.matches) return;
    const start = performance.now();
    const duration = 1050;
    const snapshot = current;
    function tick(now) {
      const fraction = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - fraction, 3);
      for (const [id, key] of fields) {
        const target = snapshot.totals[key];
        const value = target % 100 === 0 ? Math.round(target * eased / 100) * 100 : Math.round(target * eased);
        document.getElementById(id).textContent = snapshot.formatMoney(value, snapshot.language);
      }
      if (fraction < 1) frame = requestAnimationFrame(tick);
      else showFinal();
    }
    frame = requestAnimationFrame(tick);
    requestAnimationFrame(() => {
      document.getElementById('progress-fill').style.width = (snapshot.totals.progress * 100) + '%';
    });
  }

  function setupReveals() {
    const targets = document.querySelectorAll('.section-head, .stats-grid, .threshold-card, .table-wrap, .table-note, .donation-list, .plan-header, .plan-card');
    revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -22px 0px' });
    targets.forEach(target => {
      target.classList.add('reveal');
      revealObserver.observe(target);
    });
  }

  function setupNumbers() {
    for (const [id] of fields) document.getElementById(id).textContent = current.formatMoney(0, current.language);
    document.getElementById('progress-fill').style.width = '0%';
    numberObserver = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        numberObserver.disconnect();
        numberObserver = null;
        animateNumbers();
      }
    }, { threshold: 0.12 });
    numberObserver.observe(document.getElementById('overview'));
  }

  function onRender(totals, formatMoney, language) {
    current = totals ? { totals, formatMoney, language } : null;
    if (initialized) {
      if (numberObserver) { numberObserver.disconnect(); numberObserver = null; }
      showFinal(); // Language changes should be immediate and should not restart the count.
      return;
    }
    initialized = true;
    if (preference.matches || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('motion-enabled');
    setupReveals();
    if (current) setupNumbers();
  }

  function onPreferenceChange() {
    if (!preference.matches) return;
    if (numberObserver) numberObserver.disconnect();
    if (revealObserver) revealObserver.disconnect();
    document.documentElement.classList.remove('motion-enabled');
    document.querySelectorAll('.reveal').forEach(target => target.classList.add('is-visible'));
    showFinal();
  }

  if (preference.addEventListener) preference.addEventListener('change', onPreferenceChange);
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: preference.matches ? 'auto' : 'smooth', block: 'start' });
    });
  });
  window.CharityMotion = { onRender };
})();
