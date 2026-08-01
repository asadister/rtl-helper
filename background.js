// Import utilities (Manifest v3 service worker with type: module)
import { isAccessibleURL, extractHostname, safeStorageGet, safeStorageSet, updateDomainPreference } from "./common.js";

// ==================== STATE ====================
// Map of tabId -> { domain, lastSettings, lastUpdate, updating }
// This cache is essential to prevent duplicate messages and race conditions.
const tabStateMap = new Map();

// Map of domain -> { timer, updateId, domainSettings } for debouncing
const pendingUpdates = new Map();

// ==================== SMART DIFFING ====================

/**
 * Computes which domains have changed between old and new settings.
 * @param {object} oldSettings - Previous settings object
 * @param {object} newSettings - New settings object
 * @returns {array} - Array of domain names that changed
 */
function computeChangedDomains(oldSettings, newSettings) {
    const changedDomains = new Set();
    const allDomains = new Set([...Object.keys(oldSettings || {}), ...Object.keys(newSettings || {})]);

    for (const domain of allDomains) {
        const oldData = oldSettings?.[domain];
        const newData = newSettings?.[domain];

        if (!newData || !oldData) {
            changedDomains.add(domain);
            continue;
        }

        if (!isSettingsEqual(oldData, newData)) {
            changedDomains.add(domain);
        }
    }

    return Array.from(changedDomains);
}

/**
 * Checks if two settings objects are equal.
 * @param {object} a - First settings object
 * @param {object} b - Second settings object
 * @returns {boolean} - True if settings are equal
 */
function isSettingsEqual(a, b) {
    const keys = ["enabled", "fontFamily", "applyToBody", "forceImportant", "overrideFont", "customCSS"];
    for (const key of keys) {
        if (a?.[key] !== b?.[key]) return false;
    }
    return true;
}

// ==================== DOMAIN UPDATE PROCESSING ====================

/**
 * Processes a domain settings update with debouncing.
 * @param {string} domain - The domain to update
 * @param {object} domainSettings - Settings for the domain
 * @returns {Promise<void>}
 */
async function processDomainUpdate(domain, domainSettings) {
    if (pendingUpdates.has(domain)) {
        clearTimeout(pendingUpdates.get(domain).timer);
    }

    const updateId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    pendingUpdates.set(domain, {
        timer: null,
        updateId,
        domainSettings,
    });

    const timer = setTimeout(async () => {
        try {
            await applyDomainUpdateToAllTabs(domain, domainSettings, updateId);
        } finally {
            if (pendingUpdates.get(domain)?.updateId === updateId) {
                pendingUpdates.delete(domain);
            }
        }
    }, 50);

    pendingUpdates.get(domain).timer = timer;
}

/**
 * Applies domain settings update to all matching tabs.
 * @param {string} domain - The domain to apply settings for
 * @param {object} domainSettings - Settings to apply
 * @param {string} updateId - Unique identifier for this update
 * @returns {Promise<void>}
 */
