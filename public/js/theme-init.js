// Runs synchronously in <head> to set the theme before first paint (prevents a flash).
(function () {
  try {
    var root = document.documentElement;
    root.classList.add('js');
    var stored = localStorage.getItem('theme');
    var server = root.getAttribute('data-theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : server;
    if (theme !== 'light' && theme !== 'dark') {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
