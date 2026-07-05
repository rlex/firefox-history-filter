"use strict";

const HistoryFilterSettings = (() => {
  const DEFAULT_SETTINGS = {
    enabled: true,
    addressBarEnabled: false,
    rulesText: ""
  };

  const STORAGE_PREFERENCE_KEY = "syncSettingsEnabled";
  const RECENT_REMOVALS_ENABLED_KEY = "recentRemovalsEnabled";
  const RECENT_REMOVALS_KEY = "recentRemovals";
  const RECENT_REMOVALS_LIMIT = 50;
  const SYNC_RULES_ITEM_LIMIT_BYTES = 8192;
  const SYNC_RULES_WARNING_BYTES = 7000;
  let recentRemovalsWrite = Promise.resolve();

  function getLocalStorage() {
    return browser.storage.local;
  }

  function getSyncStorage() {
    return browser.storage.sync;
  }

  function getActiveStorage(syncSettingsEnabled) {
    return syncSettingsEnabled ? getSyncStorage() : getLocalStorage();
  }

  function isActiveStorageArea(syncSettingsEnabled, areaName) {
    return (syncSettingsEnabled && areaName === "sync") || (!syncSettingsEnabled && areaName === "local");
  }

  async function loadSyncPreference() {
    const preference = await getLocalStorage().get({ [STORAGE_PREFERENCE_KEY]: false });
    return Boolean(preference[STORAGE_PREFERENCE_KEY]);
  }

  async function loadRecentRemovalsEnabled() {
    const preference = await getLocalStorage().get({ [RECENT_REMOVALS_ENABLED_KEY]: false });
    return Boolean(preference[RECENT_REMOVALS_ENABLED_KEY]);
  }

  async function getRecentRemovals() {
    const stored = await getLocalStorage().get({ [RECENT_REMOVALS_KEY]: [] });
    return Array.isArray(stored[RECENT_REMOVALS_KEY]) ? stored[RECENT_REMOVALS_KEY] : [];
  }

  function normalizeRecentRemoval(entry) {
    return {
      removedAt: entry.removedAt || Date.now(),
      url: entry.url,
      lineNumber: entry.lineNumber,
      rule: entry.rule
    };
  }

  async function appendRecentRemovals(entries) {
    const normalizedEntries = entries.filter(Boolean).map(normalizeRecentRemoval);
    if (normalizedEntries.length === 0) {
      return;
    }

    recentRemovalsWrite = recentRemovalsWrite.catch(() => {}).then(async () => {
      const removals = await getRecentRemovals();
      await getLocalStorage().set({
        [RECENT_REMOVALS_KEY]: [
          ...normalizedEntries,
          ...removals
        ].slice(0, RECENT_REMOVALS_LIMIT)
      });
    });
    await recentRemovalsWrite;
  }

  async function appendRecentRemoval(entry) {
    await appendRecentRemovals([entry]);
  }

  async function clearRecentRemovals() {
    recentRemovalsWrite = recentRemovalsWrite.catch(() => {}).then(() => getLocalStorage().set({ [RECENT_REMOVALS_KEY]: [] }));
    await recentRemovalsWrite;
  }

  function getSyncItemBytes(key, value) {
    return new TextEncoder().encode(key).length + new TextEncoder().encode(JSON.stringify(value)).length;
  }

  return Object.freeze({
    DEFAULT_SETTINGS,
    STORAGE_PREFERENCE_KEY,
    RECENT_REMOVALS_ENABLED_KEY,
    RECENT_REMOVALS_KEY,
    RECENT_REMOVALS_LIMIT,
    SYNC_RULES_ITEM_LIMIT_BYTES,
    SYNC_RULES_WARNING_BYTES,
    getLocalStorage,
    getSyncStorage,
    getActiveStorage,
    isActiveStorageArea,
    loadSyncPreference,
    loadRecentRemovalsEnabled,
    getRecentRemovals,
    appendRecentRemovals,
    appendRecentRemoval,
    clearRecentRemovals,
    getSyncItemBytes
  });
})();
