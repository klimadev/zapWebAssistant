// injected.ts - Script injetado no contexto da página WhatsApp Web
// Acessa API WPP.connect para extrair mensagens e mídia
// Carregado via content.ts → chrome.runtime.getURL

// ── Types ─────────────────────────────────────────────────────────
interface FilterConfig {
  mode: string;
  includeAudio?: boolean;
  includeImage?: boolean;
  fromDate?: string;
  days?: number;
  [key: string]: unknown;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface WPPChatMessage {
  id: { _serialized: string; id?: string };
  t: number;
  type: string;
  body?: string;
  caption?: string;
  fromMe?: boolean;
  sender?: Record<string, any>;
  author?: string;
  from?: string;
  mimetype?: string;
  mediaType?: string;
  filename?: string;
  timestamp?: number;
  [key: string]: any;
}

interface WPPContact {
  name?: string;
  pushname?: string;
  formattedName?: string;
  [key: string]: any;
}

interface ContextMetadata {
  chatName: string;
  chatId: string;
  extractedAt: string;
  me: { userId: string | null; displayName: string };
  filter: { mode: string; label: string };
  stats: {
    total: number;
    audios: number;
    audiosDownloaded: number;
    images: number;
    imagesDownloaded: number;
  };
  messages: ContextMessage[];
}

interface ContextMessage {
  id: WPPChatMessage['id'];
  timestamp: number;
  sender: string;
  fromMe: boolean;
  type: string;
  content: string;
  audioFile: string | null;
  audioBase64: string | null;
  audioMimeType: string | null;
  imageFile: string | null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Systematic Debug ──────────────────────────────────────────────
const DEBUG = {
  prefix: '[WPP-INJECTED]' as const,
  step: 0,

  log(msg: string, data?: unknown) {
    const out = `${this.prefix}:${String(this.step).padStart(2, '0')} ${msg}`;
    if (data !== undefined) console.log(out, data);
    else console.log(out);
    this.step++;
  },

  error(context: string, err: unknown) {
    console.error(
      `${this.prefix}:${String(this.step).padStart(2, '0')} ERRO[${context}]`,
      {
        message: (err as Error)?.message ?? String(err),
        type: (err as Error)?.constructor?.name ?? typeof err,
        stack: (err as Error)?.stack,
      },
    );
    this.step++;
  },

  warn(msg: string, data?: unknown) {
    console.warn(`${this.prefix}:${String(this.step).padStart(2, '0')} WARN: ${msg}`, data);
    this.step++;
  },

  info(label: string, data?: unknown) {
    console.info(`${this.prefix}:${String(this.step).padStart(2, '0')} ${label}`, data);
    this.step++;
  },

  separator(label = '') {
    console.log(`${this.prefix} --- ${label || 'SEPARATOR'} ---`);
  },
};

// ── UI Logging ────────────────────────────────────────────────────
function dispatchStatus(msg: string) {
  window.dispatchEvent(new CustomEvent('WPP_EXT_STATUS', { detail: msg }));
}

// ── Ler Config do Dataset ─────────────────────────────────────────
const myScript = document.currentScript || document.getElementById('wpp-extractor-injected');
const JSZIP_URL = myScript?.dataset?.libJszip ?? '';
const WPP_URL = myScript?.dataset?.libWpp ?? '';
const FILTER_CONFIG_RAW = myScript?.dataset?.filterConfig;

if (!JSZIP_URL || !WPP_URL) {
  console.error('[WPP-INJECTED] Libs não localizadas no dataset');
  dispatchStatus('Erro interno: Libs não localizadas.');
  throw new Error('Missing lib paths in dataset');
}

const FILTER_CONFIG: FilterConfig = FILTER_CONFIG_RAW
  ? (JSON.parse(FILTER_CONFIG_RAW) as FilterConfig)
  : { mode: 'last_24h', includeAudio: true, includeImage: true };

const INCLUDE_AUDIO = FILTER_CONFIG.includeAudio !== false;
const INCLUDE_IMAGE = FILTER_CONFIG.includeImage !== false;

DEBUG.separator('INICIALIZAÇÃO');
DEBUG.log('Config carregada', { JSZIP_URL: JSZIP_URL.slice(0, 60), WPP_URL: WPP_URL.slice(0, 60), FILTER_CONFIG });

// ── Loaders ───────────────────────────────────────────────────────
function loadScript(url: string, globalCheck: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = (window as unknown as Record<string, unknown>)[globalCheck];
    if (existing) {
      DEBUG.log(`${globalCheck} já carregado no cache global`);
      dispatchStatus(`${globalCheck} já carregado.`);
      resolve();
      return;
    }

    dispatchStatus(`⬇️ Carregando ${globalCheck}…`);

    // AMD workaround (JSZip usa define)
    let restoreDefine: (() => void) | null = null;
    if (globalCheck === 'JSZip' && typeof (window as any).define === 'function' && (window as any).define.amd) {
      const originalDefine = (window as any).define;
      (window as any).define = undefined;
      restoreDefine = () => { (window as any).define = originalDefine; };
    }

    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      if (restoreDefine) restoreDefine();
      DEBUG.log(`${globalCheck} carregado`, { loaded: !!(window as unknown as Record<string, unknown>)[globalCheck] });
      dispatchStatus(`${globalCheck} carregado.`);
      resolve();
    };
    script.onerror = () => {
      if (restoreDefine) restoreDefine();
      reject(new Error(`Falha ao carregar ${url}`));
    };
    document.head.appendChild(script);
  });
}

