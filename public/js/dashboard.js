(function () {
  // Sidebar: collapsible on desktop, drawer on mobile
  var body = document.body;
  var toggle = document.getElementById('sidebar-toggle');
  var scrim = document.getElementById('scrim');
  var mobile = window.matchMedia('(max-width: 900px)');
  try { if (!mobile.matches && localStorage.getItem('sidebar') === 'collapsed') body.classList.add('sb-collapsed'); } catch (e) {}
  function setOpen(open) { if (scrim) scrim.hidden = !open; body.classList.toggle('sb-open', open); toggle.setAttribute('aria-expanded', String(open)); }
  toggle.addEventListener('click', function () {
    if (mobile.matches) { setOpen(!body.classList.contains('sb-open')); return; }
    var c = body.classList.toggle('sb-collapsed');
    toggle.setAttribute('aria-expanded', String(!c));
    try { localStorage.setItem('sidebar', c ? 'collapsed' : 'open'); } catch (e) {}
  });
  if (scrim) scrim.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });

  // Confirmation dialogs for destructive forms
  var dlg = document.getElementById('confirm-dialog');
  var text = document.getElementById('confirm-text');
  document.addEventListener('submit', function (e) {
    var f = e.target;
    var msg = f.getAttribute && f.getAttribute('data-confirm');
    if (!msg || f.dataset.confirmed === '1' || !dlg || !dlg.showModal) return;
    e.preventDefault();
    text.textContent = msg;
    dlg.returnValue = '';
    dlg.showModal();
    dlg.addEventListener('close', function once() {
      dlg.removeEventListener('close', once);
      if (dlg.returnValue === 'ok') { f.dataset.confirmed = '1'; if (f.requestSubmit) f.requestSubmit(); else f.submit(); }
    });
  }, true);

  // Filters that submit on change
  document.querySelectorAll('[data-autosubmit]').forEach(function (el) { el.addEventListener('change', function () { el.form.submit(); }); });

  // Image preview before upload
  document.querySelectorAll('input[type=file][data-preview]').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var img = document.querySelector(inp.getAttribute('data-preview'));
      var file = inp.files && inp.files[0];
      if (!img || !file) { if (img) img.hidden = true; return; }
      img.src = URL.createObjectURL(file); img.hidden = false;
    });
  });

  // ---- Motion: stagger indexes + count-up numbers ----
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.table tbody tr, .vault-row').forEach(function (el, i) { el.style.setProperty('--i', String(Math.min(i, 14))); });
  document.querySelectorAll('.stat').forEach(function (el) { el.style.setProperty('--i', el.getAttribute('data-i') || '0'); });
  if (!reduce) {
    document.querySelectorAll('[data-count]').forEach(function (el) {
      var target = parseInt(el.getAttribute('data-count'), 10);
      if (!target || target < 1) return;
      var start = null;
      var dur = 700 + Math.min(target, 40) * 10;
      el.textContent = '0';
      function step(ts) {
        if (start === null) start = ts;
        var t = Math.min(1, (ts - start) / dur);
        el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) requestAnimationFrame(step); else el.textContent = String(target);
      }
      requestAnimationFrame(step);
    });
  }
})();
