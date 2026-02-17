// BEAT - Content Script

const SWITCHER_ROOT_ID = 'sc-account-switcher-root';

const state = {
  profiles: [],
  activeProfile: null,
  loading: false
};

function sendMessage(action, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...data }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.success) {
        resolve(response.data);
      } else {
        reject(new Error(response?.error || 'Unknown error'));
      }
    });
  });
}

function findHeaderAnchor() {
  const selectors = [
    '.header__right',
    '.header__inner',
    '.header__content',
    'header[role="banner"]',
    'header',
    '.header'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      return el;
    }
  }

  return null;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function getInitials(name) {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function parseRgb(color) {
  if (!color || color === 'transparent') {
    return null;
  }

  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) {
    return null;
  }

  const alpha = match[4] !== undefined ? Number(match[4]) : 1;
  if (alpha === 0) {
    return null;
  }

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3])
  };
}

function getLuminance(color) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getEffectiveBackgroundColor(element) {
  let current = element;
  while (current && current !== document.documentElement) {
    const bg = parseRgb(getComputedStyle(current).backgroundColor);
    if (bg) {
      return bg;
    }
    current = current.parentElement;
  }

  return parseRgb(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255 };
}

function getEffectiveTextColor(element) {
  const color = parseRgb(getComputedStyle(element).color);
  if (color) {
    return color;
  }
  return parseRgb(getComputedStyle(document.body).color) || { r: 17, g: 17, b: 17 };
}

function buildTheme(anchor) {
  const headerBg = getEffectiveBackgroundColor(anchor);
  const headerText = getEffectiveTextColor(anchor);
  const isDark = getLuminance(headerBg) < 0.45;

  const headerTextColor = `rgb(${headerText.r}, ${headerText.g}, ${headerText.b})`;

  if (isDark) {
    return {
      pillBg: 'rgba(255, 255, 255, 0.08)',
      pillBgHover: 'rgba(255, 255, 255, 0.15)',
      pillBorder: 'rgba(255, 255, 255, 0.2)',
      pillText: headerTextColor || '#fff',
      panelBg: '#1b1b1b',
      panelText: '#f7f7f7',
      panelMuted: '#9b9b9b',
      panelBorder: 'rgba(255, 255, 255, 0.12)',
      panelShadow: '0 12px 30px rgba(0, 0, 0, 0.45)',
      surface: '#232323',
      inputBg: '#141414',
      inputBorder: 'rgba(255, 255, 255, 0.12)',
      hoverBg: 'rgba(255, 255, 255, 0.06)',
      hoverSoft: 'rgba(255, 255, 255, 0.1)',
      secondaryBg: '#2a2a2a',
      secondaryText: '#e6e6e6',
      accent: '#f50'
    };
  }

  return {
    pillBg: 'rgba(0, 0, 0, 0.04)',
    pillBgHover: 'rgba(0, 0, 0, 0.08)',
    pillBorder: 'rgba(0, 0, 0, 0.12)',
    pillText: headerTextColor || '#111',
    panelBg: '#ffffff',
    panelText: '#111111',
    panelMuted: '#666666',
    panelBorder: '#eeeeee',
    panelShadow: '0 12px 30px rgba(0, 0, 0, 0.18)',
    surface: '#f6f6f6',
    inputBg: '#ffffff',
    inputBorder: '#dddddd',
    hoverBg: '#fff7f1',
    hoverSoft: 'rgba(0, 0, 0, 0.05)',
    secondaryBg: '#eeeeee',
    secondaryText: '#333333',
    accent: '#f50'
  };
}

function applyTheme(root, theme) {
  const entries = Object.entries({
    '--switcher-pill-bg': theme.pillBg,
    '--switcher-pill-bg-hover': theme.pillBgHover,
    '--switcher-pill-border': theme.pillBorder,
    '--switcher-pill-text': theme.pillText,
    '--switcher-panel-bg': theme.panelBg,
    '--switcher-panel-text': theme.panelText,
    '--switcher-panel-muted': theme.panelMuted,
    '--switcher-panel-border': theme.panelBorder,
    '--switcher-panel-shadow': theme.panelShadow,
    '--switcher-surface': theme.surface,
    '--switcher-input-bg': theme.inputBg,
    '--switcher-input-border': theme.inputBorder,
    '--switcher-hover-bg': theme.hoverBg,
    '--switcher-hover-soft': theme.hoverSoft,
    '--switcher-secondary-bg': theme.secondaryBg,
    '--switcher-secondary-text': theme.secondaryText,
    '--switcher-accent': theme.accent
  });

  for (const [key, value] of entries) {
    root.style.setProperty(key, value);
  }
}

