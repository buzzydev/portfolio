(function () {
  // Dropdowns
  document.querySelectorAll('[data-dropdown]').forEach(function (dd) {
    var toggle = dd.querySelector('[data-dropdown-toggle]');
    var menu = dd.querySelector('.dropdown-menu');
    function close() { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); dd.classList.remove('is-open'); }
    function open() { menu.hidden = false; toggle.setAttribute('aria-expanded', 'true'); dd.classList.add('is-open'); }
    toggle.addEventListener('click', function (e) { e.stopPropagation(); menu.hidden ? open() : close(); });
    document.addEventListener('click', function (e) { if (!dd.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { close(); toggle.focus(); } });
  });

  // Mobile nav
  var nt = document.getElementById('nav-toggle');
  var nm = document.getElementById('nav-menu');
  if (nt && nm) {
    nt.addEventListener('click', function () {
      var open = nm.classList.toggle('is-open');
      nt.setAttribute('aria-expanded', String(open));
    });
  }

  // Toasts
  document.querySelectorAll('[data-toast]').forEach(function (t) {
    window.setTimeout(function () { t.classList.add('is-leaving'); window.setTimeout(function () { t.remove(); }, 300); }, 5000);
  });

  // Hero background image (set through CSSOM so the CSP needs no inline styles)
  var hero = document.querySelector('.hero[data-bg]');
  if (hero) hero.style.setProperty('--hero-bg', 'url("' + hero.getAttribute('data-bg') + '")');

  // Project filter
  var filters = document.querySelectorAll('.filter');
  var cards = document.querySelectorAll('.project');
  var empty = document.getElementById('filter-empty');
  filters.forEach(function (f) {
    f.addEventListener('click', function () {
      var cat = f.getAttribute('data-filter');
      filters.forEach(function (x) { var on = x === f; x.classList.toggle('is-active', on); x.setAttribute('aria-pressed', String(on)); });
      var shown = 0;
      cards.forEach(function (c) {
        var show = cat === 'ALL' || c.getAttribute('data-category') === cat;
        c.hidden = !show;
        c.classList.remove('is-entering');
        if (show) { c.style.setProperty('--i', String(shown)); void c.offsetWidth; c.classList.add('is-entering'); shown++; }
      });
      if (empty) empty.hidden = shown > 0;
    });
  });

  // Loading state on submit
  document.querySelectorAll('form[data-loading]').forEach(function (f) {
    f.addEventListener('submit', function () { var b = f.querySelector('button[type=submit], button:not([type])'); if (b) { b.classList.add('is-loading'); } });
  });

  // Contact form (progressive enhancement: falls back to a normal POST)
  var form = document.getElementById('contact-form');
  if (form) {
    var status = document.getElementById('contact-status');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      form.querySelectorAll('[data-err]').forEach(function (s) { s.textContent = ''; });
      status.textContent = ''; status.className = 'form-status';
      btn.classList.add('is-loading'); btn.disabled = true;
      fetch('/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(new FormData(form)).toString(),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (res.ok) { form.reset(); status.classList.add('ok'); }
          else {
            status.classList.add('bad');
            var errs = res.body.errors || {};
            Object.keys(errs).forEach(function (k) { var el = form.querySelector('[data-err="' + k + '"]'); if (el) el.textContent = errs[k]; });
          }
          status.textContent = res.body.message || res.body.error || 'Something went wrong.';
        })
        .catch(function () { status.classList.add('bad'); status.textContent = 'Network error. Please try again.'; })
        .then(function () { btn.classList.remove('is-loading'); btn.disabled = false; });
    });
  }

  // ---- Motion layer ----
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Sticky nav shadow + scroll progress bar
  var nav = document.querySelector('.nav');
  var bar = document.getElementById('progress');
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY;
      if (nav) nav.classList.toggle('is-scrolled', y > 8);
      if (bar) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
      }
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Scroll reveal with stagger inside each group
  if (!reduce && 'IntersectionObserver' in window) {
    var groups = [
      '.section-title', '.about-grid > *', '.skill-groups > *', '.filters', '.project-grid > *',
      '.timeline-block', '.timeline li', '.contact-grid > *', '.footer .container'
    ];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll(groups.join(',')).forEach(function (el) {
      var idx = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.setProperty('--i', String(Math.min(idx, 8)));
      el.classList.add('reveal');
      io.observe(el);
    });
  }

  // Cursor spotlight on cards
  document.querySelectorAll('.project, .skill-group').forEach(function (c) {
    c.addEventListener('pointermove', function (e) {
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  // Hero parallax (portrait and chips drift against the pointer)
  var art = document.querySelector('.hero-art');
  var heroEl = document.querySelector('.hero');
  if (art && heroEl && !reduce && window.matchMedia('(hover: hover)').matches) {
    heroEl.addEventListener('pointermove', function (e) {
      var r = heroEl.getBoundingClientRect();
      art.style.setProperty('--px', (((e.clientX - r.left) / r.width) - 0.5).toFixed(3));
      art.style.setProperty('--py', (((e.clientY - r.top) / r.height) - 0.5).toFixed(3));
    });
    heroEl.addEventListener('pointerleave', function () { art.style.setProperty('--px', '0'); art.style.setProperty('--py', '0'); });
  }
})();
