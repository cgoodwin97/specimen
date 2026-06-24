// auth.js — loaded by every page
// Handles: session check, sign in modal, register modal, nav state, sign out

(function () {

  // ---------- State ----------
  let currentUser = null;

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
        <button type="button" class="user-dropdown-item" id="sign-out-btn">sign out</button>
      </div>`;
    document.getElementById('user-menu-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('user-dropdown').hidden = !document.getElementById('user-dropdown').hidden;
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
        <div class="modal-card-wrap" style="max-width:380px;background:transparent;border:none;padding:0;position:relative;">
          <button type="button" class="modal-close-btn" id="auth-modal-close" aria-label="Close" style="position:absolute;top:10px;right:10px;z-index:10;">&times;</button>
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

    const seal = `
      <div style="width:40px;height:40px;border-radius:50%;background:#1F6F5C;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
        <span style="font-family:'Fraunces',Georgia,serif;font-style:italic;font-size:20px;font-weight:500;color:#EAEEE6;line-height:1;margin-top:1px;">S</span>
      </div>`;

    const sharedStyles = `
      background:#FAFBF7;
      border-radius:16px;
      padding:28px 26px 22px;
    `;

    if (view === 'signin') {
      content.innerHTML = `
        <div style="${sharedStyles}">
          ${seal}
          <h2 style="font-family:'Fraunces',Georgia,serif;font-style:italic;font-size:21px;font-weight:500;color:#1E2A22;text-align:center;margin:0 0 4px;">Sign in</h2>
          <p style="font-size:12px;font-family:'IBM Plex Mono',monospace;color:#6E7568;text-align:center;margin:0 0 22px;">access your saved cards across any device</p>
          <div id="auth-error" class="auth-error" hidden></div>
          <div class="auth-field">
            <label class="field-label" for="si-username">username</label>
            <input type="text" id="si-username" class="auth-input" autocomplete="username" autocapitalize="none" spellcheck="false">
          </div>
          <div class="auth-field">
            <label class="field-label" for="si-password">password</label>
            <input type="password" id="si-password" class="auth-input" autocomplete="current-password">
          </div>
          <button type="button" class="auth-submit" id="si-submit" style="width:100%;margin-top:4px;">Sign in</button>
          <p style="font-size:12px;font-family:'IBM Plex Mono',monospace;color:#6E7568;text-align:center;margin:14px 0 0;">No account? <button type="button" class="link-btn" id="go-register">Create one</button></p>
        </div>`;
      document.getElementById('go-register')?.addEventListener('click', () => renderView('register'));
      document.getElementById('si-submit')?.addEventListener('click', handleSignIn);
      document.getElementById('si-password')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSignIn();
      });
    } else {
      content.innerHTML = `
        <div style="${sharedStyles}">
          ${seal}
          <h2 style="font-family:'Fraunces',Georgia,serif;font-style:italic;font-size:21px;font-weight:500;color:#1E2A22;text-align:center;margin:0 0 4px;">Create account</h2>
          <p style="font-size:12px;font-family:'IBM Plex Mono',monospace;color:#6E7568;text-align:center;margin:0 0 22px;">avoid personal info in your username or password</p>
          <div id="auth-error" class="auth-error" hidden></div>
          <div class="auth-field">
            <label class="field-label" for="reg-username">username <span class="auth-hint">5+ characters, no spaces</span></label>
            <input type="text" id="reg-username" class="auth-input" autocomplete="username" autocapitalize="none" spellcheck="false">
          </div>
          <div class="auth-field">
            <label class="field-label" for="reg-password">password <span class="auth-hint">8+ characters</span></label>
            <input type="password" id="reg-password" class="auth-input" autocomplete="new-password">
          </div>
          <button type="button" class="auth-submit" id="reg-submit" style="width:100%;margin-top:4px;">Create account</button>
          <p style="font-size:12px;font-family:'IBM Plex Mono',monospace;color:#6E7568;text-align:center;margin:14px 0 0;">Already have an account? <button type="button" class="link-btn" id="go-signin">Sign in</button></p>
        </div>`;
      document.getElementById('go-signin')?.addEventListener('click', () => renderView('signin'));
      document.getElementById('reg-submit')?.addEventListener('click', handleRegister);
      document.getElementById('reg-password')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleRegister();
      });
    }
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
        currentUser = { username: data.username };
        setSignedInNav(data.username);
        closeModal();
        if (typeof window.onAuthSignedIn === 'function') window.onAuthSignedIn(data.username);
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
        currentUser = { username: data.username };
        setSignedInNav(data.username);
        closeModal();
        if (typeof window.onAuthSignedIn === 'function') window.onAuthSignedIn(data.username);
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
  window.SpecimenAuth = { openModal, closeModal, currentUser: () => currentUser };

  document.addEventListener('DOMContentLoaded', init);

})();
