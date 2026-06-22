// content.ts - Content script que roda no contexto WhatsApp Web
// Comunica com background service worker via chrome.runtime.sendMessage

// ── Systematic Debug ──────────────────────────────────────────────
const DEBUG = {
  prefix: '[CONTENT]' as const,
  initialized: false,
  serviceWorkerAlive: null as boolean | null,
  reconnectionAttempts: 0,
  maxReconnectAttempts: 3,
  step: 0,

  init() {
    if (this.initialized) return;
    this.initialized = true;
    console.log(`${this.prefix}:🚀 Inicializado`, {
      chromeDefined: typeof chrome !== 'undefined',
      chromeRuntime: chrome?.runtime?.id ? 'OK' : 'undefined',
      location: window.location?.href?.slice(0, 50),
    });
  },

  log(msg: string, data?: unknown) {
    const out = `${this.prefix}:${String(this.step).padStart(2, '0')} ${msg}`;
    if (data !== undefined) console.log(out, data);
    else console.log(out);
    this.step++;
  },

  error(context: string, err: unknown) {
    console.error(`${this.prefix}:${String(this.step).padStart(2, '0')} ERRO[${context}]`, {
      message: (err as Error)?.message ?? String(err),
      type: (err as Error)?.constructor?.name ?? typeof err,
      stack: (err as Error)?.stack,
    });
    this.step++;
  },

  warn(msg: string, data?: unknown) {
    console.warn(`${this.prefix}:${String(this.step).padStart(2, '0')} WARN: ${msg}`, data);
    this.step++;
  },

  separator(label = '') {
    console.log(`${this.prefix} --- ${label || 'SEPARATOR'} ---`);
  },
};

DEBUG.init();
DEBUG.separator('CONTENT SCRIPT');

// ── Service Worker Health ─────────────────────────────────────────
async function ensureServiceWorkerAlive(): Promise<boolean> {
  DEBUG.log('Verificando service worker…', {
    alive: DEBUG.serviceWorkerAlive,
    attempts: DEBUG.reconnectionAttempts,
    maxAttempts: DEBUG.maxReconnectAttempts,
  });

  if (DEBUG.serviceWorkerAlive === false && DEBUG.reconnectionAttempts >= DEBUG.maxReconnectAttempts) {
    DEBUG.log('Service worker inativo — máximo de tentativas');
    return false;
  }

  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage({ action: 'ping' }),
      new Promise<undefined>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3000),
      ),
    ]);

    if (response?.success) {
      DEBUG.serviceWorkerAlive = true;
      DEBUG.reconnectionAttempts = 0;
      DEBUG.log('✅ Service worker vivo');
      return true;
    }

    DEBUG.warn('Response inválido', response);
  } catch (e) {
    DEBUG.reconnectionAttempts++;
    DEBUG.log(`❌ Service worker inativo (tentativa ${DEBUG.reconnectionAttempts})`, {
      error: (e as Error).message,
    });
    DEBUG.serviceWorkerAlive = false;
  }

  return DEBUG.serviceWorkerAlive === true;
}

async function sendToBackgroundSafe(
  action: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any> = {},
  retries = 2,
): Promise<Record<string, unknown>> {
  const TIMEOUT_MS = 5_000;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await ensureServiceWorkerAlive();
      const message = { action, ...data };

      const response = await Promise.race([
        chrome.runtime.sendMessage(message),
        new Promise<undefined>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
        ),
      ]);

      if (response === undefined) {
        if (attempt === retries) throw new Error('Service worker não respondeu após retries');
        await new Promise((r) => setTimeout(r, 1_000));
        continue;
      }

      if (!(response as Record<string, unknown>)?.success) {
        throw new Error((response as Record<string, unknown>)?.error as string ?? 'Erro desconhecido');
      }

      DEBUG.log(`✅ ${action} OK`, response);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return response as any;
    } catch (e) {
      DEBUG.error(`sendToBackground[${action}]`, e);
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, 1_000 * attempt));
    }
  }

  throw new Error(`Falha após ${retries} tentativas`);
}

