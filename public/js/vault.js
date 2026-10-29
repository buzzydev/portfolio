(function () {
  var state = document.getElementById('vault-state');
  var csrf = state.getAttribute('data-csrf');
  var unlocked = state.getAttribute('data-unlocked') === '1';
  var until = Number(state.getAttribute('data-until')) || 0;
  var CLEAR_MS = 30000;
  var clipTimer;

  var entryDlg = document.getElementById('entry-dialog');
  var unlockDlg = document.getElementById('unlock-dialog');
  var entryForm = document.getElementById('entry-form');
  var pass = document.getElementById('entry-password');
  var secrets = new Map(); // row -> hide timer. Plaintext is never kept after hiding.

  function toast(msg, type) {
    var box = document.getElementById('toasts');
    var t = document.createElement('div');
    t.className = 'toast toast-' + (type || 'success');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.classList.add('is-leaving'); setTimeout(function () { t.remove(); }, 300); }, 3500);
  }

  function post(url, body) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); });
  }

  function render() {
    document.getElementById('vault-state-text').textContent = unlocked ? 'Vault unlocked' : 'Vault locked';
    document.getElementById('vault-state-sub').textContent = unlocked ? 'Locks again 10 minutes after you confirmed your password.' : 'Confirm your account password to reveal, copy, add, edit or delete passwords.';
    document.getElementById('vault-toggle').textContent = unlocked ? 'Lock now' : 'Unlock';
    state.classList.toggle('is-unlocked', unlocked);
    if (!unlocked) hideAll();
  }
  function hideAll() { secrets.forEach(function (_, row) { hide(row); }); }

  // Auto-lock UI when the server-side window ends
  setInterval(function () { if (unlocked && until && Date.now() > until) { unlocked = false; render(); } }, 5000);

  function ensureUnlocked() {
    if (unlocked) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var form = document.getElementById('unlock-form');
      var err = document.getElementById('unlock-error');
      err.textContent = ''; form.reset();
      function done(ok) { form.removeEventListener('submit', onSubmit); unlockDlg.removeEventListener('close', onClose); resolve(ok); }
      function onClose() { done(false); }
      function onSubmit(e) {
        e.preventDefault();
        var btn = form.querySelector('button[type=submit]'); btn.classList.add('is-loading');
        post('/admin/vault/unlock', { password: form.password.value }).then(function (r) {
          btn.classList.remove('is-loading'); form.reset();
          if (r.status === 200) { unlocked = true; until = r.body.until; render(); unlockDlg.removeEventListener('close', onClose); unlockDlg.close(); done(true); }
          else { err.textContent = r.body.error || 'Could not unlock.'; }
        });
      }
      form.addEventListener('submit', onSubmit);
      unlockDlg.addEventListener('close', onClose);
      unlockDlg.showModal();
      form.password.focus();
    });
  }

  document.getElementById('vault-toggle').addEventListener('click', function () {
    if (unlocked) { post('/admin/vault/lock').then(function () { unlocked = false; render(); }); }
    else ensureUnlocked();
  });

  function hide(row) {
    var code = row.querySelector('[data-secret]');
    code.textContent = '••••••••••••'; code.setAttribute('aria-label', 'Password hidden');
    var btn = row.querySelector('[data-act=reveal]');
    btn.setAttribute('aria-label', 'Reveal password'); btn.title = 'Reveal password';
    clearTimeout(secrets.get(row)); secrets.delete(row);
  }

  function fetchSecret(row) {
    return ensureUnlocked().then(function (ok) {
      if (!ok) return null;
      return post('/admin/vault/' + row.dataset.id + '/reveal').then(function (r) {
        if (r.status === 200) return r.body.password;
        if (r.status === 403 && r.body.code === 'REAUTH') { unlocked = false; render(); return fetchSecret(row); }
        toast(r.body.error || 'Could not reveal this password.', 'error');
        return null;
      });
    });
  }

  function copy(text, label) {
    if (!navigator.clipboard) { toast('Copy is not available in this browser.', 'error'); return; }
    navigator.clipboard.writeText(text).then(function () {
      toast(label + ' copied');
      clearTimeout(clipTimer);
      // Best effort: overwrite the clipboard after 30 seconds.
      clipTimer = setTimeout(function () { navigator.clipboard.writeText(' ').catch(function () {}); }, CLEAR_MS);
    }).catch(function () { toast('Copy was blocked by the browser.', 'error'); });
  }

  document.querySelector('.vault-list') && document.querySelector('.vault-list').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var row = btn.closest('.vault-row');
    var act = btn.getAttribute('data-act');
    if (act === 'reveal') {
      if (secrets.has(row)) { hide(row); return; }
      fetchSecret(row).then(function (pw) {
        if (pw == null) return;
        var code = row.querySelector('[data-secret]');
        code.textContent = pw; code.setAttribute('aria-label', 'Password shown');
        btn.setAttribute('aria-label', 'Hide password'); btn.title = 'Hide password';
        secrets.set(row, setTimeout(function () { hide(row); }, 15000));
      });
    } else if (act === 'copy-user') {
      copy(row.dataset.username, 'Username');
    } else if (act === 'copy-pass') {
      fetchSecret(row).then(function (pw) { if (pw != null) copy(pw, 'Password'); });
    } else if (act === 'edit') {
      ensureUnlocked().then(function (ok) { if (ok) openEdit(row); });
    }
  });

  // Deleting needs a fresh unlock; the form also enforces it on the server.
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.hasAttribute && f.hasAttribute('data-needs-unlock') && !unlocked) {
      e.preventDefault(); e.stopImmediatePropagation();
      ensureUnlocked().then(function (ok) { if (ok) f.requestSubmit(); });
    }
  }, true);

  function openAdd() {
    entryForm.reset(); entryForm.action = '/admin/vault';
    entryForm.category.value = 'General';
    document.getElementById('entry-title').textContent = 'Add password';
    document.getElementById('entry-pass-help').textContent = '';
    pass.required = true; pass.type = 'password';
    entryDlg.showModal(); entryForm.service.focus();
  }
  function openEdit(row) {
    entryForm.reset(); entryForm.action = '/admin/vault/' + row.dataset.id;
    entryForm.service.value = row.dataset.service; entryForm.username.value = row.dataset.username;
    entryForm.url.value = row.dataset.url; entryForm.category.value = row.dataset.category;
    document.getElementById('entry-title').textContent = 'Edit password';
    document.getElementById('entry-pass-help').textContent = 'Leave blank to keep the current password.';
    pass.required = false; pass.type = 'password';
    post('/admin/vault/' + row.dataset.id + '/notes').then(function (r) { if (r.status === 200) entryForm.notes.value = r.body.notes; });
    entryDlg.showModal();
  }

  document.getElementById('vault-add').addEventListener('click', function () { ensureUnlocked().then(function (ok) { if (ok) openAdd(); }); });
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { b.closest('dialog').close(); }); });
  entryDlg.addEventListener('close', function () { entryForm.reset(); pass.value = ''; });

  document.getElementById('entry-pass-toggle').addEventListener('click', function () { pass.type = pass.type === 'password' ? 'text' : 'password'; });
  document.getElementById('entry-generate').addEventListener('click', function () {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_';
    var buf = new Uint32Array(24); crypto.getRandomValues(buf);
    pass.value = Array.prototype.map.call(buf, function (n) { return chars[n % chars.length]; }).join('');
    pass.type = 'text';
  });
  entryForm.addEventListener('submit', function () { var b = entryForm.querySelector('button[type=submit]'); b.classList.add('is-loading'); });
  window.addEventListener('pagehide', hideAll);
})();
