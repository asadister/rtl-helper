// i18n.js - translation management script
document.addEventListener("DOMContentLoaded", function () {
    // Translate all elements with the data-i18n attribute
    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach((element) => {
        const messageName = element.getAttribute("data-i18n");
        const translation = chrome.i18n.getMessage(messageName);

        if (translation) {
            if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
                element.placeholder = translation;
            } else if (element.tagName === "OPTION") {
                element.textContent = translation;
            } else {
                element.textContent = translation;
            }
        }

        // Get browser language
        const browserLanguage = chrome.i18n.getUILanguage();

        // Detect RTL languages
        const rtlLanguages = ["fa", "ar", "he", "ur"];
        const isRTL = rtlLanguages.includes(browserLanguage.split("-")[0]);

        // Set direction based on language
        document.documentElement.dir = isRTL ? "rtl" : "ltr";
        document.documentElement.lang = browserLanguage;
    });
});