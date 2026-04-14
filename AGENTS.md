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
- `background.js`: Service worker - tem acesso a APIs restritas (chrome.tabs, etc)
- `content.js`: Content script que roda no contexto WhatsApp Web
- `injected.js`: Lógica principal injetada no contexto da página (acessa WPP.connect API)
- `popup.js`/`popup.html`: UI do popup da extensão
- `sidebar.html`/`sidebar.js`: UI do side panel
- `libs/`: Bibliotecas third-party (JSZip, wppconnect-wa.js)

### Manifest V3 Moderno (2025+)

Para máxima compatibilidade Chrome + Edge:

```json
{
  "manifest_version": 3,
  "name": "Extensão",
  "version": "1.0",
  "icons": {
    "16": "icon.png",
    "48": "icon.png",
    "128": "icon.png"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "permissions": ["activeTab", "scripting", "sidePanel", "storage"],
  "host_permissions": ["https://web.whatsapp.com/*"],
  "action": {
    "default_icon": { "16": "icon.png", "48": "icon.png", "128": "icon.png" }
  },
  "side_panel": {
    "default_path": "sidebar.html",
    "openPanelOnClick": true
  }
}
```

**Boas práticas:**
- Definir `icons` no nível raiz
- Usar `type": "module"` no background service worker
- Preferir `activeTab` em vez de `tabs` quando possível
- Usar `openPanelOnClick: true` no side_panel para abrir automaticamente

### Communication Patterns

**ATENÇÃO - Manifest V3 Restrições Críticas:**
- Content scripts NÃO têm acesso direto a `chrome.tabs` API
- Para operações de tabs, SEMPRE usar background service worker via messaging
- Padrão: content.js → chrome.runtime.sendMessage → background.js → chrome.tabs API

**Content Script → Background (requisição):**
```javascript
const response = await chrome.runtime.sendMessage({ action: "get_active_tab" });
if (response?.success) {
    const tab = response.tab;
}
```

**Background → Content Script (resposta):**
```javascript
chrome.runtime.sendMessage({ action: "result", data: ... })
```

**Content Script ↔ Injected Script (same page):**
```javascript
window.dispatchEvent(new CustomEvent('WPP_EXT_STATUS', {detail: message}))
```

**Injected Script → Content Script:**
```javascript
window.dispatchEvent(new CustomEvent('WPP_EXT_STATUS', {detail: message}))
```

**Content Script → Background:**
```javascript
chrome.runtime.sendMessage({action: "update_status", message: "..."})
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
- **NUNCA usar chrome.tabs em content scripts** - fazer via background service worker
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

---

## Aprendizados e Erros Constantes

### Erros Comuns e Soluções

| Erro | Causa | Solução |
|------|-------|---------|
| `Cannot read properties of undefined (reading 'query')` | Content script tentando usar `chrome.tabs.query` diretamente | ustilizar background service worker: content.js → chrome.runtime.sendMessage → background.js |
| `chrome.runtime undefined` | Script executando fora do contexto da extensão | Verificar se está no content script correto (matches no manifest) |
| `Extension context invalidated` | Extensão precisando ser recarregada | Recarregar em chrome://extensions/ |

### Regras Mandatórias

1. **SEMPRE versionar**: Após qualquer mudança significativa, incrementar versão no manifest.json
2. **SEMPRE usar background para chrome.tabs**: Content script não tem acesso direto no Manifest V3
3. **SEMPRE verificar APIs**: Validar `chrome.runtime?.id` antes de usar qualquer API
4. **SEMPRE adicionar debugs sistemáticos**: Logs estruturados com step counter em código complexo

### Debug Sistemático - Padrão

```javascript
const DEBUG = {
    step: 0,
    log: function(msg) {
        console.log(`[DEBUG:${String(this.step).padStart(2,'0')}] ${msg}`);
        this.step++;
    },
    error: function(context, err) {
        console.error(`[ERROR:${String(this.step).padStart(2,'0')}] ${context}:`, {
            message: err?.message || String(err),
            type: err?.constructor?.name || typeof err,
            stack: err?.stack
        });
        this.step++;
    }
};
```

### Padrão de Mensagens Background Service Worker

O service worker (background.js) DEVE sempre retornar resposta com formato consistente:

```javascript
// Sucesso
sendResponse({ success: true, data: ... })

// Erro
sendResponse({ success: false, error: "mensagem de erro" })
```

O content script DEVE verificar `response?.success` antes de usar os dados.

### Bug Crítico - Cliques Não Funcionam

**Sintoma:** Botões no sidebar não respondem a cliques.

**Causa:** Funções helpers (ex: `const $ = id => document.getElementById(id)`) sendo usadas ANTES de serem definidas no código. JavaScript executaimmediately e quebra ao carregar.

**Solução:** Definir TODOS os helpers e funções utilitárias NO TOPO do arquivo, antes de qualquer código que os use.

```javascript
// helpers.js - SEMPRE no topo
const $ = id => document.getElementById(id);

// resto do código pode usar $ agora
```
