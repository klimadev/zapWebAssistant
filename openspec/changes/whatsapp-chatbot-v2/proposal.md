## Why

O Extrator WhatsApp atual extrai mensagens e tem um chat IA, mas para **uso pessoal intensivo diário** faltam funcionalidades essenciais: API key configurável, persistência de dados entre sessões, streaming de respostas, múltiplos contextos de conversa, busca textual, transcrição de áudios e resumo com um clique. Sem isso, o app é um brinquedo — útil pra testar, frustrante pra usar todo dia.

## What Changes

- **API key e endpoint configuráveis via UI** — fim da chave hardcoded no bundle
- **Persistência com chrome.storage.local** — contextos extraídos, preferências, histórico de chat sobrevivem a fechar/abrir sidebar
- **Streaming de respostas (SSE)** — respostas aparecem token por token, eliminando bloqueio de 30s
- **Múltiplos contextos extraídos simultâneos** — navegar entre conversas sem re-extrair
- **Busca textual full-text nas mensagens extraídas**
- **Transcrição de áudios extraídos** — mensagens de voz viram texto pesquisável
- **Resumo 1-clique** — extraiu → "Quer resumo?" com um botão
- **Atalhos de teclado** — / pra buscar, Ctrl+Enter pra extrair, Ctrl+Shift+Enter pra enviar
- **Dark mode** com toggle
- **Action buttons pós-resposta** — copiar, regenerar
- **Tratamento de erros específicos** — 401 (key inválida), 429 (rate limit), rede off
- **Compressão de contexto longo** — summarization automático pra não estourar janela de tokens
- **Quick stats** — quem fala mais, horários pico, palavras frequentes
- **Contador de tokens do prompt**

## Capabilities

### New Capabilities

- `api-config`: Interface de configuração de API key, endpoint e modelo padrão, com validação e persistência
- `storage-persistence`: Sistema de persistência com chrome.storage.local para contextos, histórico de chat e preferências
- `streaming-response`: Respostas da IA em tempo real via SSE, com indicador visual de progresso
- `multi-context`: Suporte a múltiplos contextos extraídos simultâneos com seletor e navegação
- `fulltext-search`: Busca textual nas mensagens extraídas com highlight e filtros
- `audio-transcription`: Transcrição de áudios extraídos via API com exibição no chat
- `quick-summary`: Resumo automático 1-clique da conversa extraída
- `keyboard-shortcuts`: Atalhos de teclado para ações frequentes
- `visual-theme`: Dark mode (e light mode persistente)
- `chat-actions`: Action buttons nas respostas (copiar, regenerar, exportar)
- `error-handling`: Tratamento específico de erros (401, 429, rede, timeout) com feedback visual
- `context-compression`: Compressão automática de contexto longo via sumarização
- `conversation-stats`: Estatísticas rápidas da conversa (top remetentes, horários, palavras)
- `token-counter`: Contagem de tokens do prompt antes do envio

### Modified Capabilities

*(Nenhuma — todas as specs são novas. Nada existente muda de comportamento.)*

## Impact

- `sidebar.js`: Maioria das mudanças — nova lógica de UI, streaming, storage, busca
- `sidebar.html`: Novos elementos (config drawer, seletor contextos, search bar, dark mode vars)
- `background.js`: Novo handler para storage multiplex
- `injected.js`: Adicionar contagem de tokens no metadata exportado, expor textos brutos pra busca
- `package.json`: Sem novas dependências — chrome.storage é nativo, streaming é fetch nativo
- `manifest.json`: Sem novas permissions (já temos `storage`)
