// background.ts - Service Worker para WhatsApp Extractor + IA
// MV3 isolated context, chrome.tabs API access

// ── Systematic Debug ──────────────────────────────────────────────
const DEBUG = {
  prefix: '[BACKGROUND]' as const,
  step: 0,

  log(msg: string, data?: unknown) {
    const out = `${this.prefix}:${String(this.step).padStart(2, '0')} ${msg}`;
    if (data !== undefined) console.log(out, data);
    else console.log(out);
    this.step++;
  },

  error(context: string, err: unknown) {
    console.error(`${this.prefix}:${String(this.step).padStart(2, '0')} ERRO[${context}]`, {
      message: (err as Error)?.message ?? String(err),
      stack: (err as Error)?.stack ?? 'no stack',
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

DEBUG.separator('SERVICE_WORKER');

// ── Config ────────────────────────────────────────────────────────
const KEEP_ALIVE_PING_INTERVAL = 25_000;
const IDLE_TIMEOUT = 60_000;

let lastActivityTime = Date.now();
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

// ── Keep Alive ────────────────────────────────────────────────────
function setUpKeepAlive() {
  if (keepAliveInterval) clearInterval(keepAliveInterval);

  keepAliveInterval = setInterval(() => {
    const idleTime = Date.now() - lastActivityTime;
    if (idleTime > IDLE_TIMEOUT) {
      DEBUG.log(`Idle por ${idleTime}ms, mantendo vivo…`);
    }
  }, KEEP_ALIVE_PING_INTERVAL);

  DEBUG.log('Keep alive configurado', { interval: KEEP_ALIVE_PING_INTERVAL });
}

function updateActivity() {
  lastActivityTime = Date.now();
}

// ── Tipo de resposta padrão ───────────────────────────────────────
interface BackgroundResponse {
  success: boolean;
  error?: string;
  data?: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

type SendResponse = (response: BackgroundResponse) => void;

// ── Message Handlers ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((
  request: { action: string; [key: string]: unknown },
  sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
) => {
  updateActivity();
  DEBUG.log('📥 Mensagem', { action: request.action, sender: sender?.id });

  const handler = async (): Promise<void> => {
    switch (request.action) {
      case 'ping':
        sendResponse({ success: true, timestamp: Date.now() });
        return;

      case 'get_active_tab':
        return handleGetActiveTab(sendResponse);

      case 'open_side_panel':
        return handleOpenSidePanel(request as { action: string; tabId?: number }, sendResponse);

      case 'start_extraction':
        return handleStartExtraction(request as { action: string; filter?: Record<string, unknown> }, sendResponse);

      case 'update_status':
        sendResponse({ success: true });
        return;

      case 'extraction_complete':
        DEBUG.log('Extração completa');
        sendResponse({ success: true });
        return;

      default:
        DEBUG.warn('Action não tratada', { action: request.action });
        sendResponse({ success: false, error: `Action desconhecida: ${request.action}` });
    }
  };

  handler().catch((err: unknown) => {
    DEBUG.error('HANDLER', err);
    sendResponse({ success: false, error: (err as Error).message ?? String(err) });
  });

  return true; // keep channel open for async sendResponse
});

// ── Handlers ──────────────────────────────────────────────────────
async function handleGetActiveTab(sendResponse: SendResponse) {
  DEBUG.separator('GET_ACTIVE_TAB');

  try {
    if (!chrome.tabs?.query) throw new Error('chrome.tabs API não disponível');

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs?.length) throw new Error('Nenhuma tab ativa encontrada');

    const tab = tabs[0]!;
    DEBUG.log('✅ Tab encontrada', { id: tab.id, url: tab.url?.slice(0, 50) });

    sendResponse({
      success: true,
      tab: { id: tab.id, url: tab.url, title: tab.title },
    });
  } catch (error) {
    DEBUG.error('GET_ACTIVE_TAB', error);
    sendResponse({ success: false, error: (error as Error).message });
  }
}

async function handleOpenSidePanel(
  request: { action: string; tabId?: number },
  sendResponse: SendResponse,
) {
  DEBUG.separator('OPEN_SIDE_PANEL');

  try {
    if (!chrome.sidePanel?.open) throw new Error('chrome.sidePanel não disponível');

    let tabId = request.tabId;
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs?.length) throw new Error('Nenhuma tab ativa');
      tabId = tabs[0]!.id;
      if (!tabId) throw new Error('Tab sem ID');
    }

    await chrome.sidePanel.open({ tabId });
    DEBUG.log('✅ Side panel aberto', { tabId });
    sendResponse({ success: true });
  } catch (error) {
    DEBUG.error('OPEN_SIDE_PANEL', error);
    sendResponse({ success: false, error: (error as Error).message });
  }
}

async function handleStartExtraction(
  request: { action: string; filter?: Record<string, unknown> },
  sendResponse: SendResponse,
) {
  DEBUG.separator('START_EXTRACTION');

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs?.length) throw new Error('Nenhuma tab ativa');
    const tab = tabs[0]!;
    if (!tab.id) throw new Error('Tab sem ID');

    DEBUG.log('Enviando para tab', { tabId: tab.id, url: tab.url?.slice(0, 40) });

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'start_extraction',
      filter: request.filter ?? { mode: 'last_24h' },
    });

    DEBUG.log('✅ Mensagem enviada', { response });
    sendResponse({ success: true, response });
  } catch (error) {
    DEBUG.error('START_EXTRACTION', error);
    sendResponse({ success: false, error: (error as Error).message });
  }
}

// ── Startup ───────────────────────────────────────────────────────
DEBUG.log('🚀 Service Worker iniciado', {
  chromeTabs: typeof chrome.tabs,
  chromeRuntime: typeof chrome.runtime,
  version: chrome.runtime?.getManifest()?.version,
});

setUpKeepAlive();

// Clique no ícone → abre side panel
chrome.action.onClicked.addListener(async (tab) => {
  DEBUG.log('Clique no ícone', { tabId: tab.id });
  try {
    if (!chrome.sidePanel?.open) return;
    await chrome.sidePanel.open({ tabId: tab.id! });
    DEBUG.log('✅ Side panel aberto via ícone');
  } catch (error) {
    DEBUG.error('ON_CLICKED', error);
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  DEBUG.log('📦 Extensão instalada', {
    reason: details.reason,
    version: chrome.runtime.getManifest().version,
  });
  setUpKeepAlive();
});

chrome.runtime.onStartup.addListener(() => {
  DEBUG.log('🚀 Extensão iniciado (onStartup)');
  setUpKeepAlive();
});

// Keep alive via alarms (evita terminação do service worker)
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    DEBUG.log('💓 Keep alive');
    updateActivity();
  }
});

DEBUG.log('✅ Service Worker pronto');

// Module marker (TS module isolation)
export {};
