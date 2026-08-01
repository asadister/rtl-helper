// Import utilities
import { isDomainAccessible, updateDomainPreference } from './common.js';

let currentDomain = "";

// ==================== INITIALIZATION ====================

document.addEventListener("DOMContentLoaded", function () {
    const returnBtn = document.getElementById("returnBtn");
    const saveBtn = document.getElementById("saveBtn");
    const resetBtn = document.getElementById("resetBtn");
    const backupBtn = document.getElementById("backupBtn");
    const restoreBtn = document.getElementById("restoreBtn");
    const restoreFileInput = document.getElementById("restoreFileInput");

    loadDomainAndSettings();

    chrome.storage.onChanged.addListener(handleStorageChange);

    saveBtn.addEventListener("click", saveSettings);
    resetBtn.addEventListener("click", resetSettings);
    returnBtn.addEventListener("click", returnToSourceTab);
    backupBtn.addEventListener("click", backupSettings);
    restoreBtn.addEventListener("click", () => restoreFileInput.click());
    restoreFileInput.addEventListener("change", handleRestoreFile);

    setupTextareaTabSupport();
});

// ==================== STORAGE EVENT HANDLER ====================

function handleStorageChange(changes, namespace) {
    if (namespace !== "local" || !changes.sitePreferences) return;
    if (!currentDomain) return;

    const newSettings = changes.sitePreferences.newValue || {};
    const domainSettings = newSettings[currentDomain];

    updateUIFromSettings(domainSettings);
}

// ==================== LOAD & SAVE FUNCTIONS ====================

async function loadDomainAndSettings() {
    const domainNameEl = document.getElementById("domainName");
    const urlParams = new URLSearchParams(window.location.search);
    const domainFromUrl = urlParams.get("domain");

    if (domainFromUrl) {
        currentDomain = decodeURIComponent(domainFromUrl);
        domainNameEl.textContent = currentDomain;

        if (!isDomainAccessible(currentDomain)) {
            domainNameEl.textContent = chrome.i18n.getMessage("pageNotSupported");
            domainNameEl.style.color = "var(--error-text)";
            showStatus(chrome.i18n.getMessage("pageNotSupported"), "error");
            disableDomainControls();
            return;
        }

        await loadSettingsForDomain(currentDomain);
        enableDomainControls();
    } else {
        domainNameEl.textContent = chrome.i18n.getMessage("pageNotSupported");
        domainNameEl.style.color = "var(--error-text)";
        showStatus(chrome.i18n.getMessage("pageNotSupported"), "error");
        disableDomainControls();
    }
}

async function loadSettingsForDomain(domain) {
    try {
        const result = await chrome.storage.local.get(["sitePreferences"]);
        const sitePrefs = result.sitePreferences || {};
        updateUIFromSettings(sitePrefs[domain]);
    } catch (error) {
        console.error("Error loading settings:", error);
        showStatus(chrome.i18n.getMessage("loadError"), "error");
    }
}

function updateUIFromSettings(settings) {
    const customCSS = document.getElementById("customCSS");
    const newValue = settings?.customCSS || "";

    if (customCSS.value !== newValue) {
        customCSS.value = newValue;
    }
}

async function saveSettings() {
    if (!currentDomain) {
        showStatus(chrome.i18n.getMessage("pageNotSupported"), "error");
        return;
    }

    const customCSS = document.getElementById("customCSS").value.trim();

    try {
        // Missing fields (enabled/fontFamily/etc.) are fine to omit for a new
        // domain entry - every reader (popup.js, background.js, content.js)
        // already falls back to false/"" for fields it doesn't find.
        const updated = await updateDomainPreference(currentDomain, { customCSS });
        if (!updated) throw new Error("Failed to update preferences");

        showStatus(chrome.i18n.getMessage("saveSuccess", currentDomain), "success");
    } catch (error) {
        console.error("Error saving settings:", error);
        showStatus(chrome.i18n.getMessage("saveError", currentDomain), "error");
    }
}

async function resetSettings() {
    if (!currentDomain) {
        showStatus(chrome.i18n.getMessage("pageNotSupported"), "error");
        return;
    }

    try {
        if (await safeConfirm(chrome.i18n.getMessage("resetConfirm"))) {
            const result = await chrome.storage.local.get(["sitePreferences"]);
            const sitePrefs = result.sitePreferences || {};

            // Preserve original behavior: only write if a preference entry
            // already exists for this domain (nothing to reset otherwise).
            if (sitePrefs[currentDomain]) {
                const updated = await updateDomainPreference(currentDomain, { customCSS: "" });
                if (!updated) throw new Error("Failed to update preferences");
                showStatus(chrome.i18n.getMessage("resetSuccess", currentDomain), "success");
            }
        }
    } catch (error) {
        console.error("Error resetting settings:", error);
        showStatus(chrome.i18n.getMessage("resetError", currentDomain), "error");
    }
}

async function returnToSourceTab() {
    const domain = new URLSearchParams(window.location.search).get("domain");
    if (!domain) {
        window.close();
        return;
    }

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (tab.url && new URL(tab.url).hostname === domain) {
            chrome.tabs.update(tab.id, { active: true });
            window.close();
            return;
        }
    }
    window.close();
}

// ==================== BACKUP & RESTORE ====================