async function waitForWPP(): Promise<void> {
  if (!window.WPP) throw new Error('WPP não definido.');

  dispatchStatus('⏳ Aguardando WPP…');

  return new Promise((resolve) => {
    if (window.WPP.webpack?.isReady) {
      resolve();
      return;
    }
    window.WPP.webpack.onReady(() => resolve());
  });
}

// ── Helpers ───────────────────────────────────────────────────────
let myUserId: string | null = null;
let myDisplayName = 'Eu';

async function getMyUserInfo() {
  try {
    myUserId = window.WPP.conn.getMyUserId();
    if (myUserId) {
      const myContact = await window.WPP.contact.get(myUserId) as WPPContact | null;
      if (myContact) {
        myDisplayName = myContact.pushname || myContact.formattedName || myContact.name || myDisplayName;
      }
    }
    DEBUG.log('Usuário identificado', { myUserId, myDisplayName });
  } catch (err) {
    DEBUG.error('GET_MY_USER', err);
  }
}

function getSenderName(msg: WPPChatMessage): string {
  if (msg.fromMe) return myDisplayName;

  const senderObj = msg.sender || {};
  const name = senderObj.pushname || senderObj.formattedName || senderObj.name;
  if (name) return name;

  const id = msg.author || msg.from;
  if (id) {
    const rawId = typeof id === 'string' ? id : (id as { _serialized?: string })._serialized;
    const cleanId = rawId?.split('@')[0];
    if (cleanId) return `+${cleanId}`;
  }

  return 'Desconhecido';
}

function normalizeMessages(messages: unknown): WPPChatMessage[] {
  if (!messages) return [];
  if (Array.isArray(messages)) return messages;
  if (typeof messages === 'object' && messages !== null) {
    const obj = messages as Record<string, unknown>;
    if (typeof obj.getModelsArray === 'function') return (obj.getModelsArray() as WPPChatMessage[]) ?? [];
    if (Array.isArray(obj.models)) return obj.models as WPPChatMessage[];
    if (Array.isArray(obj._models)) return obj._models as WPPChatMessage[];
    if (typeof obj.toArray === 'function') return (obj.toArray() as WPPChatMessage[]) ?? [];
  }
  return [];
}

// ── Fetch Mensagens ───────────────────────────────────────────────
async function fetchChatMessages(
  chatId: string,
  activeChat: Record<string, unknown> | null,
): Promise<WPPChatMessage[]> {
  const errors: string[] = [];

  // Método 1: WPP.chat.getMessages
  if (typeof window.WPP?.chat?.getMessages === 'function') {
    try {
      const messages = await window.WPP.chat.getMessages(chatId, { count: -1 });
      const normalized = normalizeMessages(messages);
      if (normalized.length > 0) return normalized;
    } catch (error) {
      errors.push(`getMessages: ${(error as Error).message}`);
    }
  }

  // Método 2: loadAndGetAllMessagesInChat
  if (typeof window.WPP?.chat?.loadAndGetAllMessagesInChat === 'function') {
    try {
      const messages = await window.WPP.chat.loadAndGetAllMessagesInChat(chatId, true);
      const normalized = normalizeMessages(messages);
      if (normalized.length > 0) return normalized;
    } catch (error) {
      errors.push(`loadAndGetAllMessagesInChat: ${(error as Error).message}`);
    }
  }

  // Método 3: Chat ativo
  if (activeChat) {
    try {
      const loadFn = (activeChat.loadEarlierMsgs as (() => Promise<boolean>) | undefined)
        ?? (activeChat.loadEarlierMessages as (() => Promise<boolean>) | undefined);
      if (typeof loadFn === 'function') {
        for (let i = 0; i < 50; i++) {
          const loaded = await loadFn();
          if (!loaded) break;
          await new Promise((r) => setTimeout(r, 150));
        }
      }

      const normalized = normalizeMessages(activeChat.msgs);
      if (normalized.length > 0) return normalized;
    } catch (error) {
      errors.push(`chatAtivo: ${(error as Error).message}`);
    }
  }

  throw new Error(`Não foi possível obter mensagens. Erros: ${errors.join(' | ')}`.trim());
}

