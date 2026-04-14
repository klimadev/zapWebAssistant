// background.js - Service Worker para WhatsApp Extractor + IA
// Executa em contexto isolado, tem acesso a chrome.tabs API e chrome.sidePanel API

// ============================
// DEBUG SISTEMÁTICO - Background Service Worker
// ============================
const DEBUG = {
    prefix: '[BACKGROUND]',
    step: 0,
    
    log: function(msg, data = null) {
        const out = `${this.prefix}:${String(this.step).padStart(2,'0')} ${msg}`;
        if (data) {
            console.log(out, data);
        } else {
            console.log(out);
        }
        this.step++;
        return out;
    },
    
    error: function(context, err) {
        console.error(`${this.prefix}:${String(this.step).padStart(2,'0')} ERRO[${context}]`, {
            message: err?.message || String(err),
            stack: err?.stack || 'no stack',
            type: err?.constructor?.name || typeof err
        });
        this.step++;
    },
    
    warn: function(msg, data = null) {
        console.warn(`${this.prefix}:${String(this.step).padStart(2,'0')} WARN: ${msg}`, data);
        this.step++;
    },
    
    info: function(label, data) {
        console.info(`${this.prefix}:${String(this.step).padStart(2,'0')} ${label}`, data);
        this.step++;
    },
    
    separator: function(label = '') {
        console.log(`${this.prefix} --- ${label || 'SEPARATOR'} ---`);
    }
};

DEBUG.separator('SERVICE_WORKER');

// ============================
// Configuração
// ============================
const KEEP_ALIVE_PING_INTERVAL = 25000;
const IDLE_TIMEOUT = 60000;

let lastActivityTime = Date.now();
let keepAliveInterval = null;
let statusListeners = new Map();

// ============================
// Keep Alive
// ============================

function setUpKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }

    keepAliveInterval = setInterval(() => {
        const idleTime = Date.now() - lastActivityTime;
        
        if (idleTime > IDLE_TIMEOUT) {
            DEBUG.log(`Idle por ${idleTime}ms, mantendo vivo...`);
        }
    }, KEEP_ALIVE_PING_INTERVAL);
    
    DEBUG.log('Keep alive configurado', { interval: KEEP_ALIVE_PING_INTERVAL });
}

function updateActivity() {
    lastActivityTime = Date.now();
}

// ============================
// Message Handlers
// ============================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    updateActivity();
    DEBUG.log('📥 Mensagem', { action: request.action, sender: sender?.id });

    if (request.action === "ping") {
        DEBUG.log('✅ Ping OK', { timestamp: Date.now() });
        sendResponse({ success: true, timestamp: Date.now() });
        return true;
    }

    if (request.action === "get_active_tab") {
        handleGetActiveTab(request, sendResponse);
        return true;
    }

    if (request.action === "open_side_panel") {
        handleOpenSidePanel(request, sendResponse);
        return true;
    }

    if (request.action === "start_extraction") {
        handleStartExtraction(request, sendResponse);
        return true;
    }

    if (request.action === "update_status") {
        handleUpdateStatus(request, sendResponse);
        return true;
    }

    if (request.action === "extraction_complete") {
        handleExtractionComplete(request, sendResponse);
        return true;
    }

    DEBUG.warn('Action não tratada', { action: request.action });
    return false;
});

// ============================
// Handlers
// ============================

