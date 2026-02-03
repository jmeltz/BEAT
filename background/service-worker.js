// BEAT - Service Worker

const SOUNDCLOUD_URL = 'https://soundcloud.com';
// Generate a unique ID
function generateId() {
  return crypto.randomUUID();
}

function buildCookieUrl(cookie) {
  const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
  return `https://${domain}${cookie.path}`;
}

function maybeSetCookieField(target, key, value) {
  if (value !== undefined && value !== null) {
    target[key] = value;
  }
}

function getCookieKey(cookie) {
  const partitionKey = cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : '';
  const storeId = cookie.storeId || '';
  return `${cookie.domain}|${cookie.path}|${cookie.name}|${partitionKey}|${storeId}`;
}

async function waitForTabComplete(tabId, timeoutMs = 10000) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.status === 'complete') {
      return;
    }
  } catch (e) {
    return;
  }

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Timed out waiting for tab to load'));
    }, timeoutMs);

    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Get all SoundCloud cookies from all subdomains
async function getCurrentCookies() {
  // SoundCloud uses multiple subdomains for auth
  const domains = [
    'soundcloud.com',
    '.soundcloud.com',
    'api.soundcloud.com',
    'api-auth.soundcloud.com',
    'api-v2.soundcloud.com',
    'api-mobi.soundcloud.com',
    'secure.soundcloud.com',
    'w.soundcloud.com'
  ];

  const urls = [
    'https://soundcloud.com',
    'https://api.soundcloud.com',
    'https://api-auth.soundcloud.com',
    'https://api-v2.soundcloud.com',
    'https://secure.soundcloud.com'
  ];

  const cookieMap = new Map();

  // Get cookies by domain
  for (const domain of domains) {
    try {
      const cookies = await chrome.cookies.getAll({ domain });
      cookies.forEach(cookie => {
        cookieMap.set(getCookieKey(cookie), cookie);
      });
    } catch (e) {
      // Domain might not have any cookies
    }
  }

  // Also get cookies by URL
  for (const url of urls) {
    try {
      const cookies = await chrome.cookies.getAll({ url });
      cookies.forEach(cookie => {
        cookieMap.set(getCookieKey(cookie), cookie);
      });
    } catch (e) {
      // URL might not have any cookies
    }
  }

  const cookies = Array.from(cookieMap.values());
  console.log(`Found ${cookies.length} SoundCloud cookies from domains:`,
    [...new Set(cookies.map(c => c.domain))]);
  return cookies;
}

// Clear all SoundCloud cookies
async function clearAllCookies() {
  const cookies = await getCurrentCookies();
  console.log(`Clearing ${cookies.length} cookies`);

  for (const cookie of cookies) {
    try {
      const removalDetails = {
        url: buildCookieUrl(cookie),
        name: cookie.name
      };
      maybeSetCookieField(removalDetails, 'partitionKey', cookie.partitionKey);
      maybeSetCookieField(removalDetails, 'storeId', cookie.storeId);
      await chrome.cookies.remove(removalDetails);
    } catch (e) {
      console.warn(`Failed to remove cookie ${cookie.name}:`, e);
    }
  }
}

// Set all cookies from saved data
async function setAllCookies(cookies) {
  for (const cookie of cookies) {
    // Build the URL for the cookie
    const url = buildCookieUrl(cookie);

    const cookieData = {
      url: url,
      name: cookie.name,
      value: cookie.value,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly
    };

    // Only set domain for domain cookies (not host-only cookies)
    // If hostOnly is true, omit domain to make it a host-only cookie
    if (!cookie.hostOnly && cookie.domain) {
      cookieData.domain = cookie.domain;
    }

    // Handle sameSite - Chrome requires specific values
    // "unspecified" from getAll should be omitted
    if (cookie.sameSite && cookie.sameSite !== 'unspecified') {
      // "no_restriction" requires secure to be true
      if (cookie.sameSite === 'no_restriction') {
        cookieData.sameSite = 'no_restriction';
        cookieData.secure = true;
      } else {
        cookieData.sameSite = cookie.sameSite;
      }
    }

    // Only set expirationDate for persistent cookies (not session cookies)
    if (!cookie.session && cookie.expirationDate) {
      cookieData.expirationDate = cookie.expirationDate;
    }

    maybeSetCookieField(cookieData, 'sameParty', cookie.sameParty);
    maybeSetCookieField(cookieData, 'priority', cookie.priority);
    maybeSetCookieField(cookieData, 'partitionKey', cookie.partitionKey);
    maybeSetCookieField(cookieData, 'storeId', cookie.storeId);

    try {
      const result = await chrome.cookies.set(cookieData);
      if (!result) {
        console.warn(`Cookie ${cookie.name} was not set (returned null)`);
      }
    } catch (e) {
      console.error(`Failed to set cookie ${cookie.name}:`, e, cookieData);
    }
  }
}

