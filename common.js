/**
 * Validates if a URL is accessible for the extension to work on
 * @param {string} url - The full URL to validate
 * @returns {boolean} - True if the URL is accessible
 */
function isAccessibleURL(url) {
    try {
        if (!url) return false;

        const u = new URL(url);
        const hostname = u.hostname.toLowerCase();

        // Only allow http and https protocols
        if (!['http:', 'https:'].includes(u.protocol)) return false;

        // Validate domain format
        const domainRegex = /^(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/i;
        if (!domainRegex.test(hostname)) return false;

        // Block extension store URLs and system pages
        const blockedDomains = [
            'addons.mozilla.org',
            'addons.opera.com',
            'chrome.google.com',
            'chromewebstore.google.com',
            'edge.microsoft.com',
            'microsoftedge.microsoft.com',
            'copilot.microsoft.com',
        ];

        if (blockedDomains.some(d => hostname === d || hostname.endsWith('.' + d))) {
            return false;
        }

        return true;
    } catch (error) {
        console.error("URL validation error:", error);
        return false;
    }
}

/**
 * Validates if a domain string is accessible
 * @param {string} domain - The domain to validate
 * @returns {boolean} - True if the domain is accessible
 */
function isDomainAccessible(domain) {
    if (!domain) return false;
    const fakeUrl = `https://${domain}`;
    return isAccessibleURL(fakeUrl);
}

/**
 * Extracts hostname from a full URL
 * @param {string} url - The full URL
 * @returns {string} - The lowercase hostname or empty string if invalid
 */
function extractHostname(url) {
    try {
        if (!url) return "";
        return new URL(url).hostname.toLowerCase();
    } catch (error) {
        console.error("Error extracting hostname:", error);
        return "";
    }
}

/**
 * Safely parses and retrieves storage data
 * @param {string} key - The storage key
 * @returns {Promise<any>} - The stored data or null if not found
 */
async function safeStorageGet(key) {
    try {
        const result = await chrome.storage.local.get([key]);
        return result[key] || null;
    } catch (error) {
        console.error(`Error getting storage key '${key}':`, error);
        return null;
    }
}

/**
 * Safely sets storage data
 * @param {string} key - The storage key
 * @param {any} value - The value to store
 * @returns {Promise<boolean>} - True if successful
 */
async function safeStorageSet(key, value) {
    try {
        await chrome.storage.local.set({ [key]: value });
        return true;
    } catch (error) {
        console.error(`Error setting storage key '${key}':`, error);
        return false;
    }
}

/**
 * Atomically merges partial settings into a domain's stored preferences.
 * Always re-reads storage right before writing, so it never clobbers
 * changes made by another context (popup / options / background) that
 * happened after this context last cached sitePreferences.
 * @param {string} domain - The domain to update
 * @param {object} partialSettings - Fields to merge into the domain's settings
 * @returns {Promise<object|null>} - The full updated sitePreferences map, or null on failure
 */
async function updateDomainPreference(domain, partialSettings) {
    try {
        const result = await chrome.storage.local.get(["sitePreferences"]);
        const sitePrefs = result.sitePreferences || {};

        sitePrefs[domain] = {
            ...sitePrefs[domain],
            ...partialSettings,
            lastUsed: new Date().toISOString(),
        };

        await chrome.storage.local.set({ sitePreferences: sitePrefs });
        return sitePrefs;
    } catch (error) {
        console.error(`Error updating preferences for domain '${domain}':`, error);
        return null;
    }
}

/**
 * Atomically removes a domain's stored preferences.
 * Re-reads storage right before writing for the same reason as updateDomainPreference.
 * @param {string} domain - The domain to remove
 * @returns {Promise<object|null>} - The full updated sitePreferences map, or null on failure
 */
async function removeDomainPreference(domain) {
    try {
        const result = await chrome.storage.local.get(["sitePreferences"]);
        const sitePrefs = result.sitePreferences || {};

        if (sitePrefs[domain]) {
            delete sitePrefs[domain];
            await chrome.storage.local.set({ sitePreferences: sitePrefs });
        }

        return sitePrefs;
    } catch (error) {
        console.error(`Error removing preferences for domain '${domain}':`, error);
        return null;
    }
}

// Export functions for use in modules
export {
    isAccessibleURL,
    isDomainAccessible,
    extractHostname,
    safeStorageGet,
    safeStorageSet,
    updateDomainPreference,
    removeDomainPreference,
};
