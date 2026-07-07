// Site-wide Google sign-in for members and visitors (Supabase Auth).
// Admin rights stay server-side (UKWELI_ADMIN_EMAILS); /api/me reports isAdmin.
(function () {
  if (!window.supabase) return;
  var mount = document.getElementById('auth-nav');
  if (!mount) return;
  var sb = window.supabase.createClient('https://prrrxklacammcjovnfbc.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBycnJ4a2xhY2FtbWNqb3ZuZmJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNDYzMTAsImV4cCI6MjA5ODkyMjMxMH0.gmgJiEJDbEmiLiUsXKCrfXLQUITtVK-KtB_mJeyk_cU');
  window.ukweliAuth = sb;
  var session = null, me = null, open = false;

  function firstName(s) {
    var n = (me && me.name) || (s.user && s.user.user_metadata && (s.user.user_metadata.full_name || s.user.user_metadata.name)) || s.user.email;
    return String(n).split(' ')[0];
  }

  function render() {
    mount.textContent = '';
    if (!session) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Sign in';
      b.style.cssText = 'padding:11px 16px;background:transparent;border:1px solid rgba(33,26,18,.22);color:#211A12;border-radius:14px;font:600 14px/1 \'Hanken Grotesk\',sans-serif;cursor:pointer';
      b.addEventListener('click', function () {
        sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
      });
      mount.appendChild(b);
      return;
    }
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-flex';
    var b = document.createElement('button');
    b.type = 'button';
    var av = (session.user.user_metadata && session.user.user_metadata.avatar_url) || '';
    b.innerHTML = (av ? '<img src="' + av + '" alt="" style="width:22px;height:22px;border-radius:50%" referrerpolicy="no-referrer">' : '') +
      '<span>' + firstName(session) + '</span><span style="font-size:10px">\u25BE</span>';
    b.style.cssText = 'display:inline-flex;align-items:center;gap:8px;padding:9px 14px;background:transparent;border:1px solid rgba(33,26,18,.22);color:#211A12;border-radius:14px;font:600 14px/1 \'Hanken Grotesk\',sans-serif;cursor:pointer';
    var menu = document.createElement('div');
    menu.style.cssText = 'position:absolute;top:calc(100% + 8px);right:0;min-width:180px;background:#FBF8F2;border:1px solid #EAE1D1;border-radius:14px;box-shadow:0 20px 44px -18px rgba(33,26,18,.4);padding:6px;display:none;z-index:60';
    function item(label, fn, href) {
      var a = document.createElement(href ? 'a' : 'button');
      if (href) a.href = href; else a.type = 'button';
      a.textContent = label;
      a.style.cssText = 'display:block;width:100%;text-align:left;padding:11px 13px;background:none;border:none;border-radius:10px;font:600 14px/1 \'Hanken Grotesk\',sans-serif;color:#211A12;cursor:pointer;text-decoration:none';
      a.addEventListener('mouseenter', function () { a.style.background = '#F1E9DA'; });
      a.addEventListener('mouseleave', function () { a.style.background = 'none'; });
      if (fn) a.addEventListener('click', fn);
      menu.appendChild(a);
    }
    var email = document.createElement('div');
    email.textContent = session.user.email;
    email.style.cssText = 'padding:9px 13px;font:500 12px/1.4 \'Hanken Grotesk\',sans-serif;color:#8A7C68;border-bottom:1px solid #EAE1D1;margin-bottom:4px;word-break:break-all';
    menu.appendChild(email);
    if (me && me.isAdmin) item('Manage site', null, 'admin.html');
    item('Sign out', function () { sb.auth.signOut().then(function () { session = null; me = null; render(); }); });
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      open = !open;
      menu.style.display = open ? 'block' : 'none';
    });
    document.addEventListener('click', function () { if (open) { open = false; menu.style.display = 'none'; } });
    wrap.appendChild(b); wrap.appendChild(menu);
    mount.appendChild(wrap);
  }

  function loadMe() {
    if (!session) return;
    fetch('/api/me', { headers: { Authorization: 'Bearer ' + session.access_token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) { me = m; render(); })
      .catch(function () {});
  }

  sb.auth.getSession().then(function (d) { session = d.data.session; render(); loadMe(); });
  sb.auth.onAuthStateChange(function (_e, s) { session = s; render(); loadMe(); });
})();