// ── Injeção de Scripts ────────────────────────────────────────────
function injectScript(filePath: string, filterConfig: Record<string, unknown>) {
  DEBUG.separator('INJECT_SCRIPT');

  const oldScript = document.getElementById('wpp-extractor-injected');
  if (oldScript) oldScript.remove();

  const script = document.createElement('script');
  script.id = 'wpp-extractor-injected';
  script.src = chrome.runtime.getURL(filePath);

  const jszipUrl = chrome.runtime.getURL('libs/jszip.min.js');
  const wppUrl = chrome.runtime.getURL('libs/wppconnect-wa.js');

  script.dataset.libJszip = jszipUrl;
  script.dataset.libWpp = wppUrl;
  script.dataset.filterConfig = JSON.stringify(filterConfig);

  script.onload = () => {
    DEBUG.log('✅ Script carregado');
    script.remove();
  };
  script.onerror = () => {
    DEBUG.error('INJECT_LOAD', new Error(`Falha ao carregar ${filePath}`));
  };

  (document.head || document.documentElement).appendChild(script);
  DEBUG.log('Script anexado ao DOM');
}

// ── Listeners ─────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((
  request: { action: string; filter?: Record<string, unknown> },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: Record<string, unknown>) => void,
) => {
  DEBUG.log('📥 Mensagem recebida', { action: request.action, sender: sender?.id });

  if (request.action === 'start_extraction') {
    injectScript('injected.js', request.filter ?? { mode: 'last_24h' });
    sendResponse({ success: true, status: 'Extração iniciada' });
  }

  if (request.action === 'ping') {
    sendResponse({ success: true, timestamp: Date.now() });
  }

  return true;
});

// Status events do injected script
window.addEventListener('WPP_EXT_STATUS', (event: Event) => {
  const detail = (event as CustomEvent).detail;
  if (detail) {
    DEBUG.log(`📢 WPP_EXT_STATUS: ${String(detail)}`);
    chrome.runtime.sendMessage({ action: 'update_status', message: detail })
      .then(() => DEBUG.log('✅ Status enviado para background'))
      .catch((err: unknown) => DEBUG.error('SEND_STATUS', err));
  }
});

// Context events do injected script
window.addEventListener('WPP_EXT_CONTEXT', (event: Event) => {
  const detail = (event as CustomEvent).detail;
  if (detail) {
    try {
      const context = JSON.parse(String(detail));
      DEBUG.log('📦 Contexto parseado', {
        chatName: context.chatName,
        msgCount: context.messages?.length,
        hasAudio: context.stats?.audiosDownloaded > 0,
        hasImage: context.stats?.imagesDownloaded > 0,
      });

      chrome.runtime.sendMessage({ action: 'extraction_complete', context })
        .then(() => DEBUG.log('✅ Contexto enviado para background'))
        .catch((err: unknown) => DEBUG.error('SEND_CONTEXT', err));
    } catch (e) {
      DEBUG.error('PARSE_CONTEXT', e);
    }
  }
});

// ── Monitor de URL (com cleanup on disconnect) ────────────────────
let lastUrl = location.href;
const urlCheckInterval = setInterval(() => {
  if (location.href !== lastUrl) {
    DEBUG.log(`🔄 URL mudou: ${location.href.slice(0, 60)}…`);
    lastUrl = location.href;
  }
}, 2_000);

// Cleanup quando o content script é descartado
window.addEventListener('beforeunload', () => {
  clearInterval(urlCheckInterval);
});

DEBUG.log('✅ Content.js pronto');

// ── Floating WhatsApp Web Sidebar (in-page) ────────────────────────

const FLOATING_SIDEBAR_ID = 'wpp-ext-floating-sidebar';

