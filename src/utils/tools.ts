// ── AI tool definitions + executor ──────────────────────────────────
// OpenAI-compatible function-calling tools. Cada tool acessa dados
// extraídos do WhatsApp via chrome.storage.local.
// Sem ai-slop: descrições diretas, params claros, sem "please".

import type { ExtractedContext } from './storage';

// ── Types ──────────────────────────────────────────────────────────

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolResult {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

// ── Tool definitions ───────────────────────────────────────────────

export const TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'list_chats',
      description: 'Lista chats extraídos do WhatsApp disponíveis. Retorna nome, ID, período, total mensagens, áudios e imagens. Opcional: filtrar por data.',
      parameters: {
        type: 'object',
        properties: {
          since: { type: 'string', description: 'Data inicial ISO (ex: 2026-06-01). Opcional.' },
          until: { type: 'string', description: 'Data final ISO (ex: 2026-06-22). Opcional.' },
          max: { type: 'number', description: 'Máximo de chats (default 20, max 50).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_messages',
      description: 'Obtém mensagens de um chat extraído. Filtros por período, remetente, tipo. Mensagens de áudio/image incluem base64 se solicitado.',
      parameters: {
        type: 'object',
        properties: {
          chatId: { type: 'string', description: 'ID do chat (obrigatório). Use list_chats primeiro.' },
          since: { type: 'string', description: 'Timestamp inicial ISO ou Unix. Opcional.' },
          until: { type: 'string', description: 'Timestamp final ISO ou Unix. Opcional.' },
          sender: { type: 'string', description: 'Filtrar por nome do remetente. Opcional.' },
          type: { type: 'string', enum: ['text', 'audio', 'image', 'all'], description: 'Filtrar por tipo. Opcional.' },
          max: { type: 'number', description: 'Máximo mensagens (default 50, max 200).' },
          includeAudio: { type: 'boolean', description: 'Incluir áudio base64 na resposta. Opcional.' },
          includeImage: { type: 'boolean', description: 'Incluir imagem base64 na resposta. Opcional.' },
        },
        required: ['chatId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_chat_stats',
      description: 'Estatísticas de um chat extraído: total msgs, top remetentes, atividade por hora, palavras frequentes, contagem áudio/image.',
      parameters: {
        type: 'object',
        properties: {
          chatId: { type: 'string', description: 'ID do chat (obrigatório).' },
        },
        required: ['chatId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_in_chat',
      description: 'Busca mensagens por palavra-chave em um chat extraído. Retorna trechos com contexto, remetente e timestamp.',
      parameters: {
        type: 'object',
        properties: {
          chatId: { type: 'string', description: 'ID do chat. Use list_chats para obter IDs.' },
          query: { type: 'string', description: 'Palavra-chave ou frase (case-insensitive).' },
          sender: { type: 'string', description: 'Filtrar por remetente. Opcional.' },
          max: { type: 'number', description: 'Máximo resultados (default 20, max 50).' },
        },
        required: ['chatId', 'query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_system_info',
      description: 'Data/hora atual, fuso horário, versão extensão, modelo ativo, preferências do usuário.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

// ── Context cache (set by sidebar on load) ─────────────────────────
let _contextsCache: Map<string, ExtractedContext> = new Map();

export function setContextsCache(cache: Map<string, ExtractedContext>): void {
  _contextsCache = cache;
}

// ── Tool executors ─────────────────────────────────────────────────

function executeListChats(args: { since?: string; until?: string; max?: number }): string {
  const max = Math.min(args.max ?? 20, 50);
  const since = args.since ? new Date(args.since).getTime() : 0;
  const until = args.until ? new Date(args.until).getTime() : Infinity;

  const chats = Array.from(_contextsCache.values())
    .filter((c) => {
      const at = new Date(c.extractedAt).getTime();
      return at >= since && at <= until;
    })
    .sort((a, b) => new Date(b.extractedAt).getTime() - new Date(a.extractedAt).getTime())
    .slice(0, max)
    .map((c) => ({
      id: c.chatId,
      name: c.chatName,
      extractedAt: c.extractedAt,
      totalMessages: c.stats?.total ?? c.messages?.length ?? 0,
      audios: c.stats?.audiosDownloaded ?? 0,
      images: c.stats?.imagesDownloaded ?? 0,
      filter: c.filter?.mode ?? 'unknown',
      messageTypes: countTypes(c.messages ?? []),
    }));

  return JSON.stringify({ chats, total: chats.length });
}

function executeGetMessages(args: {
  chatId: string;
  since?: string;
  until?: string;
  sender?: string;
  type?: string;
  max?: number;
  includeAudio?: boolean;
  includeImage?: boolean;
}): string {
  const ctx = _contextsCache.get(args.chatId);
  if (!ctx) return JSON.stringify({ error: `Chat "${args.chatId}" não encontrado.` });

  const max = Math.min(args.max ?? 50, 200);
  const sinceTs = args.since ? new Date(args.since).getTime() / 1000 : 0;
  const untilTs = args.until ? new Date(args.until).getTime() / 1000 : Infinity;

  let msgs = (ctx.messages ?? []) as Array<Record<string, unknown>>;
  if (sinceTs > 0) msgs = msgs.filter((m) => Number(m.timestamp ?? 0) >= sinceTs);
  if (untilTs < Infinity) msgs = msgs.filter((m) => Number(m.timestamp ?? 0) <= untilTs);
  if (args.sender) { const s = args.sender; msgs = msgs.filter((m) => String(m.sender ?? '').toLowerCase().includes(s.toLowerCase())); }
  if (args.type && args.type !== 'all') msgs = msgs.filter((m) => (m.type ?? 'text') === args.type);

  const total = msgs.length;
  msgs = msgs.slice(-max);

  const result = msgs.map((m) => {
    const entry: Record<string, unknown> = {
      timestamp: m.timestamp,
      sender: m.sender,
      content: m.content,
      type: m.type ?? 'text',
      time: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
    };
    if (args.includeAudio && m.audioBase64) {
      entry.audioBase64 = String(m.audioBase64).slice(0, 500_000); // ponytail: cap at 500KB per msg
      entry.audioMimeType = m.audioMimeType ?? 'audio/ogg';
    }
    if (args.includeImage && m.imageBase64) {
      entry.imageBase64 = String(m.imageBase64).slice(0, 500_000);
    }
    return entry;
  });

  return JSON.stringify({
    chatName: ctx.chatName,
    total,
    returned: result.length,
    messages: result,
  });
}

function executeGetChatStats(args: { chatId: string }): string {
  const ctx = _contextsCache.get(args.chatId);
  if (!ctx) return JSON.stringify({ error: `Chat "${args.chatId}" não encontrado.` });

  const msgs = (ctx.messages ?? []) as Array<Record<string, unknown>>;
  const total = msgs.length;
  const bySender: Record<string, number> = {};
  const byHour: number[] = new Array(24).fill(0);
  const wordFreq: Record<string, number> = {};
  const stopwords = new Set(['de','da','do','em','para','com','um','uma','os','as','que','é','não','o','a','e','se','por','no','na','dos','das','mas','lhe','nos','aos','pelo','pela','ser','são','foi','mais','muito','sua','seu','seus','suas','como','já','até','também','quando','porque','está','pode','ter','tem']);
  let audioCount = 0;
  let imageCount = 0;
  let minTs = Infinity;
  let maxTs = 0;

  for (const m of msgs) {
    const sender = String(m.sender ?? 'desconhecido');
    bySender[sender] = (bySender[sender] ?? 0) + 1;
    const ts = Number(m.timestamp ?? 0);
    if (ts) {
      const h = new Date(ts * 1000).getHours(); byHour[h] = (byHour[h] ?? 0) + 1;
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

  const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const senderPct = Object.entries(bySender)
    .map(([name, count]) => ({ name, count, pct: total ? ((count / total) * 100).toFixed(1) : '0' }))
    .sort((a, b) => b.count - a.count);

  const peakHour = byHour.indexOf(Math.max(...byHour));

  return JSON.stringify({
    chatName: ctx.chatName,
    totalMessages: total,
    period: minTs < Infinity ? {
      start: new Date(minTs * 1000).toISOString(),
      end: new Date(maxTs * 1000).toISOString(),
    } : null,
    audioCount,
    imageCount,
    topSenders: senderPct.slice(0, 5),
    peakHour,
    topWords: topWords.map(([w, c]) => ({ word: w, count: c })),
  });
}

function executeSearchInChat(args: { chatId: string; query: string; sender?: string; max?: number }): string {
  const ctx = _contextsCache.get(args.chatId);
  if (!ctx) return JSON.stringify({ error: `Chat "${args.chatId}" não encontrado.` });

  const max = Math.min(args.max ?? 20, 50);
  const q = args.query.toLowerCase();
  let hits = (ctx.messages ?? []).filter((m: Record<string, unknown>) => {
    const content = String(m.content ?? '');
    const sender = String(m.sender ?? '');
    if (!content.toLowerCase().includes(q) && !sender.toLowerCase().includes(q)) return false;
    if (args.sender && !sender.toLowerCase().includes(args.sender.toLowerCase())) return false;
    return true;
  });

  const total = hits.length;
  hits = hits.slice(0, max) as Array<Record<string, unknown>>;

  const results = hits.map((m: Record<string, unknown>) => ({
    timestamp: m.timestamp,
    sender: m.sender,
    content: String(m.content ?? '').slice(0, 500), // ponytail: cap snippet
    time: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
  }));

  return JSON.stringify({ chatName: ctx.chatName, query: args.query, total, returned: results.length, results });
}

function executeGetSystemInfo(): string {
  const now = new Date();
  return JSON.stringify({
    currentDateTime: now.toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
    dateFormatted: now.toLocaleDateString('pt-BR'),
    timeFormatted: now.toLocaleTimeString('pt-BR'),
    platform: navigator.platform,
    userAgent: navigator.userAgent.slice(0, 120),
  });
}

function countTypes(msgs: Array<Record<string, unknown>>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of msgs) {
    const t = String(m.type ?? 'text');
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

// ── Dispatch ───────────────────────────────────────────────────────

const EXECUTORS: Record<string, (args: Record<string, unknown>) => string> = {
  list_chats: (a) => executeListChats(a as Parameters<typeof executeListChats>[0]),
  get_messages: (a) => executeGetMessages(a as Parameters<typeof executeGetMessages>[0]),
  get_chat_stats: (a) => executeGetChatStats(a as Parameters<typeof executeGetChatStats>[0]),
  search_in_chat: (a) => executeSearchInChat(a as Parameters<typeof executeSearchInChat>[0]),
  get_system_info: () => executeGetSystemInfo(),
};

export async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
  const executor = EXECUTORS[toolCall.function.name];
  if (!executor) {
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ error: `Tool "${toolCall.function.name}" desconhecida.` }),
    };
  }

  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ error: 'Argumentos JSON inválidos.' }),
    };
  }

  try {
    const result = executor(args);
    return { role: 'tool', tool_call_id: toolCall.id, content: result };
  } catch (err) {
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ error: `Erro executando ${toolCall.function.name}: ${(err as Error).message}` }),
    };
  }
}

export function hasToolCalls(data: Record<string, unknown>): boolean {
  const choice = (data.choices as Array<Record<string, unknown>> | undefined)?.[0];
  if (!choice) return false;
  const msg = choice.message as Record<string, unknown> | undefined;
  return !!msg?.tool_calls;
}

export function extractToolCalls(data: Record<string, unknown>): ToolCall[] {
  const choice = (data.choices as Array<Record<string, unknown>> | undefined)?.[0];
  if (!choice) return [];
  const msg = choice.message as Record<string, unknown> | undefined;
  const calls = msg?.tool_calls as Array<Record<string, unknown>> | undefined;
  if (!calls) return [];
  return calls.map((tc) => ({
    id: String(tc.id ?? ''),
    type: 'function' as const,
    function: {
      name: String((tc.function as Record<string, unknown>)?.name ?? ''),
      arguments: String((tc.function as Record<string, unknown>)?.arguments ?? '{}'),
    },
  }));
}

export function getAssistantMessage(data: Record<string, unknown>): { role: string; content: string | null; tool_calls?: ToolCall[] } {
  const choice = (data.choices as Array<Record<string, unknown>> | undefined)?.[0];
  if (!choice) return { role: 'assistant', content: null };
  const msg = choice.message as Record<string, unknown> | undefined;
  if (!msg) return { role: 'assistant', content: null };
  return {
    role: 'assistant',
    content: (msg.content as string) ?? null,
    tool_calls: msg.tool_calls ? extractToolCalls(data) : undefined,
  };
}