function createSwitcherUI(root) {
  const shadow = root.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host {
        font-family: inherit;
        color: #111;
        display: inline-flex;
        align-items: center;
        height: 100%;
        align-self: center;
        --switcher-pill-bg: rgba(0, 0, 0, 0.04);
        --switcher-pill-bg-hover: rgba(0, 0, 0, 0.08);
        --switcher-pill-border: rgba(0, 0, 0, 0.12);
        --switcher-pill-text: #111111;
        --switcher-panel-bg: #ffffff;
        --switcher-panel-text: #111111;
        --switcher-panel-muted: #666666;
        --switcher-panel-border: #eeeeee;
        --switcher-panel-shadow: 0 12px 30px rgba(0, 0, 0, 0.18);
        --switcher-surface: #f6f6f6;
        --switcher-input-bg: #ffffff;
        --switcher-input-border: #dddddd;
        --switcher-hover-bg: #fff7f1;
        --switcher-hover-soft: rgba(0, 0, 0, 0.05);
        --switcher-secondary-bg: #eeeeee;
        --switcher-secondary-text: #333333;
        --switcher-accent: #f50;
      }

      .switcher {
        position: relative;
        display: inline-flex;
        align-items: center;
        height: 100%;
        margin-left: 8px;
      }

      .switcher__button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--switcher-pill-border);
        background: var(--switcher-pill-bg);
        color: var(--switcher-pill-text);
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.3px;
        cursor: pointer;
        transition: 0.2s ease;
        line-height: 1;
      }

      .switcher__button:hover {
        border-color: var(--switcher-pill-border);
        background: var(--switcher-pill-bg-hover);
      }

      .switcher__dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--switcher-panel-muted);
      }

      .switcher__dot--active {
        background: #2ecc71;
      }

      .switcher__panel {
        position: absolute;
        right: 0;
        top: calc(100% + 10px);
        width: 320px;
        background: var(--switcher-panel-bg);
        color: var(--switcher-panel-text);
        border-radius: 12px;
        border: 1px solid var(--switcher-panel-border);
        box-shadow: var(--switcher-panel-shadow);
        padding: 12px;
        display: none;
        z-index: 99999;
      }

      .switcher__panel.open {
        display: block;
      }

      .panel__header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 12px;
      }

      .panel__title {
        font-size: 13px;
        font-weight: 700;
      }

      .panel__subtitle {
        font-size: 11px;
        color: var(--switcher-panel-muted);
        margin-top: 2px;
      }

      .panel__header-actions {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .panel__kofi {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 8px;
        color: var(--switcher-panel-muted);
        text-decoration: none;
        transition: 0.2s ease;
      }

      .panel__kofi:hover {
        background: var(--switcher-hover-soft);
        color: var(--switcher-panel-text);
      }

      .panel__close {
        background: transparent;
        border: none;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        color: var(--switcher-panel-muted);
      }

      .panel__list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 260px;
        overflow-y: auto;
        padding-right: 2px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
      }

      .panel__empty {
        padding: 16px;
        text-align: center;
        font-size: 12px;
        color: var(--switcher-panel-muted);
        background: var(--switcher-surface);
        border-radius: 8px;
      }

      .profile {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        border-radius: 10px;
        border: 1px solid var(--switcher-panel-border);
        cursor: pointer;
        transition: 0.2s ease;
        position: relative;
        background: var(--switcher-panel-bg);
      }

      .profile:hover {
        border-color: var(--switcher-accent);
        background: var(--switcher-hover-bg);
      }

      .profile.active {
        border-color: var(--switcher-accent);
        background: var(--switcher-hover-bg);
      }

      .profile__avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--switcher-accent);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
        flex-shrink: 0;
      }

      .profile__meta {
        flex: 1;
        min-width: 0;
      }

      .profile__name {
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .profile__detail {
        font-size: 11px;
        color: var(--switcher-panel-muted);
        margin-top: 2px;
      }

      .profile__actions {
        display: flex;
        gap: 4px;
        opacity: 0;
        transition: 0.2s ease;
      }

      .profile:hover .profile__actions {
        opacity: 1;
      }

      .profile__icon {
        border: none;
        background: transparent;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        color: var(--switcher-panel-muted);
        transition: 0.2s ease;
      }

      .profile__icon:hover {
        background: var(--switcher-hover-soft);
        color: var(--switcher-panel-text);
      }

      .panel__form {
        background: var(--switcher-surface);
        border-radius: 10px;
        padding: 10px;
        margin-top: 10px;
        display: none;
        flex-direction: column;
        gap: 8px;
      }

      .panel__form.open {
        display: flex;
      }

      .panel__form input {
        border: 1px solid var(--switcher-input-border);
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        background: var(--switcher-input-bg);
        color: var(--switcher-panel-text);
      }

      .panel__form-actions {
        display: flex;
        gap: 6px;
      }

      .btn {
        border: none;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: 0.2s ease;
      }

      .btn.primary {
        background: var(--switcher-accent);
        color: #fff;
      }

      .btn.primary:hover {
        background: #e64a00;
      }

      .btn.secondary {
        background: var(--switcher-secondary-bg);
        color: var(--switcher-secondary-text);
      }

      .btn.secondary:hover {
        background: #e2e2e2;
      }

      .panel__actions {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }
    </style>
    <div class="switcher">
      <button class="switcher__button" type="button">
        <span class="switcher__label">BEAT</span>
        <span class="switcher__dot"></span>
      </button>
      <div class="switcher__panel">
        <div class="panel__header">
          <div>
            <div class="panel__title">BEAT</div>
            <div class="panel__subtitle">No active profile detected</div>
          </div>
          <div class="panel__header-actions">
            <a class="panel__kofi" href="https://ko-fi.com/jmeltz" target="_blank" rel="noopener noreferrer" aria-label="Support on Ko-fi" title="Support on Ko-fi">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M18 8h1a3 3 0 0 1 0 6h-1v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5h14v3zm-2 0V7H6v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h2a1 1 0 0 0 0-2h-2z"/>
              </svg>
            </a>
            <button class="panel__close" type="button" aria-label="Close">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M18.3 5.71L12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.3 19.7 2.88 18.3 9.17 12 2.88 5.7 4.3 4.29l6.29 6.3 6.29-6.3z"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="panel__list"></div>
        <div class="panel__form">
          <div class="panel__form-title"></div>
          <input type="text" maxlength="50" placeholder="Profile name">
          <div class="panel__form-actions">
            <button class="btn secondary" type="button" data-form-cancel>Cancel</button>
            <button class="btn primary" type="button" data-form-save>Save</button>
          </div>
        </div>
        <div class="panel__actions">
          <button class="btn primary" type="button" data-action="save">Save Current Session</button>
          <button class="btn secondary" type="button" data-action="signout">Local Sign Out</button>
        </div>
      </div>
    </div>
  `;

  const button = shadow.querySelector('.switcher__button');
  const dot = shadow.querySelector('.switcher__dot');
  const panel = shadow.querySelector('.switcher__panel');
  const closeBtn = shadow.querySelector('.panel__close');
  const list = shadow.querySelector('.panel__list');
  const subtitle = shadow.querySelector('.panel__subtitle');
  const form = shadow.querySelector('.panel__form');
  const formTitle = shadow.querySelector('.panel__form-title');
  const formInput = shadow.querySelector('.panel__form input');
  const formCancel = shadow.querySelector('[data-form-cancel]');
  const formSave = shadow.querySelector('[data-form-save]');
  const saveAction = shadow.querySelector('[data-action="save"]');
  const signOutAction = shadow.querySelector('[data-action="signout"]');

  return {
    button,
    dot,
    panel,
    closeBtn,
    list,
    subtitle,
    form,
    formTitle,
    formInput,
    formCancel,
    formSave,
    saveAction,
    signOutAction
  };
}

function createProfileItem(profile, isActive, onSwitch, onRename, onDelete) {
  const item = document.createElement('div');
  item.className = `profile${isActive ? ' active' : ''}`;
  item.innerHTML = `
    <div class="profile__avatar">${getInitials(profile.name)}</div>
    <div class="profile__meta">
      <div class="profile__name"></div>
      <div class="profile__detail"></div>
    </div>
    <div class="profile__actions">
      <button class="profile__icon" type="button" data-action="rename" title="Rename">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
      </button>
      <button class="profile__icon" type="button" data-action="delete" title="Delete">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      </button>
    </div>
  `;

  item.querySelector('.profile__name').textContent = profile.name;
  item.querySelector('.profile__detail').textContent = isActive
    ? `Active - Saved ${formatDate(profile.savedAt)}`
    : `Saved ${formatDate(profile.savedAt)}`;

  item.addEventListener('click', event => {
    if (event.target.closest('[data-action]')) {
      return;
    }
    onSwitch(profile.id);
  });

  item.querySelector('[data-action="rename"]').addEventListener('click', event => {
    event.stopPropagation();
    onRename(profile);
  });

  item.querySelector('[data-action="delete"]').addEventListener('click', event => {
    event.stopPropagation();
    onDelete(profile);
  });

  return item;
}

async function mountSwitcher() {
  if (document.getElementById(SWITCHER_ROOT_ID)) {
    return true;
  }

  const anchor = findHeaderAnchor();
  if (!anchor) {
    return false;
  }

  const root = document.createElement('div');
  root.id = SWITCHER_ROOT_ID;
  anchor.appendChild(root);

  const ui = createSwitcherUI(root);
  const syncTheme = () => applyTheme(root, buildTheme(anchor));
  syncTheme();

  let formMode = null;
  let formProfileId = null;

  function openForm(mode, title, defaultValue, profileId = null) {
    formMode = mode;
    formProfileId = profileId;
    ui.formTitle.textContent = title;
    ui.formInput.value = defaultValue || '';
    ui.form.classList.add('open');
    ui.formInput.focus();
  }

  function closeForm() {
    formMode = null;
    formProfileId = null;
    ui.form.classList.remove('open');
  }

  async function loadProfiles() {
    try {
      const data = await sendMessage('getProfiles');
      state.profiles = data.profiles || [];
      state.activeProfile = data.activeProfile || null;
      renderProfiles();
    } catch (error) {
      console.warn('Failed to load profiles:', error);
    }
  }

  function renderProfiles() {
    ui.list.innerHTML = '';

    if (state.profiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'panel__empty';
      empty.textContent = 'No profiles saved yet.';
      ui.list.appendChild(empty);
    } else {
      state.profiles.forEach(profile => {
        const item = createProfileItem(
          profile,
          state.activeProfile?.id === profile.id,
          switchToProfile,
          renameProfile,
          deleteProfile
        );
        ui.list.appendChild(item);
      });
    }

    if (state.activeProfile) {
      ui.subtitle.textContent = `Logged in as ${state.activeProfile.name}`;
      ui.dot.classList.add('switcher__dot--active');
    } else {
      ui.subtitle.textContent = 'No active profile detected';
      ui.dot.classList.remove('switcher__dot--active');
    }
  }

  async function switchToProfile(profileId) {
    if (state.activeProfile?.id === profileId || state.loading) {
      return;
    }

    state.loading = true;
    try {
      await sendMessage('restoreSession', { profileId });
    } catch (error) {
      console.warn('Failed to switch profile:', error);
    } finally {
      state.loading = false;
    }
  }

  async function renameProfile(profile) {
    openForm('rename', 'Rename profile', profile.name, profile.id);
  }

  async function deleteProfile(profile) {
    const proceed = window.confirm(`Delete "${profile.name}"?`);
    if (!proceed) {
      return;
    }

    try {
      await sendMessage('deleteProfile', { profileId: profile.id });
      await loadProfiles();
    } catch (error) {
      console.warn('Failed to delete profile:', error);
    }
  }

  async function saveProfile(name) {
    try {
      await sendMessage('saveCurrentSession', { name });
      await loadProfiles();
    } catch (error) {
      console.warn('Failed to save profile:', error);
    }
  }

  async function localSignOut() {
    const proceed = window.confirm('Clear SoundCloud cookies and storage locally?');
    if (!proceed) {
      return;
    }

    try {
      await sendMessage('localSignOut');
      await loadProfiles();
    } catch (error) {
      console.warn('Failed to sign out locally:', error);
    }
  }

  ui.button.addEventListener('click', event => {
    event.stopPropagation();
    ui.panel.classList.toggle('open');
  });

  ui.closeBtn.addEventListener('click', () => {
    ui.panel.classList.remove('open');
  });

  ui.saveAction.addEventListener('click', () => {
    openForm('save', 'Save current session', '');
  });

  ui.signOutAction.addEventListener('click', localSignOut);

  ui.formCancel.addEventListener('click', closeForm);
  ui.formSave.addEventListener('click', async () => {
    const name = ui.formInput.value.trim();
    if (!name) {
      return;
    }

    if (formMode === 'save') {
      await saveProfile(name);
    } else if (formMode === 'rename' && formProfileId) {
      await sendMessage('renameProfile', { profileId: formProfileId, newName: name });
      await loadProfiles();
    }

    closeForm();
  });

  const stopShortcutPropagation = event => {
    event.stopPropagation();
  };

  ['keydown', 'keyup', 'keypress'].forEach(eventName => {
    ui.formInput.addEventListener(eventName, stopShortcutPropagation);
  });

  document.addEventListener('click', event => {
    if (!event.composedPath().includes(root)) {
      ui.panel.classList.remove('open');
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      ui.panel.classList.remove('open');
      closeForm();
    }
  });

  const themeObserver = new MutationObserver(() => syncTheme());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

  await loadProfiles();
  return true;
}

function observeForMount() {
  let attempts = 0;

  const tryMount = async () => {
    const mounted = await mountSwitcher();
    if (!mounted && attempts < 20) {
      attempts += 1;
      setTimeout(tryMount, 500);
    }
  };

  tryMount();

  const observer = new MutationObserver(() => {
    if (!document.getElementById(SWITCHER_ROOT_ID)) {
      mountSwitcher();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

// Notify the background script that a SoundCloud page has loaded
chrome.runtime.sendMessage({ action: 'pageLoaded' });
observeForMount();