// CSS styles for the floating sidebar
const FLOATING_STYLES = `
#${FLOATING_SIDEBAR_ID}-toggle {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 9999998;
  width: 38px;
  height: 48px;
  border-radius: 10px 0 0 10px;
  background: linear-gradient(135deg, #00a884, #008069);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.15);
  border-right: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  box-shadow: -2px 2px 12px rgba(0,0,0,0.18);
  transition: all 0.25s ease;
  user-select: none;
}
#${FLOATING_SIDEBAR_ID}-toggle:hover {
  width: 42px;
  filter: brightness(1.08);
}
#${FLOATING_SIDEBAR_ID}-toggle.open {
  right: 360px;
}

#${FLOATING_SIDEBAR_ID}-panel {
  position: fixed;
  top: 0;
  right: -380px;
  width: 380px;
  height: 100vh;
  max-height: 100vh;
  z-index: 9999999;
  background: #ffffff;
  box-shadow: -6px 0 30px rgba(0,0,0,0.15);
  display: flex;
  flex-direction: column;
  transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  color: #1f2d3d;
  overflow: hidden;
}
#${FLOATING_SIDEBAR_ID}-panel.open {
  right: 0;
}

#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: linear-gradient(135deg, #00a884, #008069);
  color: #fff;
  flex-shrink: 0;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-header-actions {
  display: flex;
  gap: 6px;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-header-actions button {
  background: rgba(255,255,255,0.15);
  border: none;
  border-radius: 6px;
  color: #fff;
  width: 28px;
  height: 28px;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-header-actions button:hover {
  background: rgba(255,255,255,0.28);
}

#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-body::-webkit-scrollbar {
  width: 5px;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-body::-webkit-scrollbar-thumb {
  background: #c0c8d4;
  border-radius: 99px;
}

#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-section label {
  font-size: 11px;
  font-weight: 600;
  color: #5f7086;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

#${FLOATING_SIDEBAR_ID}-panel select,
#${FLOATING_SIDEBAR_ID}-panel input[type="number"],
#${FLOATING_SIDEBAR_ID}-panel input[type="date"] {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #d9e3f0;
  border-radius: 8px;
  font-size: 12px;
  color: #1f2d3d;
  background: #ffffff;
  outline: none;
  transition: border-color 0.18s;
  box-sizing: border-box;
}
#${FLOATING_SIDEBAR_ID}-panel select:focus,
#${FLOATING_SIDEBAR_ID}-panel input:focus {
  border-color: #00a884;
  box-shadow: 0 0 0 3px rgba(0,168,132,0.12);
}

#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-checkboxes {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-checkboxes label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: #2d3f54;
  cursor: pointer;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-checkboxes input {
  accent-color: #00a884;
  cursor: pointer;
}

#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-extract-btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #00a884, #008069);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-extract-btn:hover:not(:disabled) {
  filter: brightness(1.06);
  transform: translateY(-1px);
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-extract-btn:disabled {
  background: #a6b3c7;
  cursor: not-allowed;
  transform: none;
}

#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-status {
  max-height: 120px;
  overflow-y: auto;
  border: 1px dashed #d6e1ef;
  border-radius: 8px;
  padding: 8px;
  background: #f7f9fc;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 10px;
  line-height: 1.5;
  color: #5e7088;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-status div {
  padding: 2px 0;
  border-bottom: 1px solid #e4edf7;
  word-break: break-word;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-status div:last-child {
  border-bottom: none;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-status .error { color: #dc2626; }
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-status .success { color: #16a34a; }

#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-footer {
  padding: 10px 16px;
  border-top: 1px solid #e8edf4;
  text-align: center;
  flex-shrink: 0;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-footer button {
  border: none;
  background: none;
  color: #00a884;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 6px;
  transition: background 0.2s;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-footer button:hover {
  background: rgba(0,168,132,0.08);
}

#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-hidden-field {
  display: none;
}
#${FLOATING_SIDEBAR_ID}-panel .wpp-ext-hidden-field.visible {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
`;

interface FloatingSidebarElements {
  toggle: HTMLElement;
  panel: HTMLElement;
  statusEl: HTMLElement;
  extractBtn: HTMLElement;
  modeSelect: HTMLSelectElement;
  daysInput: HTMLInputElement;
  includeAudio: HTMLInputElement;
  includeImage: HTMLInputElement;
}

let floatingSidebarElements: FloatingSidebarElements | null = null;
let sidebarIsExtracting = false;

