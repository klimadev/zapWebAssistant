## ADDED Requirements

### Requirement: System supports keyboard shortcuts for common actions

The sidebar SHALL support keyboard shortcuts for frequent operations.

#### Scenario: Extrair conversation
- **WHEN** user presses Ctrl+Enter
- **THEN** triggers extraction (same as clicking "Extrair mensagens")

#### Scenario: Send message
- **WHEN** user presses Ctrl+Shift+Enter
- **THEN** sends the current chat message (same as clicking "Enviar")

#### Scenario: Focus search
- **WHEN** user presses `/` (slash) key
- **THEN** focus moves to the search input if visible, else toggles search bar open

#### Scenario: Close panels
- **WHEN** user presses Escape
- **THEN** any open dropdown/panel (model selector, settings) closes

#### Scenario: Open settings
- **WHEN** user presses Ctrl+,
- **THEN** settings panel toggles open/closed

### Requirement: Shortcuts are disabled when typing

Keyboard shortcuts SHALL NOT interfere with text input.

#### Scenario: Typing in textarea
- **WHEN** focus is on `#chatInput` textarea or any input field
- **THEN** Ctrl+Shift+Enter still works for sending; single-key shortcuts (like `/`) are suppressed
