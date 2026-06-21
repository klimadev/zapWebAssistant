## ADDED Requirements

### Requirement: System displays conversation statistics

The system SHALL compute and display basic statistics for the active context.

#### Scenario: Stats available after extraction
- **WHEN** user clicks "Estatísticas" on a context
- **THEN** a panel shows: total messages, messages per sender, audio count, image count, date range

#### Scenario: Top senders
- **WHEN** stats are displayed
- **THEN** senders are ranked by message count with percentage

#### Scenario: Activity by hour
- **WHEN** stats are displayed
- **THEN** messages per hour of day are shown (as a simple horizontal bar or list)

#### Scenario: Most frequent words
- **WHEN** stats are displayed
- **THEN** top 10 most frequent words (excluding common stopwords) are listed

### Requirement: Stats are computed from stored messages

Statistics SHALL be computed locally from the message data without API calls.

#### Scenario: Offline stats
- **WHEN** user views stats while offline
- **THEN** stats are computed and displayed from local data
