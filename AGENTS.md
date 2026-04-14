# AGENTS.md

## Project Overview

This is a Chrome extension (Manifest V3) that extracts WhatsApp Web chat messages and audio files from the last 24 hours. It uses the WPP.connect library to access WhatsApp data and generates a ZIP file with a text transcript, audio files, and JSON metadata.

## Build/Test/Lint Commands

This project has no build system, package.json, or automated testing. It's a vanilla JavaScript extension that loads directly into Chrome.

**Loading the extension:**
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select this directory

**Testing:**
- Manual testing only - open WhatsApp Web, open a chat, click the extension icon, and click "Extract"
- Check the console (F12) on the WhatsApp Web tab for debug messages
- No automated test suite exists

**Linting/Formatting:**
- No linting tools configured
- Follow existing code style (see guidelines below)

## Code Style Guidelines

### File Structure and Architecture

- `manifest.json`: Extension configuration (Manifest V3)
- `content.js`: Content script that runs in the WhatsApp Web context and injects the main script
- `injected.js`: Main business logic loaded into WhatsApp Web page context (has access to WPP.connect API)
- `popup.js`/`popup.html`: Extension popup UI
- `libs/`: Third-party libraries (JSZip, wppconnect-wa.js)

### Communication Patterns

**Popup to Content Script:**
```javascript
chrome.tabs.sendMessage(tabId, {action: "start_extraction"})
```

**Content Script to Popup:**
```javascript
chrome.runtime.sendMessage({action: "update_status", message: "..."})
```

**Injected Script to Content Script:**
```javascript
window.dispatchEvent(new CustomEvent('WPP_EXT_STATUS', {detail: message}))
```

### Naming Conventions

- Functions: camelCase (e.g., `getSenderName`, `injectScript`)
- Variables: camelCase (e.g., `chatId`, `audioCount`)
- Constants: ALL_CAPS with underscores (e.g., `JSZIP_URL`, `WPP_URL`)
- Event types: SCREAMING_SNAKE_CASE with prefix (e.g., `WPP_EXT_STATUS`)
- HTML IDs: camelCase (e.g., `btnExtract`, `status`)
- CSS classes: kebab-case (e.g., `log-entry`)

### Indentation and Formatting

- Use 2 spaces for indentation (not tabs)
- Use `const` for variables that don't change, `let` for variables that do
- Legacy `var` usage exists but prefer `const`/`let` in new code
- Add blank lines between major sections of code
- Align closing braces with opening statements

### Comments and Documentation

- Write comments in Portuguese (existing codebase pattern)
- Use `//` for single-line comments
- Add section headers with `// --- Section Name ---`
- Include emoji indicators for logging (🔄, ⏳, 📊, ✅, ❌)
- Comment complex logic, especially WhatsApp API interactions

### Error Handling

- Always wrap async operations in try-catch blocks
- Log errors to console: `console.error('Context:', error)`
- Dispatch status events to UI: `window.dispatchEvent(new CustomEvent('WPP_EXT_STATUS', {detail: error.message}))`
- Provide fallback values where possible
- Check for null/undefined before accessing nested properties (use optional chaining `?.`)

### Chrome Extension APIs

- Use `chrome.runtime.getURL()` for extension file paths
- Use `chrome.tabs.query({active: true, currentWindow: true})` to get active tab
- Use `chrome.runtime.onMessage.addListener()` for message handling
- Always check `chrome.runtime.lastError` after chrome API calls
- Return `true` from message listeners for async responses

### Async/Await Patterns

- Prefer `async/await` over promises when possible
- Use `Promise` wrapper for loading external scripts
- Add delays between media downloads: `await new Promise(resolve => setTimeout(resolve, 300))`
- Handle blob conversions for media files

### DOM Manipulation

- Use `document.createElement()` and `appendChild()` for dynamic elements
- Clean up injected scripts after loading: `script.onload = function() { this.remove(); }`
- Remove old injections before creating new ones: check for existing element IDs
- Use `window.dispatchEvent()` for cross-context communication

### WhatsApp Web Integration

- Access WPP API through `window.WPP` (loaded from libs/wppconnect-wa.js)
- Wait for WPP to be ready: `window.WPP.webpack.onReady()`
- Get active chat: `window.WPP.chat.getActiveChat()`
- Get messages: `window.WPP.chat.getMessages(chatId, {count: 1000})`
- Download media: `window.WPP.chat.downloadMedia(msg.id)`
- Contact info: `window.WPP.contact.get(chatId)`

### Message Type Handling

Check `msg.type` for: 'chat', 'image', 'video', 'sticker', 'document', 'location', 'vcard', 'multi_vcard', 'audio', 'ptt'
- Text messages: `msg.body`
- Media thumbnails: Don't concatenate `msg.body` (contains base64)
- Captions: Check `msg.caption` for image/video captions
- Audio files: Handle both 'audio' and 'ptt' (push-to-talk) types

### Metadata and File Naming

- Audio filename format: `audio_TIMESTAMP_ID.extension`
- Use `toISOString()` and replace `[:.]` with `-` for timestamps
- Clean message IDs with regex: `replace(/[^a-zA-Z0-9]/g, '')`
- Clean chat names for filenames: `replace(/[^a-z0-9]/gi, '_')`

### Zip File Generation (JSZip)

- Create zip instance: `new JSZip()`
- Create folders: `zip.folder("folder_name")`
- Add files: `zip.file("filename", content)` or `folder.file("filename", blob)`
- Generate blob: `await zip.generateAsync({type: "blob"})`
- Download: Create temporary anchor tag, trigger click, revoke URL

### UI Styling

- WhatsApp-like colors: `#075e54` (green header), `#25d366` (primary button), `#128c7e` (hover)
- Font: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif
- Disabled button: `#ccc` background
- Status div: white background, scrollable, max-height 150px
