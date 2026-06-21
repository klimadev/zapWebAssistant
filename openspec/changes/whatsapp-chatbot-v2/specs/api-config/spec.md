## ADDED Requirements

### Requirement: User can configure API key and endpoint

The system SHALL provide an interface for the user to configure the API base URL and API key used for AI model requests.

#### Scenario: User opens settings panel
- **WHEN** user clicks the settings icon in the sidebar header
- **THEN** a settings panel opens with fields for API Base URL and API Key

#### Scenario: User updates API key
- **WHEN** user types a new API key and clicks "Save"
- **THEN** the new key is persisted to chrome.storage.local and used for subsequent requests

#### Scenario: User updates API endpoint
- **WHEN** user types a new endpoint URL and clicks "Save"
- **THEN** the new URL is persisted to chrome.storage.local and used for subsequent requests

#### Scenario: User saves empty API key
- **WHEN** user clears the API key field and clicks "Save"
- **THEN** system shows validation error "API key não pode estar vazia"

#### Scenario: User saves invalid URL
- **WHEN** user types an invalid URL (no protocol, malformed) and clicks "Save"
- **THEN** system shows validation error "URL inválida. Use https://..."

#### Scenario: Configuration persists across sidebar close
- **WHEN** user configures API settings, closes sidebar, and reopens
- **THEN** the previously saved settings are loaded from chrome.storage.local

### Requirement: API key is not exposed in source code

The hardcoded API key in the bundle SHALL be removed and replaced with runtime configuration from chrome.storage.

#### Scenario: Bundle inspection
- **WHEN** the distributed code is inspected
- **THEN** no hardcoded API key or endpoint URL shall be present

### Requirement: "Testar Conexão" button validates configuration

The settings panel SHALL include a "Testar Conexão" button that validates the current configuration against the API.

#### Scenario: Successful connection test
- **WHEN** user clicks "Testar Conexão" with valid API key and endpoint
- **THEN** system shows success message "Conexão OK"

#### Scenario: Failed connection test
- **WHEN** user clicks "Testar Conexão" with invalid API key
- **THEN** system shows specific error message based on HTTP status (401 for unauthorized, timeout for unreachable)

### Requirement: Default fallback configuration

The system SHALL have sensible fallback defaults when no configuration is saved yet.

#### Scenario: First run
- **WHEN** extension loads for the first time and no config exists in storage
- **THEN** the API base URL defaults to the current URL and the API key is empty, prompting user to configure
