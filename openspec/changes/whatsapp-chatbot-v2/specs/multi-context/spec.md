## ADDED Requirements

### Requirement: System supports multiple extracted contexts

The system SHALL store and manage multiple extracted conversation contexts simultaneously.

#### Scenario: Second extraction adds to list
- **WHEN** user extracts a second conversation
- **THEN** both contexts are available, the new one is selected as active

#### Scenario: Context list shows all extractions
- **WHEN** user opens the context selector
- **THEN** all extracted contexts are shown with chat name and extraction timestamp

#### Scenario: Switch between contexts
- **WHEN** user selects a different context from the selector
- **THEN** the assistant switches to that context's messages and chat history

### Requirement: Context selector UI

The sidebar SHALL have a visible context selector showing the currently active context.

#### Scenario: Context selector displays current
- **WHEN** a context is active
- **THEN** the selector shows the chat name, extraction date, and message count

#### Scenario: No contexts extracted
- **WHEN** no contexts exist in storage
- **THEN** the selector shows a disabled state with text "Nenhum contexto"

### Requirement: Delete individual context

The user SHALL be able to delete a specific context from storage.

#### Scenario: Delete context
- **WHEN** user clicks delete on a context item
- **THEN** the context is removed from storage and the selector updates

#### Scenario: Delete active context
- **WHEN** user deletes the currently active context
- **THEN** system selects the next available context or shows empty state
