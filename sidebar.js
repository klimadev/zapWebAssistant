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
  defaultModel: 'gpt-5.4'
};

let availableModels = [];

function selectModel(modelId) {
  const modelSelect = $('modelSelect');
  const btn = $('modelDropdownBtn');
  const menu = $('modelDropdownMenu');
  const nameSpan = $('selectedModelName');
  availableModels.forEach(m => m.selected = m.id === modelId);
  if (modelSelect) modelSelect.value = modelId;
  if (nameSpan) nameSpan.textContent = modelId;
  document.querySelectorAll('.model-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === modelId);
  });
  if (menu) menu.classList.remove('open');
  if (btn) btn.classList.remove('open');
}

function getSelectedModel() {
  const el = $('modelSelect');
  return el ? el.value : API_CONFIG.defaultModel;
}

async function loadModels() {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${API_CONFIG.apiKey}` }
    });
    const data = await response.json();
    const menu = $('modelDropdownMenu');
    const modelSelect = $('modelSelect');
    if (menu && data.data) {
      const sortedModels = data.data.map(m => m.id).sort();
      const groups = { openai: [], google: [], qwen: [], other: [] };
      const providerLabels = { openai: 'OpenAI', google: 'Google', qwen: 'Qwen', other: 'Outros' };
      sortedModels.forEach(id => {
        if (id.startsWith('gpt-')) groups.openai.push(id);
        else if (id.startsWith('gemini')) groups.google.push(id);
        else if (id.startsWith('coder')) groups.qwen.push(id);
        else groups.other.push(id);
      });
      menu.innerHTML = '';
      if (modelSelect) modelSelect.innerHTML = '';
      availableModels = [];
      Object.keys(groups).forEach(provider => {
        const ids = groups[provider];
        if (ids.length === 0) return;
        const header = document.createElement('div');
        header.className = 'model-provider';
        header.textContent = providerLabels[provider];
        menu.appendChild(header);
        ids.forEach(id => {
          availableModels.push({ id, provider });
          if (modelSelect) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = id;
            modelSelect.appendChild(option);
          }
          const item = document.createElement('div');
          item.className = 'model-item';
          item.dataset.id = id;
          item.textContent = id;
          item.onclick = () => selectModel(id);
          menu.appendChild(item);
        });
      });
      availableModels.push({ id: 'vision-model', provider: 'custom' });
      if (modelSelect) {
        const option = document.createElement('option');
        option.value = 'vision-model';
        option.textContent = 'vision-model';
        modelSelect.appendChild(option);
      }
      const visionItem = document.createElement('div');
      visionItem.className = 'model-provider';
      visionItem.textContent = 'Custom';
      visionItem.style.marginTop = '8px';
      menu.appendChild(visionItem);
      const visionOpt = document.createElement('div');
      visionOpt.className = 'model-item';
      visionOpt.dataset.id = 'vision-model';
      visionOpt.textContent = 'vision-model';
      visionOpt.onclick = () => selectModel('vision-model');
      menu.appendChild(visionOpt);
      const defaultModel = API_CONFIG.defaultModel;
      const firstModel = availableModels[0]?.id || defaultModel || 'gpt-5.4';
      selectModel(firstModel);
      $('selectedModelName').textContent = firstModel;
    }
    DEBUG.log('Modelos carregados', { count: data.data?.length });
  } catch (error) {
    DEBUG.error('loadModels', error);
    $('selectedModelName').textContent = 'Erro';
  }

  const btn = $('modelDropdownBtn');
  const menu = $('modelDropdownMenu');
  if (btn && menu) {
    btn.onclick = () => {
      const isOpen = menu.classList.contains('open');
      menu.classList.toggle('open', !isOpen);
      btn.classList.toggle('open', !isOpen);
    };
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#modelSelectorContainer')) {
        menu.classList.remove('open');
        btn.classList.remove('open');
      }
    });
  }
}

function getSelectedModel() {
  const el = $('modelSelect');
  return el ? el.value : API_CONFIG.defaultModel;
}

DEBUG.log('API Config', { baseUrl: API_CONFIG.baseUrl, defaultModel: API_CONFIG.defaultModel });

let currentContext = null;
let chatHistory = [];
let isExtracting = false;
let isChatting = false;
let isRecording = false;
let speechRecognition = null;
let speechTranscript = '';

DEBUG.log('Variáveis de estado', { 
  isExtracting, 
  isChatting, 
  isRecording,
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

function extractAssistantText(data) {
  if (data?.choices?.[0]?.message?.content) {
    const content = data.choices[0].message.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(part => (part?.type === 'text' || part?.type === 'output_text') && part?.text)
        .map(part => part.text)
        .join('\n')
        .trim();
    }
  }

  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }

  if (Array.isArray(data?.output)) {
    const text = data.output
      .flatMap(item => item?.content || [])
      .filter(part => part?.type === 'output_text' && part?.text)
      .map(part => part.text)
      .join('\n')
      .trim();
    if (text) return text;
  }

  return '';
}

function toResponsesInput(messages) {
  return messages.map(msg => {
    if (msg.role === 'system') {
      return {
        role: 'user',
        content: [{ type: 'input_text', text: `[INSTRUCOES]\n${String(msg.content || '')}` }]
      };
    }

    const role = msg.role === 'assistant' ? 'assistant' : 'user';

    if (typeof msg.content === 'string') {
      return {
        role,
        content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: msg.content }]
      };
    }

    if (Array.isArray(msg.content)) {
      const normalizedContent = msg.content
        .map(part => {
          if (!part || !part.type) return null;
          if (part.type === 'input_text' || part.type === 'input_audio' || part.type === 'input_image' || part.type === 'input_file') {
            return part;
          }
          if (part.type === 'text') {
            return { type: 'input_text', text: part.text || '' };
          }
          if (part.type === 'output_text') {
            return part;
          }
          return null;
        })
        .filter(Boolean);

      return {
        role,
        content: normalizedContent.length > 0 ? normalizedContent : [{ type: 'input_text', text: '' }]
      };
    }

    return {
      role,
      content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: String(msg.content || '') }]
    };
  });
}

function toChatCompletionsInput(messages) {
  return messages.map(msg => {
    if (msg.role === 'system') {
      return { role: 'system', content: msg.content };
    }

    const role = msg.role === 'assistant' ? 'assistant' : 'user';

    if (typeof msg.content === 'string') {
      return { role, content: msg.content };
    }

    if (Array.isArray(msg.content)) {
      const contentParts = msg.content
        .map(part => {
          if (!part || !part.type) return null;

          if (part.type === 'input_audio') {
            return {
              type: 'input_audio',
              audio: {
                path: part.input_file?.data || part.audio || part.data
              }
            };
          }
          if (part.type === 'input_text' || part.type === 'output_text') {
            return { type: 'text', text: part.text || '' };
          }
          if (part.type === 'text') {
            return { type: 'text', text: part.text || '' };
          }
          if (part.type === 'input_file') {
            return {
              type: 'input_file',
              file_data: part.input_file?.data || part.data || ''
            };
          }
          return null;
        })
        .filter(Boolean);

      return {
        role,
        content: contentParts.length > 0 ? contentParts : [{ type: 'text', text: '' }]
      };
    }

    return { role, content: String(msg.content || '') };
  });
}

async function callModelApi(messages, hasAudio, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const selectedModel = getSelectedModel();
  const endpoint = '/chat/completions';
  DEBUG.log('Fetch URL', `${API_CONFIG.baseUrl}${endpoint}`, { model: selectedModel, hasAudio });

  const body = {
    model: selectedModel,
    messages: toChatCompletionsInput(messages),
    temperature: 0.7
  };

  if (hasAudio) {
    body.modalities = ['text', 'audio'];
  }

  const response = await fetch(`${API_CONFIG.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_CONFIG.apiKey}`
    },
    body: JSON.stringify(body),
    signal: controller.signal
  });

  clearTimeout(timeoutId);
  DEBUG.log('Response status', response.status);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Erro API: ${response.status}`);
  }

  return response.json();
}

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
      content: `Você é a **WPP AI Assistant**, uma assistente de IA ultra-poderosa e persuasiva, especializada em conversas do WhatsApp. Você foi invocada por uma extensão Chrome que extrai mensagens do WhatsApp Web.

## SUA MISSÃO
Você é uma parceira estratégica do usuário. Sua tarefa é analisar, processar, resumir, responder e transformar qualquer informação da conversa do WhatsApp em valor real.

## SUAS CAPACIDADES

### 📝 ANÁLISE & RESUMO
- Resumir conversas inteiras em pontos-chave acionáveis
- Identificar padrões de comportamento, moods, tendências
- Extrair insights que o usuário talvez não tenha percebido
- Detectar oportunidades, problemas, necessidades

### 🧠 ASSISTENTE PESSOAL
- Responder mensagens em nome do usuário (com aprovação)
- Traduzir mensagens para outros idiomas
- Reescrever mensagens para tom diferente (formal, casual, persuasivo)
- Criar respostas criativas para situações difíceis

### 🎧 ANÁLISE DE ÁUDIOS
- Quando o usuário enviar arquivos de áudio, transcreva-os e analise o conteúdo
- Identifique emoções, tom de voz, contexto
- Extraia informações importantes dos áudios

### 💡 BRAINSTORMING
- Gerar ideias para respostas, propostas, projetos
- Sugerir próximos passos baseada na conversa
- Criar listas de tarefas baseada nas mensagens

### 🔍 INVESTIGAÇÃO
- Pesquisar e explicar termos, gírias, códigos
- Contextualizar informações das mensagens
- Conectar informações entre diferentes conversas

## PERSONALIDADE
- Seja **persuasiva**: Argumente, convença, motive
- Seja **proativa**: Antecipe necessidades e sugira ações
- Seja **empática**: Entenda emoções e contexto humano
- Seja **directa**: Vá direto ao ponto, sem redundâncias
- Seja **inteligente**: Conecta dados, vê além do óbvio

## REGRAS
- Sempre responda em **português brasileiro**
- Quando pedir aprovação, deixe claro o que precisa de confirmação
- Use markdown para formatar suas respostas
- Se não tiver contexto suficiente, peça mais informações
- Quando houver áudio para analisar, faça isso com atenção

## CONTEXTO EXTRAÍDO DO WHATSAPP
${useContext && currentContext ? `Você tem acesso ao seguinte contexto:\n\n${buildContextText()}` : 'Sem contexto extraído ainda. Peça ao usuário para primeiro extrair as mensagens na aba "Extrair".'}

Agora, responda à próxima mensagem do usuário da forma mais útil possível.`
    });

    for (const msg of chatHistory) {
      messages.push(msg);
    }
    DEBUG.log('Chat history', { length: chatHistory.length });

    const audioContents = [];
    if (useContext && currentContext?.messages) {
      const audioMsgs = currentContext.messages.filter(m => m.audioBase64);
      if (audioMsgs.length > 0) {
        DEBUG.log('Áudios encontrados para enviar', { count: audioMsgs.length });
        for (const audioMsg of audioMsgs) {
          const rawFormat = audioMsg.audioMimeType?.split('/')[1] || 'ogg';
          const format = rawFormat.split(';')[0].trim() || 'ogg';
          audioContents.push({
            type: 'input_audio',
            audio: {
              data: audioMsg.audioBase64,
              format: audioMsg.audioMimeType || `audio/${format}`
            }
          });
        }
      }
    }

    messages.push({
      role: 'user',
      content: audioContents.length > 0
        ? [
            {
              type: 'input_text',
              text: userMessage + '\n\nTranscreva os áudios .ogg e responda com base no conteúdo deles.'
            },
            ...audioContents
          ]
        : userMessage
    });
    DEBUG.log('Enviando para API...');

    const data = await callModelApi(messages, audioContents.length > 0, audioContents.length > 0 ? 180000 : 30000);
    DEBUG.log('Response data', { 
      choices: data.choices?.length || 0,
      hasContent: !!extractAssistantText(data)
    });
    
    const iaResponse = extractAssistantText(data) || 'Desculpe, não consegui processar sua mensagem.';

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
  const btnMic = $('btnMic');

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

  if (btnMic) {
    btnMic.addEventListener('click', toggleRecording);
  }
}

