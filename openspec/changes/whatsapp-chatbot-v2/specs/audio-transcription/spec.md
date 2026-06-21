## ADDED Requirements

### Requirement: Audio messages from extraction can be transcribed

The system SHALL allow the user to request transcription of audio messages from extracted contexts.

#### Scenario: Transcribe audio button appears
- **WHEN** a context with audio messages is active
- **THEN** a button "Transcrever áudios (N)" appears showing the count of audio files

#### Scenario: Transcription completes
- **WHEN** user clicks "Transcrever áudios"
- **THEN** each audio is sent to the API for transcription, the resulting text replaces "[ÁUDIO]" in the message display

#### Scenario: Partial transcription failure
- **WHEN** some audio files fail to transcribe
- **THEN** success message shows N/M transcribed. Failed ones keep "[ÁUDIO]" marker

#### Scenario: Transcribed text is searchable
- **WHEN** audio has been transcribed
- **THEN** the transcribed text is included in full-text search

### Requirement: Transcription progress indicator

The system SHALL show progress during batch transcription.

#### Scenario: Progress bar during transcription
- **WHEN** multiple audios are being transcribed
- **THEN** a progress indicator shows "Transcrevendo X de Y áudios..."

### Requirement: Automatic transcription opt-in

The user SHALL be able to choose between automatic transcription after extraction vs manual trigger.

#### Scenario: Toggle auto-transcribe
- **WHEN** user configures extraction settings
- **THEN** a "Transcrever áudios automaticamente" checkbox is available
