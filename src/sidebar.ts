// sidebar.ts - Side Panel UI (WhatsApp Extractor + IA)
// Executa no contexto do side panel (sidebar.html) com acesso parcial a chrome.* API

// ── Helpers (definir primeiro) ────────────────────────────────────
const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

import { escapeHtml, renderMarkdown, toChatCompletionsInput, extractAssistantText } from './utils';
import {
  loadAiConfig, saveAiConfig, loadAllContexts, saveContext,
  deleteContext, loadChatHistory, saveChatHistory,
  loadPreferences, savePreferences, cleanupOldContexts, clearStorage,
  StorageKeys, type AiConfig, type ExtractedContext, type ChatMessage,
} from './utils/storage';
import { ModelSelector } from './components/model-selector';

// ── Debug ─────────────────────────────────────────────────────────
const DEBUG = {
  prefix: '[SIDEBAR]' as const,
  step: 0,
  showInChat: false,

  log(msg: string, data?: unknown) {
    const out = `${this.prefix}:${String(this.step).padStart(2, '0')} ${msg}`;
    if (data !== undefined) console.log(out, data);
    else console.log(out);
    const container = $<HTMLElement>('chatMessages');
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
  },

  error(context: string, err: unknown) {
    console.error(`${this.prefix}:${String(this.step).padStart(2, '0')} ERRO[${context}]: ${(err as Error)?.message ?? String(err)}`, err);
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

DEBUG.separator('SIDEBAR');
DEBUG.log('Inicializando…');

// ── Config (chrome.storage.local via storage module) ───────────────
const DEFAULT_CONFIG: AiConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'https://routerai.chamalead.com/v1',
  apiKey: import.meta.env.VITE_API_KEY ?? '',
  defaultModel: import.meta.env.VITE_DEFAULT_MODEL ?? 'gpt-4o-mini',
};

let aiConfig: AiConfig = { ...DEFAULT_CONFIG };

async function loadConfig(): Promise<void> {
  aiConfig = await loadAiConfig();
  preferences = await loadPreferences();
  // load debug config
  try {
    const data = await chrome.storage.local.get('wpp_debug_show');
    DEBUG.showInChat = data.wpp_debug_show === true;
  } catch {
    DEBUG.showInChat = false;
  }
}

async function saveConfig(config: AiConfig): Promise<void> {
  aiConfig = config;
  await saveAiConfig(config);
}

async function saveConfigPartial(partial: Partial<AiConfig>): Promise<void> {
  await saveConfig({ ...aiConfig, ...partial });
  aiConfig = { ...aiConfig, ...partial };
}

// ── State ─────────────────────────────────────────────────────────
let modelSelectorComponent: ModelSelector | null = null;

// ponytail: thin shim keeps callers unchanged; component owns all UI state
function selectModel(modelId: string) { modelSelectorComponent?.select(modelId); }
function getSelectedModel(): string { return modelSelectorComponent?.getSelectedModel() ?? aiConfig.defaultModel; }
async function loadModels() { await modelSelectorComponent?.reload(); }

let availableModels: { id: string; provider: string; selected?: boolean }[] = [];
// Multi-context support — Map stored in memory, synced to chrome.storage.local
let contexts: Map<string, ExtractedContext> = new Map();
let activeContextKey: string | null = null;
let chatHistory: ChatMessage[] = [];
// Alias for active context (kept for backward compat with buildContextText etc.)
let currentContext: Record<string, any> | null = null;
let isExtracting = false;
let isChatting = false;
let isStreaming = false;
let activeAbortController: AbortController | null = null;
let isRecording = false;
let speechRecognition: any = null;
let speechTranscript = '';
let preferences: Awaited<ReturnType<typeof loadPreferences>> | null = null;
let lastApiUsage: { promptTokens?: number; totalTokens?: number } | null = null;

DEBUG.log('API Config', {
  baseUrl: aiConfig.baseUrl,
  defaultModel: aiConfig.defaultModel,
  hasKey: aiConfig.apiKey.length > 0,
});

// ── Model Selector (legacy body — replaced by ModelSelector component) ───
// ponytail: kept as dead-code stub so grep references don't break; shims above delegate
async function _loadModels_legacy() {
  if (!aiConfig.apiKey) {
    $<HTMLElement>('selectedModelName')!.textContent = 'Sem chave API';
    return;
  }

  try {
    const response = await fetch(`${aiConfig.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${aiConfig.apiKey}` },
    });
    if (!response.ok) {
      const errBody = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(errBody.error?.message ?? `HTTP ${response.status}`);
    }
    const data = (await response.json()) as { data?: Array<{ id: string }> };
    const menu = $<HTMLElement>('modelDropdownMenu');
    const modelSelect = $<HTMLSelectElement>('modelSelect');
    if (!menu || !data.data) {
      throw new Error('Resposta inválida da API (esperado { data: [...] })');
    }

    const sortedModels = data.data.map((m) => m.id).sort();
    const groups: { openai: string[]; google: string[]; qwen: string[]; other: string[] } = {
      openai: [],
      google: [],
      qwen: [],
      other: [],
    };

    const providerLabels: Record<string, string> = {
      openai: 'OpenAI',
      google: 'Google',
      qwen: 'Qwen',
      other: 'Outros',
    };

    for (const id of sortedModels) {
      if (id.startsWith('gpt-')) groups.openai.push(id);
      else if (id.startsWith('gemini')) groups.google.push(id);
      else if (id.startsWith('coder')) groups.qwen.push(id);
      else groups.other.push(id);
    }

    menu.innerHTML = '';
    if (modelSelect) modelSelect.innerHTML = '';
    availableModels = [];

    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 Buscar modelo…';
    searchInput.className = 'model-search-input';
    menu.appendChild(searchInput);

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'model-items-container';
    menu.appendChild(itemsContainer);

    for (const [provider, ids] of Object.entries(groups)) {
      if (ids.length === 0) continue;
      const header = document.createElement('div');
      header.className = 'model-provider';
      header.textContent = providerLabels[provider] ?? provider;
      itemsContainer.appendChild(header);

      for (const id of ids) {
        availableModels.push({ id, provider });
        if (modelSelect) {
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = id;
          modelSelect.appendChild(opt);
        }
        const item = document.createElement('div');
        item.className = 'model-item';
        item.dataset.id = id;
        item.textContent = id;
        item.onclick = () => selectModel(id);
        itemsContainer.appendChild(item);
      }
    }

    // Search filter
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      let curProvider: HTMLElement | null = null;
      for (let i = 0; i < itemsContainer.children.length; i++) {
        const el = itemsContainer.children[i] as HTMLElement;
        if (el.classList.contains('model-provider')) {
          curProvider = el;
          (el as HTMLElement).style.display = 'none';
        } else if (el.classList.contains('model-item')) {
          const match = !q || (el.dataset.id?.toLowerCase().includes(q) ?? false);
          el.style.display = match ? '' : 'none';
          if (match && curProvider) curProvider.style.display = '';
        }
      }
    });

    const firstId = availableModels[0]?.id ?? aiConfig.defaultModel;
    selectModel(firstId);
    const nameSpan = $<HTMLElement>('selectedModelName');
    if (nameSpan) nameSpan.textContent = firstId;

    const configStatus = $<HTMLElement>('configStatus');
    if (configStatus) {
      configStatus.textContent = `✅ ${data.data.length} modelos carregados`;
      setTimeout(() => { configStatus.innerHTML = '&nbsp;'; }, 4000);
    }

    DEBUG.log('Modelos carregados', { count: data.data.length });
  } catch (error) {
    DEBUG.error('loadModels', error);
    const nameSpan = $<HTMLElement>('selectedModelName');
    if (nameSpan) nameSpan.textContent = 'Erro';
    const configStatus = $<HTMLElement>('configStatus');
    if (configStatus) {
      configStatus.textContent = `❌ Falha: ${(error as Error).message}`;
    }
  }

  // Dropdown toggle + outside click
  const btn = $<HTMLElement>('modelDropdownBtn');
  const menu = $<HTMLElement>('modelDropdownMenu');
  if (btn && menu) {
    btn.onclick = () => {
      menu.classList.toggle('open');
      btn.classList.toggle('open');
    };
    document.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('#modelSelectorContainer')) {
        menu.classList.remove('open');
        btn.classList.remove('open');
      }
    });
  }
}

