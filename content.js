// content.js - WhatsApp Extractor + IA
// Script de conteúdo que roda no contexto da página do WhatsApp Web

// ============================
// DEBUG SISTEMÁTICO - Content Script
// ============================
const DEBUG = {
    prefix: '[CONTENT]',
    initialized: false,
    serviceWorkerAlive: null,
    reconnectionAttempts: 0,
    maxReconnectAttempts: 3,
    step: 0,

    init: function() {
        if (this.initialized) return;
        this.initialized = true;

        console.log(`${this.prefix}:🚀 Inicializado`, {
            chromeDefined: typeof chrome !== 'undefined',
            chromeRuntime: typeof chrome?.runtime?.id ? 'OK' : 'undefined',
            location: window.location?.href?.substring(0, 50),
            timestamp: new Date().toISOString()
        });
    },

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
            type: err?.constructor?.name || typeof err,
            stack: err?.stack
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

DEBUG.init();
DEBUG.separator('CONTENT SCRIPT');

// ============================
// Gerenciador de Service Worker
// ============================

async function ensureServiceWorkerAlive() {
    DEBUG.log('Verificando service worker...', { 
        alive: DEBUG.serviceWorkerAlive, 
        attempts: DEBUG.reconnectionAttempts,
        maxAttempts: DEBUG.maxReconnectAttempts
    });

    if (DEBUG.serviceWorkerAlive === false && DEBUG.reconnectionAttempts >= DEBUG.maxReconnectAttempts) {
        DEBUG.log('Service worker inativo - máximo de tentativas atingido');
        return false;
    }

    try {
        const response = await Promise.race([
            chrome.runtime.sendMessage({ action: "ping" }),
            new Promise((_, reject) => setTimeout(() => reject(new Error(" timeout")), 3000))
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
        DEBUG.log(`❌ Service worker inativado (tentativa ${DEBUG.reconnectionAttempts})`, { error: e.message });
        DEBUG.serviceWorkerAlive = false;
    }

    return DEBUG.serviceWorkerAlive === true;
}

async function sendToBackgroundSafe(action, data = {}, retries = 2) {
    const TIMEOUT_MS = 5000;

    for (let attempt = 1; attempt <= retries; attempt++) {
        DEBUG.log(`Attempt ${attempt}/${retries}`, { action, data });

        try {
            await ensureServiceWorkerAlive();

            const message = { action, ...data };

            const response = await Promise.race([
                chrome.runtime.sendMessage(message),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${TIMEOUT_MS}ms`)), TIMEOUT_MS))
            ]);

            if (response === undefined) {
                DEBUG.warn(`Attempt ${attempt}: resposta undefined`);
                if (attempt === retries) throw new Error("Service worker não respondeu após retries");
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            if (!response?.success) {
                DEBUG.error(`Action[${action}]`, new Error(response?.error || "Erro desconhecido"));
                throw new Error(response?.error || "Erro desconhecido");
            }

            DEBUG.log(`✅ ${action} OK`, response);
            return response;

        } catch (e) {
            DEBUG.error(`sendToBackground[${action}]`, e);

            if (attempt === retries) {
                throw e;
            }

            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }

    throw new Error(`Falha após ${retries} tentativas`);
}

// ============================
// Injeção de Scripts
// ============================

function injectScript(file_path, filterConfig) {
    DEBUG.separator('INJECT_SCRIPT');
    DEBUG.log('Injetando script', { file_path, filterConfig });

    const oldScript = document.getElementById('wpp-extractor-injected');
    if (oldScript) {
        DEBUG.log('Removendo script anterior');
        oldScript.remove();
    }

    const script = document.createElement('script');
    script.id = 'wpp-extractor-injected';
    script.setAttribute('type', 'text/javascript');
    script.setAttribute('src', chrome.runtime.getURL(file_path));

    const jszipUrl = chrome.runtime.getURL('libs/jszip.min.js');
    const wppUrl = chrome.runtime.getURL('libs/wppconnect-wa.js');

    DEBUG.log('URLs das libs', { jszipUrl, wppUrl });

    script.dataset.libJszip = jszipUrl;
    script.dataset.libWpp = wppUrl;
    script.dataset.filterConfig = JSON.stringify(filterConfig);

    script.onload = function() {
        DEBUG.log('✅ Script carregado e pronto');
        this.remove();
    };
    
    script.onerror = function(e) {
        DEBUG.error('INJECT_LOAD', new Error(`Falha ao carregar ${file_path}`));
    };

    (document.head || document.documentElement).appendChild(script);
    DEBUG.log('Script anexado ao DOM');
}

// ============================
// Listeners
// ============================

// Escuta mensagens do background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    DEBUG.log('📥 Mensagem recebida', { action: request.action, sender: sender?.id });

    if (request.action === "start_extraction") {
        const filter = request.filter || { mode: 'last_24h' };
        DEBUG.log('Iniciando extração', { filter });
        
        injectScript('injected.js', filter);
        
        sendResponse({ success: true, status: "Extração iniciada" });
        DEBUG.log('✅ Resposta enviada: Extração iniciada');
    }

    if (request.action === "ping") {
        sendResponse({ success: true, timestamp: Date.now() });
    }

    return true;
});

// Escuta eventos de status do injected script
window.addEventListener("WPP_EXT_STATUS", function(event) {
    if (event.detail) {
        DEBUG.log(`📢 WPP_EXT_STATUS: ${event.detail}`);
        
        chrome.runtime.sendMessage({
            action: "update_status",
            message: event.detail
        }).then(() => {
            DEBUG.log('✅ Status enviado para background');
        }).catch((err) => {
            DEBUG.error('SEND_STATUS', err);
        });
    }
}, false);

// Escuta contexto do injected script
window.addEventListener("WPP_EXT_CONTEXT", function(event) {
    if (event.detail) {
        DEBUG.log('📦 WPP_EXT_CONTEXT recebido');
        
        try {
            const context = JSON.parse(event.detail);
            DEBUG.log('Contextoparseado', {
                chatName: context.chatName,
                msgCount: context.messages?.length,
                hasAudio: context.stats?.audiosDownloaded > 0,
                hasImage: context.stats?.imagesDownloaded > 0
            });

            chrome.runtime.sendMessage({
                action: "extraction_complete",
                context: context
            }).then(() => {
                DEBUG.log('✅ Contexto enviado para background');
            }).catch(err => DEBUG.error('SEND_CONTEXT', err));
        } catch (e) {
            DEBUG.error('PARSE_CONTEXT', e);
        }
    }
}, false);

// ============================
// Monitor de URL
// ============================

let lastUrl = location.href;
setInterval(() => {
    if (location.href !== lastUrl) {
        DEBUG.log(`🔄 URL mudou: ${location.href.substring(0, 60)}...`);
        lastUrl = location.href;
    }
}, 2000);

DEBUG.log('✅ Content.js pronto');