// ===== DOUBLE INJECTION PREVENTION =====
if (typeof window.__rtlHelperLoaded === "undefined") {
    window.__rtlHelperLoaded = true;

    let currentStyleId = null;
    let styleElement = null;
    let firstRun = true;

    const appliedSettings = {
        enabled: null,
        fontFamily: null,
        customCSS: null,
        applyToBody: null,
        forceImportant: null,
        overrideFont: null,
        applyDefaultStyles: null,
    };

    /**
     * Removes all RTL Helper style elements from the DOM
     */
    function removeAllRTLStyleElements() {
        const existingStyles = document.querySelectorAll('style[id^="rtl-helper-"]');
        existingStyles.forEach((style) => {
            if (style.parentNode) {
                style.remove();
                console.debug("Removed existing RTL style:", style.id);
            }
        });
    }

    /** Checks if the new settings differ from the applied settings
     * @param {object} newSettings - The new settings to compare
     * @returns {boolean} - True if settings have changed
     */
    function hasSettingsChanged(newSettings) {
        if (appliedSettings.enabled !== newSettings.state) return true;
        return (
            appliedSettings.fontFamily !== newSettings.fontFamily ||
            appliedSettings.customCSS !== newSettings.customCSS ||
            appliedSettings.applyToBody !== newSettings.applyToBody ||
            appliedSettings.overrideFont !== newSettings.overrideFont ||
            appliedSettings.forceImportant !== newSettings.forceImportant ||
            appliedSettings.applyDefaultStyles !== newSettings.applyDefaultStyles
        );
    }

    /** Updates the stored applied settings
     * @param {object} settings - The new settings to store
     */
    function updateAppliedSettings(settings) {
        appliedSettings.enabled = settings.state;
        appliedSettings.fontFamily = settings.fontFamily || "";
        appliedSettings.customCSS = settings.customCSS || "";
        appliedSettings.applyToBody = settings.applyToBody || false;
        appliedSettings.forceImportant = settings.forceImportant || false;
        appliedSettings.overrideFont = settings.overrideFont || false;
        // Defaults to true: existing saved settings predate this field and
        // must keep behaving exactly as before (default RTL styles applied).
        appliedSettings.applyDefaultStyles = settings.applyDefaultStyles !== false;
    }

    /**
     * Clears the stored applied settings
     */
    function clearAppliedSettings() {
        appliedSettings.enabled = null;
        appliedSettings.fontFamily = null;
        appliedSettings.customCSS = null;
        appliedSettings.applyToBody = null;
        appliedSettings.forceImportant = null;
        appliedSettings.overrideFont = null;
        appliedSettings.applyDefaultStyles = null;
    }

    /** Applies RTL styles to the page
     * @param {string} fontFamily - The font family to apply
     * @param {string} customCSS - Additional custom CSS
     * @param {boolean} applyToBody - Whether to apply styles to body element
     * @param {boolean} forceImportant - Whether to add !important to all rules
     * @param {boolean} overrideFont - Whether to override the font
     * @param {boolean} applyDefaultStyles - Whether to apply the extension's default RTL styling
     */
    function applyRTLStyles(fontFamily, customCSS, applyToBody = false, forceImportant = false, overrideFont = false, applyDefaultStyles = true) {
        try {
            // ===== CLEANUP BEFORE APPLY =====
            removeAllRTLStyleElements();

            const cssCode = generateCSSCode(fontFamily, customCSS, applyToBody, forceImportant, overrideFont, applyDefaultStyles);

            // Check if element still exists in DOM
            const isValidElement = styleElement && styleElement.parentNode && document.contains(styleElement);

            if (isValidElement) {
                // Update existing style element
                styleElement.textContent = cssCode;
                console.debug("RTL styles updated");
            } else {
                // Clean up stale reference
                styleElement = null;
                currentStyleId = null;

                // Create new style element
                styleElement = document.createElement("style");
                currentStyleId = "rtl-helper-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
                styleElement.id = currentStyleId;
                styleElement.textContent = cssCode;
                document.head.appendChild(styleElement);
                console.debug("RTL styles applied (new element)");
            }
        } catch (error) {
            console.error("Error applying RTL styles:", error);
            // Cleanup on error
            styleElement = null;
            currentStyleId = null;
            throw error;
        }
    }

    /**
     * Removes RTL styles from the page
     */
    function removeRTLStyles() {
        try {
            removeAllRTLStyleElements();
            styleElement = null;
            currentStyleId = null;
            clearAppliedSettings();
        } catch (error) {
            console.error("Error removing RTL styles:", error);
            styleElement = null;
            currentStyleId = null;
            clearAppliedSettings();
        }
    }

    /**
     * Builds a CSS block with the given selector and rules.
     * @param {string} selector - The CSS selector.
     * @param {string[]} rules - The CSS rules.
     * @returns {string} The generated CSS block.
     */
    function buildBlock(selector, rules) {
        const body = rules
            .filter(Boolean)
            .map((r) => `  ${r}`)
            .join("\n");
        return `${selector} {\n${body}\n}`;
    }

    /**
     * Get the CSS @import rule for a font family.
     * @param {string} fontFamily - The font family name.
     * @returns {string} The CSS @import statement, or an empty string if not available.
     */
    function getFontImport(fontFamily) {
        const fontLocal = {
            "'Vazirmatn', sans-serif": `@import url('${chrome.runtime.getURL("fonts/vazirmatn-font.css")}');`,
        };

        const fontCDNs = {
            "'Estedad', sans-serif": "@import url('https://fonts.googleapis.com/css2?family=Estedad:wght@100..900&display=swap');",
            "'Markazi Text', serif": "@import url('https://fonts.googleapis.com/css2?family=Markazi+Text:wght@400..700&display=swap');",
            "'Parastoo', sans-serif": "@import url('https://fonts.googleapis.com/css2?family=Parastoo:wght@400..700&display=swap');",
            "'Noto Sans Arabic', sans-serif": "@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@100..900&display=swap');",
            "'Amiri', serif": "@import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap');",
            "'Cairo', sans-serif": "@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@200..1000&display=swap');",
            "'Heebo', sans-serif": "@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@100..900&display=swap');",
            "'Rubik', sans-serif": "@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@300..900&display=swap');",
            "'Noto Nastaliq Urdu', serif": "@import url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400..700&display=swap');",
        };

        return fontLocal[fontFamily] || fontCDNs[fontFamily] || "";
    }

    /** Generates the complete CSS code for RTL styling
     * @param {string} fontFamily - The font family to apply
     * @param {string} customCSS - Additional custom CSS
     * @param {boolean} applyToBody - Whether to apply styles to body element
     * @param {boolean} forceImportant - Whether to add !important to all rules
     * @param {boolean} overrideFont - Whether to override the font
     * @param {boolean} applyDefaultStyles - Whether to apply the extension's default RTL styling
     * @returns {string} - The generated CSS code
     */
    function generateCSSCode(fontFamily, customCSS, applyToBody = false, forceImportant = false, overrideFont = false, applyDefaultStyles = true) {
        const imp = forceImportant ? " !important" : "";
        const parts = [];

        // Font import
        const fontImport = getFontImport(fontFamily);
        if (fontImport) parts.push(fontImport);

        // :root
        const rootRules = [
            "--text-direction: rtl;",
            "--text-align: start;",
            fontFamily && !overrideFont && `--font-family: ${fontFamily};`,
            applyToBody && `direction: var(--text-direction)${imp};`,
            applyToBody && `text-align: var(--text-align)${imp};`,
        ];
        parts.push(buildBlock(":root", rootRules));

        // body
        const bodyRules = [];

        if (applyToBody) {
            bodyRules.push(`direction: inherit${imp};`);
            bodyRules.push(`text-align: inherit${imp};`);
        }

        if (fontFamily && !overrideFont) {
            bodyRules.push(`font-family: var(--font-family)${imp};`);
        }

        if (bodyRules.length > 0) {
            parts.push(buildBlock("body", bodyRules));
        }

        // override font
        if (fontFamily && overrideFont) {
            const overrideSelector = [
                '*',
                ':not(pre):not(pre *):not(code):not(code *):not(svg):not(svg *)',
                ':not([class*="fa-"]):not([class*="bi-"]):not([class*="ion-"]):not([class*="material"])',
                ':not([class*="ico" i]):not([data-cds*="icon" i])',
            ].join('');
            parts.push(buildBlock(overrideSelector, [`font-family: ${fontFamily}${imp};`]));
        }

        // RTL elements
        const rtlSelectors = [
            'p, li, ul, ol, h1, h2, h3, h4, h5, h6, blockquote',
            'table:not([dir="ltr"]), table:not([dir="ltr"]) :where(th, td)',
            'input:not([type="url"]):not([type="email"]):not([type="tel"]):not([type="number"]):not([type="password"]), textarea, select',
        ];

        const rtlRules = [];

        if (applyDefaultStyles) {
            rtlRules.push(`direction: var(--text-direction)${imp};`);
            rtlRules.push(`text-align: var(--text-align)${imp};`);
        }

        if (fontFamily && !overrideFont) {
            rtlRules.push(`font-family: var(--font-family)${imp};`);
        }

        if (rtlRules.length > 0) {
            rtlSelectors.forEach((sel) => parts.push(buildBlock(sel, rtlRules)));
        }

        if (applyDefaultStyles) {
            parts.push(buildBlock("pre, code", [`direction: ltr${imp};`, `text-align: start${imp};`]));
        }

        if (customCSS) parts.push(customCSS);

        return parts.join("\n\n");
    }

    /**
     * Message listener for applying/removing RTL styles
     * @param {object} request - The message request
     * @param {object} sender - The message sender
     * @param {function} sendResponse - The response callback
     * @returns {boolean} - True to indicate async response
     */
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        console.debug("Content:", request.action, request.source);

        try {
            switch (request.action) {
                case "applyRTL": {
                    const styleElement = document.querySelector('style[id^="rtl-helper-"]');
                    const styleShouldBeRemoved = styleElement && !request.state;
                    const styleMissing = !styleElement && request.state;
                    const mustChange = hasSettingsChanged(request) || styleMissing || styleShouldBeRemoved;
                    const isTurnOnRequest = request.state && !appliedSettings.enabled;

                    if (mustChange) {
                        try {
                            if (request.state) {
                                updateAppliedSettings(request);
                                applyRTLStyles(
                                    request.fontFamily,
                                    request.customCSS,
                                    request.applyToBody,
                                    request.forceImportant,
                                    request.overrideFont,
                                    request.applyDefaultStyles !== false
                                );
                                console.debug(
                                    styleMissing && !firstRun && !isTurnOnRequest
                                        ? "Settings applied (SPI detected)"
                                        : "Settings applied (changed)"
                                );
                                firstRun = false;
                            } else {
                                removeRTLStyles();
                                console.debug("RTL disabled (forced cleanup)");
                            }
                        } catch (applyError) {
                            console.error("Error applying settings:", applyError);
                            if (!request.state) {
                                removeRTLStyles();
                            }
                            throw applyError;
                        }
                    } else {
                        console.debug("Settings unchanged, skipping apply");
                    }

                    sendResponse({ success: true, changed: mustChange });
                    break;
                }

                default:
                    sendResponse({ success: false, error: "Unknown action" });
            }
        } catch (error) {
            console.error("Content: Error processing message:", error);
            sendResponse({ success: false, error: error.message });
        }

        return true;
    });
} else {
    console.debug("RTL helper already loaded, skipping injection");
}