// ── UI Functions ──────────────────────────────────────────────────
function addLog(message: string, isError = false, isSuccess = false) {
  const status = $<HTMLElement>('status');
  if (!status) return;

  const entry = document.createElement('div');
  entry.className = `log-entry${isError ? ' error' : ''}${isSuccess ? ' success' : ''}`;
  entry.textContent = message;
  status.appendChild(entry);
  status.scrollTop = status.scrollHeight;

  const globalStatus = $<HTMLElement>('globalStatus');
  if (globalStatus) {
    if (isError) globalStatus.textContent = 'Erro na execução';
    else if (isSuccess) globalStatus.textContent = 'Extração concluída';
    else globalStatus.textContent = message.replace(/^[^\wÀ-ÿ]+/, '').slice(0, 42);
  }
}

function addChatMessage(text: string, isUser = false, isThinking = false): HTMLElement | null {
  const container = $<HTMLElement>('chatMessages');
  if (!container) return null;

  const div = document.createElement('div');
  div.className = `message ${isUser ? 'user' : 'ia'}${isThinking ? ' thinking' : ''}`;

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

function updateExtractButtonState(isLoading: boolean) {
  const btn = $<HTMLButtonElement>('btnExtract');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Extraindo…' : 'Extrair mensagens';
}

function updateSendButtonState(isLoading: boolean) {
  const btn = $<HTMLButtonElement>('btnSend');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Enviando…' : 'Enviar';
}

// ── Extraction ────────────────────────────────────────────────────
function getFilterConfig(): Record<string, unknown> {
  const mode = ($<HTMLSelectElement>('extractMode')?.value) ?? 'last_24h';
  switch (mode) {
    case 'last_24h':
      return { mode: 'last_24h' };
    case 'date_range': {
      const date = ($<HTMLInputElement>('fromDate')?.value) ?? '';
      const time = ($<HTMLInputElement>('fromTime')?.value) ?? '00:00';
      if (!date) throw new Error('Selecione uma data válida.');
      return { mode: 'date_range', fromDate: new Date(`${date}T${time}`).toISOString() };
    }
    case 'last_x_days': {
      const days = parseInt(($<HTMLInputElement>('daysCount')?.value) ?? '0', 10);
      if (!days || days < 1) throw new Error('Número de dias inválido.');
      return { mode: 'last_x_days', days };
    }
    case 'all':
      return { mode: 'all' };
    default:
      throw new Error(`Modo inválido: ${mode}`);
  }
}

function getModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    last_24h: 'Últimas 24h',
    date_range: 'Data específica',
    last_x_days: 'Últimos dias',
    all: 'Todas',
  };
  return labels[mode] ?? mode;
}

async function startExtraction() {
  if (isExtracting) return;
  isExtracting = true;
  updateExtractButtonState(true);

  const statusEl = $<HTMLElement>('status');
  if (statusEl) statusEl.innerHTML = '';
  const includeAudio = ($<HTMLInputElement>('includeAudio')?.checked) ?? false;
  const includeImage = ($<HTMLInputElement>('includeImage')?.checked) ?? false;

  try {
    const filterConfig = getFilterConfig();
    addLog(`🚀 Iniciando extração (${getModeLabel(filterConfig.mode as string)})…`);

    filterConfig.includeAudio = includeAudio;
    filterConfig.includeImage = includeImage;

    // Side panel NO contexto content script: precisa enviar via background
    const response = await chrome.runtime.sendMessage({
      action: 'start_extraction',
      filter: filterConfig,
    });

    if (!response?.success) {
      throw new Error((response?.error as string) ?? 'Erro desconhecido');
    }

    addLog('💉 Extração iniciada!');
  } catch (error) {
    DEBUG.error('START_EXTRACTION', error);
    addLog(`❌ ${(error as Error).message}`, true);
    addLog('Certifique-se de estar na aba do WhatsApp Web.', true);
    updateExtractButtonState(false);
    isExtracting = false;
  }
}

// ── IA Assistant ───────────────────────────────────────────────────
async function callModelApi(
  messages: Array<{ role: string; content: string | unknown[] }>,
  hasAudio: boolean,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('Timeout excedido'), timeoutMs);

  const selectedModel = getSelectedModel();
  const endpoint = '/chat/completions';

  const body: Record<string, unknown> = {
    model: selectedModel,
    messages: toChatCompletionsInput(messages),
    temperature: 0.7,
  };
  if (hasAudio) body.modalities = ['text', 'audio'];

  const response = await fetch(`${aiConfig.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiConfig.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);
  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errorData.error?.message ?? `Erro API: ${response.status}`);
  }

  const data = await response.json() as Record<string, unknown>;

  // capture usage
  const usageData = data?.usage as Record<string, number> | undefined;
  if (usageData) {
    lastApiUsage = {
      promptTokens: usageData.prompt_tokens ?? usageData.promptTokens,
      totalTokens: usageData.total_tokens ?? usageData.totalTokens,
    };
  }

  return data;
}

async function callModelApiStream(
  messages: Array<{ role: string; content: string | unknown[] }>,
  hasAudio: boolean,
  timeoutMs: number,
  onChunk: (fullText: string) => void,
  onController?: (controller: AbortController) => void,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort('Timeout excedido'), timeoutMs);

  const selectedModel = getSelectedModel();
  const body: Record<string, unknown> = {
    model: selectedModel,
    messages: toChatCompletionsInput(messages),
    temperature: 0.7,
    stream: true,
  };
  if (hasAudio) body.modalities = ['text', 'audio'];

  const response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiConfig.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  clearTimeout(timeoutId);
  if (!response.ok) {
    const errBody = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(errBody.error?.message ?? `Erro API: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        // capture usage from streaming response (some APIs send it in final chunk)
        if (parsed.usage) {
          lastApiUsage = {
            promptTokens: parsed.usage.prompt_tokens ?? parsed.usage.promptTokens,
            totalTokens: parsed.usage.total_tokens ?? parsed.usage.totalTokens,
          };
        }
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) { result += delta; onChunk(result); }
      } catch { /* chunk incompleto */ }
    }
  }
  return result;
}

