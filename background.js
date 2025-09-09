// NG Word Search Blocker - background.js

// --- Constants ---
const DNR_RULE_ID = 1;
const SEARCH_DOMAINS = [
  "google.com",
  "www.google.com",
  "google.co.jp",
  "www.google.co.jp",
  "google.co.uk",
  "www.google.co.uk",
  "google.de",
  "www.google.de",
  "google.fr",
  "www.google.fr",
  "bing.com",
  "www.bing.com",
  "duckduckgo.com",
  "search.yahoo.co.jp"
];
const QUERY_PARAMS = ["q", "p"]; // google, bing, ddg use 'q', yahoo.jp uses 'p'

// --- State Management ---

const defaultState = {
  ngWords: [],
  settings: {
    useRegex: false,
    useWordBoundaryEN: false,
    showBadge: true,
  },
  tempBypassUntil: null,
  blockedCount: 0,
};

async function getState() {
  const state = await chrome.storage.local.get(defaultState);
  // Ensure settings object has all keys, even if saved partially
  state.settings = { ...defaultState.settings, ...(state.settings || {}) };
  return state;
}

async function setState(newState) {
  const currentState = await getState();
  const mergedState = { ...currentState, ...newState };
  // Ensure settings are merged, not overwritten
  if (newState.settings) {
    mergedState.settings = { ...currentState.settings, ...newState.settings };
  }
  await chrome.storage.local.set(mergedState);
  return mergedState;
}

// --- DNR Rule Management ---

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function buildAndApplyDnrRules() {
  // DNR rules are disabled - using content script approach instead
  console.log("Using content script approach for blocking. Removing any existing DNR rules.");
  
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [DNR_RULE_ID]
    });
  } catch (error) {
    console.log("No existing DNR rules to remove.");
  }
  
  updateBadge();
}


// --- Badge Management ---

async function updateBadge() {
    const { settings, tempBypassUntil } = await getState();
    const isBypassed = tempBypassUntil && Date.now() < tempBypassUntil;

    if (settings.showBadge && !isBypassed) {
        chrome.action.setBadgeText({ text: '●' });
        chrome.action.setBadgeBackgroundColor({ color: '#d93025' }); // Red color
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}

function blockAndRedirect(tabId, query, matchedWord, engine) {
  const params = new URLSearchParams();
  params.set('query', encodeURIComponent(query));
  params.set('ngword', encodeURIComponent(matchedWord));
  params.set('engine', encodeURIComponent(engine));

  const blockUrl = chrome.runtime.getURL(`pages/block.html?${params.toString()}`);
  
  chrome.tabs.update(tabId, { url: blockUrl });
}


// --- Temporary Bypass ---

function checkBypassStatus() {
    getState().then(({ tempBypassUntil }) => {
        if (tempBypassUntil && Date.now() >= tempBypassUntil) {
            console.log("Temporary bypass expired. Re-enabling blocker.");
            setState({ tempBypassUntil: null });
            // State change will trigger rule rebuild via storage.onChanged listener
        }
    });
}

// --- Event Listeners ---

// On Install/Update: Initialize state and rules
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await setState(defaultState);
    console.log("Extension installed. Default state set.");
  }
  buildAndApplyDnrRules();
  updateBadge();
  // Set up a periodic alarm to check bypass status
  chrome.alarms.create('bypassCheck', { periodInMinutes: 1 });
});

// On Startup: Re-apply rules
chrome.runtime.onStartup.addListener(() => {
  console.log("Browser startup. Rebuilding DNR rules.");
  checkBypassStatus();
  buildAndApplyDnrRules();
  updateBadge();
});

// On Message: Handle communication from other extension parts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let isAsync = true;
  switch (message.type) {
    case 'GET_STATE':
      getState().then(sendResponse);
      break;
    case 'SET_STATE':
      setState(message.payload).then((newState) => {
        // If bypass is set, create a specific alarm for its expiry
        if (newState.tempBypassUntil) {
            chrome.alarms.create('bypassExpiry', { when: newState.tempBypassUntil });
        }
        sendResponse({ status: 'ok' });
      });
      break;
    case 'REBUILD_DNR':
      buildAndApplyDnrRules().then(() => sendResponse({ status: 'ok' }));
      break;
    case 'INCREMENT_BLOCKED':
      chrome.storage.local.get({ blockedCount: 0 }).then(({ blockedCount }) => {
        chrome.storage.local.set({ blockedCount: blockedCount + 1 })
          .then(() => sendResponse({ status: 'ok' }));
      });
      break;
    case 'BLOCK_AND_REDIRECT':
      const { query, matchedWord, engine } = message.payload;
      if (sender.tab && sender.tab.id) {
        blockAndRedirect(sender.tab.id, query, matchedWord, engine);
      }
      sendResponse({ status: 'ok' });
      break;
    default:
      isAsync = false;
      console.warn("Unknown message type received:", message.type);
      break;
  }
  return isAsync;
});

// On Storage Change: React to state changes from options page etc.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
        console.log("Storage changed, reacting to changes.");
        const needsRuleRebuild = changes.ngWords || changes.settings || changes.tempBypassUntil;
        const needsBadgeUpdate = changes.settings || changes.tempBypassUntil;

        if (needsRuleRebuild) {
            console.log("Rebuilding DNR rules due to storage change.");
            buildAndApplyDnrRules();
        } else if (needsBadgeUpdate) {
            console.log("Updating badge due to storage change.");
            updateBadge();
        }
    }
});

// On Alarm: Check for bypass expiration
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'bypassCheck' || alarm.name === 'bypassExpiry') {
        checkBypassStatus();
    }
});

console.log("NG Word Blocker service worker loaded.");