// sidebar.ts - Side Panel UI (WhatsApp Extractor + IA)
// Executa no contexto do side panel (sidebar.html) com acesso parcial a chrome.* API

// ── Helpers (definir primeiro) ────────────────────────────────────
const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

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

// ── Config (chrome.storage + fallback import.meta.env) ─────────────
interface AiConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

const STORAGE_KEY = 'wpp_ai_config';

const DEFAULT_CONFIG: AiConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'https://api.openai.com/v1',
  apiKey: import.meta.env.VITE_API_KEY ?? '',
  defaultModel: import.meta.env.VITE_DEFAULT_MODEL ?? 'gpt-4o-mini',
};

let aiConfig: AiConfig = { ...DEFAULT_CONFIG };

async function loadConfig(): Promise<void> {
  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    if (stored[STORAGE_KEY]) {
      aiConfig = { ...DEFAULT_CONFIG, ...stored[STORAGE_KEY] as Partial<AiConfig> };
    }
  } catch {
    aiConfig = { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(config: AiConfig): Promise<void> {
  aiConfig = config;
  await chrome.storage.sync.set({ [STORAGE_KEY]: config });
}

// ── State ─────────────────────────────────────────────────────────
interface ModelInfo {
  id: string;
  provider: string;
  selected?: boolean;
}

let availableModels: ModelInfo[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentContext: Record<string, any> | null = null;
let chatHistory: Array<{ role: string; content: string | unknown[] }> = [];
let isExtracting = false;
let isChatting = false;
let isRecording = false;
let speechRecognition: any = null;
let speechTranscript = '';

DEBUG.log('API Config', {
  baseUrl: aiConfig.baseUrl,
  defaultModel: aiConfig.defaultModel,
  hasKey: aiConfig.apiKey.length > 0,
});

// ── Model Selector ────────────────────────────────────────────────
function selectModel(modelId: string) {
  const modelSelect = $<HTMLSelectElement>('modelSelect');
  const btn = $<HTMLElement>('modelDropdownBtn');
  const menu = $<HTMLElement>('modelDropdownMenu');
  const nameSpan = $<HTMLElement>('selectedModelName');

  availableModels.forEach((m) => (m.selected = m.id === modelId));
  if (modelSelect) modelSelect.value = modelId;
  if (nameSpan) nameSpan.textContent = modelId;

  document.querySelectorAll('.model-item').forEach((el) => {
    el.classList.toggle('selected', (el as HTMLElement).dataset.id === modelId);
  });
  menu?.classList.remove('open');
  btn?.classList.remove('open');
}

function getSelectedModel(): string {
  const el = $<HTMLSelectElement>('modelSelect');
  return el?.value ?? aiConfig.defaultModel;
}

async function loadModels() {
  if (!aiConfig.apiKey) {
    $<HTMLElement>('selectedModelName')!.textContent = 'Sem chave API';
    return;
  }

  try {
    const response = await fetch(`${aiConfig.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${aiConfig.apiKey}` },
    });
    const data = (await response.json()) as { data?: Array<{ id: string }> };
    const menu = $<HTMLElement>('modelDropdownMenu');
    const modelSelect = $<HTMLSelectElement>('modelSelect');
    if (!menu || !data.data) return;

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

    for (const [provider, ids] of Object.entries(groups)) {
      if (ids.length === 0) continue;
      const header = document.createElement('div');
      header.className = 'model-provider';
      header.textContent = providerLabels[provider] ?? provider;
      menu.appendChild(header);

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
        menu.appendChild(item);
      }
    }

    const firstId = availableModels[0]?.id ?? aiConfig.defaultModel;
    selectModel(firstId);
    const nameSpan = $<HTMLElement>('selectedModelName');
    if (nameSpan) nameSpan.textContent = firstId;

    DEBUG.log('Modelos carregados', { count: data.data.length });
  } catch (error) {
    DEBUG.error('loadModels', error);
    const nameSpan = $<HTMLElement>('selectedModelName');
    if (nameSpan) nameSpan.textContent = 'Erro';
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkdown(text: string): string {
  const raw = String(text ?? '');
  let html = escapeHtml(raw);

  // Block-level
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Blockquote
  html = html.replace(/^>\s?(.*)$/gm, '<blockquote>$1</blockquote>');
  // Inline
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Paragraphs
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Unordered list
  html = html.replace(/(?:^|\n)([-*])\s+(.+)(?=(?:\n[-*]\s+)|\n\n|$)/g, (_match) => {
    const items = _match
      .trim()
      .split(/\n/)
      .map((line) => `<li>${line.replace(/^[-*]\s+/, '').trim()}</li>`)
      .join('');
    return `\n<ul>${items}</ul>`;
  });

  // Ordered list
  html = html.replace(/(?:^|\n)(\d+)\.\s+(.+)(?=(?:\n\d+\.\s+)|\n\n|$)/g, (_match) => {
    const items = _match
      .trim()
      .split(/\n/)
      .map((line) => `<li>${line.replace(/^\d+\.\s+/, '').trim()}</li>`)
      .join('');
    return `\n<ol>${items}</ol>`;
  });

  // Cleanup empty wrappers
  html = html.replace(/<p>\s*(<(h\d|ul|ol|pre|blockquote)[\s\S]*?>[\s\S]*?<\/(h\d|ul|ol|pre|blockquote)>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
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
function extractAssistantText(data: Record<string, unknown>): string {
  const choice = (data.choices as Array<Record<string, unknown>> | undefined)?.[0];
  const content = choice?.message as Record<string, unknown> | undefined;
  if (content?.content) {
    const c = content.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      const text = (c as Array<Record<string, string>>)
        .filter((p) => (p.type === 'text' || p.type === 'output_text') && p.text)
        .map((p) => p.text)
        .join('\n')
        .trim();
      if (text) return text;
    }
  }

  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;

  if (Array.isArray(data.output)) {
    const text = (data.output as Array<Record<string, unknown>>)
      .flatMap((item) => (item.content as Array<Record<string, string>>) ?? [])
      .filter((p) => p?.type === 'output_text' && p.text)
      .map((p) => p.text)
      .join('\n')
      .trim();
    if (text) return text;
  }

  return '';
}

function toChatCompletionsInput(
  messages: Array<{ role: string; content: string | unknown[] }>,
): Array<{ role: string; content: unknown }> {
  return messages.map((msg) => {
    if (msg.role === 'system') return { role: 'system', content: msg.content };

    const role = msg.role === 'assistant' ? 'assistant' : 'user';

    if (typeof msg.content === 'string') {
      return { role, content: msg.content };
    }

    if (Array.isArray(msg.content)) {
      const contentParts = (msg.content as Array<Record<string, unknown>>)
        .map((part) => {
          if (!part?.type) return null;
          if (part.type === 'input_audio') {
            return {
              type: 'input_audio',
              audio: {
                data: ((part as any).input_file?.data ?? (part as any).audio ?? (part as any).data) as string,
              },
            };
          }
          if (part.type === 'input_text' || part.type === 'output_text' || part.type === 'text') {
            return { type: 'text', text: (part as Record<string, string>).text ?? '' };
          }
          if (part.type === 'input_file') {
            return { type: 'input_file', file_data: (part.input_file as Record<string, string>)?.data ?? part.data ?? '' };
          }
          return null;
        })
        .filter(Boolean);

      return {
        role,
        content: contentParts.length > 0 ? contentParts : [{ type: 'text', text: '' }],
      };
    }

    return { role, content: String(msg.content ?? '') };
  });
}

async function callModelApi(
  messages: Array<{ role: string; content: string | unknown[] }>,
  hasAudio: boolean,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

  return response.json() as Promise<Record<string, unknown>>;
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
  updateSendButtonState(true);
  if (input) {
    input.value = '';
    autoResizeTextarea(input);
  }

  addChatMessage(userMessage, true);
  const thinkingMsg = addChatMessage('🤔 Pensando…', false, true); // com classe 'thinking'

  try {
    const messages: Array<{ role: string; content: string | unknown[] }> = [];

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

    // Chat history
    for (const msg of chatHistory) {
      messages.push(msg);
    }

    // Áudios do contexto
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

    const data = await callModelApi(messages, audioContents.length > 0, audioContents.length > 0 ? 180_000 : 30_000);

    const iaResponse = extractAssistantText(data) || 'Desculpe, não consegui processar sua mensagem.';

    // Remove o "Pensando…" e mostra resposta real
    if (thinkingMsg) thinkingMsg.remove();
    addChatMessage(iaResponse, false);

    chatHistory.push({ role: 'user', content: userMessage });
    chatHistory.push({ role: 'assistant', content: iaResponse });
  } catch (error) {
    DEBUG.error('CATCH_ERROR', error);
    if (thinkingMsg) thinkingMsg.remove();
    addChatMessage(`❌ Erro: ${(error as Error).message}`, false);
  } finally {
    isChatting = false;
    updateSendButtonState(false);
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
    if (status) status.textContent = '✅ Configuração salva!';
    setTimeout(() => { if (status) status.innerHTML = '&nbsp;'; }, 3000);
    loadModels();
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
  initSidebar();
  initConfig();
  await loadModels();
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
      currentContext = request.context;
      chatHistory = [];
      addLog('✅ Contexto atualizado para chat IA!', false, true);
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

