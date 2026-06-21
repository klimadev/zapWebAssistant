## ADDED Requirements

### Requirement: System persists extracted contexts to chrome.storage.local

All extracted conversation contexts SHALL be persisted to chrome.storage.local so they survive sidebar close/reopen.

#### Scenario: After extraction completes
- **WHEN** extraction completes and context is received
- **THEN** the context is saved to chrome.storage.local under key `contexts`

#### Scenario: Sidebar reopens and loads contexts
- **WHEN** sidebar initializes
- **THEN** previously saved contexts are loaded from chrome.storage.local and available

#### Scenario: Multiple extractions from same chat
- **WHEN** user extracts the same chat twice
- **THEN** each extraction is stored separately keyed by `ctx_${chatId}_${timestamp}`

### Requirement: System persists user preferences to chrome.storage.local

User preferences (selected model, useContext toggle, theme, include media options) SHALL be persisted.

#### Scenario: Preference survives restart
- **WHEN** user changes preferences and reloads sidebar
- **THEN** preferences are restored from chrome.storage.local

### Requirement: System persists chat history per context

The assistant chat history SHALL be persisted and scoped to each context.

#### Scenario: Chat history persists per context
- **WHEN** user chats with assistant about context A, then switches to context B and back to A
- **THEN** the chat history for context A is restored exactly as left

#### Scenario: New extraction resets chat
- **WHEN** user performs a new extraction
- **THEN** a fresh empty chat history is created for that context

### Requirement: System limits storage usage

To prevent unbounded storage growth, the system SHALL manage storage capacity.

#### Scenario: Context older than 90 days
- **WHEN** loading contexts from storage
- **THEN** contexts older than 90 days are filtered out and not loaded

#### Scenario: Manual cleanup
- **WHEN** user clicks "Limpar dados" in settings
- **THEN** all stored contexts and chat history are deleted from chrome.storage.local
