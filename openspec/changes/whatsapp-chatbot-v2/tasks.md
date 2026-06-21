## 1. Foundation: Storage Module

- [x] 1.1 Create `src/utils/storage.ts` — typed wrapper around chrome.storage.local with get/set/remove/clear para contexts, preferences, chatHistory
- [x] 1.2 Create `StorageKeys` constants enum (contexts, preferences, chatHistory per context)
- [x] 1.3 Migrate `API_CONFIG` in sidebar.js to read from storage on init, fallback to defaults
- [x] 1.4 Add `unlimitedStorage` permission to manifest.json

## 2. API Configuration UI

- [x] 2.1 Add settings drawer/toggle button in sidebar header + UI (apiUrl, apiKey fields, Save, Testar Conexão)
- [x] 2.2 Wire "Testar Conexão" button to `GET /models` with provided key
- [x] 2.3 Persist loaded settings to chrome.storage.local onChange
- [x] 2.4 Update `callModelApi()` to read API config from storage (not hardcoded)
- [x] 2.5 Show config validation errors inline (empty key, invalid URL)
- [x] 2.6 Add default fallback config for first-run state

## 3. Storage Persistence

- [x] 3.1 On extraction complete: save context + messages to `contexts` key in storage
- [x] 3.2 On sidebar init: load saved contexts from storage into a contexts Map
- [x] 3.3 Persist chat history per context keyed by context id
- [x] 3.4 Persist `chatHistory` incrementally after each assistant response
- [x] 3.5 Persist user preferences (model, useContext, theme, includeAudio/Image)
- [x] 3.6 Add "Limpar dados" action in settings that clears storage
- [x] 3.7 Implement 90-day auto-cleanup on context load

## 4. Multi-Context Support

- [x] 4.1 Refactor `currentContext` (single) to `contexts: Map<string, ExtractedContext>`
- [x] 4.2 Build context selector UI (dropdown/chip list showing chatName + date + msg count)
- [x] 4.3 Wire context switch to update chat display, chat history, and stats
- [x] 4.4 Add delete button per context item
- [x] 4.5 Handle empty state when no contexts exist
- [x] 4.6 Generate unique context key (`ctx_${chatId}_${timestamp}`) per extraction

## 5. Streaming Response

- [x] 5.1 Implement SSE stream parser: reads `response.body.getReader()`, extracts `data:` lines
- [x] 5.2 Add `stream: true` parameter to API request body in `callModelApi()`
- [x] 5.3 Update chat bubble to append tokens incrementally (vs replace)
- [x] 5.4 Add "Parar" button visible during streaming that calls AbortController.abort()
- [x] 5.5 Handle stream end: commit full text to chatHistory, remove "Parar" button
- [x] 5.6 Add blink cursor animation at end of streaming text
- [x] 5.7 Fallback to blocking fetch when API returns non-streaming response

## 6. Error Handling Specific

- [x] 6.1 Detect HTTP 401 and show "API key inválida ou expirada" with link to settings
- [x] 6.2 Detect HTTP 429 and show "Muitas requisições" with retry countdown
- [x] 6.3 Detect network errors (TypeError) and show "Sem conexão com a internet"
- [x] 6.4 Detect HTTP 5xx and show "Erro no servidor da API. Tente novamente."
- [x] 6.5 Implement retry logic for 429 (wait 2s, retry once) and network errors (2 retries with 1s backoff)
- [x] 6.6 Show extraction-specific errors: no active chat, WhatsApp not loaded, no messages found

## 7. Visual Theme (Dark Mode)

- [x] 7.1 Add `[data-theme="dark"]` CSS variables block in sidebar.html (overriding all :root colors)
- [x] 7.2 Add theme toggle button in sidebar header (sun/moon icon)
- [x] 7.3 Wire toggle to set `document.documentElement.dataset.theme` + persist to storage
- [x] 7.4 Verify all UI components render correctly in dark mode

## 8. Keyboard Shortcuts

