## ADDED Requirements

### Requirement: User can search across messages in the active context

The system SHALL provide full-text search across messages in the currently active extracted context.

#### Scenario: Search box is visible
- **WHEN** a context is active
- **THEN** a search input is displayed in the sidebar (collapsed by default, expandable via `/` shortcut or click)

#### Scenario: Search returns matching messages
- **WHEN** user types a query and presses Enter
- **THEN** messages containing the query (case-insensitive) are displayed with highlighted matching text

#### Scenario: No results found
- **WHEN** query matches no messages
- **THEN** system shows "Nenhuma mensagem encontrada para: [query]"

#### Scenario: Search includes sender and content
- **WHEN** searching with a query
- **THEN** both sender name and message content are searched

#### Scenario: Filter by sender
- **WHEN** user clicks a sender name filter
- **THEN** results are scoped to messages from that sender only

### Requirement: Search results are navigable

The search results SHALL be navigable with keyboard shortcuts.

#### Scenario: Navigate results
- **WHEN** results are displayed
- **THEN** pressing Tab / Shift+Tab moves between result items

#### Scenario: Open message context
- **WHEN** user clicks or presses Enter on a search result
- **THEN** the message is displayed with surrounding context (3 messages before/after)