function buildContextText(): string {
  if (!currentContext) return '';

  const ctx = currentContext;
  let text = `--- DADOS DA CONVERSA ---\n`;
  text += `Chat: ${ctx.chatName}\n`;
  text += `Data extração: ${ctx.extractedAt}\n`;
  text += `Filtro: ${ctx.filter?.label ?? 'N/A'}\n`;
  text += `Total mensagens: ${ctx.stats?.total ?? 0}\n`;
  text += `Áudios: ${ctx.stats?.audiosDownloaded ?? 0}\n`;
  text += `Imagens: ${ctx.stats?.imagesDownloaded ?? 0}\n\n`;

  if (ctx.messages) {
    const audioFiles: string[] = [];
    const imageFiles: string[] = [];
    for (const m of ctx.messages) {
      if (m.audioFile) audioFiles.push(m.audioFile);
      if (m.imageFile) imageFiles.push(m.imageFile);
    }

    if (audioFiles.length > 0) text += `--- ARQUIVOS DE ÁUDIO ---\n${audioFiles.join(', ')}\n\n`;
    if (imageFiles.length > 0) text += `--- ARQUIVOS DE IMAGEM ---\n${imageFiles.join(', ')}\n\n`;

    text += `--- MENSAGENS ---\n`;
    text += ctx.messages
      .map((m: { timestamp: number; sender: string; content: string }) => {
        const time = new Date(m.timestamp * 1000).toLocaleString('pt-BR');
        return `[${time}] ${m.sender}: ${m.content}`;
      })
      .join('\n');
  }

  return text;
}

async function sendToIA() {
  if (isChatting) return;

  const input = $<HTMLTextAreaElement>('chatInput');
  const useContextCheck = ($<HTMLInputElement>('useContext')?.checked) ?? false;
  const userMessage = input?.value.trim();
  if (!userMessage) return;

  isChatting = true;
  isStreaming = false;
  updateSendButtonState(true);
  hideStopButton();
  if (input) {
    input.value = '';
    autoResizeTextarea(input);
  }

  addChatMessage(userMessage, true);
  const thinkingMsg = addChatMessage('🤔 Pensando…', false, true);

  // Build messages outside try so catch can access for retry
  const messages: ChatMessage[] = [];

  messages.push({
    role: 'system',
    content: `Você é a **WPP AI Assistant**, uma assistente de IA ultra-poderosa e persuasiva, especializada em conversas do WhatsApp.


## SUA MISSÃO
Analisar, processar, resumir, responder e transformar qualquer informação da conversa do WhatsApp em valor real.

## SUAS CAPACIDADES
- Resumir conversas em pontos-chave acionáveis
- Identificar padrões, moods, tendências
- Extrair insights não óbvios
- Responder mensagens, traduzir, reescrever
- Transcrever e analisar áudios
- Sugerir próximos passos

## PERSONALIDADE
- Persuasiva, proativa, empática, direta, inteligente

## REGRAS
- Sempre responda em **português brasileiro**
- Use markdown para formatar respostas
- Se não tiver contexto, peça mais informações

## CONTEXTO EXTRAÍDO DO WHATSAPP
${
  useContextCheck && currentContext
    ? `Você tem acesso ao seguinte contexto:\n\n${buildContextText()}`
    : 'Sem contexto extraído ainda. Peça ao usuário para primeiro extrair as mensagens na aba "Extrair".'
}

Agora, responda à próxima mensagem do usuário.`,
    });

    for (const msg of chatHistory) {
      messages.push(msg);
    }

    // Build audioContents outside try for retry access
    const audioContents: Array<{ type: string; audio: Record<string, unknown> }> = [];
    if (useContextCheck && currentContext?.messages) {
      const audioMsgs = (currentContext.messages as Array<{ audioBase64?: string; audioMimeType?: string }>).filter(
        (m) => m.audioBase64,
      );
      for (const audioMsg of audioMsgs) {
        const format = audioMsg.audioMimeType?.split('/')[1]?.split(';')[0]?.trim() ?? 'ogg';
        audioContents.push({
          type: 'input_audio',
          audio: { data: audioMsg.audioBase64, format: audioMsg.audioMimeType ?? `audio/${format}` },
        });
      }
    }

    messages.push({
      role: 'user',
      content:
        audioContents.length > 0
          ? ([
              { type: 'input_text', text: userMessage + '\n\nTranscreva os áudios e responda com base no conteúdo deles.' },
              ...audioContents,
            ] as unknown as string)
          : userMessage,
    });

  try {
    isStreaming = true;
    showStopButton();
    activeAbortController = new AbortController();

    let iaResponse: string;
    try {
      iaResponse = await callModelApiStream(
        messages,
        audioContents.length > 0,
        audioContents.length > 0 ? 180_000 : 30_000,
        (text) => {
          if (thinkingMsg) {
            thinkingMsg.classList.remove('thinking');
            thinkingMsg.classList.add('md');
            thinkingMsg.innerHTML = renderMarkdown(text) + '<span class="stream-cursor">|</span>';
          }
        },
        (controller) => { activeAbortController = controller; },
      );
    } catch (streamErr) {
      // Fallback to non-streaming if streaming fails
      DEBUG.warn('Streaming failed, falling back to blocking fetch', streamErr);
      iaResponse = await callModelApi(messages, audioContents.length > 0, audioContents.length > 0 ? 180_000 : 30_000)
        .then(data => extractAssistantText(data) || '');
    }

    if (!iaResponse) iaResponse = 'Desculpe, não consegui processar sua mensagem.';

    if (thinkingMsg) {
      thinkingMsg.classList.remove('thinking');
      thinkingMsg.classList.add('md');
      thinkingMsg.innerHTML = renderMarkdown(iaResponse);
    }

    // Add chat actions
    addChatActions(thinkingMsg!, iaResponse);

    chatHistory.push({ role: 'user', content: userMessage });
    chatHistory.push({ role: 'assistant', content: iaResponse });

    // Save chat history per context
    if (activeContextKey) {
      await saveChatHistory(activeContextKey, chatHistory);
    }
  } catch (error) {
    DEBUG.error('CATCH_ERROR', error);
    const msg = (error as Error).message;

    // Specific error handling
    if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('API key')) {
      addChatMessage('❌ **API key inválida ou expirada.** [Ir para Config](/#config)', false);
    } else if (msg.includes('429') || msg.includes('rate limit') || msg.includes('Too Many Requests')) {
      addChatMessage('❌ **Muitas requisições.** Aguarde um momento e tente novamente.', false);
      addLog('⏳ Tentando novamente em 2s…');
      await new Promise(r => setTimeout(r, 2000));
      try {
        const data = await callModelApi(messages, audioContents.length > 0, 30_000);
        const retryText = extractAssistantText(data) || '';
        if (thinkingMsg) {
          thinkingMsg.classList.remove('thinking');
          thinkingMsg.classList.add('md');
          thinkingMsg.innerHTML = renderMarkdown(retryText);
        }
        chatHistory.push({ role: 'user', content: userMessage });
        chatHistory.push({ role: 'assistant', content: retryText });
        if (activeContextKey) await saveChatHistory(activeContextKey, chatHistory);
        isChatting = false;
        updateSendButtonState(false);
        hideStopButton();
        isStreaming = false;
        return;
      } catch { /* ignore retry failure */ }
    } else if (msg.includes('TypeError') || msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
      addChatMessage('❌ **Sem conexão com a internet.** Verifique sua rede.', false);
    } else if (msg.includes('500') || msg.includes('5') || msg.includes('server')) {
      addChatMessage('❌ **Erro no servidor da API.** Tente novamente mais tarde.', false);
    }

    if (thinkingMsg) {
      const errDiv = document.createElement('div');
      errDiv.className = 'message ia';
      errDiv.textContent = `❌ Erro: ${(error as Error).message}`;
      thinkingMsg.replaceWith(errDiv);
    } else {
      addChatMessage(`❌ Erro: ${(error as Error).message}`, false);
    }
  } finally {
    isChatting = false;
    isStreaming = false;
    updateSendButtonState(false);
    hideStopButton();
    activeAbortController = null;
  }
}