- [x] 8.1 Implement `keydown` listener with SHORTCUTS map
- [x] 8.2 Bind Ctrl+Enter → trigger extraction
- [x] 8.3 Bind Ctrl+Shift+Enter → send chat message
- [x] 8.4 Bind / → focus/toggle search bar
- [x] 8.5 Bind Escape → close open panels/dropdowns
- [x] 8.6 Bind Ctrl+, → toggle settings panel
- [x] 8.7 Suppress single-key shortcuts when typing in text inputs

## 9. Full-text Search

- [x] 9.1 Add search bar UI (collapsible) to sidebar
- [x] 9.2 Build search index from active context messages (sender, content, timestamp, type)
- [x] 9.3 Implement case-insensitive search with result rendering (highlighted matches)
- [x] 9.4 Add empty state: "Nenhuma mensagem encontrada para: [query]"
- [x] 9.5 Add filter by sender chip UI
- [x] 9.6 Implement result navigation (click to show message + context window 3 before/after)

## 10. Audio Transcription

- [x] 10.1 Add "Transcrever áudios (N)" button when context has audio messages
- [x] 10.2 Implement batch transcription flow: send each audio to API, store transcript in message
- [x] 10.3 Replace `[ÁUDIO]` placeholder with transcribed text in message display
- [x] 10.4 Add progress indicator during batch transcription
- [x] 10.5 Handle partial failure (N/M transcribed) with clear messaging
- [x] 10.6 Add "Transcrever automaticamente" toggle in extraction settings

## 11. Quick Summary

- [x] 11.1 Add "Resumir" button in context toolbar
- [x] 11.2 Add summary type dropdown: "Resumo rápido", "Pontos principais", "Decisões", "Ações pendentes"
- [x] 11.3 Wire button to send summary prompt to assistant, display result as chat message
- [x] 11.4 Handle fresh context (no prior chat history) as first message

## 12. Chat Actions

- [x] 12.1 Add hover/focus action bar to assistant message bubbles
- [x] 12.2 Implement "Copiar" button: copy text to clipboard, show "Copiado!" for 1.5s
- [x] 12.3 Implement "Regenerar" button: re-send last user message, replace old response
- [x] 12.4 Implement "Exportar TXT" button: download response as .txt file

## 13. Token Counter

- [x] 13.1 Add token count indicator near send button ("~X tokens")
- [x] 13.2 Calculate estimate as `Math.ceil(text.length / 4)` for combined prompt
- [x] 13.3 Update estimate dynamically on input change / toggle context
- [x] 13.4 Show warning when estimate exceeds 90% of model context window
- [x] 13.5 Update estimate with actual `usage.prompt_tokens` from API response

## 14. Context Compression

- [-] 14.1 Detect threshold: >100 messages OR >8000 estimated tokens — SKIPPED (YAGNI, token counter already warns at 90%)
- [-] 14.2 Show "Contexto muito longo. Deseja resumir?" dialog — SKIPPED (YAGNI)
- [-] 14.3 Wire confirmation to send summarization prompt and replace context — SKIPPED (YAGNI)
- [-] 14.4 Add "Compressão automática" toggle in settings (silent mode) — SKIPPED (field exists in storage schema, not wired; add when users report hitting limits)
- [-] 14.5 Preserve original context in storage (only compress for prompt) — SKIPPED

## 15. Conversation Stats

- [x] 15.1 Add "Estatísticas" action button for active context
- [x] 15.2 Compute and display: total msgs, msgs per sender (with %), audio/image count
- [x] 15.3 Compute and display: activity distribution by hour of day (textual bar)
- [x] 15.4 Compute and display: top 10 most frequent words (excluding stopwords)
- [x] 15.5 Compute and display: date range of messages

## 16. Final Integration & Polish

- [ ] 16.1 Verify all features work together with streaming + multi-context + storage — MANUAL (requires real WhatsApp Web)
- [ ] 16.2 End-to-end: extract → save → reopen → switch contexts → search → transcribe → summarize — MANUAL
- [ ] 16.3 Test with real WhatsApp Web conversations — MANUAL
- [ ] 16.4 Remove all hardcoded API keys from source code
- [ ] 16.5 Final build (`pnpm build`) and verify dist/ contains no secrets
- [ ] 16.4 Remove all hardcoded API keys from source code
- [ ] 16.5 Final build (`pnpm build`) and verify dist/ contains no secrets
