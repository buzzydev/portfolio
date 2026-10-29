(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function save(btn, next) {
    try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
    var url = btn.getAttribute('data-save-url');
    if (url) {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': btn.getAttribute('data-csrf'), Accept: 'application/json' },
        body: JSON.stringify({ theme: next }),
      }).catch(function () {});
    }
  }

  document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      var apply = function () { root.setAttribute('data-theme', next); };
      if (document.startViewTransition && !reduce) {
        // Circular wipe that grows from the toggle button
        var r = btn.getBoundingClientRect();
        root.style.setProperty('--tx', (r.left + r.width / 2) + 'px');
        root.style.setProperty('--ty', (r.top + r.height / 2) + 'px');
        document.startViewTransition(apply);
      } else {
        root.classList.add('theme-anim');
        apply();
        window.setTimeout(function () { root.classList.remove('theme-anim'); }, 350);
      }
      save(btn, next);
    });
  });
})();