// ── Auto-resize Textarea ──────────────────────────────────────────
function autoResizeTextarea(input: HTMLTextAreaElement | null) {
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

// ── Speech Recognition ────────────────────────────────────────────
async function toggleRecording() {
  const btnMic = $<HTMLElement>('btnMic');
  if (isRecording) {
    stopRecording();
    return;
  }

  try {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) throw new Error('Seu navegador não suporta reconhecimento de voz local.');

    speechRecognition = new SpeechRecognitionCtor();
    speechRecognition.lang = 'pt-BR';
    speechRecognition.interimResults = true;
    speechRecognition.continuous = true;
    speechTranscript = '';

    speechRecognition.onresult = (event: SpeechRecognitionEvent) => {
      let partial = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i]?.[0]?.transcript ?? '';
        if (event.results[i]?.isFinal) {
          speechTranscript += transcript + ' ';
        } else {
          partial += transcript;
        }
      }

      const input = $<HTMLTextAreaElement>('chatInput');
      if (input) {
        input.value = (speechTranscript + partial).trim();
        autoResizeTextarea(input);
      }
    };

    speechRecognition.onerror = (evt: any) => {
      DEBUG.error('SPEECH_RECOGNITION', new Error(evt?.error ?? 'Erro no reconhecimento'));
    };

    speechRecognition.onend = () => {
      const text = speechTranscript.trim();
      isRecording = false;
      if (btnMic) {
        btnMic.classList.remove('recording');
        btnMic.textContent = '🎤';
      }

      if (text) {
        const input = $<HTMLTextAreaElement>('chatInput');
        if (input) {
          input.value = text;
          autoResizeTextarea(input);
        }
        addChatMessage('🎤 Transcrição local concluída.', false);
        sendToIA();
      } else {
        addChatMessage('⚠️ Não consegui transcrever. Tente falar mais próximo do microfone.', false);
      }
    };

    speechRecognition.start();
    isRecording = true;
    btnMic?.classList.add('recording');
    if (btnMic) btnMic.textContent = '⏹';
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
    const btnMic = $<HTMLElement>('btnMic');
    if (btnMic) {
      btnMic.classList.remove('recording');
      btnMic.textContent = '🎤';
    }
  }
}

// ── Multi-Context ────────────────────────────────────────────────
function generateContextKey(chatId: string): string {
  return `ctx_${chatId}_${Date.now()}`;
}

async function loadContextsFromStorage(): Promise<void> {
  const stored = await loadAllContexts();
  contexts = new Map(Object.entries(stored));
  // cleanup old
  const removed = await cleanupOldContexts(90);
  if (removed > 0) DEBUG.log(`Limpeza: ${removed} contextos antigos removidos`);
}

function getContextList(): ExtractedContext[] {
  return Array.from(contexts.values())
    .sort((a, b) => new Date(b.extractedAt).getTime() - new Date(a.extractedAt).getTime());
}

function renderContextSelector() {
  const container = $<HTMLElement>('contextSelector');
  if (!container) return;
  const list = getContextList();
  if (list.length === 0) {
    container.innerHTML = '<div class="helper-text" style="padding:6px 0">Nenhum contexto extraído</div>';
    return;
  }
  container.innerHTML = list.map(ctx => {
    const key = ctx.chatId;
    const active = key === activeContextKey ? ' selected' : '';
    const count = (ctx.messages?.length ?? 0);
    const date = new Date(ctx.extractedAt).toLocaleDateString('pt-BR');
    return `<div class="context-chip${active}" data-key="${key}">
      <span class="context-chip-name">${escapeHtml(ctx.chatName)}</span>
      <span class="context-chip-meta">${count} msgs • ${date}</span>
      <button class="context-chip-del" data-key="${key}" title="Remover">&times;</button>
    </div>`;
  }).join('');

  // click to switch
  container.querySelectorAll('.context-chip').forEach(el => {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('context-chip-del')) return;
      const key = (el as HTMLElement).dataset.key!;
      switchContext(key);
    });
  });
  container.querySelectorAll('.context-chip-del').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const key = (el as HTMLElement).dataset.key!;
      await deleteContext(key);
      contexts.delete(key);
      if (activeContextKey === key) {
        activeContextKey = null;
        currentContext = null;
        chatHistory = [];
      }
      renderContextSelector();
      updateChatDisplay();
    });
  });
}

function switchContext(key: string) {
  const ctx = contexts.get(key);
  if (!ctx) return;
  activeContextKey = key;
  currentContext = ctx as any;
  // load chat history for this context
  loadChatHistory(key).then(h => { chatHistory = h; });
  renderContextSelector();
  updateChatDisplay();
  // update status
  const gs = $<HTMLElement>('globalStatus');
  if (gs) gs.textContent = `Contexto: ${ctx.chatName}`;
  addLog(`📂 Switch para: ${ctx.chatName}`);
}

function updateChatDisplay() {
  const container = $<HTMLElement>('chatMessages');
  if (!container) return;
  container.innerHTML = '';
  if (!activeContextKey) {
    container.innerHTML = `<div class="message ia md"><p>Nenhum contexto ativo. Extraia uma conversa ou selecione uma existente.</p></div>`;
  } else {
    // restore welcome + chat history messages
    const ctx = contexts.get(activeContextKey);
    const welcome = document.createElement('div');
    welcome.className = 'message ia md';
    welcome.innerHTML = `<h3>${escapeHtml(ctx?.chatName ?? 'Conversa')}</h3><p>Faça perguntas sobre esta conversa.</p>`;
    container.appendChild(welcome);
    for (const msg of chatHistory) {
      const div = document.createElement('div');
      const isUser = msg.role === 'user';
      div.className = `message ${isUser ? 'user' : 'ia'}${!isUser ? ' md' : ''}`;
      if (isUser) div.textContent = typeof msg.content === 'string' ? msg.content : '';
      else div.innerHTML = renderMarkdown(typeof msg.content === 'string' ? msg.content : '');
      container.appendChild(div);
    }
    container.scrollTop = container.scrollHeight;
  }
}

