# RTL Helper - Browser Extension for RTL Languages

![Version](https://img.shields.io/badge/version-4.11.2-4caf50)
![License](https://img.shields.io/badge/license-free%20for%20personal%20%26%20commercial%20use-blue)
![Chrome](https://img.shields.io/badge/Chrome-88%2B-4285F4)
![Firefox](https://img.shields.io/badge/Firefox-142%2B-FF7139)
![Edge](https://img.shields.io/badge/Edge-88%2B-0078D7)

A user-friendly browser extension for **Chrome/Chromium** and **Firefox** that provides better support for Right-to-Left (RTL) languages like Persian, Arabic, Urdu, and Hebrew.


## ✨ Features

- 🎯 **Per-Site Settings** - Configure different RTL preferences for each website
- ✏️ **Font Selection** - Choose from 10+ RTL fonts including Vazirmatn (local) and more from CDN
- 🧩 **Custom CSS** - Add personalized styles for each domain
- 💾 **Backup & Restore** - Export and import all your settings
- 🌐 **Multi-Language Support** - Persian, Arabic, Urdu, Hebrew, and English
- ⚡ **Optimized Performance** - Event-driven architecture, smart debouncing, and no redundant caching
- 🔒 **Security** - Blocks system pages (Chrome Store, Firefox Add-ons, Edge Store, etc.)
- ⌨️ **Keyboard Shortcut** - Quick toggle with `Ctrl+Shift+1` (Windows/Linux) or `Cmd+Shift+1` (macOS)
- 📱 **Mobile Support** - Fully optimized for Firefox and Edge on Mobile
- 🎨 **Dark Mode** - Automatic support for system dark/light themes


## 📦 Installation

### Chrome / Chromium / Brave / Opera
1. Visit the [Chrome Web Store](https://chromewebstore.google.com/detail/rtl-helper/odficamdfmgmmndjeeopejealfjjenkg)
2. Click "Add to Chrome"

### Microsoft Edge (Desktop & Mobile)
1. Visit the [Edge Add-ons Store](https://microsoftedge.microsoft.com/addons/detail/rtl-helper/mjenkioeoopchenpinllklipigionchk)
2. Click "Get"

### Firefox (Desktop & Mobile)
1. Visit the [Firefox Add-ons Store](https://addons.mozilla.org/firefox/addon/rtl-helper/)
2. Click "Add to Firefox"

### Manual Installation (for development)
1. Download or clone this repository
2. Open your browser's extensions page:
   - **Chrome/Edge/Brave/Opera**: `chrome://extensions/` or `edge://extensions/`
   - **Firefox**: `about:debugging#/runtime/this-firefox`
3. Enable "Developer mode" (Chrome/Edge/Brave/Opera) or "Load Temporary Add-on" (Firefox)
4. Load the extension:
   - **Chrome/Edge/Brave/Opera**: Click "Load unpacked" and select the `chrome/` build folder (uses `manifest.chrome.json` → `manifest.json`)
   - **Firefox**: Click "Load Temporary Add-on" and select `manifest.json` inside the `firefox/` build folder (uses `manifest.firefox.json` → `manifest.json`)

> **Note:** Chrome and Firefox ship from **two different manifests** (see [Cross-Browser Manifest](#-cross-browser-manifest) below). Make sure you're loading the right build folder for the browser you're testing in.

## 🎮 How to Use

### Quick Settings Popup
- **Toggle RTL**: Enable/disable RTL for the current website
- **Font Selection**: Choose from 12+ predefined RTL fonts
- **Override Font**: Force the selected font across the entire page
- **Apply to Page**: Apply RTL direction to the entire page
- **Force Styles**: Use `!important` to override conflicting styles
- **Forget this site**: Remove saved settings for the current site

### Advanced Settings Page
The options page is split into two clearly separated sections:
- **Settings for this site** (green accent) - Custom CSS for the domain you arrived from
- **Backup & restore** (amber accent) - global, applies to every saved site, not just the current one

### Keyboard Shortcut
- **Windows/Linux**: `Ctrl+Shift+1`
- **macOS**: `Cmd+Shift+1`

## 🧱 Architecture

### Hybrid Architecture Design
- **UI Components** (`popup.js`, `options.js`): Directly read from and write to storage, providing instant feedback without caching delays (Event-Driven). Every write goes through the shared `updateDomainPreference()` / `removeDomainPreference()` helpers in `common.js`, which re-read storage immediately before writing — this keeps two contexts open at once (e.g. popup + options page on different domains) from silently overwriting each other's changes.
- **Background Script** (`background.js`): Listens to `storage.onChanged` events and propagates changes to all relevant tabs using debounced messaging.
- **Content Script** (`content.js`): Applies styles to web pages with double-injection prevention and automatic cleanup.

### 🦊 Cross-Browser Manifest
Chrome and Firefox handle MV3 background execution differently, so we ship **two manifests from one shared codebase**:

| | Chrome / Edge / Brave / Opera | Firefox |
|---|---|---|
| Background | `service_worker` (terminates on idle, can restart mid-session) | `scripts` — a non-persistent **event page** (Firefox's own MV3 background model, longer-lived than a Chromium service worker) |
| `scripting` permission | Present — used as a fallback to re-inject `content.js` if a tab's content script stops responding after a SW restart | Deliberately **omitted** — in practice, Firefox's event page keeps the connection alive across enable/disable and browser reload, so the fallback path is never needed |
| Manifest file | `manifest.chrome.json` | `manifest.firefox.json` (adds `browser_specific_settings.gecko`) |

`background.js`, `content.js`, and `common.js` are byte-identical across both builds — only the manifest differs. If you change background/messaging logic, test both browsers; a fix that relies on `chrome.scripting` will silently no-op on Firefox by design.

### Key Modules
- **background.js** — Event-driven storage listener, tab state management, debounced updates, and icon management
- **content.js** — Style injection, DOM management, SPI detection, and message handling
- **popup.js** — Quick settings UI with real-time updates
- **options.js** — Advanced settings UI with backup/restore and custom CSS editor
- **common.js** — Shared utilities: URL validation, storage helpers (with race-safe read-modify-write), domain extraction

### Smart Features
- **Debouncing**: Prevents excessive updates when settings change rapidly
- **State Tracking**: Per-tab state map prevents duplicate messages and race conditions
- **Icon Sync**: Extension icon color reflects RTL status per tab
- **SPI Detection**: Automatically recovers styles if they're removed by other scripts

## 🏗️ Project Structure

```
.
├── manifest.chrome.json   # Chrome/Edge/Brave/Opera manifest (service_worker)
├── manifest.firefox.json  # Firefox manifest (event page, no `scripting` permission)
├── background.js          # Shared - manages settings and state
├── content.js             # Shared - applies styles to web pages
├── popup/
│   ├── popup.html         # Quick settings UI
│   ├── popup.js           # Quick settings logic
│   └── popup.css          # Quick settings styles
├── options.html            # Advanced settings page (site-scope + global-scope sections)
├── options.js              # Advanced settings logic
├── options.css             # Advanced settings styles
├── i18n.js                 # Translation manager
├── common.js                # Shared utility functions
├── fonts/                  # Local font files
├── icons/                  # Extension icons (default + active state)
├── store-listing.en.txt    # Plain-text copy for store listings (English)
├── store-listing.fa.txt    # Plain-text copy for store listings (Persian)
└── _locales/                # Translations
    ├── fa/                  # Persian
    ├── ar/                  # Arabic
    ├── he/                  # Hebrew
    ├── ur/                  # Urdu
    └── en/                  # English
```

## 🌍 Browser Support

| Browser | Desktop | Mobile | Minimum Version |
|---------|---------|---------|-----------------|
| **Chrome / Chromium** | ✅ Full | ❌ | 88+ |
| **Microsoft Edge** | ✅ Full | ✅ Full | 88+ |
| **Firefox** | ✅ Full | ✅ Full | 142+ |

> **Note:** Chrome, Brave, Opera, and Vivaldi on Mobile do not support browser extensions. Firefox and Edge on Mobile do support extensions, and RTL Helper is fully optimized for both.

## 🔐 Privacy

RTL Helper stores all settings locally on your device (`chrome.storage.local`) — nothing is sent to any server, and there is no analytics or tracking of any kind. Full privacy policy: **https://peyvandnegar.ir/rtl-helper-browser-extension/**

## 🐛 Known Issues

- Some websites with hardcoded styles may need the "Force Styles" option
- For Mobile: Keyboard shortcuts are not available (popup only)

## 💡 Tips

- Use "Force Styles" if styles aren't being applied correctly
- Use "Override Font" to force a consistent font across the entire page
- Custom CSS is appended to default styles for each domain
- Settings are stored locally - no cloud sync (privacy-first)
- Use the backup feature before updating to preserve your preferences

## 📝 License

This project is free for personal and commercial use.

## 👨‍💻 Contributing

Issues and pull requests are welcome! If you're touching `background.js`, `content.js`, or `common.js`, please test in both a Chromium browser and Firefox — see [Cross-Browser Manifest](#-cross-browser-manifest) for why the two can behave differently.

## 🌟 Support the Project

If you find this extension useful, consider:
- ⭐ Starring the repository
- 🐛 Reporting issues
- 🌐 Contributing translations

---

**Version:** 4.11.2
**Last Updated:** August 1, 2026