// ── Download Mídia com Concurrency ────────────────────────────────
async function downloadMedia(
  msgId: { _serialized: string },
): Promise<Blob | null> {
  const raw = await window.WPP.chat.downloadMedia(msgId);
  if (!raw) return null;
  if (typeof raw === 'string' && raw.startsWith('data:')) {
    return fetch(raw).then((r) => r.blob());
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return raw;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function buildFilename(
  prefix: string,
  msg: WPPChatMessage,
  extension: string,
): string {
  const timestamp = new Date(msg.t * 1000)
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);
  const msgIdFull = msg.id?.id
    ?? (msg.id?._serialized ? msg.id._serialized.split('_')[0] : 'unknown');
  const cleanId = (msgIdFull ?? 'unknown').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  return `${prefix}_${timestamp}_${cleanId}.${extension}`;
}

function guessExtension(mimetype: string | undefined, fallback: string): string {
  if (!mimetype) return fallback;
  const ext = mimetype.split('/')[1]?.split(';')[0]?.trim();
  return ext ?? fallback;
}

// ── Main Extraction ───────────────────────────────────────────────
(async function startExtraction() {
  DEBUG.separator('START_EXTRACTION');

  try {
    dispatchStatus('🚀 Iniciando extração…');

    // 1. JSZip
    DEBUG.log('01. Carregando JSZip…');
    await loadScript(JSZIP_URL, 'JSZip');
    if (!window.JSZip) throw new Error('JSZip não carregou');
    DEBUG.log('JSZip OK');

    // 2. WPP.connect
    DEBUG.log('02. Carregando WPP.connect…');
    await loadScript(WPP_URL, 'WPP');
    if (!window.WPP) throw new Error('WPP não carregou');
    DEBUG.log('WPP OK');

    // 3. Aguardar WPP ready
    DEBUG.log('03. Aguardando WPP…');
    await waitForWPP();
    await getMyUserInfo();

    // 4. Chat ativo
    const activeChat = window.WPP.chat.getActiveChat() as Record<string, unknown> | null;
    let chatId = activeChat as unknown as string;
    if (chatId && typeof chatId === 'object') {
      const obj = chatId as Record<string, unknown>;
      const id = obj.id as { _serialized?: string } | string | undefined;
      if (id && typeof id === 'object') chatId = (id as { _serialized?: string })._serialized ?? String(id);
      else if (typeof id === 'string') chatId = id;
    }
    if (!chatId || typeof chatId !== 'string') {
      throw new Error('Nenhum chat ativo encontrado. Abra uma conversa.');
    }

    dispatchStatus(`📂 Chat: ${chatId}`);
    DEBUG.log('Chat ativo', { chatId });

    const contact = await window.WPP.contact.get(chatId) as WPPContact | null;
    const chatName = contact?.name || contact?.pushname || contact?.formattedName || chatId;

    // 5. Filtro
    const now = Date.now();
    let minTimestampSeconds: number;
    let filterLabel: string;

    switch (FILTER_CONFIG.mode) {
      case 'last_24h':
        minTimestampSeconds = Math.floor((now - 24 * 60 * 60 * 1000) / 1000);
        filterLabel = 'Últimas 24h';
        break;
      case 'date_range': {
        const fromDate = new Date(FILTER_CONFIG.fromDate ?? now);
        minTimestampSeconds = Math.floor(fromDate.getTime() / 1000);
        filterLabel = `Desde ${fromDate.toLocaleString('pt-BR')}`;
        break;
      }
      case 'last_x_days': {
        const days = FILTER_CONFIG.days ?? 7;
        minTimestampSeconds = Math.floor((now - days * 24 * 60 * 60 * 1000) / 1000);
        filterLabel = `Últimos ${days} dias`;
        break;
      }
      case 'all':
        minTimestampSeconds = 0;
        filterLabel = 'Todas as mensagens';
        break;
      default:
        throw new Error(`Modo de filtro inválido: ${FILTER_CONFIG.mode}`);
    }

    DEBUG.log('Filtro', { filterLabel, minTimestampSeconds });

    // 6. Buscar mensagens
    dispatchStatus('🔍 Buscando mensagens…');
    const allMessages = await fetchChatMessages(chatId, activeChat);
    const filteredMessages = allMessages.filter(
      (m) => (m.t ?? m.timestamp ?? 0) >= minTimestampSeconds,
    );

    if (filteredMessages.length === 0) {
      throw new Error(`Nenhuma mensagem encontrada (${filterLabel}).`);
    }
    dispatchStatus(`📊 ${filteredMessages.length} mensagens (${filterLabel}).`);
    DEBUG.log('Mensagens', { total: allMessages.length, filtradas: filteredMessages.length });

    // 7. ZIP
    const zip = new JSZip();
    const audioFolder = zip.folder('audios');
    const imageFolder = zip.folder('imagens');

    let txtContent = `Extrato de Conversa: ${chatName}\n`;
    txtContent += `Filtro: ${filterLabel}\n`;
    txtContent += `Gerado em: ${new Date().toLocaleString()}\n`;
    txtContent += `Total Mensagens: ${filteredMessages.length}\n`;
    txtContent += `MEU NOME NESTA CONVERSA: ${myDisplayName}\n\n---\n`;

    const metadata: ContextMetadata = {
      chatName,
      chatId,
      extractedAt: new Date().toISOString(),
      me: { userId: myUserId, displayName: myDisplayName },
      filter: { mode: FILTER_CONFIG.mode, label: filterLabel },
      stats: {
        total: filteredMessages.length,
        audios: 0,
        audiosDownloaded: 0,
        images: 0,
        imagesDownloaded: 0,
      },
      messages: [],
    };

    // ── Processamento com download paralelo ─────────────────────────
    dispatchStatus('⚙️ Processando mensagens…');

    const MAX_CONCURRENT = 3; // limite concorrência download mídia
    let audioCount = 0;
    let successAudioCount = 0;
    let imageCount = 0;
    let successImageCount = 0;

    // Fila de downloads
    const pendingDownloads: Array<() => Promise<void>> = [];

    for (let i = 0; i < filteredMessages.length; i++) {
      const msg = filteredMessages[i]!;
      const dateStr = new Date(msg.t * 1000).toLocaleString();
      const sender = getSenderName(msg);
      let contentText = '';
      let audioFileName: string | null = null;
      let audioBase64: string | null = null;
      let audioMimeType: string | null = null;
      let imageFileName: string | null = null;
      let isAudio = false;
      let isImage = false;

      // ── Tipo ────────────────────────────────────────────────────
      switch (msg.type) {
        case 'chat':
          contentText = msg.body ?? '';
          break;
        case 'image':
          isImage = true;
          imageCount++;
          contentText = '[IMAGEM]';
          break;
        case 'video':
          contentText = '[VIDEO]';
          break;
        case 'sticker':
          contentText = '[STICKER]';
          break;
        case 'document':
          contentText = `[DOCUMENTO] ${msg.filename ?? ''}`;
          break;
        case 'location':
          contentText = '[LOCALIZAÇÃO]';
          break;
        case 'vcard':
        case 'multi_vcard':
          contentText = '[CONTATO]';
          break;
        case 'audio':
        case 'ptt':
          if (INCLUDE_AUDIO) {
            isAudio = true;
            audioCount++;
          }
          contentText = '[ÁUDIO]';
          break;
        default:
          contentText =
            msg.body && !msg.body.startsWith('data:')
              ? msg.body
              : `[TIPO: ${(msg.type ?? 'DESCONHECIDO').toUpperCase()}]`;
      }

      // ── Caption ─────────────────────────────────────────────────
      if (msg.caption) contentText += `\n   Legenda: ${msg.caption}`;

      // ── Adicionar ao TXT ────────────────────────────────────────
      txtContent += `[${dateStr}] ${sender}: ${contentText}\n------------------------------------------\n`;

      // ── Agendar download de áudio ───────────────────────────────
      if (isAudio && INCLUDE_AUDIO) {
        const idx = i;
        pendingDownloads.push(async () => {
          try {
            const blob = await downloadMedia(msg.id);
            if (blob) {
              successAudioCount++;
              const ext = guessExtension(msg.mimetype, 'ogg');
              const filename = buildFilename('audio', msg, ext);

              audioFolder?.file(filename, blob);
              audioFileName = filename;
              audioMimeType = msg.mimetype ?? 'audio/ogg';
              audioBase64 = await blobToBase64(blob);

              if (successAudioCount % 2 === 0) dispatchStatus(`⬇️ Áudios: ${successAudioCount}`);
            } else {
              contentText += ' (Falha: Download vazio)';
            }
          } catch (err) {
            DEBUG.error(`AUDIO_DOWNLOAD[${idx}]`, err);
            contentText += ' (Erro no download)';
          }
        });
      }

      // ── Agendar download de imagem ──────────────────────────────
      if (isImage && INCLUDE_IMAGE) {
        const idx = i;
        pendingDownloads.push(async () => {
          try {
            const blob = await downloadMedia(msg.id);
            if (blob) {
              successImageCount++;
              const ext = guessExtension(msg.mimetype, 'jpg');
              const filename = buildFilename('imagem', msg, ext);
              imageFolder?.file(filename, blob);
              imageFileName = filename;

              if (successImageCount % 2 === 0) dispatchStatus(`🖼️ Imagens: ${successImageCount}`);
            } else {
              contentText += ' (Falha: Download vazio)';
            }
          } catch (err) {
            DEBUG.error(`IMAGE_DOWNLOAD[${idx}]`, err);
            contentText += ' (Erro no download)';
          }
        });
      }

      // Atualiza contentText com nome do arquivo baixado (será sobrescrito pelo download)
      if (audioFileName) contentText += ` (Arquivo: audios/${audioFileName})`;
      if (imageFileName) contentText += ` (Arquivo: imagens/${imageFileName})`;

      metadata.messages.push({
        id: msg.id,
        timestamp: msg.t,
        sender,
        fromMe: !!msg.fromMe,
        type: msg.type,
        content: contentText,
        audioFile: audioFileName,
        audioBase64,
        audioMimeType,
        imageFile: imageFileName,
      });
    }

    // Executa downloads com concorrência limitada
    DEBUG.log(`Processando ${pendingDownloads.length} downloads (concorrência máx: ${MAX_CONCURRENT})`);
    const pool = async (tasks: Array<() => Promise<void>>, limit: number) => {
      let idx = 0;
      const run = async (): Promise<void> => {
        while (idx < tasks.length) {
          const task = tasks[idx++]!;
          await task();
        }
      };
      await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => run()));
    };
    await pool(pendingDownloads, MAX_CONCURRENT);

    // Stats
    metadata.stats.audios = audioCount;
    metadata.stats.audiosDownloaded = successAudioCount;
    metadata.stats.images = imageCount;
    metadata.stats.imagesDownloaded = successImageCount;

    DEBUG.log('Stats finais', metadata.stats);
    dispatchStatus(`🖼️ Imagens: ${successImageCount}/${imageCount}`);

    // ── Gerar ZIP ─────────────────────────────────────────────────
    dispatchStatus('📦 Gerando ZIP final…');
    zip.file('conversas.txt', txtContent);
    zip.file('metadados.json', JSON.stringify(metadata, null, 2));

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    const fileNameSuffix = filterLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    a.download = `WhatsApp_${chatName.replace(/[^a-z0-9]/gi, '_')}_${fileNameSuffix}.zip`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    dispatchStatus('✅ Extração concluída!');
    DEBUG.log('ZIP baixado!', { size: zipBlob.size });

    // Enviar contexto para sidebar
    window.dispatchEvent(new CustomEvent('WPP_EXT_CONTEXT', { detail: JSON.stringify(metadata) }));
  } catch (error) {
    DEBUG.error('EXTRAÇÃO_FINAL', error);
    dispatchStatus(`❌ Erro: ${(error as Error).message}`);
  }
})();

export {};
