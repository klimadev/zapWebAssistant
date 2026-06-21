## ADDED Requirements

### Requirement: Assistant responses have action buttons

Each assistant message bubble SHALL include contextual action buttons.

#### Scenario: Copy response
- **WHEN** user hovers over or focus is on an assistant message
- **THEN** a "Copiar" button appears; clicking it copies the response text to clipboard

#### Scenario: Regenerate response
- **WHEN** user clicks "Regenerar" on an assistant message
- **THEN** the last user message is re-sent to the API and the old response is replaced

#### Scenario: Export as text
- **WHEN** user clicks "Exportar" on an assistant message
- **THEN** the response is downloaded as a .txt file

### Requirement: Action buttons have visual feedback

#### Scenario: Copy confirmation
- **WHEN** text is copied
- **THEN** "Copiar" briefly changes to "Copiado!" (1.5s) before reverting