async function onExtractionComplete(context: Record<string, any>) {
  const ctx = context as unknown as ExtractedContext;
  const key = ctx.chatId || generateContextKey(ctx.chatName || 'chat');
  ctx.chatId = key;
  await saveContext(key, ctx);
  contexts.set(key, ctx);
  activeContextKey = key;
  currentContext = ctx as any;
  chatHistory = [];
  await saveChatHistory(key, []);
  renderContextSelector();
  updateChatDisplay();
  addLog('✅ Contexto salvo e pronto para chat!', false, true);
  // auto-transcribe if enabled
  if (preferences?.autoTranscribe) {
    addLog('🎤 Transcrevendo áudios automaticamente...');
    const btn = $<HTMLElement>('btnTranscribe');
    if (btn) btn.click();
  }
}

// ── Theme Toggle ─────────────────────────────────────────────────
function applyTheme(theme: 'light' | 'dark' | 'system') {
  const html = document.documentElement;
  if (theme === 'system') {
    html.removeAttribute('data-theme');
  } else {
    html.dataset.theme = theme;
  }
  const btn = $<HTMLElement>('btnTheme');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

async function toggleTheme() {
  const current = preferences?.theme ?? 'system';
  const next = current === 'dark' ? 'light' : current === 'light' ? 'system' : 'dark';
  preferences = await savePreferences({ theme: next });
  applyTheme(next);
  addLog(`🎨 Tema: ${next === 'dark' ? 'escuro' : next === 'light' ? 'claro' : 'sistema'}`);
}

// ── Keyboard Shortcuts ───────────────────────────────────────────
const SHORTCUTS: Record<string, () => void> = {};

function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    // suppress when typing in inputs
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      // still allow Ctrl+ combinations
      if (!e.ctrlKey && !e.metaKey) return;
    }

    const key = [
      e.ctrlKey || e.metaKey ? 'Ctrl' : '',
      e.shiftKey ? 'Shift' : '',
      e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key,
    ].filter(Boolean).join('+');

    const handler = SHORTCUTS[key];
    if (handler) {
      e.preventDefault();
      handler();
    }
  });
}

// Register shortcuts (called from init)
function registerShortcuts() {
  SHORTCUTS['Ctrl+Enter'] = () => {
    if (!isExtracting) startExtraction();
  };
  SHORTCUTS['Ctrl+Shift+Enter'] = () => {
    if (!isChatting) sendToIA();
  };
  SHORTCUTS['/'] = () => {
    const search = $<HTMLInputElement>('searchInput');
    if (search) { search.focus(); search.select(); }
  };
  SHORTCUTS['Escape'] = () => {
    const search = $<HTMLInputElement>('searchInput');
    if (search && document.activeElement === search) { search.value = ''; search.blur(); clearSearch(); return; }
    // close open panels
    const menus = document.querySelectorAll('.model-dropdown-menu.open, .context-selector.open');
    menus.forEach(m => m.classList.remove('open'));
  };
  SHORTCUTS['Ctrl+,'] = () => {
    // switch to config tab
    const configTab = document.querySelector('.tab[data-tab="config"]') as HTMLElement;
    configTab?.click();
  };
}

// ── Full-text Search ─────────────────────────────────────────────
let searchData: Array<{ sender: string; content: string; timestamp: number; type: string }> = [];
let searchResults: Array<{ sender: string; content: string; timestamp: number }> = [];
let selectedSender: string | null = null;

function buildSearchIndex() {
  if (!currentContext?.messages) return;
  searchData = (currentContext.messages as Array<Record<string, unknown>>).map(m => ({
    sender: String(m.sender ?? ''),
    content: String(m.content ?? ''),
    timestamp: Number(m.timestamp ?? 0),
    type: String(m.type ?? 'text'),
  }));
}

