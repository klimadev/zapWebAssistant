// ============================
// Helpers (definir primeiro)
// ============================
const $ = id => document.getElementById(id);

// ============================
// DEBUG SISTEMÁTICO - Sidebar
// ============================
const DEBUG = {
  prefix: '[SIDEBAR]',
  step: 0,
  showInChat: false,

  log: function(msg, data = null) {
    const out = `${this.prefix}:${String(this.step).padStart(2,'0')} ${msg}`;
    const container = document.getElementById('chatMessages');
    if (data) {
      console.log(out, data);
    } else {
      console.log(out);
    }
    if (container && this.showInChat) {
      const entry = document.createElement('div');
      entry.className = 'message ia';
      entry.style.color = '#64748b';
      entry.style.fontSize = '10px';
      entry.textContent = out;
      container.appendChild(entry);
      container.scrollTop = container.scrollHeight;
    }
    this.step++;
    return out;
  },

  error: function(context, err) {
    const out = `${this.prefix}:${String(this.step).padStart(2,'0')} ERRO[${context}]: ${err?.message || String(err)}`;
    console.error(out, err);
    this.step++;
  },

  warn: function(msg, data = null) {
    const out = `${this.prefix}:${String(this.step).padStart(2,'0')} WARN: ${msg}`;
    console.warn(out, data);
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

DEBUG.separator('SIDEBAR');
DEBUG.log('Inicializando...');

// ============================
// Configuração API
// ============================
const API_CONFIG = {
  baseUrl: 'https://routerai.chamalead.com/v1',
  apiKey: 'sk-vECcv8guLuigfTXPKDJEbrn7RPG8QiJJ6vPcc9LMG9xYc',
  model: 'gpt-5.4-mini'
};

DEBUG.log('API Config', { baseUrl: API_CONFIG.baseUrl, model: API_CONFIG.model });

let currentContext = null;
let chatHistory = [];
let isExtracting = false;
let isChatting = false;

DEBUG.log('Variáveis de estado', { 
  isExtracting, 
  isChatting, 
  hasContext: !!currentContext 
});

DEBUG.log('Helpers carregados');

// ============================
// Funções de UI
// ============================

function addLog(message, isError = false, isSuccess = false) {
  DEBUG.log('addLog', { message, isError, isSuccess });
  
  const status = $('status');
  if (!status) {
    DEBUG.warn('Status element não encontrado!');
    return;
  }
  
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (isError ? ' error' : '') + (isSuccess ? ' success' : '');
  entry.textContent = message;
  status.appendChild(entry);
  status.scrollTop = status.scrollHeight;

  const globalStatus = $('globalStatus');
  if (globalStatus) {
    if (isError) {
      globalStatus.textContent = 'Erro na execução';
    } else if (isSuccess) {
      globalStatus.textContent = 'Extração concluída';
    } else {
      globalStatus.textContent = message.replace(/^[^\wÀ-ÿ]+/, '').slice(0, 42);
    }
  }
}

function addChatMessage(text, isUser = false, isThinking = false) {
  const container = $('chatMessages');
  if (!container) {
    DEBUG.error('ADD_CHAT', new Error('Container chatMessages não encontrado!'));
    return null;
  }

  const div = document.createElement('div');
  div.className = 'message ' + (isUser ? 'user' : 'ia') + (isThinking ? ' thinking' : '');

  if (isThinking) {
    div.innerHTML = '<span>Pensando</span><span class="typing-dots"><span></span><span></span><span></span></span>';
  } else if (isUser) {
    div.textContent = text;
  } else {
    div.classList.add('md');
    div.innerHTML = renderMarkdown(text);
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(text) {
  const raw = String(text || '');
  let html = escapeHtml(raw);

  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
  html = html.replace(/^>\s?(.*)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';

  html = html.replace(/(?:^|\n)([-*])\s+(.+)(?=(?:\n[-*]\s+)|\n\n|$)/g, function(match) {
    const items = match
      .trim()
      .split(/\n/)
      .map(line => line.replace(/^[-*]\s+/, '').trim())
      .map(item => `<li>${item}</li>`)
      .join('');
    return `\n<ul>${items}</ul>`;
  });

  html = html.replace(/(?:^|\n)(\d+)\.\s+(.+)(?=(?:\n\d+\.\s+)|\n\n|$)/g, function(match) {
    const items = match
      .trim()
      .split(/\n/)
      .map(line => line.replace(/^\d+\.\s+/, '').trim())
      .map(item => `<li>${item}</li>`)
      .join('');
    return `\n<ol>${items}</ol>`;
  });

  html = html.replace(/<p>\s*(<(h\d|ul|ol|pre|blockquote)[\s\S]*?>[\s\S]*?<\/(h\d|ul|ol|pre|blockquote)>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

function updateExtractButtonState(isLoading) {
  const btn = $('btnExtract');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Extraindo...' : 'Extrair mensagens';
}

function updateSendButtonState(isLoading) {
  const btn = $('btnSend');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Enviando...' : 'Enviar';
}

function getFilterConfig() {
  DEBUG.separator('GET_FILTER_CONFIG');
  
  const mode = $('extractMode').value;
  DEBUG.log('Modo selecionado', mode);
  
  switch(mode) {
    case 'last_24h':
      DEBUG.log('Retornando last_24h');
      return { mode: 'last_24h' };
      
    case 'date_range':
      const date = $('fromDate').value;
      const time = $('fromTime').value;
      DEBUG.log('Date range', { date, time });
      if (!date) throw new Error('Selecione uma data válida.');
      return {
        mode: 'date_range',
        fromDate: new Date(`${date}T${time}`).toISOString()
      };
      
    case 'last_x_days':
      const days = parseInt($('daysCount').value);
      DEBUG.log('Last x days', { days });
      if (!days || days < 1) throw new Error('Número de dias inválido.');
      return { mode: 'last_x_days', days };
      
    case 'all':
      DEBUG.log('Retornando all');
      return { mode: 'all' };
      
    default:
      DEBUG.error('GET_FILTER', new Error(`Modo inválido: ${mode}`));
      throw new Error('Modo inválido.');
  }
}

function getModeLabel(mode) {
  const labels = {
    'last_24h': 'Últimas 24h',
    'date_range': 'Data específica',
    'last_x_days': 'Últimos dias',
    'all': 'Todas'
  };
  return labels[mode] || mode;
}

DEBUG.separator('START_EXTRACTION');

async function startExtraction() {
  DEBUG.log('startExtraction chamada', { isExtracting });
  
  if (isExtracting) {
    DEBUG.warn('Extração já em andamento');
    return;
  }
  
  isExtracting = true;

  const includeAudio = $('includeAudio').checked;
  const includeImage = $('includeImage').checked;
  
  DEBUG.log('Parâmetros', { includeAudio, includeImage });
  
  updateExtractButtonState(true);
  $('status').innerHTML = '';
  
  try {
    const filterConfig = getFilterConfig();
    addLog(`🚀 Iniciando extração (${getModeLabel(filterConfig.mode)})...`);
    
    filterConfig.includeAudio = includeAudio;
    filterConfig.includeImage = includeImage;

    DEBUG.log('Enviando para content script', { filterConfig });
    
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    DEBUG.log('Tab encontrada', { tabId: tab?.id, url: tab?.url?.substring(0, 40) });
    
    if (!tab?.id) throw new Error('Nenhuma aba ativa encontrada.');
    
    chrome.tabs.sendMessage(tab.id, {
      action: "start_extraction",
      filter: filterConfig
    }, (response) => {
      if (chrome.runtime.lastError) {
        DEBUG.error('SEND_MESSAGE', new Error(chrome.runtime.lastError.message));
        addLog(`❌ ${chrome.runtime.lastError.message}`, true);
        addLog('Certifique-se de estar na aba do WhatsApp Web.', true);
        updateExtractButtonState(false);
        isExtracting = false;
      } else {
        DEBUG.log('Resposta do content', response);
        addLog('💉 Extração iniciada!');
      }
    });

  } catch (error) {
    DEBUG.error('START_EXTRACTION', error);
    addLog(`❌ ${error.message}`, true);
    updateExtractButtonState(false);
    isExtracting = false;
  }
}

DEBUG.separator('SEND_TO_IA');

async function sendToIA() {
  DEBUG.log('sendToIA chamada', { isChatting });
  
  if (isChatting) {
    DEBUG.warn('Chat já em andamento');
    return;
  }
  
  const input = $('chatInput');
  const btnSend = $('btnSend');
  const useContext = $('useContext').checked;
  
  const userMessage = input.value.trim();
  if (!userMessage) {
    DEBUG.warn('Mensagem vazia');
    return;
  }

  DEBUG.log('Mensagem do usuário', { message: userMessage.substring(0, 30), useContext });

  DEBUG.step = 0;
  DEBUG.log('Iniciando request...');

  isChatting = true;
  updateSendButtonState(true);
  input.value = '';
  autoResizeTextarea(input);

  addChatMessage(userMessage, true);

  const thinkingMsg = addChatMessage('🤔 Pensando...', false, true);
  DEBUG.log('Thinking msg enviado', { has: !!thinkingMsg });
  
  if (thinkingMsg) {
    thinkingMsg.classList.remove('thinking');
  }

  try {
    const messages = [];

    messages.push({
      role: 'system',
      content: `Você é um assistente de IA especializado em analisar conversas do WhatsApp. 
Você foi invokedado por uma extensão Chrome que extrai mensagens do WhatsApp Web.
Seu objetivo é responder dúvidas sobre a conversa, identificar padrões, resumir informações, e ajudar o usuário a entender melhor suas conversas.
Responda sempre em português brasileiro, de forma clara e útil.`
    });

    if (useContext && currentContext) {
      const contextText = buildContextText();
      messages.push({
        role: 'system',
        content: `Aqui está o contexto da conversa extraída:\n\n${contextText}`
      });
      DEBUG.log('Contexto adicionado', { contextLength: contextText.length });
    }

    for (const msg of chatHistory) {
      messages.push(msg);
    }
    DEBUG.log('Chat history', { length: chatHistory.length });

    messages.push({ role: 'user', content: userMessage });
    DEBUG.log('Enviando para API...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    DEBUG.log('Fetch URL', `${API_CONFIG.baseUrl}/chat/completions`);
    
    const response = await fetch(`${API_CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: API_CONFIG.model,
        messages: messages,
        temperature: 0.7
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    DEBUG.log('Response status', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      DEBUG.error('API_ERROR', new Error(errorData.error?.message || `Erro API: ${response.status}`));
      throw new Error(errorData.error?.message || `Erro API: ${response.status}`);
    }

    const data = await response.json();
    DEBUG.log('Response data', { 
      choices: data.choices?.length || 0,
      hasContent: !!data.choices?.[0]?.message?.content
    });
    
    const iaResponse = data.choices?.[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';

    if (thinkingMsg) {
      thinkingMsg.remove();
    }
    addChatMessage(iaResponse, false);
    DEBUG.log('Resposta adicionada');

    chatHistory.push({ role: 'user', content: userMessage });
    chatHistory.push({ role: 'assistant', content: iaResponse });

  } catch (error) {
    DEBUG.error('CATCH_ERROR', error);
    if (thinkingMsg) thinkingMsg.remove();
    addChatMessage(`❌ Erro: ${error.message}`, false);
  } finally {
    isChatting = false;
    updateSendButtonState(false);
    DEBUG.log('Finalizado');
  }
}

function autoResizeTextarea(input) {
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

function buildContextText() {
  if (!currentContext) return '';

  let text = '';
  text += `--- DADOS DA CONVERSA ---\n`;
  text += `Chat: ${currentContext.chatName}\n`;
  text += `Data extração: ${currentContext.extractedAt}\n`;
  text += `Filtro: ${currentContext.filter?.label || 'N/A'}\n`;
  text += `Total mensagens: ${currentContext.stats?.total || 0}\n`;
  text += `Áudios: ${currentContext.stats?.audiosDownloaded || 0}\n`;
  text += `Imagens: ${currentContext.stats?.imagesDownloaded || 0}\n\n`;

  const audioFiles = [];
  const imageFiles = [];

  if (currentContext.messages) {
    for (const msg of currentContext.messages) {
      if (msg.audioFile) audioFiles.push(msg.audioFile);
      if (msg.imageFile) imageFiles.push(msg.imageFile);
    }
  }

  if (audioFiles.length > 0) {
    text += `--- ARQUIVOS DE ÁUDIO ---\n`;
    text += audioFiles.join(', ') + '\n\n';
  }

  if (imageFiles.length > 0) {
    text += `--- ARQUIVOS DE IMAGEM ---\n`;
    text += imageFiles.join(', ') + '\n\n';
  }

  if (currentContext.messages) {
    text += `--- MENSAGENS ---\n`;
    const msgTexts = currentContext.messages.map(m => {
      const time = new Date(m.timestamp * 1000).toLocaleString('pt-BR');
      return `[${time}] ${m.sender}: ${m.content}`;
    });
    text += msgTexts.join('\n');
  }

  return text;
}

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = 'tab-' + tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      contents.forEach(c => {
        c.classList.toggle('active', c.id === targetId);
      });
    });
  });
}

function initExtractMode() {
  const modeSelect = $('extractMode');
  const dateRangeFields = $('dateRangeFields');
  const lastXDaysFields = $('lastXDaysFields');

  modeSelect.addEventListener('change', () => {
    const mode = modeSelect.value;
    
    dateRangeFields.classList.toggle('visible', mode === 'date_range');
    lastXDaysFields.classList.toggle('visible', mode === 'last_x_days');
  });
}

function initChat() {
  const input = $('chatInput');
  const btnSend = $('btnSend');

  autoResizeTextarea(input);

  const sendMessage = () => {
    if (!isChatting) sendToIA();
  };

  btnSend.addEventListener('click', sendMessage);
  input.addEventListener('input', () => autoResizeTextarea(input));
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function initToggle() {
  const btnToggle = $('btnToggle');
  btnToggle.addEventListener('click', () => {
    window.close();
  });
}

function setupMessageListener() {
  DEBUG.separator('MESSAGE_LISTENER');
  
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    DEBUG.log('Mensagem recebida', { action: request.action });
    
    if (request.action === 'update_status') {
      DEBUG.log('Update status', { message: request.message });
      addLog(request.message);
      
      if (request.message.includes('concluído') || request.message.includes('Erro')) {
        DEBUG.log('Extração finalizada, habilitando botão');
        updateExtractButtonState(false);
        isExtracting = false;
      }
    }

    if (request.action === 'extraction_complete') {
      DEBUG.log('Extração completa', { 
        contextKeys: Object.keys(request.context || {}),
        chatName: request.context?.chatName,
        msgCount: request.context?.messages?.length
      });
      
      currentContext = request.context;
      chatHistory = [];
      addLog('✅ Contexto atualizado para chat IA!', false, true);
    }
  });
  
  DEBUG.log('Listener configurado');
}

DEBUG.log('Inicializando DOM...');

function initSidebar() {
  DEBUG.separator('INIT_SIDEBAR');
  
  try {
    const btnExtract = document.getElementById('btnExtract');
    const extractMode = document.getElementById('extractMode');
    const chatInput = document.getElementById('chatInput');
    const btnSend = document.getElementById('btnSend');
    
    DEBUG.log('Elementos encontrados', {
      btnExtract: !!btnExtract,
      extractMode: !!extractMode,
      chatInput: !!chatInput,
      btnSend: !!btnSend
    });
    
    if (!btnExtract) {
      DEBUG.error('INIT', new Error('btnExtract não encontrado!'));
      return;
    }
    
    initTabs();
    initExtractMode();
    initChat();
    initToggle();
    setupMessageListener();

    btnExtract.addEventListener('click', () => {
      DEBUG.log('Clique em btnExtract');
      startExtraction();
    });
    
    DEBUG.log('✅ Sidebar pronta');
  } catch (error) {
    DEBUG.error('INIT_SIDEBAR', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidebar);
} else {
  initSidebar();
}