async function applyDomainUpdateToAllTabs(domain, domainSettings, updateId) {
    const tabs = await chrome.tabs.query({});
    const targetTabs = [];

    for (const tab of tabs) {
        if (!tab.url) continue;
        try {
            const tabDomain = extractHostname(tab.url);
            if (tabDomain === domain && isAccessibleURL(tab.url)) {
                targetTabs.push(tab);
            }
        } catch {
            // ignore invalid URLs
        }
    }

    if (targetTabs.length === 0) {
        console.debug("No tabs found for domain:", domain);
        return;
    }

    console.debug(`Applying update to ${targetTabs.length} tabs for domain: ${domain}`);

    for (const tab of targetTabs) {
        const res = await safeSendMessage(tab.id, {
            action: "applyRTL",
            state: domainSettings?.enabled || false,
            fontFamily: domainSettings?.fontFamily || "",
            customCSS: domainSettings?.customCSS || "",
            applyToBody: domainSettings?.applyToBody || false,
            forceImportant: domainSettings?.forceImportant || false,
            overrideFont: domainSettings?.overrideFont || false,
            source: "domain_update",
            updateId,
        });

        if (res.success) {
            tabStateMap.set(tab.id, {
                domain,
                lastSettings: domainSettings || null,
                lastUpdate: Date.now(),
            });
            updateIcon(tab.id, domainSettings?.enabled || false);
        }
    }
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Saves site preferences to storage.
 * @param {string} domain - The domain to save settings for
 * @param {object} settings - The settings object to save
 * @returns {Promise<boolean>} - True if successful
 */
async function saveSitePreferences(domain, settings) {
    const updated = await updateDomainPreference(domain, settings);
    return updated !== null;
}

/**
 * Updates the extension icon to indicate RTL status for a specific tab.
 * @param {number} tabId - The tab ID
 * @param {boolean} isEnabled - Whether RTL is enabled
 */
function updateIcon(tabId, isEnabled) {
    try {
        const iconPath = isEnabled
            ? {
                16: "icons/icon-16-active.png",
                32: "icons/icon-32-active.png",
                48: "icons/icon-48-active.png",
                96: "icons/icon-96-active.png",
                128: "icons/icon-128-active.png",
            }
            : {
                16: "icons/icon-16.png",
                32: "icons/icon-32.png",
                48: "icons/icon-48.png",
                96: "icons/icon-96.png",
                128: "icons/icon-128.png",
            };

        chrome.action.setIcon({ path: iconPath, tabId }, () => {
            const err = chrome.runtime.lastError?.message;
            if (err && !err.includes("No tab with id") && !err.includes("Invalid tab")) {
                console.debug("Unexpected icon update error:", err);
            }
        });
    } catch (_) {
        // Suppress any synchronous errors
    }
}

/**
 * Safely sends a message to a tab's content script.
 * @param {number} tabId - The tab ID
 * @param {object} message - The message to send
 * @returns {Promise<object>} - Result with success status and details
 */
async function safeSendMessage(tabId, message) {
    return new Promise((resolve) => {
        const finish = (res) => resolve({ tabId, ...res });

        const send = () => {
            chrome.tabs.sendMessage(tabId, message, (response) => {
                const lastErr = chrome.runtime.lastError?.message;

                if (!lastErr) {
                    return finish({ success: true, response });
                }

                if (lastErr.includes("No tab with id") || lastErr.includes("Invalid tab")) {
                    return finish({ success: false, reason: "tab_closed" });
                }

                const noReceiver =
                    lastErr.includes("Receiving end does not exist") ||
                    lastErr.includes("Could not establish connection");

                if (!noReceiver) {
                    return finish({ success: false, reason: "send_failed", error: lastErr });
                }

                if (!chrome.scripting?.executeScript) {
                    return finish({ success: false, reason: "no_receiver", injectable: false, error: lastErr });
                }

                chrome.scripting
                    .executeScript({
                        target: { tabId },
                        files: ["content.js"],
                    })
                    .then(() => setTimeout(send, 80))
                    .catch((e) => {
                        return finish({
                            success: false,
                            reason: "inject_failed",
                            injectable: false,
                            error: e?.message,
                        });
                    });
            });
        };

        send();
    });
}

/**
 * Determines if a tab needs settings update.
 * @param {object} tabState - Current tab state
 * @param {string} currentDomain - Current domain
 * @param {object} currentSettings - Current settings
 * @returns {boolean} - True if update is needed
 */
function shouldUpdateTab(tabState, currentDomain, currentSettings) {
    if (!tabState) return true;
    if (tabState.updating) return false; // Don't update if already updating
    if (tabState.domain !== currentDomain) return true;
    if (!currentSettings) return true;
    if (!isSettingsEqual(tabState.lastSettings, currentSettings)) return true;
    return false;
}

// ==================== EVENT LISTENERS ====================

/**
 * Listens for storage changes and applies updates to affected tabs.
 */
chrome.storage.onChanged.addListener(async function (changes, namespace) {
    if (namespace !== "local" || !changes.sitePreferences) return;

    try {
        const oldSettings = changes.sitePreferences.oldValue || {};
        const newSettings = changes.sitePreferences.newValue || {};

        const changedDomains = computeChangedDomains(oldSettings, newSettings);

        for (const domain of changedDomains) {
            processDomainUpdate(domain, newSettings[domain]).catch(console.error);
        }
    } catch (error) {
        console.error("Error handling storage change:", error);
    }
});

/**
 * Listens for tab activation and applies settings for the activated tab.
 */
chrome.tabs.onActivated.addListener(async function (activeInfo) {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (!tab?.url || !isAccessibleURL(tab.url)) return;

        const domain = extractHostname(tab.url);
        if (!domain) return;

        // Read fresh settings directly from storage
        const sitePreferences = await safeStorageGet("sitePreferences");
        const domainSettings = sitePreferences?.[domain] || null;

        const tabState = tabStateMap.get(tab.id);

        // If no settings for this domain: only send OFF if previously ON
        if (!domainSettings) {
            if (tabState?.lastSettings?.enabled) {
                const res = await safeSendMessage(tab.id, {
                    action: "applyRTL",
                    state: false,
                    fontFamily: "",
                    customCSS: "",
                    applyToBody: false,
                    forceImportant: false,
                    overrideFont: false,
                    source: "tab_activation_no_settings",
                    updateId: `tab-activation-off-${Date.now()}-${tab.id}`,
                });

                if (res.success) {
                    tabStateMap.set(tab.id, {
                        domain,
                        lastSettings: null,
                        lastUpdate: Date.now(),
                    });
                    updateIcon(tab.id, false);
                }
            } else {
                tabStateMap.set(tab.id, {
                    domain,
                    lastSettings: null,
                    lastUpdate: Date.now(),
                });
                updateIcon(tab.id, false);
            }
            return;
        }

        const needsUpdate = shouldUpdateTab(tabState, domain, domainSettings);
        if (!needsUpdate) {
            return;
        }

        console.debug(`Tab ${tab.id} update for ${domain}: ${domainSettings.enabled ? "ON" : "OFF"}`);

        const res = await safeSendMessage(tab.id, {
            action: "applyRTL",
            state: domainSettings.enabled || false,
            fontFamily: domainSettings.fontFamily || "",
            customCSS: domainSettings.customCSS || "",
            applyToBody: domainSettings.applyToBody || false,
            forceImportant: domainSettings.forceImportant || false,
            overrideFont: domainSettings.overrideFont || false,
            source: "tab_activation",
            updateId: `tab-activation-${Date.now()}-${tab.id}`,
        });

        if (res.success) {
            tabStateMap.set(tab.id, {
                domain,
                lastSettings: domainSettings,
                lastUpdate: Date.now(),
            });
            updateIcon(tab.id, domainSettings.enabled || false);
        }
    } catch (error) {
        console.debug("Tab activation error:", error.message);
    }
});

