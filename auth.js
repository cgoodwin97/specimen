// auth.js — loaded by every page
// Handles: session check, sign in modal, register modal, nav state, sign out

(function () {

  // ---------- State ----------
  let currentUser = null;

  // Level titles — mirrors profile/xp.js
  const LEVEL_TITLES = [
    'Curious Mind','Microscopist','Lab Trainee','Field Researcher',
    'Lab Technician','Research Associate','Research Scientist',
    'Senior Scientist','Research Fellow','Principal Scientist',
  ];
  const LEVEL_THRESHOLDS = [0,100,300,600,1000,1500,2200,3000,4000,5500];

  function levelTitle(level){ return LEVEL_TITLES[(level||1)-1] || 'Curious Mind'; }
  function nextLevelXp(level){ return level >= 10 ? null : LEVEL_THRESHOLDS[level]; }

  // ---------- Init ----------
  async function init() {
    injectAuthModal();
    injectNavSignIn();
    await checkSession();
    bindModalEvents();
  }

  // ---------- Session check ----------
  async function checkSession() {
    try {
      const res = await fetch('/auth/me', { credentials: 'include' });
      const data = await res.json();
      if (data.ok && data.user) {
        currentUser = data.user;
        setSignedInNav(data.user.username);
      } else {
        setSignedOutNav();
      }
    } catch (e) {
      setSignedOutNav();
    }
  }

  // ---------- Nav injection ----------
  function injectNavSignIn() {
    const nav = document.querySelector('.site-nav');
    if (!nav) return;
    const sep = document.createElement('span');
    sep.className = 'nav-sep';
    sep.textContent = '|';
    const wrap = document.createElement('span');
    wrap.id = 'auth-nav-item';
    wrap.style.position = 'relative';
    nav.appendChild(sep);
    nav.appendChild(wrap);
  }

  function setSignedOutNav() {
    const wrap = document.getElementById('auth-nav-item');
    if (!wrap) return;
    wrap.innerHTML = '<button type="button" class="nav-auth-btn" id="open-signin">sign in</button>';
    document.getElementById('open-signin')?.addEventListener('click', () => openModal('signin'));
  }

  function setSignedInNav(username) {
    const wrap = document.getElementById('auth-nav-item');
    if (!wrap) return;
    wrap.innerHTML = `
      <button type="button" class="nav-auth-btn nav-username" id="user-menu-btn">${esc(username)}</button>
      <div class="user-dropdown" id="user-dropdown" hidden>
        <button type="button" class="user-dropdown-item" id="open-profile-btn">profile</button>
        <button type="button" class="user-dropdown-item" id="sign-out-btn">sign out</button>
      </div>`;
    document.getElementById('user-menu-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('user-dropdown').hidden = !document.getElementById('user-dropdown').hidden;
    });
    document.getElementById('open-profile-btn')?.addEventListener('click', () => {
      document.getElementById('user-dropdown').hidden = true;
      openProfileModal();
    });
    document.getElementById('sign-out-btn')?.addEventListener('click', signOut);
    document.addEventListener('click', () => {
      const dd = document.getElementById('user-dropdown');
      if (dd) dd.hidden = true;
    });
  }

  // ---------- Modal injection ----------
  function injectAuthModal() {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="modal-overlay" id="auth-modal-overlay" hidden>
        <div class="modal-card-wrap" style="max-width:400px;">
          <button type="button" class="modal-close-btn" id="auth-modal-close" aria-label="Close">&times;</button>
          <div id="auth-modal-content"></div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);
  }

  function openModal(view) {
    const overlay = document.getElementById('auth-modal-overlay');
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    renderView(view);
  }

  function closeModal() {
    const overlay = document.getElementById('auth-modal-overlay');
    overlay.hidden = true;
    document.body.style.overflow = '';
    document.getElementById('auth-modal-content').innerHTML = '';
  }

  function bindModalEvents() {
    document.addEventListener('click', (e) => {
      const overlay = document.getElementById('auth-modal-overlay');
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      const overlay = document.getElementById('auth-modal-overlay');
      if (e.key === 'Escape' && overlay && !overlay.hidden) closeModal();
    });
    document.getElementById('auth-modal-close')?.addEventListener('click', closeModal);
  }

  // ---------- Sign in view ----------
  function renderView(view) {
    const content = document.getElementById('auth-modal-content');
    if (view === 'signin') {
      content.innerHTML = `
        <div class="card">
          <div class="card-hole" aria-hidden="true"></div>
          <h2 class="entry-name" style="font-size:22px; margin-bottom:4px;">Sign in</h2>
          <p class="meta" style="margin-bottom:16px;">Access your saved genes across any device.</p>
          <div class="rule"></div>
          <div id="auth-error" class="auth-error" hidden></div>
          <div class="auth-field">
            <label class="field-label" for="si-username">username</label>
            <input type="text" id="si-username" class="auth-input" autocomplete="username" autocapitalize="none" spellcheck="false">
          </div>
          <div class="auth-field">
            <label class="field-label" for="si-password">password</label>
            <input type="password" id="si-password" class="auth-input" autocomplete="current-password">
          </div>
          <button type="button" class="auth-submit" id="si-submit">Sign in</button>
          <div class="rule"></div>
          <p class="meta" style="text-align:center;">No account? <button type="button" class="link-btn" id="go-register">Create one</button></p>
        </div>`;
      document.getElementById('go-register')?.addEventListener('click', () => renderView('register'));
      document.getElementById('si-submit')?.addEventListener('click', handleSignIn);
      document.getElementById('si-password')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSignIn();
      });
    } else {
      content.innerHTML = `
        <div class="card">
          <div class="card-hole" aria-hidden="true"></div>
          <h2 class="entry-name" style="font-size:22px; margin-bottom:4px;">Create account</h2>
          <p class="meta" style="margin-bottom:16px;">All data is stored securely, but as a precaution, please avoid using any personal information in your username or password.</p>
          <div class="rule"></div>
          <div id="auth-error" class="auth-error" hidden></div>
          <div class="auth-field">
            <label class="field-label" for="reg-username">username <span class="auth-hint">5+ characters, no spaces</span></label>
            <input type="text" id="reg-username" class="auth-input" autocomplete="username" autocapitalize="none" spellcheck="false">
          </div>
          <div class="auth-field">
            <label class="field-label" for="reg-password">password <span class="auth-hint">8+ characters</span></label>
            <input type="password" id="reg-password" class="auth-input" autocomplete="new-password">
          </div>
          <button type="button" class="auth-submit" id="reg-submit">Create account</button>
          <div class="rule"></div>
          <p class="meta" style="text-align:center;">Already have an account? <button type="button" class="link-btn" id="go-signin">Sign in</button></p>
        </div>`;
      document.getElementById('go-signin')?.addEventListener('click', () => renderView('signin'));
      document.getElementById('reg-submit')?.addEventListener('click', handleRegister);
      document.getElementById('reg-password')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleRegister();
      });
    }
  }

  // ---------- Profile modal ----------
  function openProfileModal() {
    const overlay = document.getElementById('auth-modal-overlay');
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    renderProfileModal();
  }

  function renderProfileModal() {
    const content = document.getElementById('auth-modal-content');
    const user = currentUser || {};
    const level = user.level || 1;
    const xp = user.xp || 0;
    const title = levelTitle(level);
    const nextXp = nextLevelXp(level);
    const pct = nextXp ? Math.min(100, Math.round((xp / nextXp) * 100)) : 100;
    const xpLabel = nextXp ? `${xp} xp` : `${xp} xp`;
    const nextLabel = nextXp ? `next level at ${nextXp} xp` : 'max level';

    content.innerHTML = `
      <div style="background:#FAFBF7;border-radius:16px;overflow:hidden;">
        <div style="padding:24px 24px 20px;border-bottom:0.5px solid #D4D8D0;">
          <p style="font-family:'Fraunces',Georgia,serif;font-style:italic;font-size:18px;font-weight:500;color:#1E2A22;margin:0 0 8px;text-align:center;">${esc(user.username || '')}</p>
          <div style="display:inline-flex;align-items:center;gap:6px;background:#E1F5EE;border:0.5px solid #9FE1CB;border-radius:20px;padding:4px 12px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:#085041;font-weight:500;width:fit-content;margin:0 auto 10px;display:flex;justify-content:center;">
            <span style="width:7px;height:7px;border-radius:50%;background:#1F6F5C;display:inline-block;"></span>
            level ${level} — ${esc(title)}
          </div>
          <div style="margin-top:8px;">
            <div style="display:flex;justify-content:space-between;font-size:10.5px;font-family:'IBM Plex Mono',monospace;color:#6E7568;margin-bottom:5px;">
              <span>${xpLabel}</span><span>${nextLabel}</span>
            </div>
            <div style="width:100%;height:5px;background:#D4D8D0;border-radius:3px;overflow:hidden;">
              <div style="height:100%;background:#1F6F5C;border-radius:3px;width:${pct}%;"></div>
            </div>
          </div>
        </div>
        <div style="padding:18px 24px 16px;">
          <div id="profile-save-msg" style="display:none;font-size:12px;font-family:'IBM Plex Mono',monospace;color:#1F6F5C;margin-bottom:10px;text-align:center;"></div>
          <label style="font-size:10.5px;font-family:'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:0.06em;color:#6E7568;margin:0 0 5px;display:block;">first name</label>
          <input type="text" id="profile-first-name" class="auth-input" value="${esc(user.first_name || '')}" placeholder="optional" maxlength="50" autocomplete="given-name" spellcheck="false" style="margin-bottom:12px;">
          <button type="button" class="auth-submit" id="profile-save-btn" style="width:100%;margin-top:0;">Save</button>
        </div>
        <div style="border-top:0.5px solid #D4D8D0;padding:12px 24px 16px;text-align:center;">
          <button type="button" id="profile-signout-btn" style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:#6E7568;background:none;border:none;cursor:pointer;">sign out</button>
        </div>
      </div>`;

    document.getElementById('profile-save-btn')?.addEventListener('click', async () => {
      const firstName = document.getElementById('profile-first-name')?.value.trim() || '';
      const btn = document.getElementById('profile-save-btn');
      const msg = document.getElementById('profile-save-msg');
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const res = await fetch('/profile/update', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ first_name: firstName }),
        });
        const data = await res.json();
        if (data.ok) {
          if (currentUser) currentUser.first_name = data.first_name;
          msg.textContent = 'Saved!';
          msg.style.display = 'block';
          setTimeout(() => { msg.style.display = 'none'; }, 2000);
        }
      } catch(e) {}
      btn.disabled = false; btn.textContent = 'Save';
    });

    document.getElementById('profile-signout-btn')?.addEventListener('click', () => {
      closeModal();
      signOut();
    });
  }

  // Exposed so pages can update the profile state after XP is awarded
  function refreshUserXp(xp, level) {
    if (currentUser) { currentUser.xp = xp; currentUser.level = level; }
  }

  // ---------- Auth handlers ----------
  async function handleSignIn() {
    const username = document.getElementById('si-username')?.value.trim();
    const password = document.getElementById('si-password')?.value;
    clearError();
    if (!username || !password) return showError('Please enter your username and password.');
    setSubmitLoading('si-submit', true);
    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.ok) {
        try {
          const meRes = await fetch('/auth/me', { credentials: 'include' });
          const meData = await meRes.json();
          currentUser = meData.ok ? meData.user : { username: data.username, xp: 0, level: 1, first_name: '' };
        } catch(e) {
          currentUser = { username: data.username, xp: 0, level: 1, first_name: '' };
        }
        setSignedInNav(currentUser.username);
        closeModal();
        if (typeof window.onAuthSignedIn === 'function') window.onAuthSignedIn(currentUser.username);
      } else {
        showError(data.error || 'Sign in failed.');
      }
    } catch (e) {
      showError('Could not reach the server. Please try again.');
    }
    setSubmitLoading('si-submit', false);
  }

  async function handleRegister() {
    const username = document.getElementById('reg-username')?.value.trim();
    const password = document.getElementById('reg-password')?.value;
    clearError();
    if (!username || !password) return showError('Please fill in all fields.');
    if (username.includes(' ')) return showError('Username cannot contain spaces.');
    if (username.length < 5) return showError('Username must be at least 5 characters.');
    if (password.length < 8) return showError('Password must be at least 8 characters.');
    setSubmitLoading('reg-submit', true);
    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.ok) {
        currentUser = { username: data.username, xp: 0, level: 1, first_name: '' };
        setSignedInNav(currentUser.username);
        closeModal();
        if (typeof window.onAuthSignedIn === 'function') window.onAuthSignedIn(currentUser.username);
      } else {
        showError(data.error || 'Registration failed.');
      }
    } catch (e) {
      showError('Could not reach the server. Please try again.');
    }
    setSubmitLoading('reg-submit', false);
  }

  async function signOut() {
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) { /* proceed regardless */ }
    currentUser = null;
    setSignedOutNav();
    if (typeof window.onAuthSignedOut === 'function') window.onAuthSignedOut();
  }

  // ---------- Helpers ----------
  function showError(msg) {
    const el = document.getElementById('auth-error');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }
  function clearError() {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = ''; el.hidden = true; }
  }
  function setSubmitLoading(id, loading) {
    const btn = document.getElementById(id);
    if (btn) { btn.disabled = loading; btn.textContent = loading ? 'Please wait…' : (id === 'si-submit' ? 'Sign in' : 'Create account'); }
  }
  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Expose for pages that need to react to auth state changes
  window.SpecimenAuth = { openModal, closeModal, currentUser: () => currentUser, refreshUserXp };

  document.addEventListener('DOMContentLoaded', init);

})();
