// BEAT - Popup Script

// State
let profiles = [];
let activeProfile = null;
let selectedProfileId = null;

// DOM Elements
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');
const profileList = document.getElementById('profileList');
const profileCount = document.getElementById('profileCount');
const saveBtn = document.getElementById('saveBtn');
const localSignOutBtn = document.getElementById('localSignOutBtn');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const toast = document.getElementById('toast');

// Modals
const saveModal = document.getElementById('saveModal');
const renameModal = document.getElementById('renameModal');
const deleteModal = document.getElementById('deleteModal');
const importModal = document.getElementById('importModal');

// Modal Inputs
const profileNameInput = document.getElementById('profileNameInput');
const renameInput = document.getElementById('renameInput');
const importFileInput = document.getElementById('importFileInput');

// Send message to background script
async function sendMessage(action, data = {}) {
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

// Show toast notification
function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Format date
function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Get initials from name
function getInitials(name) {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Render profile list
function renderProfiles() {
  profileCount.textContent = profiles.length;

  if (profiles.length === 0) {
    profileList.innerHTML = `
      <div class="empty-state">
        <p>No profiles saved yet</p>
        <p class="hint">Save your current session to get started</p>
      </div>
    `;
    return;
  }

  profileList.innerHTML = profiles.map(profile => {
    const isActive = activeProfile?.id === profile.id;
    return `
      <div class="profile-item ${isActive ? 'active' : ''}" data-id="${profile.id}">
        <div class="profile-avatar">${getInitials(profile.name)}</div>
        <div class="profile-info">
          <div class="profile-name">${escapeHtml(profile.name)}</div>
          <div class="profile-date">
            ${isActive ? '<span class="active-indicator">Active</span> · ' : ''}
            Saved ${formatDate(profile.savedAt)}
          </div>
        </div>
        <div class="profile-actions">
          <button class="profile-action-btn rename" data-id="${profile.id}" title="Rename">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </button>
          <button class="profile-action-btn delete" data-id="${profile.id}" title="Delete">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers for switching
  document.querySelectorAll('.profile-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Don't switch if clicking action buttons
      if (e.target.closest('.profile-action-btn')) return;
      switchToProfile(item.dataset.id);
    });
  });

  // Add click handlers for rename buttons
  document.querySelectorAll('.profile-action-btn.rename').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRenameModal(btn.dataset.id);
    });
  });

  // Add click handlers for delete buttons
  document.querySelectorAll('.profile-action-btn.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteModal(btn.dataset.id);
    });
  });
}

// Update status bar
function updateStatus() {
  if (activeProfile) {
    statusBar.className = 'status-bar logged-in';
    statusText.textContent = `Logged in as: ${activeProfile.name}`;
  } else {
    statusBar.className = 'status-bar logged-out';
    statusText.textContent = 'No active profile detected';
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load profiles from background
async function loadProfiles() {
  try {
    const data = await sendMessage('getProfiles');
    profiles = data.profiles || [];
    activeProfile = data.activeProfile || null;
    renderProfiles();
    updateStatus();
  } catch (error) {
    showToast('Failed to load profiles', 'error');
    console.error(error);
  }
}

// Switch to a profile
async function switchToProfile(profileId) {
  if (activeProfile?.id === profileId) {
    showToast('Already using this profile', 'info');
    return;
  }

  try {
    profileList.classList.add('loading');
    await sendMessage('restoreSession', { profileId });
    showToast('Switched profile successfully', 'success');
    // The page will refresh, so we don't need to reload profiles
  } catch (error) {
    showToast('Failed to switch profile', 'error');
    console.error(error);
    profileList.classList.remove('loading');
  }
}

// Local sign out (clear cookies/storage without calling /logout)
async function localSignOut() {
  const proceed = window.confirm(
    'Clear SoundCloud cookies and storage without contacting SoundCloud?'
  );
  if (!proceed) {
    return;
  }

  try {
    localSignOutBtn.disabled = true;
    await sendMessage('localSignOut');
    showToast('Signed out locally', 'success');
    await loadProfiles();
  } catch (error) {
    showToast('Failed to sign out locally', 'error');
    console.error(error);
  } finally {
    localSignOutBtn.disabled = false;
  }
}

// Modal functions
function openModal(modal) {
  modal.classList.add('show');
}

function closeModal(modal) {
  modal.classList.remove('show');
}

function openSaveModal() {
  profileNameInput.value = '';
  openModal(saveModal);
  profileNameInput.focus();
}

function openRenameModal(profileId) {
  selectedProfileId = profileId;
  const profile = profiles.find(p => p.id === profileId);
  renameInput.value = profile?.name || '';
  openModal(renameModal);
  renameInput.focus();
}

function openDeleteModal(profileId) {
  selectedProfileId = profileId;
  const profile = profiles.find(p => p.id === profileId);
  document.getElementById('deleteMessage').textContent =
    `Are you sure you want to delete "${profile?.name}"?`;
  openModal(deleteModal);
}

function openImportModal() {
  importFileInput.value = '';
  openModal(importModal);
}

// Save current session
async function saveCurrentSession() {
  const name = profileNameInput.value.trim();
  if (!name) {
    showToast('Please enter a profile name', 'error');
    return;
  }

  try {
    closeModal(saveModal);
    await sendMessage('saveCurrentSession', { name });
    showToast('Profile saved successfully', 'success');
    await loadProfiles();
  } catch (error) {
    showToast('Failed to save profile', 'error');
    console.error(error);
  }
}

// Rename profile
async function renameProfile() {
  const newName = renameInput.value.trim();
  if (!newName) {
    showToast('Please enter a name', 'error');
    return;
  }

  try {
    closeModal(renameModal);
    await sendMessage('renameProfile', { profileId: selectedProfileId, newName });
    showToast('Profile renamed', 'success');
    await loadProfiles();
  } catch (error) {
    showToast('Failed to rename profile', 'error');
    console.error(error);
  }
}

// Delete profile
async function deleteProfile() {
  try {
    closeModal(deleteModal);
    await sendMessage('deleteProfile', { profileId: selectedProfileId });
    showToast('Profile deleted', 'success');
    await loadProfiles();
  } catch (error) {
    showToast('Failed to delete profile', 'error');
    console.error(error);
  }
}

// Export profiles
async function exportProfiles() {
  try {
    const data = await sendMessage('exportProfiles');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `soundcloud-profiles-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Profiles exported', 'success');
  } catch (error) {
    showToast('Failed to export profiles', 'error');
    console.error(error);
  }
}

// Import profiles
async function importProfiles() {
  const file = importFileInput.files[0];
  if (!file) {
    showToast('Please select a file', 'error');
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    closeModal(importModal);
    const count = await sendMessage('importProfiles', { data });
    showToast(`Imported ${count} profile(s)`, 'success');
    await loadProfiles();
  } catch (error) {
    showToast('Failed to import profiles', 'error');
    console.error(error);
  }
}

// Event Listeners
saveBtn.addEventListener('click', openSaveModal);
localSignOutBtn.addEventListener('click', localSignOut);
exportBtn.addEventListener('click', exportProfiles);
importBtn.addEventListener('click', openImportModal);

// Save modal
document.getElementById('saveCancelBtn').addEventListener('click', () => closeModal(saveModal));
document.getElementById('saveConfirmBtn').addEventListener('click', saveCurrentSession);
profileNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') saveCurrentSession();
});

// Rename modal
document.getElementById('renameCancelBtn').addEventListener('click', () => closeModal(renameModal));
document.getElementById('renameConfirmBtn').addEventListener('click', renameProfile);
renameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') renameProfile();
});

// Delete modal
document.getElementById('deleteCancelBtn').addEventListener('click', () => closeModal(deleteModal));
document.getElementById('deleteConfirmBtn').addEventListener('click', deleteProfile);

// Import modal
document.getElementById('importCancelBtn').addEventListener('click', () => closeModal(importModal));
document.getElementById('importConfirmBtn').addEventListener('click', importProfiles);

// Close modals on backdrop click
[saveModal, renameModal, deleteModal, importModal].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
});

// Close modals on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    [saveModal, renameModal, deleteModal, importModal].forEach(closeModal);
  }
});

// Initialize
loadProfiles();