function injectFloatingSidebar(): void {
  if (document.getElementById(FLOATING_SIDEBAR_ID + '-panel')) return;
  if (document.getElementById(FLOATING_SIDEBAR_ID + '-toggle')) return;

  DEBUG.log('Injetando sidebar flutuante…');

  // Inject styles
  const style = document.createElement('style');
  style.id = FLOATING_SIDEBAR_ID + '-styles';
  style.textContent = FLOATING_STYLES;
  document.head.appendChild(style);

  // Toggle button
  const toggle = document.createElement('div');
  toggle.id = FLOATING_SIDEBAR_ID + '-toggle';
  toggle.title = 'Abrir Extrator WhatsApp';
  toggle.innerHTML = '⚡';

  // Panel
  const panel = document.createElement('div');
  panel.id = FLOATING_SIDEBAR_ID + '-panel';

  panel.innerHTML = `
    <div class="wpp-ext-header">
      <h2>⚡ Extrator WhatsApp</h2>
      <div class="wpp-ext-header-actions">
        <button id="${FLOATING_SIDEBAR_ID}-btn-open-full" title="Abrir painel completo">↗</button>
        <button id="${FLOATING_SIDEBAR_ID}-btn-close" title="Fechar">✕</button>
      </div>
    </div>
    <div class="wpp-ext-body">
      <div class="wpp-ext-section">
        <label>Modo de extração</label>
        <select id="${FLOATING_SIDEBAR_ID}-mode">
          <option value="last_24h">Últimas 24 horas</option>
          <option value="last_x_days">Últimos X dias</option>
          <option value="all">Todas as mensagens</option>
        </select>
      </div>
      <div class="wpp-ext-section wpp-ext-hidden-field" id="${FLOATING_SIDEBAR_ID}-days-field">
        <label>Dias</label>
        <input type="number" id="${FLOATING_SIDEBAR_ID}-days" min="1" max="365" value="7">
      </div>
      <div class="wpp-ext-section">
        <label>Incluir</label>
        <div class="wpp-ext-checkboxes">
          <label><input type="checkbox" id="${FLOATING_SIDEBAR_ID}-include-audio" checked> Áudio</label>
          <label><input type="checkbox" id="${FLOATING_SIDEBAR_ID}-include-image" checked> Imagem</label>
        </div>
      </div>
      <button class="wpp-ext-extract-btn" id="${FLOATING_SIDEBAR_ID}-extract-btn">Extrair mensagens</button>
      <div class="wpp-ext-section">
        <label>Status</label>
        <div class="wpp-ext-status" id="${FLOATING_SIDEBAR_ID}-status">
          <div>⏳ Pronto...</div>
        </div>
      </div>
    </div>
    <div class="wpp-ext-footer">
      <button id="${FLOATING_SIDEBAR_ID}-btn-open-full">Abrir painel completo ↗</button>
    </div>
  `;

  document.body.appendChild(toggle);
  document.body.appendChild(panel);

  // Cache elements
  const statusEl = panel.querySelector(`#${FLOATING_SIDEBAR_ID}-status`) as HTMLElement;
  const extractBtn = panel.querySelector(`#${FLOATING_SIDEBAR_ID}-extract-btn`) as HTMLElement;
  const modeSelect = panel.querySelector(`#${FLOATING_SIDEBAR_ID}-mode`) as HTMLSelectElement;
  const daysInput = panel.querySelector(`#${FLOATING_SIDEBAR_ID}-days`) as HTMLInputElement;
  const includeAudio = panel.querySelector(`#${FLOATING_SIDEBAR_ID}-include-audio`) as HTMLInputElement;
  const includeImage = panel.querySelector(`#${FLOATING_SIDEBAR_ID}-include-image`) as HTMLInputElement;

  floatingSidebarElements = {
    toggle, panel, statusEl, extractBtn, modeSelect,
    daysInput, includeAudio, includeImage,
  };

  // ── Event listeners ──

  // Toggle open/close
  toggle.addEventListener('click', () => {
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open');
    toggle.classList.toggle('open');
    toggle.title = isOpen ? 'Abrir Extrator WhatsApp' : 'Fechar Extrator WhatsApp';
  });

  // Close button
  panel.querySelector(`#${FLOATING_SIDEBAR_ID}-btn-close`)?.addEventListener('click', () => {
    panel.classList.remove('open');
    toggle.classList.remove('open');
    toggle.title = 'Abrir Extrator WhatsApp';
  });

  // Open full side panel
  panel.querySelectorAll(`#${FLOATING_SIDEBAR_ID}-btn-open-full`).forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'open_side_panel', tabId: getCurrentTabId() })
        .then(() => DEBUG.log('Side panel opened from floating sidebar'))
        .catch((err: unknown) => DEBUG.error('OPEN_SIDE_PANEL', err));
    });
  });

  // Mode switch
  modeSelect.addEventListener('change', () => {
    const daysField = panel.querySelector(`#${FLOATING_SIDEBAR_ID}-days-field`) as HTMLElement;
    daysField.classList.toggle('visible', modeSelect.value === 'last_x_days');
  });

  // Extract button
  extractBtn.addEventListener('click', () => {
    if (!sidebarIsExtracting) startFloatingExtraction();
  });

  DEBUG.log('✅ Sidebar flutuante injetada');
}

