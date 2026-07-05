"use strict";

let settings = { ...HistoryFilterSettings.DEFAULT_SETTINGS };
let ruleEntries = [];
let syncSettingsEnabled = false;
let recentRemovalsEnabled = false;

function getActiveStorage() {
  return HistoryFilterSettings.getActiveStorage(syncSettingsEnabled);
}

async function loadStoragePreference() {
  syncSettingsEnabled = await HistoryFilterSettings.loadSyncPreference();
}

function loadRules() {
  ruleEntries = HistoryFilterMatcher.parseRuleEntries(settings.rulesText);
}

async function loadRecentRemovalsPreference() {
  recentRemovalsEnabled = await HistoryFilterSettings.loadRecentRemovalsEnabled();
}

async function updateAddressBarIcon(tabId) {
  if (tabId == null || !browser.pageAction) {
    return;
  }

  try {
    if (settings.addressBarEnabled) {
      const state = settings.enabled ? "on" : "off";
      await browser.pageAction.show(tabId);
      await browser.pageAction.setIcon({
        tabId,
        path: {
          19: `icons/page-${state}-19.png`,
          38: `icons/page-${state}-38.png`
        }
      });
      await browser.pageAction.setTitle({
        tabId,
        title: `History Filter: filtering ${settings.enabled ? "on" : "off"}`
      });
    } else {
      await browser.pageAction.hide(tabId);
    }
  } catch (error) {
    console.warn("History Filter could not update address bar icon:", error);
  }
}

async function updateAddressBarIcons() {
  if (!browser.pageAction || !browser.tabs) {
    return;
  }

  try {
    const tabs = await browser.tabs.query({});
    await Promise.all(tabs.map((tab) => updateAddressBarIcon(tab.id)));
  } catch (error) {
    console.warn("History Filter could not update address bar icons:", error);
  }
}

async function loadSettings() {
  await loadStoragePreference();
  await loadRecentRemovalsPreference();
  const storedSettings = await getActiveStorage().get(HistoryFilterSettings.DEFAULT_SETTINGS);
  settings = { ...HistoryFilterSettings.DEFAULT_SETTINGS, ...storedSettings };
  loadRules();
  updateAddressBarIcons();
}

async function toggleFiltering() {
  settings.enabled = !settings.enabled;
  await getActiveStorage().set({ enabled: settings.enabled });
  updateAddressBarIcons();
}

async function deleteFromHistory(url, match) {
  try {
    await browser.history.deleteUrl({ url });
    if (recentRemovalsEnabled && match) {
      await HistoryFilterSettings.appendRecentRemoval({
        url,
        lineNumber: match.lineNumber,
        rule: match.rule
      });
    }
  } catch (error) {
    console.warn("History Filter could not delete URL:", url, error);
  }
}

function getMatchingRule(url) {
  if (!settings.enabled) {
    return null;
  }

  return HistoryFilterMatcher.findMatchingRuleEntry(url, ruleEntries);
}

browser.history.onVisited.addListener((historyItem) => {
  const match = historyItem.url ? getMatchingRule(historyItem.url) : null;
  if (match) {
    deleteFromHistory(historyItem.url, match);
  }
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[HistoryFilterSettings.RECENT_REMOVALS_ENABLED_KEY]) {
    recentRemovalsEnabled = Boolean(changes[HistoryFilterSettings.RECENT_REMOVALS_ENABLED_KEY].newValue);
  }

  if (areaName === "local" && changes[HistoryFilterSettings.STORAGE_PREFERENCE_KEY]) {
    loadSettings().catch((error) => {
      console.error("History Filter could not reload settings:", error);
    });
    return;
  }

  if (!HistoryFilterSettings.isActiveStorageArea(syncSettingsEnabled, areaName)) {
    return;
  }

  if (changes.enabled) {
    settings.enabled = changes.enabled.newValue;
    updateAddressBarIcons();
  }

  if (changes.addressBarEnabled) {
    settings.addressBarEnabled = changes.addressBarEnabled.newValue;
    updateAddressBarIcons();
  }

  if (changes.rulesText) {
    settings.rulesText = changes.rulesText.newValue;
    loadRules();
  }
});

browser.tabs.onCreated.addListener((tab) => {
  updateAddressBarIcon(tab.id);
});

browser.tabs.onUpdated.addListener((tabId) => {
  updateAddressBarIcon(tabId);
});

browser.tabs.onActivated.addListener(({ tabId }) => {
  updateAddressBarIcon(tabId);
});

browser.pageAction.onClicked.addListener(() => {
  toggleFiltering().catch((error) => {
    console.error("History Filter could not toggle filtering:", error);
  });
});

loadSettings().catch((error) => {
  console.error("History Filter could not load settings:", error);
});
