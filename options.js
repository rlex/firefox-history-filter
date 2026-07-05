"use strict";

const enabledInput = document.querySelector("#enabled");
const enabledLabel = document.querySelector("#enabled-label");
const syncSettingsInput = document.querySelector("#sync-settings");
const syncSettingsLabel = document.querySelector("#sync-settings-label");
const addressBarInput = document.querySelector("#address-bar");
const addressBarLabel = document.querySelector("#address-bar-label");
const recentRemovalsInput = document.querySelector("#recent-removals-enabled");
const recentRemovalsLabel = document.querySelector("#recent-removals-enabled-label");
const currentSiteSection = document.querySelector("#current-site");
const currentSiteHostOutput = document.querySelector("#current-site-host");
const filterDomainButton = document.querySelector("#filter-domain");
const filterSubdomainsButton = document.querySelector("#filter-subdomains");
const filterPageButton = document.querySelector("#filter-page");
const rulesInput = document.querySelector("#rules");
const rulesLineNumbers = document.querySelector("#rules-line-numbers");
const rulesConflictPanel = document.querySelector("#rules-conflict");
const reloadRulesButton = document.querySelector("#reload-rules");
const keepRulesButton = document.querySelector("#keep-rules");
const rulesValidationOutput = document.querySelector("#rules-validation");
const rulesSizeOutput = document.querySelector("#rules-size");
const rulesCheckPanel = document.querySelector("#rules-check");
const rulesCheckTitle = document.querySelector("#rules-check-title");
const rulesCheckList = document.querySelector("#rules-check-list");
const testUrlInput = document.querySelector("#test-url");
const testUrlButton = document.querySelector("#test-url-button");
const testUrlResult = document.querySelector("#test-url-result");
const saveButton = document.querySelector("#save");
const checkRulesButton = document.querySelector("#check-rules");
const cleanButton = document.querySelector("#clean");
const statusOutput = document.querySelector("#status");
const cleanPreviewPanel = document.querySelector("#clean-preview");
const cleanPreviewTitle = document.querySelector("#clean-preview-title");
const cleanPreviewList = document.querySelector("#clean-preview-list");
const confirmCleanButton = document.querySelector("#confirm-clean");
const dismissCleanPreviewButton = document.querySelector("#dismiss-clean-preview");
const recentRemovalsPanel = document.querySelector("#recent-removals");
const recentRemovalsSummary = document.querySelector("#recent-removals-summary");
const recentRemovalsList = document.querySelector("#recent-removals-list");
const clearRecentRemovalsButton = document.querySelector("#clear-recent-removals");

let statusTimer;
let cleaning = false;
let previewingClean = false;
let cleanPreview = null;
let syncSettingsEnabled = false;
let recentRemovalsEnabled = false;
let rulesDirty = false;
let rulesTooLarge = false;
let rulesInvalid = false;
let externalRulesText = null;
let activePage = null;

function getActiveStorage() {
  return HistoryFilterSettings.getActiveStorage(syncSettingsEnabled);
}

function isActiveStorageArea(areaName) {
  return HistoryFilterSettings.isActiveStorageArea(syncSettingsEnabled, areaName);
}

function getCurrentSettings() {
  return {
    enabled: enabledInput.checked,
    addressBarEnabled: addressBarInput.checked,
    rulesText: rulesInput.value
  };
}

function hasRule(rule) {
  return HistoryFilterMatcher.parseRules(rulesInput.value).some((existingRule) => existingRule.toLowerCase() === rule.toLowerCase());
}

function appendRule(rule) {
  const trimmedValue = rulesInput.value.trimEnd();
  rulesInput.value = `${trimmedValue}${trimmedValue ? "\n" : ""}${rule}\n`;
  rulesDirty = true;
  updateRulesLineNumbers();
  clearRulesCheck();
  clearCleanPreview();
  hideRulesConflict();
  updateRulesFeedback();
}

