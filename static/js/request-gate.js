/* Restrict HOA request submissions to emails in the resident directory.
   The page ships SHA-256 hashes only (window.SPCC_ALLOW) — never raw emails. */
(function () {
  var allow = (window.SPCC_ALLOW || []).map(function (s) { return String(s).toLowerCase(); });
  function hashHex(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }
  document.querySelectorAll('form.needs-resident-email').forEach(function (form) {
    var email = form.querySelector('input[type="email"]');
    var btn = form.querySelector('button[type="submit"]');
    if (!email || !btn) return;
    var status = document.createElement('p');
    status.className = 'resident-check';
    email.insertAdjacentElement('afterend', status);
    var ok = false;
    function render() { btn.disabled = !ok; }
    function check() {
      var v = (email.value || '').trim().toLowerCase();
      if (!v) { ok = false; status.textContent = ''; status.className = 'resident-check'; render(); return; }
      hashHex(v).then(function (hex) {
        ok = allow.indexOf(hex) >= 0;
        status.textContent = ok
          ? '✓ Resident email recognized.'
          : '✗ This email isn’t in our resident directory. If you’re a resident, email SPCCHOA@gmail.com to be added.';
        status.className = 'resident-check ' + (ok ? 'ok' : 'bad');
        render();
      });
    }
    btn.disabled = true;
    email.addEventListener('input', check);
    email.addEventListener('blur', check);
    form.addEventListener('submit', function (e) { if (!ok) { e.preventDefault(); check(); } });
  });
})();
