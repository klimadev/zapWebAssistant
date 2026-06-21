## ADDED Requirements

### Requirement: Specific error messages per failure type

The system SHALL distinguish between different API error types and show specific messages.

#### Scenario: 401 Unauthorized
- **WHEN** API returns HTTP 401
- **THEN** system shows "API key inválida ou expirada. Verifique suas configurações."

#### Scenario: 429 Rate Limited
- **WHEN** API returns HTTP 429
- **THEN** system shows "Muitas requisições. Aguarde um momento e tente novamente."

#### Scenario: Network error / offline
- **WHEN** fetch fails with network error (TypeError)
- **THEN** system shows "Sem conexão com a internet. Verifique sua rede."

#### Scenario: API timeout
- **WHEN** request exceeds the configured timeout
- **THEN** system shows "A requisição excedeu o tempo limite. Tente novamente."

#### Scenario: Generic server error (5xx)
- **WHEN** API returns HTTP 500
- **THEN** system shows "Erro no servidor da API. Tente novamente mais tarde."

### Requirement: Retry mechanism for transient errors

The system SHALL automatically retry on certain error types.

#### Scenario: 429 retry with backoff
- **WHEN** API returns 429
- **THEN** system waits 2 seconds and retries once, showing "Rate limit atingido. Tentando novamente..."

#### Scenario: Network retry
- **WHEN** network error occurs
- **THEN** system retries up to 2 times with 1-second backoff, then shows the network error message

### Requirement: Extraction errors show specific guidance

#### Scenario: No active WhatsApp chat
- **WHEN** user tries to extract without an active chat
- **THEN** system shows "Abra uma conversa no WhatsApp Web antes de extrair"

#### Scenario: WhatsApp Web not loaded
- **WHEN** user tries to extract but WhatsApp Web page isn't loaded
- **THEN** system shows "WhatsApp Web não detectado. Acesse web.whatsapp.com primeiro"
