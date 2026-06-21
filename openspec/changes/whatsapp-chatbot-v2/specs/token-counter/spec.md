## ADDED Requirements

### Requirement: System shows estimated token count before sending

The system SHALL estimate and display the total token count of the prompt (system message + context + chat history + user message) before sending to the API.

#### Scenario: Token count visible
- **WHEN** user types a message or the context changes
- **THEN** estimated token count is displayed near the send button as "~X tokens"

#### Scenario: Token count updates dynamically
- **WHEN** user types more text or toggles context inclusion
- **THEN** token estimate updates in real-time

#### Scenario: Over-limit warning
- **WHEN** estimated tokens exceed 90% of the model's context window (default 128K for most models)
- **THEN** a warning is shown: "O prompt está muito longo (~X tokens). Considere resumir o contexto."

### Requirement: Token count uses actual API usage

When the API response includes `usage.prompt_tokens`, the system SHALL display the actual count.

#### Scenario: Actual count replaces estimate
- **WHEN** API response contains `usage.prompt_tokens`
- **THEN** the displayed count updates to show the actual value

### Requirement: Simple estimation algorithm

The token estimate SHALL use `Math.ceil(text.length / 4)` as the calculation method.

#### Scenario: Estimate shown per model
- **WHEN** estimating tokens for a model with known context window
- **THEN** the display includes the approximate percentage used