/**
 * Listens for page load completion and applies settings for the loaded page.
 */
chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo, tab) {
    if (changeInfo.status === "complete" && tab?.url) {
        try {
            const domain = extractHostname(tab.url);
            if (!domain || !isAccessibleURL(tab.url)) return;

            // Read fresh settings directly from storage
            const sitePreferences = await safeStorageGet("sitePreferences");
            const domainSettings = sitePreferences?.[domain];

            const currentState = tabStateMap.get(tabId);

            // If no settings for this domain: only send OFF if previously ON
            if (!domainSettings) {
                if (currentState?.lastSettings?.enabled) {
                    const res = await safeSendMessage(tabId, {
                        action: "applyRTL",
                        state: false,
                        fontFamily: "",
                        customCSS: "",
                        applyToBody: false,
                        forceImportant: false,
                        overrideFont: false,
                        source: "tab_update",
                        updateId: `tab-update-${Date.now()}-${tabId}`,
                    });

                    if (res.success) {
                        tabStateMap.set(tabId, {
                            domain,
                            lastSettings: null,
                            lastUpdate: Date.now(),
                            updating: false,
                        });
                        updateIcon(tabId, false);
                    }
                } else {
                    tabStateMap.set(tabId, {
                        domain,
                        lastSettings: null,
                        lastUpdate: Date.now(),
                        updating: false,
                    });
                    updateIcon(tabId, false);
                }
                return;
            }

            tabStateMap.set(tabId, {
                domain,
                lastSettings: null,
                lastUpdate: Date.now(),
                updating: true,
            });

            const res = await safeSendMessage(tabId, {
                action: "applyRTL",
                state: domainSettings.enabled || false,
                fontFamily: domainSettings.fontFamily || "",
                customCSS: domainSettings.customCSS || "",
                applyToBody: domainSettings.applyToBody || false,
                forceImportant: domainSettings.forceImportant || false,
                overrideFont: domainSettings.overrideFont || false,
                source: "tab_update",
                updateId: `tab-update-${Date.now()}-${tabId}`,
            });

            if (res.success) {
                tabStateMap.set(tabId, {
                    domain,
                    lastSettings: domainSettings || null,
                    lastUpdate: Date.now(),
                    updating: false,
                });
                updateIcon(tabId, domainSettings.enabled || false);
            } else {
                if (currentState) {
                    tabStateMap.set(tabId, currentState);
                } else {
                    tabStateMap.delete(tabId);
                }
            }
        } catch (error) {
            console.debug("Tab update error:", error.message);
        }
    }
});