async function backupSettings() {
    try {
        const allSettings = await chrome.storage.local.get(null);

        const backupData = {
            version: "1.0",
            exportDate: new Date().toISOString(),
            extensionName: chrome.i18n.getMessage("extName"),
            extensionVersion: chrome.runtime.getManifest().version,
            settings: {
                sitePreferences: allSettings.sitePreferences || {},
                fontFamily: allSettings.fontFamily || "",
                applyToBody: allSettings.applyToBody || false,
                forceImportant: allSettings.forceImportant || false,
            },
        };

        const jsonData = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;

        const date = new Date().toISOString().split("T")[0];
        a.download = `rtl-helper-backup-${date}.json`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showStatus(chrome.i18n.getMessage("backupSuccess"), "success");
    } catch (error) {
        console.error("Error backing up:", error);
        showStatus(chrome.i18n.getMessage("backupError"), "error");
    }
}

function handleRestoreFile(e) {
    if (!e.target.files.length) return;

    const file = e.target.files[0];
    restoreSettings(file);
}

function restoreSettings(file) {
    if (!file || file.type !== "application/json") {
        showStatus(chrome.i18n.getMessage("invalidFileType"), "error");
        resetFileInput();
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showStatus(chrome.i18n.getMessage("fileTooLarge"), "error");
        resetFileInput();
        return;
    }

    const reader = new FileReader();

    reader.onload = async function (e) {
        try {
            const backupData = JSON.parse(e.target.result);

            if (!backupData.settings?.sitePreferences) {
                showStatus(chrome.i18n.getMessage("invalidBackupFile"), "error");
                resetFileInput();
                return;
            }

            const siteCount = Object.keys(backupData.settings.sitePreferences).length;
            const confirmMessage = chrome.i18n.getMessage("restoreConfirmation", [
                siteCount.toString(),
                backupData.exportDate ? new Date(backupData.exportDate).toLocaleDateString() : chrome.i18n.getMessage("unknownMsg"),
                backupData.extensionVersion || chrome.i18n.getMessage("unknownMsg"),
            ]);

            if (!(await safeConfirm(confirmMessage))) {
                resetFileInput();
                showStatus(chrome.i18n.getMessage("restoreCanceled"), "error");
                return;
            }

            await chrome.storage.local.set(backupData.settings);
            showStatus(chrome.i18n.getMessage("restoreSuccess", [siteCount.toString()]), "success");
            resetFileInput();
        } catch (error) {
            console.error("Restore error:", error);
            showStatus(chrome.i18n.getMessage("fileReadError"), "error");
            resetFileInput();
        }
    };

    reader.onerror = function () {
        showStatus(chrome.i18n.getMessage("fileReadError"), "error");
        resetFileInput();
    };

    reader.readAsText(file);
}

function resetFileInput() {
    document.getElementById("restoreFileInput").value = "";
}

async function safeConfirm(message) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(confirm(message));
        }, 50);
    });
}

// ==================== UI UTILITIES ====================
function setupTextareaTabSupport() {
    const textarea = document.getElementById("customCSS");
    if (!textarea) return;

    const INDENT = "    ";

    // Check if execCommand is supported
    function isExecCommandSupported() {
        try {
            return document.queryCommandSupported("insertText");
        } catch (_) {
            return false;
        }
    }

    const useExecCommand = isExecCommandSupported();

    // Function to insert text at the cursor position with fallback
    function insertTextWithFallback(text) {
        if (useExecCommand) {
            try {
                document.execCommand("insertText", false, text);
                return true;
            } catch (_) {
                // Fallback to setRangeText
            }
        }

        // Fallback method using setRangeText
        try {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.setRangeText(text, start, end, "end");
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        } catch (_) {
            return false;
        }
    }

    function handleTabKey(e) {
        if (e.key === "Escape") {
            textarea.blur();
            return;
        }

        if (e.key !== "Tab") return;

        e.preventDefault();

        try {
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const value = textarea.value;

            const lineStart = value.lastIndexOf("\n", start - 1) + 1;
            let lineEnd = value.indexOf("\n", end);
            if (lineEnd === -1) lineEnd = value.length;

            const selectedText = value.substring(lineStart, lineEnd);
            const lines = selectedText.split("\n");
            let newText;

            if (e.shiftKey) {
                // Dedent
                const newLines = lines.map((line) => {
                    if (line.startsWith(INDENT)) return line.slice(INDENT.length);
                    if (line.startsWith("\t")) return line.slice(1);
                    return line;
                });
                newText = newLines.join("\n");
            } else {
                // Indent
                if (start === end) {
                    insertTextWithFallback(INDENT);
                    return;
                }
                const newLines = lines.map((line) => INDENT + line);
                newText = newLines.join("\n");
            }

            if (newText === selectedText) return;

            // Replace selected text
            textarea.selectionStart = lineStart;
            textarea.selectionEnd = lineEnd;
            insertTextWithFallback(newText);

            // Update selection
            const newLength = newText.length;
            textarea.selectionStart = lineStart;
            textarea.selectionEnd = lineStart + newLength;

        } catch (error) {
            console.debug("Tab handler error:", error);
        }
    }

    textarea.addEventListener("keydown", handleTabKey);
}

function enableDomainControls() {
    const controls = ["customCSS", "saveBtn", "resetBtn"];
    controls.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });
}

function disableDomainControls() {
    const controls = ["customCSS", "saveBtn", "resetBtn"];
    controls.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
    });
}

function showStatus(message, type) {
    const element = document.getElementById("saveStatus");

    if (element._statusTimeout) {
        clearTimeout(element._statusTimeout);
    }

    element.textContent = message;
    element.className = "save-status " + type;
    element.classList.add("visible");

    element._statusTimeout = setTimeout(() => {
        element.classList.remove("visible");
    }, 3000);
}