function getCurrentTabId(): number | undefined {
  // Content script can't directly get tabId, but we use chrome.runtime.sendMessage with open_side_panel
  // which accepts tabId — we'll let background figure it out
  return undefined;
}

function addFloatingStatus(message: string, isError = false, isSuccess = false) {
  if (!floatingSidebarElements) return;
  const statusEl = floatingSidebarElements.statusEl;
  const entry = document.createElement('div');
  entry.className = (isError ? ' error' : '') + (isSuccess ? ' success' : '');
  entry.textContent = message;
  statusEl.appendChild(entry);
  statusEl.scrollTop = statusEl.scrollHeight;
}

async function startFloatingExtraction() {
  if (!floatingSidebarElements) return;
  if (sidebarIsExtracting) return;

  sidebarIsExtracting = true;
  const extractBtn = floatingSidebarElements.extractBtn;
  extractBtn.disabled = true;
  extractBtn.textContent = '⏳ Extraindo...';
  floatingSidebarElements.statusEl.innerHTML = '';

  try {
    const mode = floatingSidebarElements.modeSelect.value;
    const includeAudio = floatingSidebarElements.includeAudio.checked;
    const includeImage = floatingSidebarElements.includeImage.checked;

    const filterConfig: Record<string, unknown> = { mode, includeAudio, includeImage };

    if (mode === 'last_x_days') {
      const days = parseInt(floatingSidebarElements.daysInput.value) || 7;
      filterConfig.days = days;
    }

    addFloatingStatus(`🚀 Iniciando extração (${mode})…`);

    // Inject the extraction script — same as main sidebar
    injectScript('injected.js', filterConfig);

    addFloatingStatus('💉 Script injetado!');
  } catch (error) {
    DEBUG.error('FLOATING_EXTRACT', error);
    addFloatingStatus(`❌ ${(error as Error).message}`, true);
  }
}

// Patch the existing status event listener to also update the floating sidebar
function patchStatusHandler() {
  const origListener = window.addEventListener;

  // We don't need to patch — we just add our own handler below
  // The existing handlers already catch WPP_EXT_STATUS and WPP_EXT_CONTEXT
}

// ── Inject on page ready ───────────────────────────────────────────
// Wait a bit for WhatsApp Web to fully render, then inject the sidebar
function initFloatingSidebar() {
  // Only inject on WhatsApp Web
  if (!window.location.href.includes('web.whatsapp.com')) return;

  // Wait for body to exist
  if (!document.body) {
    setTimeout(initFloatingSidebar, 500);
    return;
  }

  // Wait a moment for the page to fully render
  const tryInject = () => {
    // Check for WhatsApp Web main element
    const appEl = document.querySelector('#app, .app, [data-testid="conversation-panel"]');
    if (appEl) {
      injectFloatingSidebar();
    } else {
      // Wait longer
      setTimeout(tryInject, 1000);
    }
  };

  setTimeout(tryInject, 3000);
}

// Also listen for status events to update the floating sidebar
window.addEventListener('WPP_EXT_STATUS', ((event: Event) => {
  const detail = (event as CustomEvent).detail;
  if (detail && floatingSidebarElements) {
    const msg = String(detail);
    const isError = msg.includes('Erro');
    const isSuccess = msg.includes('concluído') || msg.includes('concluída');
    addFloatingStatus(msg, isError, isSuccess);

    // Re-enable extract button on completion or error
    if (isError || isSuccess || msg.includes('Finalizado')) {
      sidebarIsExtracting = false;
      if (floatingSidebarElements) {
        floatingSidebarElements.extractBtn.disabled = false;
        floatingSidebarElements.extractBtn.textContent = 'Extrair mensagens';
      }
    }
  }
) as EventListener);

window.addEventListener('WPP_EXT_CONTEXT', ((event: Event) => {
  if (floatingSidebarElements) {
    sidebarIsExtracting = false;
    floatingSidebarElements.extractBtn.disabled = false;
    floatingSidebarElements.extractBtn.textContent = 'Extrair mensagens';
    addFloatingStatus('✅ Extração concluída!', false, true);
  }
) as EventListener);

// Start the floating sidebar
initFloatingSidebar();

export {};
