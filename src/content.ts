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

export {};