/**
 * Handles keyboard shortcut toggle for RTL.
 */
async function handleKeyboardShortcut() {
    try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.url || !isAccessibleURL(activeTab.url)) return;

        const domain = extractHostname(activeTab.url);
        if (!domain) return;

        const sitePreferences = await safeStorageGet("sitePreferences");
        const currentSettings = sitePreferences?.[domain] || {
            enabled: false,
            fontFamily: "",
            applyToBody: false,
            forceImportant: false,
            overrideFont: false,
            customCSS: "",
        };

        await saveSitePreferences(domain, { enabled: !currentSettings.enabled });

        console.debug(`Keyboard shortcut: ${currentSettings.enabled ? "Disabling" : "Enabling"} RTL for ${domain}`);
        // storage change will trigger domain update and icon update automatically
    } catch (error) {
        console.error("Keyboard shortcut error:", error);
    }
}

/**
 * Listens for keyboard shortcut commands and toggles RTL for the active tab.
 */
if (chrome.commands) {
    chrome.commands.onCommand.addListener((command) => {
        if (command === "toggle-rtl") {
            handleKeyboardShortcut().catch(console.error);
        }
    });
}

/**
 * Cleans up tab state when a tab is closed or replaced.
 */
chrome.tabs.onRemoved.addListener((tabId) => {
    tabStateMap.delete(tabId);
    console.debug(`Cleaned up tab ${tabId} from state`);
});

/**
 * Cleans up tab state when a tab is replaced (e.g., prerendering or navigation).
 */
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    tabStateMap.delete(removedTabId);
    console.debug(`Cleaned up replaced tab ${removedTabId}`);
});

/**
 * Handles extension startup events.
 */
chrome.runtime.onStartup.addListener(async () => {
    console.log("Browser startup detected");
});

/**
 * Handles extension installation or update events.
 */
chrome.runtime.onInstalled.addListener(async () => {
    // Ensure storage is initialized
    const sitePreferences = await safeStorageGet("sitePreferences");
    if (!sitePreferences) {
        await safeStorageSet("sitePreferences", {});
    }
    console.log("Extension installed/updated");
});