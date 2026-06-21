## ADDED Requirements

### Requirement: Long contexts are automatically compressed

When the system detects that a context's message volume exceeds a threshold, it SHALL offer to compress (summarize) the context before sending to the API.

#### Scenario: Compression threshold reached
- **WHEN** context has more than 100 messages or estimated tokens > 8000
- **THEN** system shows "Contexto muito longo (X mensagens). Deseja resumir antes de perguntar?"

#### Scenario: User accepts compression
- **WHEN** user clicks "Sim, resumir"
- **THEN** system sends the full context to the API with a "Resuma esta conversa mantendo os pontos principais" prompt, then replaces the context with the generated summary

#### Scenario: User declines compression
- **WHEN** user clicks "Não, enviar completo"
- **THEN** full context is sent as-is

#### Scenario: Automatic compression mode
- **WHEN** user enables "Compressão automática" in settings
- **THEN** long contexts are silently compressed without asking

### Requirement: Original context preserved during compression

The system SHALL NOT delete the original context when compressing.

#### Scenario: Original remains
- **WHEN** context is compressed for the prompt
- **THEN** the original full context remains stored and can be restored
