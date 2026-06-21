## ADDED Requirements

### Requirement: Context can be summarized with one click

The system SHALL provide a "Resumir" button that generates a summary of the active conversation context.

#### Scenario: Summary request
- **WHEN** user clicks "Resumir" button with a context active
- **THEN** assistant receives a system prompt requesting bullet-point summary of the conversation

#### Scenario: Summary displayed as assistant message
- **WHEN** summary is generated
- **THEN** it appears in the chat as an assistant message with markdown formatting

#### Scenario: Summary without existing chat history
- **WHEN** user clicks "Resumir" on a fresh context (no previous chat)
- **THEN** summary is generated and becomes the first chat message

### Requirement: Summary types

The system SHALL offer predefined summary types.

#### Scenario: Summary type selector
- **WHEN** user clicks the arrow next to "Resumir" button
- **THEN** a dropdown shows options: "Resumo rápido", "Pontos principais", "Decisões", "Ações pendentes"
