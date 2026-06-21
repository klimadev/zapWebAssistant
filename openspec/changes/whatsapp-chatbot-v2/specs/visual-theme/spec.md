## ADDED Requirements

### Requirement: System supports dark theme

The sidebar SHALL support a dark color theme toggleable by the user.

#### Scenario: Toggle dark mode
- **WHEN** user clicks the theme toggle button in the header
- **THEN** all UI elements switch to dark color scheme

#### Scenario: Theme persists across sessions
- **WHEN** user toggles dark mode and reloads sidebar
- **THEN** the dark theme preference is restored from chrome.storage.local

#### Scenario: All UI components themed
- **WHEN** dark mode is active
- **THEN** header, cards, chat messages, inputs, dropdowns, modals, and status area all use dark-appropriate colors

### Requirement: Theme applies via CSS variables

The theme system SHALL use CSS custom properties scoped to `[data-theme="dark"]` selector.

#### Scenario: CSS variable switch
- **WHEN** `[data-theme="dark"]` is set on `<html>`
- **THEN** all color references via `var(--bg)` etc resolve to dark values

#### Scenario: Light mode unaffected
- **WHEN** `[data-theme]` is not present or is `light`
- **THEN** existing light mode styles apply unchanged