// Get localStorage and sessionStorage from the active SoundCloud tab
async function getStorageData(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const localStorage = {};
        const sessionStorage = {};

        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          localStorage[key] = window.localStorage.getItem(key);
        }

        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i);
          sessionStorage[key] = window.sessionStorage.getItem(key);
        }

        return { localStorage, sessionStorage };
      }
    });

    return results[0]?.result || { localStorage: {}, sessionStorage: {} };
  } catch (e) {
    console.warn('Failed to get storage data:', e);
    return { localStorage: {}, sessionStorage: {} };
  }
}

// Set localStorage and sessionStorage in the active SoundCloud tab
async function setStorageData(tabId, localStorage, sessionStorage) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (localData, sessionData) => {
        // Clear existing storage
        window.localStorage.clear();
        window.sessionStorage.clear();

        // Restore localStorage
        for (const [key, value] of Object.entries(localData)) {
          window.localStorage.setItem(key, value);
        }

        // Restore sessionStorage
        for (const [key, value] of Object.entries(sessionData)) {
          window.sessionStorage.setItem(key, value);
        }
      },
      args: [localStorage, sessionStorage]
    });
  } catch (e) {
    console.warn('Failed to set storage data:', e);
  }
}

// Clear localStorage and sessionStorage in the active SoundCloud tab
async function clearStorageData(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        window.localStorage.clear();
        window.sessionStorage.clear();
      }
    });
  } catch (e) {
    console.warn('Failed to clear storage data:', e);
  }
}

// Get all saved profiles
async function getProfiles() {
  const data = await chrome.storage.local.get(['profiles', 'lastActiveProfileId']);
  return {
    profiles: data.profiles || [],
    lastActiveProfileId: data.lastActiveProfileId || null
  };
}

// Save profiles to storage
async function saveProfiles(profiles, lastActiveProfileId = null) {
  const data = { profiles };
  if (lastActiveProfileId !== null) {
    data.lastActiveProfileId = lastActiveProfileId;
  }
  await chrome.storage.local.set(data);
}

// Find the SoundCloud tab
async function findSoundCloudTab() {
  const tabs = await chrome.tabs.query({ url: '*://*.soundcloud.com/*' });
  return tabs[0] || null;
}

async function findSoundCloudTabs() {
  return await chrome.tabs.query({ url: '*://*.soundcloud.com/*' });
}

// Save current session as a new profile
async function saveCurrentSession(profileName) {
  const tab = await findSoundCloudTab();
  const cookies = await getCurrentCookies();

  let storageData = { localStorage: {}, sessionStorage: {} };
  if (tab) {
    storageData = await getStorageData(tab.id);
  }

  const profile = {
    id: generateId(),
    name: profileName,
    savedAt: Date.now(),
    cookies,
    localStorage: storageData.localStorage,
    sessionStorage: storageData.sessionStorage
  };

  const { profiles } = await getProfiles();
  profiles.push(profile);
  await saveProfiles(profiles, profile.id);

  return profile;
}

// Restore a saved session
async function restoreSession(profileId) {
  const { profiles } = await getProfiles();
  const profile = profiles.find(p => p.id === profileId);

  if (!profile) {
    throw new Error('Profile not found');
  }

  const profileCookies = profile.cookies || [];
  console.log(`Restoring profile: ${profile.name} with ${profileCookies.length} cookies`);

  // Find SoundCloud tabs
  const tabs = await findSoundCloudTabs();
  const tabIds = tabs.map(tab => tab.id);
  let tab = tabs[0] || null;

  if (!tab) {
    tab = await chrome.tabs.create({ url: SOUNDCLOUD_URL, active: true });
    tabIds.push(tab.id);
  }

  // Clear cookies before restoring the target session.
  await clearAllCookies();

  // Verify cookies were cleared
  const afterClear = await getCurrentCookies();
  console.log(`After clear: ${afterClear.length} cookies remain`);

  // Restore cookies
  await setAllCookies(profileCookies);

  // Verify cookies were set
  const afterSet = await getCurrentCookies();
  console.log(`After restore: ${afterSet.length} cookies set`);

  // Check for oauth_token specifically
  const oauthCookie = afterSet.find(c => c.name === 'oauth_token');
  console.log(`oauth_token cookie:`, oauthCookie ? 'present' : 'MISSING');

  // Restore storage on the active SoundCloud tab
  try {
    await waitForTabComplete(tab.id);
    await setStorageData(
      tab.id,
      profile.localStorage || {},
      profile.sessionStorage || {}
    );
  } catch (e) {
    console.warn('Failed to restore storage data:', e);
  }

  // Reload SoundCloud tabs to pick up restored session data
  for (const tabId of tabIds) {
    try {
      await chrome.tabs.reload(tabId);
    } catch (e) {
      console.warn('Failed to reload SoundCloud tab after restore:', e);
    }
  }

  // Update last active profile
  await chrome.storage.local.set({ lastActiveProfileId: profile.id });

  return profile;
}

