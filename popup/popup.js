// Import utilities
import { isAccessibleURL, updateDomainPreference, removeDomainPreference } from "../common.js";

let currentDomain = null;
let localCache = {};
let isInitialized = false;

// DOM elements
const rtlToggle = document.getElementById("rtlToggle");
const applyToBody = document.getElementById("applyToBody");
const forceImportant = document.getElementById("forceImportant");
const overrideFont = document.getElementById("overrideFont");
const fontFamily = document.getElementById("fontFamily");
const optionsBtn = document.getElementById("optionsBtn");
const forgetSiteBtn = document.getElementById("forgetSiteBtn");
const currentSiteEl = document.getElementById("currentSite");

// ==================== INITIALIZATION ====================

async function initializePopup() {
    if (isInitialized) return;

    setupMobileEnvironment();
    currentDomain = await getCurrentTabDomain();

    if (!currentDomain || !(await isCurrentDomainAccessible())) {
        showPageNotSupported();
        return;
    }

    await loadCache();
    updateDomainDisplay(currentDomain);
    await loadSettingsFromCache();
    updateShortcutDisplay();

    chrome.storage.onChanged.addListener(handleStorageChange);

    isInitialized = true;
    console.debug("Popup initialized for domain:", currentDomain);
}

async function loadCache() {
    try {
        const result = await chrome.storage.local.get(["sitePreferences"]);
        localCache = result.sitePreferences || {};
        console.debug("Local cache loaded with", Object.keys(localCache).length, "domains");
    } catch (error) {
        console.error("Error loading cache:", error);
        localCache = {};
    }
}

async function loadSettingsFromCache() {
    if (!currentDomain) {
        disableAllControls();
        return;
    }

    const domainSettings = localCache[currentDomain];

    if (domainSettings) {
        updateUIFromSettings(domainSettings);
        currentSiteEl.textContent = currentDomain + " ✓";
        currentSiteEl.style.color = "var(--success-text)";
        forgetSiteBtn.disabled = false;
    } else {
        resetUIToDefaults();
        currentSiteEl.textContent = currentDomain;
        currentSiteEl.style.color = "var(--text-color)";
        forgetSiteBtn.disabled = true;
    }

    enableAllControls();
}

async function isCurrentDomainAccessible() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0] && tabs[0].url) {
                resolve(isAccessibleURL(tabs[0].url));
            } else {
                resolve(false);
            }
        });
    });
}

// ==================== STORAGE EVENT HANDLER ====================

async function handleStorageChange(changes, namespace) {
    if (namespace !== "local" || !changes.sitePreferences) return;

    const newSettings = changes.sitePreferences.newValue || {};
    localCache = newSettings;

    if (!currentDomain) return;

    const domainSettings = newSettings[currentDomain];

    if (!domainSettings) {
        resetUIToDefaults();
        updateDomainDisplay(currentDomain);
        forgetSiteBtn.disabled = true;
        return;
    }

    updateUIFromSettings(domainSettings);
    updateDomainDisplay(currentDomain);
    forgetSiteBtn.disabled = false;
}

// ==================== LOAD & SAVE FUNCTIONS ====================

async function saveCurrentSettings() {
    if (!currentDomain) return;

    try {
        // customCSS is edited only from the options page, so keep whatever
        // is currently cached for it rather than assuming it's empty.
        const cachedCustomCSS = localCache[currentDomain]?.customCSS || "";

        const settingsToSave = {
            enabled: rtlToggle.checked,
            fontFamily: fontFamily.value || "",
            applyToBody: applyToBody.checked,
            forceImportant: forceImportant.checked,
            overrideFont: overrideFont.checked,
            customCSS: cachedCustomCSS,
        };

        // updateDomainPreference re-reads storage right before writing, so it
        // won't clobber changes saved elsewhere (options page, another
        // window) since this popup's cache was last loaded.
        const updatedPrefs = await updateDomainPreference(currentDomain, settingsToSave);
        if (updatedPrefs) {
            localCache = updatedPrefs;
        }

        console.debug("Settings saved for:", currentDomain);
    } catch (error) {
        console.error("Error saving settings:", error);
    }
}

// ==================== UI FUNCTIONS ====================

function updateUIFromSettings(settings) {
    if (!settings) return;

    rtlToggle.checked = settings.enabled || false;
    applyToBody.checked = settings.applyToBody || false;
    forceImportant.checked = settings.forceImportant || false;
    overrideFont.checked = settings.overrideFont || false;
    fontFamily.value = settings.fontFamily || "";
}

function resetUIToDefaults() {
    rtlToggle.checked = false;
    applyToBody.checked = false;
    forceImportant.checked = false;
    overrideFont.checked = false;
    fontFamily.value = "";
}