function updateRulesLineNumbers() {
  const lineCount = rulesInput.value.split("\n").length;
  rulesLineNumbers.textContent = Array.from({ length: lineCount }, (_value, index) => String(index + 1)).join("\n");
}

function syncRulesLineNumbersScroll() {
  rulesLineNumbers.scrollTop = rulesInput.scrollTop;
}

function pagePrefixFromUrl(url) {
  const parsedUrl = new URL(url);
  parsedUrl.search = "";
  parsedUrl.hash = "";
  return parsedUrl.href;
}

async function loadActivePage() {
  if (!browser.tabs) {
    return;
  }

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url) {
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(tab.url);
  } catch (_error) {
    return;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return;
  }

  activePage = {
    host: parsedUrl.hostname,
    pagePrefix: pagePrefixFromUrl(tab.url)
  };
  currentSiteHostOutput.textContent = activePage.host;
  currentSiteSection.hidden = false;
}

async function loadStoragePreference() {
  syncSettingsEnabled = await HistoryFilterSettings.loadSyncPreference();
  syncSettingsInput.checked = syncSettingsEnabled;
  syncSwitchLabel(syncSettingsInput, syncSettingsLabel);
}

async function loadRecentRemovalsPreference() {
  recentRemovalsEnabled = await HistoryFilterSettings.loadRecentRemovalsEnabled();
  recentRemovalsInput.checked = recentRemovalsEnabled;
  syncSwitchLabel(recentRemovalsInput, recentRemovalsLabel);
}

function setStatus(message) {
  window.clearTimeout(statusTimer);
  statusOutput.textContent = message;
  statusTimer = window.setTimeout(() => {
    statusOutput.textContent = "";
  }, 3000);
}

function syncSwitchLabel(input, label) {
  label.textContent = input.checked ? "On" : "Off";
}

function showRulesConflict(nextRulesText) {
  externalRulesText = nextRulesText;
  rulesConflictPanel.hidden = false;
}