// Local sign out (clear cookies/storage without calling /logout)
async function localSignOut() {
  const tabs = await findSoundCloudTabs();
  const tabIds = tabs.map(tab => tab.id);

  if (tabs.length > 0) {
    const storageTab = tabs[0];
    await waitForTabComplete(storageTab.id);
    await clearStorageData(storageTab.id);
  }

  await clearAllCookies();
  await chrome.storage.local.set({ lastActiveProfileId: null });

  for (const tabId of tabIds) {
    try {
      await chrome.tabs.reload(tabId);
    } catch (e) {
      console.warn('Failed to reload SoundCloud tab after sign out:', e);
    }
  }

  return true;
}

// Delete a profile
async function deleteProfile(profileId) {
  const { profiles, lastActiveProfileId } = await getProfiles();
  const newProfiles = profiles.filter(p => p.id !== profileId);

  const newLastActive = lastActiveProfileId === profileId ? null : lastActiveProfileId;
  await saveProfiles(newProfiles, newLastActive);

  return true;
}

// Rename a profile
async function renameProfile(profileId, newName) {
  const { profiles, lastActiveProfileId } = await getProfiles();
  const profile = profiles.find(p => p.id === profileId);

  if (!profile) {
    throw new Error('Profile not found');
  }

  profile.name = newName;
  await saveProfiles(profiles, lastActiveProfileId);

  return profile;
}

// Detect which saved profile matches the current session
async function detectActiveProfile() {
  const cookies = await getCurrentCookies();
  const { profiles } = await getProfiles();

  // Look for the oauth_token cookie as it's unique per user
  const currentAuthCookie = cookies.find(c => c.name === 'oauth_token');

  if (!currentAuthCookie) {
    return null;
  }

  for (const profile of profiles) {
    const profileAuthCookie = profile.cookies.find(c => c.name === 'oauth_token');
    if (profileAuthCookie && profileAuthCookie.value === currentAuthCookie.value) {
      return profile;
    }
  }

  return null;
}

// Export all profiles
async function exportProfiles() {
  const { profiles } = await getProfiles();
  return {
    version: 1,
    exportedAt: Date.now(),
    profiles
  };
}

// Import profiles from exported data
async function importProfiles(data) {
  if (!data || !data.profiles || !Array.isArray(data.profiles)) {
    throw new Error('Invalid import data');
  }

  const { profiles: existingProfiles } = await getProfiles();
  const existingIds = new Set(existingProfiles.map(p => p.id));

  // Add imported profiles, regenerating IDs to avoid conflicts
  const importedProfiles = data.profiles.map(profile => ({
    ...profile,
    id: existingIds.has(profile.id) ? generateId() : profile.id,
    importedAt: Date.now()
  }));

  const newProfiles = [...existingProfiles, ...importedProfiles];
  await saveProfiles(newProfiles);

  return importedProfiles.length;
}

// Message handler for popup communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    getProfiles: async () => {
      const data = await getProfiles();
      const activeProfile = await detectActiveProfile();
      return { ...data, activeProfile };
    },
    saveCurrentSession: async () => {
      return await saveCurrentSession(message.name);
    },
    restoreSession: async () => {
      return await restoreSession(message.profileId);
    },
    localSignOut: async () => {
      return await localSignOut();
    },
    deleteProfile: async () => {
      return await deleteProfile(message.profileId);
    },
    renameProfile: async () => {
      return await renameProfile(message.profileId, message.newName);
    },
    exportProfiles: async () => {
      return await exportProfiles();
    },
    importProfiles: async () => {
      return await importProfiles(message.data);
    }
  };

  const handler = handlers[message.action];
  if (handler) {
    handler()
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
});

// Listen for content script notifications
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'pageLoaded' && sender.tab) {
    console.log('SoundCloud page loaded:', sender.tab.url);
  }
});