function renderSearchSenders(query: string) {
  const container = $<HTMLElement>('searchSenders');
  if (!container) return;
  if (!query.trim() || searchData.length === 0) { container.innerHTML = ''; return; }
  const senders = [...new Set(searchData.map(m => m.sender))].sort();
  container.innerHTML = `<button class="sender-chip${selectedSender === null ? ' active' : ''}" data-sender="">Todos</button>` +
    senders.map(s => `<button class="sender-chip${selectedSender === s ? ' active' : ''}" data-sender="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('');
  container.querySelectorAll('.sender-chip').forEach(el => {
    el.addEventListener('click', () => {
      selectedSender = (el as HTMLElement).dataset.sender ?? null;
      performSearch(query);
    });
  });
}

function performSearch(query: string): void {
  const container = $<HTMLElement>('searchResults');
  if (!container) return;
  renderSearchSenders(query);
  if (!query.trim()) { container.innerHTML = ''; container.classList.remove('visible'); return; }

  const q = query.toLowerCase();
  let filtered = searchData
    .filter(m => m.content.toLowerCase().includes(q) || m.sender.toLowerCase().includes(q));
  if (selectedSender) filtered = filtered.filter(m => m.sender === selectedSender);
  searchResults = filtered.map(m => ({ sender: m.sender, content: m.content, timestamp: m.timestamp }));

  if (searchResults.length === 0) {
    container.innerHTML = `<div class="helper-text">Nenhuma mensagem encontrada para: "${escapeHtml(query)}"</div>`;
  } else {
    container.innerHTML = searchResults.slice(0, 50).map(r => {
      const idx = r.content.toLowerCase().indexOf(q);
      let display = escapeHtml(r.content);
      if (idx !== -1) {
        const before = escapeHtml(r.content.slice(0, idx));
        const match = escapeHtml(r.content.slice(idx, idx + q.length));
        const after = escapeHtml(r.content.slice(idx + q.length));
        display = `${before}<mark>${match}</mark>${after}`;
      }
      const time = new Date(r.timestamp * 1000).toLocaleString('pt-BR');
      return `<div class="search-result-item">
        <span class="search-sender">${escapeHtml(r.sender)}</span>
        <span class="search-text">${display}</span>
        <span class="search-time">${time}</span>
      </div>`;
    }).join('');
    container.querySelectorAll('.search-result-item').forEach((el, i) => {
      const result = searchResults[i];
      if (result) el.addEventListener('click', () => showMessageContext(result));
    });
  }
  container.classList.add('visible');
}

function clearSearch() {
  const container = $<HTMLElement>('searchResults');
  if (container) { container.innerHTML = ''; container.classList.remove('visible'); }
}

function showMessageContext(result: { sender: string; content: string; timestamp: number }) {
  if (!currentContext?.messages) return;
  const msgs = currentContext.messages as Array<Record<string, unknown>>;
  const idx = msgs.findIndex(m => m.timestamp === result.timestamp && m.content === result.content);
  if (idx === -1) return;
  const start = Math.max(0, idx - 3);
  const end = Math.min(msgs.length, idx + 4);
  const context = msgs.slice(start, end);

  // Clear chat and show context window
  const container = $<HTMLElement>('chatMessages');
  if (!container) return;
  container.innerHTML = `<div class="message ia md"><p><strong>Contexto próximo à mensagem:</strong></p></div>`;
  for (const m of context) {
    const div = document.createElement('div');
    div.className = `message ${m.timestamp === result.timestamp ? 'user' : 'ia'}`;
    if (m.timestamp === result.timestamp) div.classList.add('user');
    div.textContent = `[${new Date(Number(m.timestamp) * 1000).toLocaleString('pt-BR')}] ${m.sender}: ${m.content}`;
    container.appendChild(div);
  }
  container.scrollTop = container.scrollHeight;
}

// ── Token Counter ────────────────────────────────────────────────
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function updateTokenCount() {
  const input = $<HTMLTextAreaElement>('chatInput');
  const el = $<HTMLElement>('tokenCount');
  if (!input || !el) return;
  const text = input.value.trim();
  if (!text && !activeContextKey) { el.textContent = ''; return; }
  let total = estimateTokens(text);
  if (activeContextKey && currentContext) {
    total += estimateTokens(buildContextText());
  }
  // show actual API usage if available
  if (lastApiUsage?.promptTokens) {
    el.textContent = `~${total} est. | ${lastApiUsage.promptTokens} reais (última req)`;
  } else {
    el.textContent = `~${total} tokens`;
  }
  // warn at 90% of typical context (assume 128k model)
  if (total > 115_200) {
    el.style.color = 'var(--warning, #d97706)';
  } else {
    el.style.color = 'var(--text-ter, #868e96)';
  }
}

// ── Chat Actions ─────────────────────────────────────────────────
function addChatActions(div: HTMLElement, text: string) {
  const actions = document.createElement('div');
  actions.className = 'chat-actions-bar';
  actions.innerHTML = `
    <button class="chat-action-btn" data-action="copy" title="Copiar">📋</button>
    <button class="chat-action-btn" data-action="regenerate" title="Regenerar">🔄</button>
    <button class="chat-action-btn" data-action="export" title="Exportar TXT">📥</button>
  `;
  div.appendChild(actions);

  actions.querySelector('[data-action="copy"]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      const btn = actions.querySelector('[data-action="copy"]')!;
      btn.textContent = '✅';
      setTimeout(() => { btn.textContent = '📋'; }, 1500);
    } catch { /* ignore */ }
  });

  actions.querySelector('[data-action="regenerate"]')?.addEventListener('click', () => {
    // re-send last user message
    if (chatHistory.length < 2) return;
    const lastUser = chatHistory[chatHistory.length - 2];
    if (lastUser?.role === 'user') {
      chatHistory = chatHistory.slice(0, -2); // remove last exchange
      const input = $<HTMLTextAreaElement>('chatInput');
      if (input) {
        input.value = typeof lastUser.content === 'string' ? lastUser.content : '';
        autoResizeTextarea(input);
      }
      sendToIA();
    }
  });

  actions.querySelector('[data-action="export"]')?.addEventListener('click', () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resposta-ia-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ── Stop button for streaming ───────────────────────────────────
function showStopButton() {
  const el = $<HTMLElement>('btnStop');
  if (el) el.style.display = '';
}

function hideStopButton() {
  const el = $<HTMLElement>('btnStop');
  if (el) el.style.display = 'none';
}

// ── Quick Summary ────────────────────────────────────────────────
async function quickSummary(type: string) {
  if (!activeContextKey || !currentContext || isChatting) return;
  const labels: Record<string, string> = {
    quick: 'Resumo rápido',
    key_points: 'Pontos principais',
    decisions: 'Decisões',
    actions: 'Ações pendentes',
  };
  const prompts: Record<string, string> = {
    quick: 'Faça um resumo conciso desta conversa em 3-5 parágrafos.',
    key_points: 'Liste os pontos principais discutidos nesta conversa em tópicos.',
    decisions: 'Identifique e liste as decisões tomadas nesta conversa.',
    actions: 'Extraia todas as ações pendentes e tarefas desta conversa.',
  };

  const msg = (prompts[type] ?? prompts.quick) ?? '';
  const label = labels[type] ?? 'Resumo';

  const input = $<HTMLTextAreaElement>('chatInput');
  if (input) input.value = msg;
  addLog(`📝 Gerando ${label.toLowerCase()}...`);
  await sendToIA();
}

// ── Conversation Stats ───────────────────────────────────────────
function showConversationStats() {
  if (!currentContext?.messages) {
    addLog('⚠️ Nenhum contexto ativo para gerar estatísticas.', true);
    return;
  }
  const msgs = currentContext.messages as Array<Record<string, unknown>>;
  const total = msgs.length;
  const bySender: Record<string, number> = {};
  const byHour: number[] = new Array(24).fill(0);
  const wordFreq: Record<string, number> = {};
  const stopwords = new Set(['de','da','do','em','para','com','um','uma','os','as','que','é','não','o','a','e','se','por','no','na','dos','das','mas','lhe','nos','aos','das','pelo','pela','ser','são','foi','mais','muito','sua','seu','seus','suas','como','já','até','também','quando','porque','está','pode','ter','tem']);
  let audioCount = 0;
  let imageCount = 0;
  let minTs = Infinity;
  let maxTs = 0;

  for (const m of msgs) {
    const sender = String(m.sender ?? 'desconhecido');
    bySender[sender] = (bySender[sender] ?? 0) + 1;

    const ts = Number(m.timestamp ?? 0);
    if (ts) {
      const h = new Date(ts * 1000).getHours();
      byHour[h] = (byHour[h] ?? 0) + 1;
      if (ts < minTs) minTs = ts;
      if (ts > maxTs) maxTs = ts;
    }

    if (m.type === 'audio' || m.audioBase64) audioCount++;
    if (m.type === 'image' || m.imageBase64) imageCount++;

    const words = String(m.content ?? '').toLowerCase().split(/\W+/).filter(Boolean);
    for (const w of words) {
      if (w.length < 3 || stopwords.has(w)) continue;
      wordFreq[w] = (wordFreq[w] ?? 0) + 1;
    }
  }

  const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const senderPct = Object.entries(bySender).map(([name, count]) => ({
    name, count, pct: ((count / total) * 100).toFixed(1),
  })).sort((a, b) => b.count - a.count);

  const maxHour = Math.max(...byHour, 1);
  const hourBars = byHour.map((c, h) => {
    const barLen = Math.round((c / maxHour) * 20);
    return `${String(h).padStart(2, '0')}h ${'█'.repeat(barLen)}${barLen < 20 ? '░'.repeat(20 - barLen) : ''} ${c}`;
  }).join('\n');

  const statsText = [
    `📊 **Estatísticas da Conversa**`,
    ``,
    `📝 **Total de mensagens:** ${total}`,
    ``,
    `**Remetentes:**`,
    ...senderPct.map(s => `  • ${escapeHtml(s.name)}: ${s.count} (${s.pct}%)`),
    ``,
    audioCount > 0 ? `🎵 **Áudios:** ${audioCount}` : ``,
    imageCount > 0 ? `🖼️ **Imagens:** ${imageCount}` : ``,
    minTs < Infinity ? `📅 **Período:** ${new Date(minTs * 1000).toLocaleDateString('pt-BR')} — ${new Date(maxTs * 1000).toLocaleDateString('pt-BR')}` : ``,
    ``,
    `**Atividade por hora:**`,
    `\`\`\``,
    hourBars,
    `\`\`\``,
    ``,
    topWords.length > 0 ? `**Palavras mais frequentes:**` : ``,
    ...topWords.map(([w, c]) => `  • ${escapeHtml(w)}: ${c}x`),
  ].filter(Boolean).join('\n');

  const container = $<HTMLElement>('chatMessages');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'message ia md';
  div.innerHTML = renderMarkdown(statsText);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ── Audio Transcription UI ───────────────────────────────────────
function renderTranscribeButton() {
  const el = $<HTMLElement>('btnTranscribe');
  if (!el) return;
  if (!activeContextKey || !currentContext?.messages) { el.style.display = 'none'; return; }
  const audioMsgs = (currentContext.messages as Array<Record<string, unknown>>).filter(m => m.audioBase64);
  if (audioMsgs.length === 0) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.textContent = `🎤 Transcrever áudios (${audioMsgs.length})`;
}
interface TestResult {
  models: { ok: boolean; status: string; count: number };
  chat: { ok: boolean; status: string; latency: number };
}

async function testConnection(baseUrl: string, apiKey: string, modelId?: string): Promise<TestResult> {
  const result: TestResult = { models: { ok: false, status: '', count: 0 }, chat: { ok: false, status: '', latency: 0 } };

  // Test 1: GET /models
  try {
    const t0 = performance.now();
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = await res.json() as { data?: Array<unknown> };
      result.models.ok = true;
      result.models.status = `HTTP ${res.status}`;
      result.models.count = data.data?.length ?? 0;
    } else {
      const errBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
      result.models.status = errBody.error?.message ?? `HTTP ${res.status}`;
    }
  } catch (e) {
    result.models.status = (e as Error).message;
  }

  // Test 2: POST /chat/completions (ping simples)
  try {
    const t0 = performance.now();
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelId ?? getSelectedModel(), messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(15_000),
    });
    result.chat.latency = Math.round(performance.now() - t0);
    result.chat.ok = res.ok;
    result.chat.status = res.ok ? `HTTP ${res.status} (${result.chat.latency}ms)` : `HTTP ${res.status}`;
  } catch (e) {
    result.chat.status = (e as Error).message;
  }

  return result;
}