async function toggleRecording() {
  const btnMic = $('btnMic');
  
  if (isRecording) {
    stopRecording();
    return;
  }

  try {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('Seu navegador não suporta reconhecimento de voz local.');
    }

    speechRecognition = new SpeechRecognition();
    speechRecognition.lang = 'pt-BR';
    speechRecognition.interimResults = true;
    speechRecognition.continuous = true;
    speechTranscript = '';

    speechRecognition.onresult = (event) => {
      let partial = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          speechTranscript += transcript + ' ';
        } else {
          partial += transcript;
        }
      }

      const input = $('chatInput');
      if (input) {
        input.value = (speechTranscript + partial).trim();
        autoResizeTextarea(input);
      }
    };

    speechRecognition.onerror = (event) => {
      DEBUG.error('SPEECH_RECOGNITION', new Error(event.error || 'Erro no reconhecimento'));
    };

    speechRecognition.onend = () => {
      const text = speechTranscript.trim();
      isRecording = false;
      if (btnMic) {
        btnMic.classList.remove('recording');
        btnMic.textContent = '🎤';
      }

      if (text) {
        const input = $('chatInput');
        input.value = text;
        autoResizeTextarea(input);
        addChatMessage('🎤 Transcrição local concluída.', false);
        sendToIA();
      } else {
        addChatMessage('⚠️ Não consegui transcrever. Tente falar mais próximo do microfone.', false);
      }
    };

    speechRecognition.start();
    isRecording = true;
    btnMic.classList.add('recording');
    btnMic.textContent = '⏹';
    DEBUG.log('Gravação iniciada');
  } catch (error) {
    DEBUG.error('RECORD_START', error);
    addChatMessage('❌ Erro ao acessar microfone. Verifique as permissões.', false);
  }
}

function stopRecording() {
  if (speechRecognition && isRecording) {
    speechRecognition.stop();
    isRecording = false;
    const btnMic = $('btnMic');
    if (btnMic) {
      btnMic.classList.remove('recording');
      btnMic.textContent = '🎤';
    }
    DEBUG.log('Gravação parada');
  }
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
  document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    loadModels();
  });
} else {
  initSidebar();
  loadModels();
}