function updateDomainDisplay(domain) {
    if (domain) {
        const domainSettings = localCache[domain];
        if (domainSettings) {
            currentSiteEl.textContent = domain + " ✓";
            currentSiteEl.style.color = "var(--success-text)";
        } else {
            currentSiteEl.textContent = domain;
            currentSiteEl.style.color = "var(--text-color)";
        }
    } else {
        currentSiteEl.textContent = chrome.i18n.getMessage("pageNotSupported");
        currentSiteEl.style.color = "var(--error-text)";
    }
}

function enableAllControls() {
    rtlToggle.disabled = false;
    applyToBody.disabled = false;
    forceImportant.disabled = false;
    overrideFont.disabled = fontFamily.value === "";
    fontFamily.disabled = false;
}

function disableAllControls() {
    rtlToggle.disabled = true;
    applyToBody.disabled = true;
    forceImportant.disabled = true;
    overrideFont.disabled = true;
    fontFamily.disabled = true;
    rtlToggle.checked = false;
    applyToBody.checked = false;
    forceImportant.checked = false;
    overrideFont.checked = false;
    fontFamily.value = "";

    forgetSiteBtn.disabled = true;
}

function showPageNotSupported() {
    currentSiteEl.textContent = chrome.i18n.getMessage("pageNotSupported");
    currentSiteEl.style.color = "var(--error-text)";

    disableAllControls();
    forgetSiteBtn.disabled = true;
}

// ==================== EVENT HANDLERS ====================

function setupEventListeners() {
    rtlToggle.addEventListener("change", handleSettingChange);
    applyToBody.addEventListener("change", handleSettingChange);
    forceImportant.addEventListener("change", handleSettingChange);
    overrideFont.addEventListener("change", handleSettingChange);
    fontFamily.addEventListener("change", handleSettingChange);

    fontFamily.addEventListener("input", function () {
        if (fontFamily.value === "") {
            overrideFont.disabled = true;
            overrideFont.checked = false;
        } else {
            overrideFont.disabled = false;
        }
    });

    optionsBtn.addEventListener("click", async function () {
        let optionsUrl = chrome.runtime.getURL("options.html");
        if (currentDomain) {
            optionsUrl += `?domain=${encodeURIComponent(currentDomain)}`;
        }
        chrome.tabs.create({ url: optionsUrl });
        window.close();
    });

    forgetSiteBtn.addEventListener("click", async function () {
        if (!currentDomain) return;

        try {
            const updatedPrefs = await removeDomainPreference(currentDomain);
            if (updatedPrefs) {
                localCache = updatedPrefs;
            }

            console.debug("Settings removed for:", currentDomain);

            forgetSiteBtn.disabled = true;
            overrideFont.disabled = true;
            currentSiteEl.textContent = currentDomain;
            currentSiteEl.style.color = "var(--text-color)";
        } catch (error) {
            console.error("Error removing settings:", error);
        }
    });
}

async function handleSettingChange() {
    await saveCurrentSettings();
}

// ==================== UTILITY FUNCTIONS ====================

function setupMobileEnvironment() {
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        document.body.classList.add("mobile");
        const shortcutGuide = document.querySelector(".shortcut-guide");
        if (shortcutGuide) shortcutGuide.style.display = "none";
    }
}

function updateShortcutDisplay() {
    if (!chrome.commands?.getAll) {
        const shortcutGuide = document.querySelector(".shortcut-guide");
        if (shortcutGuide) {
            shortcutGuide.textContent = chrome.i18n.getMessage("shortcutNotSupported");
        }
        return;
    }

    chrome.commands.getAll(function (commands) {
        const toggleCommand = commands.find((cmd) => cmd.name === "toggle-rtl");
        const shortcutGuide = document.querySelector(".shortcut-guide");
        if (!shortcutGuide) return;

        if (toggleCommand?.shortcut) {
            const keys = toggleCommand.shortcut.split("+");
            shortcutGuide.innerHTML = "";
            shortcutGuide.appendChild(document.createTextNode(chrome.i18n.getMessage("shortcutPrefix")));
            keys.forEach((key, index) => {
                const kbd = document.createElement("kbd");
                kbd.textContent = key;
                shortcutGuide.appendChild(kbd);
                if (index < keys.length - 1) {
                    shortcutGuide.appendChild(document.createTextNode("+"));
                }
            });
        } else {
            shortcutGuide.textContent = chrome.i18n.getMessage("shortcutNotSet");
        }
    });
}

async function getCurrentTabDomain() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]?.url) {
                try {
                    const urlObj = new URL(tabs[0].url);
                    resolve(urlObj.hostname);
                } catch (error) {
                    resolve(null);
                }
            } else {
                resolve(null);
            }
        });
    });
}

// ==================== DOM CONTENT LOADED ====================

document.addEventListener("DOMContentLoaded", function () {
    setupEventListeners();
    initializePopup().catch(console.error);
});