// ── Config UI ─────────────────────────────────────────────────────
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = 'tab-' + (tab as HTMLElement).dataset.tab;
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      contents.forEach((c) => c.classList.toggle('active', c.id === targetId));
    });
  });
}

function populateConfigForm() {
  const baseUrlInput = $<HTMLInputElement>('configBaseUrl');
  const apiKeyInput = $<HTMLInputElement>('configApiKey');
  const modelInput = $<HTMLInputElement>('configDefaultModel');
  if (baseUrlInput) baseUrlInput.value = aiConfig.baseUrl;
  if (apiKeyInput) apiKeyInput.value = aiConfig.apiKey;
  if (modelInput) modelInput.value = aiConfig.defaultModel;
}

function initConfig() {
  const btnSave = $<HTMLElement>('btnSaveConfig');
  const btnLoad = $<HTMLElement>('btnLoadModels');
  const status = $<HTMLElement>('configStatus');
  const debugCb = $<HTMLInputElement>('configShowDebug');

  if (debugCb) {
    debugCb.checked = DEBUG.showInChat;
    debugCb.addEventListener('change', async () => {
      DEBUG.showInChat = debugCb.checked;
      await chrome.storage.local.set({ wpp_debug_show: debugCb.checked });
      if (status) status.textContent = debugCb.checked ? '✅ Debug ativado' : '🔇 Debug desativado';
      setTimeout(() => { if (status) status.innerHTML = '&nbsp;'; }, 2500);
    });
  }

  btnSave?.addEventListener('click', async () => {
    const baseUrl = ($<HTMLInputElement>('configBaseUrl')?.value ?? '').replace(/\/+$/, '');
    const apiKey = $<HTMLInputElement>('configApiKey')?.value ?? '';
    const defaultModel = $<HTMLInputElement>('configDefaultModel')?.value ?? '';

    if (!baseUrl) {
      if (status) status.textContent = '⚠️ URL base é obrigatória.';
      return;
    }
    if (!apiKey) {
      if (status) status.textContent = '⚠️ Chave da API é obrigatória.';
      return;
    }

    await saveConfig({ baseUrl, apiKey, defaultModel });
    // Update the component so it reloads models with new credentials
    modelSelectorComponent?.updateConfig({ baseUrl, apiKey, defaultModel });
    if (status) status.textContent = '✅ Configuração salva!';
    setTimeout(() => { if (status) status.innerHTML = '&nbsp;'; }, 3000);
    loadModels();
  });

  const btnTest = $<HTMLElement>('btnTestConn');

  btnTest?.addEventListener('click', async () => {
    const baseUrl = ($<HTMLInputElement>('configBaseUrl')?.value ?? '').replace(/\/+$/, '');
    const apiKey = $<HTMLInputElement>('configApiKey')?.value ?? '';
    if (!baseUrl || !apiKey) {
      if (status) status.textContent = '⚠️ Preencha URL e chave primeiro.';
      return;
    }
    if (status) {
      status.textContent = '🔄 Testando…';
      (btnTest as HTMLButtonElement).disabled = true;
    }
    const r = await testConnection(baseUrl, apiKey);
    const lines: string[] = [];
    lines.push(`📡 Models: ${r.models.ok ? '✅' : '❌'} ${r.models.status}${r.models.count ? ` (${r.models.count} modelos)` : ''}`);
    lines.push(`💬 Chat: ${r.chat.ok ? '✅' : '❌'} ${r.chat.status}`);
    if (status) {
      status.innerHTML = lines.join('<br>');
      setTimeout(() => { status.innerHTML = '&nbsp;'; }, 6000);
    }
    DEBUG.log('Teste conexão', r);
    (btnTest as HTMLButtonElement).disabled = false;
  });

  btnLoad?.addEventListener('click', async () => {
    const baseUrl = ($<HTMLInputElement>('configBaseUrl')?.value ?? '').replace(/\/+$/, '');
    const apiKey = $<HTMLInputElement>('configApiKey')?.value ?? '';

    if (!baseUrl || !apiKey) {
      if (status) status.textContent = '⚠️ Preencha URL e chave primeiro.';
      return;
    }

    // temporariamente usa o que está no form p/ testar
    const savedUrl = aiConfig.baseUrl;
    const savedKey = aiConfig.apiKey;
    aiConfig.baseUrl = baseUrl;
    aiConfig.apiKey = apiKey;
    if (status) status.textContent = '🔄 Carregando modelos…';
    await loadModels().catch(() => {});
    // restaura — só salva se clicar em Salvar
    aiConfig.baseUrl = savedUrl;
    aiConfig.apiKey = savedKey;
  });

  populateConfigForm();
}