function hideRulesConflict() {
  externalRulesText = null;
  rulesConflictPanel.hidden = true;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatRemovedAt(timestamp) {
  if (!timestamp) {
    return "Unknown time";
  }

  return new Date(timestamp).toLocaleString();
}

function updateRulesControls() {
  const controlsBusy = cleaning || previewingClean;
  saveButton.disabled = rulesTooLarge || rulesInvalid;
  checkRulesButton.disabled = rulesTooLarge;
  cleanButton.disabled = rulesTooLarge || rulesInvalid || controlsBusy;
  confirmCleanButton.disabled = rulesTooLarge || rulesInvalid || controlsBusy || !cleanPreview || cleanPreview.matches.length === 0;
}

function updateRulesSizeWarning() {
  if (!syncSettingsEnabled) {
    rulesTooLarge = false;
    rulesSizeOutput.classList.remove("warning", "error");
    rulesSizeOutput.textContent = "";
    updateRulesControls();
    return { bytes: 0, overLimit: false };
  }

  const bytes = HistoryFilterSettings.getSyncItemBytes("rulesText", rulesInput.value);
  const overLimit = bytes > HistoryFilterSettings.SYNC_RULES_ITEM_LIMIT_BYTES;
  const nearLimit = bytes >= HistoryFilterSettings.SYNC_RULES_WARNING_BYTES;
  rulesTooLarge = overLimit;

  rulesSizeOutput.classList.toggle("warning", nearLimit && !overLimit);
  rulesSizeOutput.classList.toggle("error", overLimit);
  updateRulesControls();

  if (overLimit) {
    rulesSizeOutput.textContent = `Rule list is ${formatBytes(bytes)}. Firefox Sync allows about 8.0 KB for this setting.`;
  } else if (nearLimit) {
    rulesSizeOutput.textContent = `Rule list is ${formatBytes(bytes)} of about 8.0 KB available for sync.`;
  } else {
    rulesSizeOutput.textContent = "";
  }

  return { bytes, overLimit };
}

function createValidationLine(issue, className) {
  const item = document.createElement("p");
  item.className = className;
  item.textContent = `Line ${issue.lineNumber}: ${issue.message}`;
  return item;
}

function updateRulesValidation() {
  const validation = HistoryFilterMatcher.validateRules(rulesInput.value);
  const visibleIssues = [...validation.errors.map((issue) => [issue, "error"]), ...validation.warnings.map((issue) => [issue, "warning"])];
  rulesInvalid = validation.errors.length > 0;
  rulesValidationOutput.replaceChildren();

  for (const [issue, className] of visibleIssues.slice(0, 5)) {
    rulesValidationOutput.append(createValidationLine(issue, className));
  }

  const hiddenCount = visibleIssues.length - 5;
  if (hiddenCount > 0) {
    const item = document.createElement("p");
    item.className = validation.errors.length > 0 ? "error" : "warning";
    item.textContent = `${hiddenCount} more issue${hiddenCount === 1 ? "" : "s"}.`;
    rulesValidationOutput.append(item);
  }

  updateRulesControls();
  return { hasErrors: rulesInvalid };
}

function updateRulesFeedback() {
  const size = updateRulesSizeWarning();
  const validation = updateRulesValidation();
  return { overLimit: size.overLimit, hasErrors: validation.hasErrors };
}

function clearRulesCheck() {
  rulesCheckTitle.textContent = "";
  rulesCheckList.replaceChildren();
  rulesCheckPanel.classList.remove("ok");
  rulesCheckPanel.hidden = true;
}

function appendRulesCheckItem(message) {
  const item = document.createElement("li");
  item.textContent = message;
  rulesCheckList.append(item);
}

function checkRules() {
  const { overLimit } = updateRulesFeedback();
  if (overLimit) {
    clearRulesCheck();
    setStatus("Shorten the rule list before checking.");
    return;
  }

  const validation = HistoryFilterMatcher.validateRules(rulesInput.value);
  const redundantRules = validation.errors.length === 0
    ? HistoryFilterMatcher.findRedundantRules(rulesInput.value)
    : [];
  const issueCount = validation.errors.length + validation.warnings.length + redundantRules.length;

  rulesCheckPanel.hidden = false;
  rulesCheckPanel.classList.toggle("ok", issueCount === 0);
  rulesCheckList.replaceChildren();

  if (issueCount === 0) {
    rulesCheckTitle.textContent = "No rule issues found.";
    setStatus("Rules checked.");
    return;
  }

  rulesCheckTitle.textContent = `${issueCount} rule issue${issueCount === 1 ? "" : "s"} found.`;

  for (const issue of validation.errors) {
    appendRulesCheckItem(`Line ${issue.lineNumber}: ${issue.message}`);
  }

  for (const issue of validation.warnings) {
    appendRulesCheckItem(`Line ${issue.lineNumber}: ${issue.message}`);
  }

  for (const issue of redundantRules) {
    appendRulesCheckItem(
      `Line ${issue.lineNumber}: ${issue.rule} is covered by line ${issue.coveredByLineNumber}: ${issue.coveredByRule}`
    );
  }

  setStatus("Rules checked.");
}

function setTestUrlResult(message, className = "") {
  testUrlResult.className = `url-test-result${className ? ` ${className}` : ""}`;
  testUrlResult.textContent = message;
}

function testUrlAgainstRules() {
  const url = testUrlInput.value.trim();
  if (!url) {
    setTestUrlResult("");
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (_error) {
    setTestUrlResult("Enter a valid URL.", "error");
    return;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    setTestUrlResult("Only http and https URLs are checked.", "error");
    return;
  }

  const { hasErrors } = updateRulesFeedback();
  if (hasErrors) {
    setTestUrlResult("Fix rule errors before testing.", "error");
    return;
  }

  const match = HistoryFilterMatcher.findMatchingRule(parsedUrl.href, rulesInput.value);
  if (match) {
    setTestUrlResult(`Matched line ${match.lineNumber}: ${match.rule}`, "match");
  } else {
    setTestUrlResult("No match.");
  }
}

async function loadSettings() {
  await loadStoragePreference();
  await loadRecentRemovalsPreference();
  const settings = await getActiveStorage().get(HistoryFilterSettings.DEFAULT_SETTINGS);
  enabledInput.checked = settings.enabled;
  addressBarInput.checked = settings.addressBarEnabled;
  rulesInput.value = settings.rulesText;
  rulesDirty = false;
  updateRulesLineNumbers();
  clearRulesCheck();
  clearCleanPreview();
  hideRulesConflict();
  syncSwitchLabel(enabledInput, enabledLabel);
  syncSwitchLabel(addressBarInput, addressBarLabel);
  updateRulesFeedback();
  await renderRecentRemovals();
}

async function saveSettings(options = {}) {
  const statusMessage = Object.prototype.hasOwnProperty.call(options, "statusMessage") ? options.statusMessage : "Saved.";
  const { overLimit, hasErrors } = updateRulesFeedback();
  if (overLimit) {
    throw new Error("Rule list is too large for Firefox Sync.");
  }
  if (hasErrors) {
    throw new Error("Fix rule errors before saving.");
  }

  await getActiveStorage().set(getCurrentSettings());
  rulesDirty = false;
  hideRulesConflict();
  if (!options.preserveCleanPreview) {
    clearCleanPreview();
  }
  if (statusMessage) {
    setStatus(statusMessage);
  }
}

async function addCurrentSiteRule(rule) {
  if (!rule) {
    return;
  }

  if (hasRule(rule)) {
    setStatus("Rule already exists.");
    return;
  }

  appendRule(rule);
  await saveSettings();
  setStatus(`Added ${rule}.`);
}

async function saveEnabled() {
  syncSwitchLabel(enabledInput, enabledLabel);
  await getActiveStorage().set({ enabled: enabledInput.checked });
  setStatus(`Filtering ${enabledInput.checked ? "on" : "off"}.`);
}

async function saveAddressBarEnabled() {
  syncSwitchLabel(addressBarInput, addressBarLabel);
  await getActiveStorage().set({ addressBarEnabled: addressBarInput.checked });
  setStatus(`Address bar icon ${addressBarInput.checked ? "shown" : "hidden"}.`);
}

async function saveRecentRemovalsEnabled() {
  recentRemovalsEnabled = recentRemovalsInput.checked;
  syncSwitchLabel(recentRemovalsInput, recentRemovalsLabel);
  await HistoryFilterSettings.getLocalStorage().set({
    [HistoryFilterSettings.RECENT_REMOVALS_ENABLED_KEY]: recentRemovalsEnabled
  });
  setStatus(`Recent removals log ${recentRemovalsEnabled ? "on" : "off"}.`);
}

async function saveSyncSettingsEnabled() {
  const nextEnabled = syncSettingsInput.checked;
  const previousEnabled = syncSettingsEnabled;

  if (nextEnabled) {
    syncSettingsEnabled = true;
    const { overLimit, hasErrors } = updateRulesFeedback();
    if (overLimit || hasErrors) {
      syncSettingsEnabled = previousEnabled;
      syncSettingsInput.checked = previousEnabled;
      syncSwitchLabel(syncSettingsInput, syncSettingsLabel);
      updateRulesFeedback();
      throw new Error(overLimit ? "Rule list is too large for Firefox Sync." : "Fix rule errors before enabling sync.");
    }

    await HistoryFilterSettings.getSyncStorage().set(getCurrentSettings());
  } else {
    await HistoryFilterSettings.getLocalStorage().set(getCurrentSettings());
  }

  await HistoryFilterSettings.getLocalStorage().set({ [HistoryFilterSettings.STORAGE_PREFERENCE_KEY]: nextEnabled });
  syncSettingsEnabled = nextEnabled;
  rulesDirty = false;
  clearCleanPreview();
  hideRulesConflict();
  syncSwitchLabel(syncSettingsInput, syncSettingsLabel);
  updateRulesFeedback();
  setStatus(`Settings sync ${nextEnabled ? "on" : "off"}.`);
}

function renderRecentRemovalItem(entry) {
  const item = document.createElement("li");

  const url = document.createElement("span");
  url.className = "recent-removals-url";
  url.textContent = entry.url || "Unknown URL";

  const rule = document.createElement("span");
  rule.className = "recent-removals-rule";
  if (entry.rule) {
    rule.textContent = `Line ${entry.lineNumber || "?"}: ${entry.rule}`;
  } else {
    rule.textContent = "Unknown rule";
  }

  const time = document.createElement("span");
  time.className = "recent-removals-time";
  time.textContent = formatRemovedAt(entry.removedAt);

  item.append(url, rule, time);
  return item;
}

async function renderRecentRemovals() {
  recentRemovalsPanel.hidden = !recentRemovalsEnabled;
  if (!recentRemovalsEnabled) {
    return;
  }

  const removals = await HistoryFilterSettings.getRecentRemovals();
  recentRemovalsList.replaceChildren(...removals.map(renderRecentRemovalItem));
  recentRemovalsSummary.textContent = `${removals.length} of ${HistoryFilterSettings.RECENT_REMOVALS_LIMIT} saved locally.`;
  clearRecentRemovalsButton.disabled = removals.length === 0;
}

async function clearRecentRemovals() {
  await HistoryFilterSettings.clearRecentRemovals();
  await renderRecentRemovals();
  setStatus("Recent removals cleared.");
}

function formatUrlCount(count) {
  return `${count} URL${count === 1 ? "" : "s"}`;
}

function clearCleanPreview() {
  cleanPreview = null;
  cleanPreviewTitle.textContent = "";
  cleanPreviewList.replaceChildren();
  cleanPreviewPanel.hidden = true;
  updateRulesControls();
}

function renderCleanPreview(matches, breakdown) {
  cleanPreviewPanel.hidden = false;
  cleanPreviewTitle.textContent = matches.length === 0
    ? "No matching history URLs found."
    : `${formatUrlCount(matches.length)} match these rules.`;
  cleanPreviewList.replaceChildren();

  if (matches.length === 0) {
    updateRulesControls();
    return;
  }

  const sortedBreakdown = [...breakdown.values()].sort((a, b) => b.count - a.count);
  for (const item of sortedBreakdown.slice(0, 8)) {
    const line = document.createElement("li");
    line.textContent = `Line ${item.lineNumber}: ${item.rule} - ${formatUrlCount(item.count)}`;
    cleanPreviewList.append(line);
  }

  const hiddenCount = sortedBreakdown.length - 8;
  if (hiddenCount > 0) {
    const line = document.createElement("li");
    line.textContent = `${hiddenCount} more matching rule${hiddenCount === 1 ? "" : "s"}.`;
    cleanPreviewList.append(line);
  }

  updateRulesControls();
}

async function previewCleanMatchingHistory() {
  const { overLimit, hasErrors } = updateRulesFeedback();
  if (overLimit) {
    setStatus("Shorten the rule list before previewing.");
    return;
  }
  if (hasErrors) {
    setStatus("Fix rule errors before previewing.");
    return;
  }

  const rulesText = rulesInput.value;
  const ruleEntries = HistoryFilterMatcher.parseRuleEntries(rulesText);
  const results = await browser.history.search({
    text: "",
    startTime: 0,
    maxResults: 100000
  });

  const seenUrls = new Set();
  const matches = [];
  const breakdown = new Map();

  for (const item of results) {
    if (!item.url || seenUrls.has(item.url)) {
      continue;
    }

    const match = HistoryFilterMatcher.findMatchingRuleEntry(item.url, ruleEntries);
    if (!match) {
      continue;
    }

    seenUrls.add(item.url);
    matches.push({ url: item.url, lineNumber: match.lineNumber, rule: match.rule });

    const key = `${match.lineNumber}\n${match.rule}`;
    const breakdownItem = breakdown.get(key) || {
      lineNumber: match.lineNumber,
      rule: match.rule,
      count: 0
    };
    breakdownItem.count += 1;
    breakdown.set(key, breakdownItem);
  }

  cleanPreview = { rulesText, matches };
  renderCleanPreview(matches, breakdown);
}

async function confirmCleanMatchingHistory() {
  if (!cleanPreview) {
    return;
  }

  if (cleanPreview.rulesText !== rulesInput.value) {
    clearCleanPreview();
    setStatus("Rules changed. Preview again before cleaning.");
    return;
  }

  const { overLimit, hasErrors } = updateRulesFeedback();
  if (overLimit) {
    setStatus("Shorten the rule list before cleaning.");
    return;
  }
  if (hasErrors) {
    setStatus("Fix rule errors before cleaning.");
    return;
  }

  const urls = cleanPreview.matches.map((match) => match.url);
  await saveSettings({ preserveCleanPreview: true, statusMessage: "" });

  await Promise.all(urls.map((url) => browser.history.deleteUrl({ url })));
  if (recentRemovalsEnabled) {
    await HistoryFilterSettings.appendRecentRemovals(cleanPreview.matches);
    await renderRecentRemovals();
  }
  clearCleanPreview();
  setStatus(`Removed ${formatUrlCount(urls.length)}.`);
}

function reloadExternalRules() {
  if (externalRulesText == null) {
    return;
  }

  rulesInput.value = externalRulesText;
  rulesDirty = false;
  updateRulesLineNumbers();
  clearRulesCheck();
  clearCleanPreview();
  hideRulesConflict();
  updateRulesFeedback();
  testUrlAgainstRules();
  setStatus("Reloaded external rules.");
}

async function keepLocalRules() {
  if (externalRulesText == null) {
    return;
  }

  await saveSettings();
  hideRulesConflict();
  setStatus("Kept local rules.");
}

function getCurrentSiteRule(kind) {
  if (!activePage) {
    return "";
  }

  if (kind === "domain") {
    return activePage.host;
  }
  if (kind === "subdomains") {
    return `**.${activePage.host}`;
  }
  if (kind === "page") {
    return activePage.pagePrefix;
  }

  return "";
}

enabledInput.addEventListener("change", () => {
  saveEnabled().catch((error) => {
    console.error(error);
    setStatus("Could not save toggle.");
  });
});
addressBarInput.addEventListener("change", () => {
  saveAddressBarEnabled().catch((error) => {
    console.error(error);
    setStatus("Could not save address bar setting.");
  });
});
recentRemovalsInput.addEventListener("change", () => {
  saveRecentRemovalsEnabled()
    .then(renderRecentRemovals)
    .catch((error) => {
      console.error(error);
      setStatus("Could not save recent removals setting.");
    });
});
syncSettingsInput.addEventListener("change", () => {
  saveSyncSettingsEnabled().catch((error) => {
    console.error(error);
    setStatus(error.message || "Could not change sync setting.");
  });
});
rulesInput.addEventListener("input", () => {
  rulesDirty = true;
  updateRulesLineNumbers();
  clearRulesCheck();
  clearCleanPreview();
  updateRulesFeedback();
  testUrlAgainstRules();
});
rulesInput.addEventListener("scroll", syncRulesLineNumbersScroll);
reloadRulesButton.addEventListener("click", reloadExternalRules);
keepRulesButton.addEventListener("click", () => {
  keepLocalRules().catch((error) => {
    console.error(error);
    setStatus(error.message || "Could not keep local rules.");
  });
});
filterDomainButton.addEventListener("click", () => {
  addCurrentSiteRule(getCurrentSiteRule("domain")).catch((error) => {
    console.error(error);
    setStatus(error.message || "Could not add current domain.");
  });
});
filterSubdomainsButton.addEventListener("click", () => {
  addCurrentSiteRule(getCurrentSiteRule("subdomains")).catch((error) => {
    console.error(error);
    setStatus(error.message || "Could not add current site.");
  });
});
filterPageButton.addEventListener("click", () => {
  addCurrentSiteRule(getCurrentSiteRule("page")).catch((error) => {
    console.error(error);
    setStatus(error.message || "Could not add current page.");
  });
});
testUrlButton.addEventListener("click", testUrlAgainstRules);
testUrlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    testUrlAgainstRules();
  }
});
saveButton.addEventListener("click", () => {
  saveSettings().catch((error) => {
    console.error(error);
    setStatus(error.message || "Could not save settings.");
  });
});
checkRulesButton.addEventListener("click", checkRules);
cleanButton.addEventListener("click", () => {
  previewingClean = true;
  updateRulesControls();
  previewCleanMatchingHistory()
    .catch((error) => {
      console.error(error);
      setStatus("Preview failed. See extension console.");
    })
    .finally(() => {
      previewingClean = false;
      updateRulesFeedback();
    });
});
confirmCleanButton.addEventListener("click", () => {
  cleaning = true;
  updateRulesControls();
  confirmCleanMatchingHistory()
    .catch((error) => {
      console.error(error);
      setStatus("Clean failed. See extension console.");
    })
    .finally(() => {
      cleaning = false;
      updateRulesFeedback();
    });
});
dismissCleanPreviewButton.addEventListener("click", clearCleanPreview);
clearRecentRemovalsButton.addEventListener("click", () => {
  clearRecentRemovals().catch((error) => {
    console.error(error);
    setStatus("Could not clear recent removals.");
  });
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[HistoryFilterSettings.RECENT_REMOVALS_ENABLED_KEY]) {
    recentRemovalsEnabled = Boolean(changes[HistoryFilterSettings.RECENT_REMOVALS_ENABLED_KEY].newValue);
    recentRemovalsInput.checked = recentRemovalsEnabled;
    syncSwitchLabel(recentRemovalsInput, recentRemovalsLabel);
    renderRecentRemovals().catch((error) => {
      console.error(error);
      setStatus("Could not reload recent removals.");
    });
  }

  if (areaName === "local" && changes[HistoryFilterSettings.RECENT_REMOVALS_KEY]) {
    renderRecentRemovals().catch((error) => {
      console.error(error);
      setStatus("Could not reload recent removals.");
    });
  }

  if (areaName === "local" && changes[HistoryFilterSettings.STORAGE_PREFERENCE_KEY]) {
    loadSettings().catch((error) => {
      console.error(error);
      setStatus("Could not reload settings.");
    });
    return;
  }

  if (!isActiveStorageArea(areaName)) {
    return;
  }

  if (changes.enabled) {
    enabledInput.checked = changes.enabled.newValue;
    syncSwitchLabel(enabledInput, enabledLabel);
  }

  if (changes.addressBarEnabled) {
    addressBarInput.checked = changes.addressBarEnabled.newValue;
    syncSwitchLabel(addressBarInput, addressBarLabel);
  }

  if (changes.rulesText) {
    if (rulesDirty || document.activeElement === rulesInput) {
      showRulesConflict(changes.rulesText.newValue);
      return;
    }

    rulesInput.value = changes.rulesText.newValue;
    rulesDirty = false;
    updateRulesLineNumbers();
    clearRulesCheck();
    clearCleanPreview();
    hideRulesConflict();
    updateRulesFeedback();
    testUrlAgainstRules();
  }
});

loadSettings().catch((error) => {
  console.error(error);
  setStatus("Could not load settings.");
});

loadActivePage().catch((error) => {
  console.error(error);
});
