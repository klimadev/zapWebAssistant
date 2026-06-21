## Context

WhatsApp Extractor + IA é uma Chrome Extension (Manifest V3) com arquitetura de 4 camadas: background service worker, content script, injected script (contexto da página WhatsApp Web), e sidebar (UI do side panel). A comunicação entre camadas usa `chrome.runtime.sendMessage` e Custom Events do DOM.

**Estado atual (limitações identificadas):**
- API key e endpoint hardcoded em `sidebar.js` — inseguro e inflexível
- Contexto extraído (`currentContext`) volátil — desaparece ao fechar a sidebar
- Histórico de chat (`chatHistory`) em RAM — mesmo problema
- Respostas bloqueantes (`fetch` síncrono) — experiência frustrante em respostas longas
- Apenas 1 contexto extraído por vez — impossível alternar entre conversas
- Sem busca textual — conversas longas exigem leitura manual
- Áudios baixados mas não transcritos para consulta textual
- Sem atalhos de teclado — cada ação exige clique
- Tratamento de erro genérico — 401/429/rede viram "Erro: ..."
- Sem dark mode — cansativo em uso prolongado
- Sem contagem de tokens — risco de estourar limite sem aviso

## Goals / Non-Goals

**Goals:**
- Tornar o app utilizável para **uso pessoal intensivo diário**
- Persistir dados entre sessões (contextos, preferências, histórico)
- Streaming de respostas para UX não-bloqueante
- Suporte a múltiplas conversas extraídas simultaneamente
- Busca textual full-text nas mensagens
- Transcrição de áudios visível como texto
- Resumo instantâneo 1-clique
- Feedback de erro específico por tipo
- Dark mode

**Non-Goals:**
- Suporte a grupos WhatsApp (fora de escopo agora)
- Integração com serviços externos (Notion, Gmail, CRM) — mantido isolado na sidebar
- PWA/mobile — extensão Chrome somente
- i18n — português brasileiro apenas
- Onboarding tutorial
- Animações complexas ou gamificação

## Decisions

### D1: chrome.storage.local como única camada de persistência
- **Decisão**: Usar `chrome.storage.local` para tudo (contextos, histórico, preferências)
- **Por quê**: Já é permissão concedida no manifest.json. Capacidade de bytes (5MB+ com `unlimitedStorage`). Sem dependências externas. API assíncrona padronizada.
- **Alternativas consideradas**: IndexedDB (mais complexo, sem vantagem para payloads <5MB), localStorage (não disponível em service workers), chrome.storage.sync (limitado a 100KB, muito pequeno).

### D2: Store de contextos como Map serializado no storage
- **Decisão**: Estrutura `{[chatId: string]: ExtractedContext}` armazenada como objeto simples
- **Por quê**: chrome.storage não suporta Map. Serialização JSON nativa. ChatId como chave permite lookup O(1).
- **Estrutura da chave**: `contexts:{[chatId]: {chatName, extractedAt, filter, stats, messages[], messagesText (concatenado pra busca)}}`
- **Prefixo**: `ctx_${chatId}_${timestamp}` para permitir múltiplas extrações do mesmo chat

### D3: Streaming via fetch + ReadableStream (SSE)
- **Decisão**: Usar `fetch` com `stream: true` no body, lendo `response.body.getReader()` como chunks SSE
- **Por quê**: API do routerAI (compatível OpenAI) suporta SSE via `stream: true`. Não requer WebSocket nem SSE library — fetch nativo com reader resolve.
- **Implementação**: Adaptar `callModelApi()` para aceitar `stream: true`, retornar token por token via callback, construir resposta completa ao final.

### D4: Busca textual in-memory com indexação lazy
- **Decisão**: Ao carregar um contexto, construir índice de busca (array de {sender, text, timestamp, type}) em memória
- **Por quê**: Contextos típicos têm 100-500 mensagens (< 50KB), indexar em memória é trivial. chrome.storage não tem query.
- **Query**: `msg.content.includes(query)` + filtrar por remetente/tipo. Case-insensitive. Sem dependência de lib de busca.

### D5: Transcrição de áudio integrada ao fluxo de extração
- **Decisão**: Ao extrair áudios, o sistema pergunta se deseja transcrever. Se sim, envia áudio para API de transcrição (rota do routerAI) e armazena o texto como `message.transcript`
- **Por quê**: A API já recebe `input_audio` no chat, mas a transcrição não fica visível como mensagem de texto. Separar a transcrição permite busca e consulta mesmo sem o áudio.

### D6: Atalhos de teclado com mapa centralizado
- **Decisão**: Objeto `SHORTCUTS` mapeando combinações de teclas a ações
- **Por quê**: Simples, sem dependência, fácil de estender. Chrome extension já captura teclado na sidebar.
- **Atalhos**: `Ctrl+Enter` extrair, `Ctrl+Shift+Enter` enviar, `/` foco busca, `Escape` fechar painéis, `Ctrl+,` abrir config

### D7: Dark mode via CSS variables com toggle
- **Decisão**: Conjunto de variáveis CSS `[data-theme="dark"]` que sobrescrevem `:root`
- **Por quê**: A sidebar.html já usa CSS variables para o tema claro. Dark mode vira um toggle que adiciona `data-theme="dark"` ao `<html>`. Zero dependência, performance máxima.

### D8: Counter de tokens via estimativa por caractere
- **Decisão**: `Math.ceil(text.length / 4)` para estimativa rápida de tokens
- **Por quê**: Para modelos GPT, ~4 chars por token é aproximação razoável. Não justifica adicionar tiktoken WASM (~200KB) para uso pessoal. O valor real é obtido na resposta da API (`usage.prompt_tokens`).

## Risks / Trade-offs

| Risco | Mitigação |
|-------|-----------|
| **chrome.storage.local cheio** com muitos contextos e áudios em base64 | Limitar armazenamento de mensagens a 90 dias. Oferecer "Limpar contextos antigos" nas configs. Pedir permissão `unlimitedStorage` |
| **Streaming SSE quebra se API mudar** | Fallback automático para modo não-streaming se detectar Content-Type diferente de `text/event-stream` |
| **Busca textual lenta em chats muito grandes** | Indexar apenas campos relevantes (sender + content + timestamp). Para >5000 mensagens, mostrar "Resultados parciais" |
| **Transcrição gasta tokens extras** | Deixar transcrição como ação opt-in (botão "Transcrever áudios") |
| **Dark mode customizado não cobre 100% dos elementos** | Inspeção visual após ativar, ajustar variáveis faltantes. A própria estrutura CSS atual é bem modular |
| **Contexto comprimido perde detalhes** | Manter original no storage. Comprimir só a versão enviada ao prompt. Oferecer toggle "Usar versão resumida" |
