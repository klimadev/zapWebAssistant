// ── Storage module: typed chrome.storage.local wrapper ─────────────
// For contexts, chatHistory, preferences, AI config.
// chrome.storage.local has ~5MB default; unlimitedStorage for more.

export const StorageKeys = {
  CONTEXTS: 'contexts',
  CHAT_HISTORY_PREFIX: 'chat_',
  PREFERENCES: 'preferences',
  AI_CONFIG: 'wpp_ai_config',
  DEBUG_SHOW: 'wpp_debug_show',
} as const;

// ── Types ─────────────────────────────────────────────────────────
export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

export interface UserPreferences {
  model: string;
  useContext: boolean;
  theme: 'light' | 'dark' | 'system';
  includeAudio: boolean;
  includeImage: boolean;
  autoTranscribe: boolean;
  autoCompress: boolean;
  contextOnly: boolean;
}

export interface ExtractedContext {
  chatId: string;
  chatName: string;
  extractedAt: string;
  filter: Record<string, unknown>;
  stats: Record<string, unknown>;
  messages: Array<Record<string, unknown>>;
  messagesText?: string;
}

export type ChatMessage = { role: string; content: string | unknown[] };

// ── Generic storage helpers ──────────────────────────────────────
const local = chrome.storage.local;

export async function get<T>(key: string): Promise<T | undefined> {
  const data = await local.get(key);
  return data[key] as T | undefined;
}

export async function set(key: string, value: unknown): Promise<void> {
  await local.set({ [key]: value });
}

export async function remove(key: string): Promise<void> {
  await local.remove(key);
}

export async function clearStorage(): Promise<void> {
  await local.clear();
}

// ── AI Config ────────────────────────────────────────────────────
const DEFAULT_CONFIG: AiConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? 'https://routerai.chamalead.com/v1',
  apiKey: import.meta.env.VITE_API_KEY ?? '',
  defaultModel: import.meta.env.VITE_DEFAULT_MODEL ?? 'gpt-4o-mini',
};

export async function loadAiConfig(): Promise<AiConfig> {
  const stored = await get<AiConfig>(StorageKeys.AI_CONFIG);
  return stored ? { ...DEFAULT_CONFIG, ...stored } : { ...DEFAULT_CONFIG };
}

export async function saveAiConfig(config: AiConfig): Promise<void> {
  await set(StorageKeys.AI_CONFIG, config);
}

// ── Contexts ─────────────────────────────────────────────────────
export async function saveContext(
  chatId: string,
  context: ExtractedContext,
): Promise<void> {
  const contexts = await loadAllContexts();
  contexts[chatId] = context;
  await set(StorageKeys.CONTEXTS, contexts);
}

export async function loadAllContexts(): Promise<Record<string, ExtractedContext>> {
  return (await get<Record<string, ExtractedContext>>(StorageKeys.CONTEXTS)) ?? {};
}

export async function deleteContext(chatId: string): Promise<void> {
  const contexts = await loadAllContexts();
  delete contexts[chatId];
  await set(StorageKeys.CONTEXTS, contexts);
  await remove(`${StorageKeys.CHAT_HISTORY_PREFIX}${chatId}`);
}

// ── Chat History ─────────────────────────────────────────────────
export async function saveChatHistory(
  contextKey: string,
  history: ChatMessage[],
): Promise<void> {
  await set(`${StorageKeys.CHAT_HISTORY_PREFIX}${contextKey}`, history);
}

export async function loadChatHistory(
  contextKey: string,
): Promise<ChatMessage[]> {
  return (await get<ChatMessage[]>(`${StorageKeys.CHAT_HISTORY_PREFIX}${contextKey}`)) ?? [];
}

// ── Preferences ──────────────────────────────────────────────────
const DEFAULT_PREFERENCES: UserPreferences = {
  model: 'gpt-4o-mini',
  useContext: true,
  theme: 'system',
  includeAudio: true,
  includeImage: true,
  autoTranscribe: false,
  autoCompress: false,
  contextOnly: false,
};

export async function loadPreferences(): Promise<UserPreferences> {
  const stored = await get<UserPreferences>(StorageKeys.PREFERENCES);
  return stored ? { ...DEFAULT_PREFERENCES, ...stored } : { ...DEFAULT_PREFERENCES };
}

export async function savePreferences(
  prefs: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const current = await loadPreferences();
  const updated = { ...current, ...prefs };
  await set(StorageKeys.PREFERENCES, updated);
  return updated;
}

// ── Conversations (AI chat threads, independent from WhatsApp contexts) ─
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  contextKey?: string; // optional link to an extracted context
  messages: ChatMessage[];
  model?: string;
}

const CONVERSATIONS_KEY = 'zap_conversations';

export async function loadConversations(): Promise<Conversation[]> {
  const data = await get<Conversation[]>(CONVERSATIONS_KEY);
  return data ?? [];
}

export async function saveConversations(list: Conversation[]): Promise<void> {
  await set(CONVERSATIONS_KEY, list);
}

export async function createConversation(title?: string, contextKey?: string): Promise<Conversation> {
  const list = await loadConversations();
  const now = new Date().toISOString();
  const conv: Conversation = {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: title ?? `Conversa ${list.length + 1}`,
    createdAt: now,
    updatedAt: now,
    contextKey,
    messages: [],
  };
  list.push(conv);
  await set(CONVERSATIONS_KEY, list);
  return conv;
}

export async function updateConversation(
  id: string,
  updates: Partial<Pick<Conversation, 'title' | 'contextKey' | 'messages' | 'model'>>,
): Promise<Conversation | null> {
  const list = await loadConversations();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() } as Conversation;
  await set(CONVERSATIONS_KEY, list);
  return list[idx] ?? null;
}

export async function deleteConversation(id: string): Promise<boolean> {
  const list = await loadConversations();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  await set(CONVERSATIONS_KEY, list);
  return true;
}

export async function appendConversationMessage(
  convId: string,
  msg: ChatMessage,
): Promise<void> {
  const list = await loadConversations();
  const conv = list.find((c) => c.id === convId);
  if (!conv) return;
  conv.messages.push(msg);
  conv.updatedAt = new Date().toISOString();
  await set(CONVERSATIONS_KEY, list);
}

// ── Cleanup ──────────────────────────────────────────────────────
export async function cleanupOldContexts(maxAgeDays = 90): Promise<number> {
  const contexts = await loadAllContexts();
  const cutoff = Date.now() - maxAgeDays * 86_400 * 1_000;
  let removed = 0;
  for (const [key, ctx] of Object.entries(contexts)) {
    const at = new Date(ctx.extractedAt).getTime();
    if (isNaN(at) || at < cutoff) {
      delete contexts[key];
      await remove(`${StorageKeys.CHAT_HISTORY_PREFIX}${key}`);
      removed++;
    }
  }
  if (removed > 0) await set(StorageKeys.CONTEXTS, contexts);
  return removed;
}