// ── Init (async) ──────────────────────────────────────────────────
async function main() {
  await loadConfig();
  await loadContextsFromStorage();

  // ── Bootstrap ModelSelector component ────────────────────────────
  const modelSelectorEl = $<HTMLElement>('modelSelectorContainer');
  if (modelSelectorEl) {
    modelSelectorComponent = new ModelSelector(modelSelectorEl, {
      baseUrl: aiConfig.baseUrl,
      apiKey: aiConfig.apiKey,
      defaultModel: aiConfig.defaultModel,
      label: 'Modelo',
      onSelect: (id) => {
        availableModels.forEach((m) => (m.selected = m.id === id));
        DEBUG.log('Modelo selecionado', id);
      },
      onError: (err) => DEBUG.error('ModelSelector', err),
    });
  }

  initSidebar();
  initConfig();
  initShortcuts();
  registerShortcuts();
  await loadModels();
  // apply saved theme
  if (preferences?.theme) applyTheme(preferences.theme);
  // render context selector
  renderContextSelector();
  // render transcribe button if applicable
  renderTranscribeButton();

  // Stop button handler
  $<HTMLElement>('btnStop')?.addEventListener('click', () => {
    if (activeAbortController) {
      activeAbortController.abort('Parado pelo usuário');
      addLog('⏹ Streaming interrompido pelo usuário');
    }
  });

  // Search input handler
  const searchInput = $<HTMLInputElement>('searchInput');
  searchInput?.addEventListener('input', () => {
    if (currentContext) {
      if (!searchData.length) buildSearchIndex();
      performSearch(searchInput.value);
    }
  });

  // Theme toggle
  $<HTMLElement>('btnTheme')?.addEventListener('click', toggleTheme);

  // Summary buttons
  $<HTMLElement>('btnQuickSummary')?.addEventListener('click', () => quickSummary('quick'));
  $<HTMLElement>('btnKeyPoints')?.addEventListener('click', () => quickSummary('key_points'));

  // Stats button
  $<HTMLElement>('btnStats')?.addEventListener('click', showConversationStats);

  // Clear data action
  $<HTMLElement>('btnClearData')?.addEventListener('click', async () => {
    if (confirm('Limpar todos os dados locais (contextos, histórico, configurações)?')) {
      await clearStorage();
      contexts.clear();
      activeContextKey = null;
      currentContext = null;
      chatHistory = [];
      searchData = [];
      renderContextSelector();
      updateChatDisplay();
      addLog('🗑️ Todos os dados foram limpos.');
    }
  });

  // Transcribe button
  $<HTMLElement>('btnTranscribe')?.addEventListener('click', async () => {
    if (!currentContext?.messages) return;
    const audioMsgs = (currentContext.messages as Array<Record<string, unknown>>).filter(m => m.audioBase64);
    let transcribed = 0;
    for (let i = 0; i < audioMsgs.length; i++) {
      const msg = audioMsgs[i]!;
      addLog(`🔄 Transcrevendo áudio ${i + 1}/${audioMsgs.length}…`);
      try {
        // Send audio to API for transcription
        const resp = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiConfig.apiKey}` },
          body: JSON.stringify({
            model: getSelectedModel(),
            messages: [{
              role: 'user',
              content: [
                { type: 'input_text', text: 'Transcreva este áudio.' },
                { type: 'input_audio', audio: { data: msg.audioBase64, format: msg.audioMimeType || 'audio/ogg' } },
              ],
            }],
          }),
        });
        if (resp.ok) {
          const data = await resp.json() as Record<string, unknown>;
          const text = extractAssistantText(data);
          if (text) {
            msg.transcript = text;
            delete msg.audioBase64; // replace with transcript
            msg.content = `[TRANSCRITO] ${text}`;
            transcribed++;
          }
        }
      } catch (e) {
        DEBUG.error('TRANSCRIBE', e);
      }
    }
    addLog(`✅ ${transcribed}/${audioMsgs.length} áudios transcritos.`);
    if (transcribed < audioMsgs.length) {
      addLog(`⚠️ ${audioMsgs.length - transcribed} falhas na transcrição.`, true);
    }
    renderTranscribeButton();
  });

  // Token counter on input change
  const chatInput = $<HTMLTextAreaElement>('chatInput');
  chatInput?.addEventListener('input', updateTokenCount);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { main(); });
} else {
  main();
}

function initExtractMode() {
  const modeSelect = $<HTMLSelectElement>('extractMode');
  const dateRangeFields = $<HTMLElement>('dateRangeFields');
  const lastXDaysFields = $<HTMLElement>('lastXDaysFields');

  modeSelect?.addEventListener('change', () => {
    const mode = modeSelect.value;
    dateRangeFields?.classList.toggle('visible', mode === 'date_range');
    lastXDaysFields?.classList.toggle('visible', mode === 'last_x_days');
  });

  // auto-transcribe toggle
  const autoTx = $<HTMLInputElement>('autoTranscribe');
  if (autoTx && preferences) {
    autoTx.checked = preferences.autoTranscribe;
    autoTx.addEventListener('change', async () => {
      preferences = await savePreferences({ autoTranscribe: autoTx.checked });
    });
  }
}

function initChat() {
  const input = $<HTMLTextAreaElement>('chatInput');
  const btnSend = $<HTMLElement>('btnSend');
  const btnMic = $<HTMLElement>('btnMic');

  autoResizeTextarea(input);

  const sendMessage = () => {
    if (!isChatting) sendToIA();
  };

  btnSend?.addEventListener('click', sendMessage);
  input?.addEventListener('input', () => autoResizeTextarea(input));
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  btnMic?.addEventListener('click', toggleRecording);
}

function initToggle() {
  $<HTMLElement>('btnToggle')?.addEventListener('click', () => window.close());
}

function setupMessageListener() {
  chrome.runtime.onMessage.addListener((
    request: { action: string; message?: string; context?: Record<string, unknown> },
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: Record<string, unknown>) => void,
  ) => {
    DEBUG.log('Mensagem recebida', { action: request.action });

    if (request.action === 'update_status' && request.message) {
      addLog(request.message);
      if (request.message.includes('concluído') || request.message.includes('Erro')) {
        updateExtractButtonState(false);
        isExtracting = false;
      }
    }

    if (request.action === 'extraction_complete' && request.context) {
      updateExtractButtonState(false);
      isExtracting = false;
      onExtractionComplete(request.context);
    }

    sendResponse({ success: true });
    return true;
  });
}

function initSidebar() {
  const btnExtract = $<HTMLElement>('btnExtract');
  if (!btnExtract) {
    DEBUG.error('INIT', new Error('btnExtract não encontrado'));
    return;
  }

  initTabs();
  initExtractMode();
  initChat();
  initToggle();
  setupMessageListener();

  btnExtract.addEventListener('click', () => startExtraction());
  DEBUG.log('✅ Sidebar pronta');
}