async function handleGetActiveTab(request, sendResponse) {
    DEBUG.separator('GET_ACTIVE_TAB');
    const startTime = Date.now();
    
    try {
        DEBUG.log('Buscando tab ativa...');

        if (!chrome.tabs?.query) {
            throw new Error("chrome.tabs API não disponível");
        }

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tabs || tabs.length === 0) {
            throw new Error("Nenhuma tab ativa encontrada");
        }

        const tab = tabs[0];
        const elapsed = Date.now() - startTime;
        
        DEBUG.log('✅ Tab encontrada', { 
            id: tab.id, 
            url: tab.url?.substring(0, 50), 
            time: elapsed + 'ms' 
        });

        sendResponse({
            success: true,
            tab: { id: tab.id, url: tab.url, title: tab.title }
        });
    } catch (error) {
        DEBUG.error('GET_ACTIVE_TAB', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleOpenSidePanel(request, sendResponse) {
    DEBUG.separator('OPEN_SIDE_PANEL');
    
    try {
        DEBUG.log('Abrindo side panel...');

        if (!chrome.sidePanel) {
            throw new Error("chrome.sidePanel API não disponível. Requer Chrome 114+.");
        }

        if (!chrome.sidePanel.open) {
            throw new Error("chrome.sidePanel.open não disponível");
        }

        const tabId = request.tabId;
        
        if (!tabId) {
            throw new Error("tabId não fornecido");
        }

        DEBUG.log('Abrindo para tabId', tabId);

        await new Promise((resolve, reject) => {
            chrome.sidePanel.open({ tabId: tabId }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });

        DEBUG.log('✅ Side panel aberto');
        sendResponse({ success: true });
    } catch (error) {
        DEBUG.error('OPEN_SIDE_PANEL', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleStartExtraction(request, sendResponse) {
    DEBUG.separator('START_EXTRACTION');
    
    try {
        DEBUG.log('Iniciando extração', { filter: request.filter });
        
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tabs || tabs.length === 0) {
            throw new Error("Nenhuma tab ativa");
        }
        
        const tab = tabs[0];
        
        if (!tab.id) {
            throw new Error("Tab sem ID");
        }
        
        DEBUG.log('Enviando para tab', { tabId: tab.id, url: tab.url?.substring(0, 40) });

        // Envia mensagem para content script
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: "start_extraction",
            filter: request.filter || { mode: 'last_24h' }
        });
        
        DEBUG.log('✅ Mensagem enviada', { response });

        sendResponse({ success: true, response });
        
    } catch (error) {
        DEBUG.error('START_EXTRACTION', error);
        sendResponse({ success: false, error: error.message });
    }
}

function handleUpdateStatus(request, sendResponse) {
    DEBUG.log('📢 Status update', { message: request.message });
    
    // Armazena o status mais recente
    statusListeners.set("latest", {
        message: request.message,
        timestamp: Date.now()
    });
    
    sendResponse({ success: true });
}

function handleExtractionComplete(request, sendResponse) {
    DEBUG.separator('EXTRACTION_COMPLETE');
    DEBUG.log('Extração completa', { 
        chatName: request.context?.chatName,
        msgCount: request.context?.messages?.length,
        stats: request.context?.stats
    });
    
    sendResponse({ success: true });
}

// ============================
// Startup
// ============================

DEBUG.log('🚀 Service Worker iniciado', {
    chromeTabs: typeof chrome.tabs,
    chromeRuntime: typeof chrome.runtime,
    version: chrome.runtime?.getManifest()?.version
});

setUpKeepAlive();

// Clique no ícone da extensão abre o side panel
chrome.action.onClicked.addListener(async (tab) => {
    DEBUG.log('Clique no ícone', { tabId: tab.id });
    
    try {
        if (!chrome.sidePanel?.open) {
            DEBUG.warn('chrome.sidePanel não disponível');
            return;
        }
        
        DEBUG.log('Abrindo side panel...');
        
        await new Promise((resolve, reject) => {
            chrome.sidePanel.open({ tabId: tab.id }, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
        
        DEBUG.log('✅ Side panel aberto via ícone');
    } catch (error) {
        DEBUG.error('ON_CLICKED', error);
    }
});

chrome.runtime.onInstalled.addListener((details) => {
    DEBUG.log('📦 Extensão instalada', { 
        reason: details.reason, 
        version: chrome.runtime.getManifest().version 
    });
    setUpKeepAlive();
});

chrome.runtime.onStartup.addListener(() => {
    DEBUG.log('🚀 Extensão iniciado (onStartup)');
    setUpKeepAlive();
});

// Keep alive para evitar terminação
chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keepAlive") {
        DEBUG.log('💓 Keep alive');
        updateActivity();
    }
});

DEBUG.log('✅ Servic Worker pronto');