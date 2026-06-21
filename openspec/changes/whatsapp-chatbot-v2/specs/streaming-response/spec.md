## ADDED Requirements

### Requirement: Assistant responses stream in real-time

The assistant SHALL stream responses token by token instead of delivering the complete response at once.

#### Scenario: User sends a message with streaming
- **WHEN** user clicks "Enviar" or presses Ctrl+Shift+Enter
- **THEN** the response begins appearing in the chat message bubble as tokens arrive, with a visual "thinking" indicator that transitions to live text

#### Scenario: Streaming cancellation
- **WHEN** user clicks "Parar" button during an active stream
- **THEN** the fetch AbortController aborts the request, partial response remains visible

#### Scenario: Full response after stream ends
- **WHEN** the stream completes
- **THEN** the complete response text is persisted to chat history

### Requirement: System handles SSE stream parsing

The system SHALL correctly parse Server-Sent Events from the API response.

#### Scenario: Standard SSE chunks arrive
- **WHEN** API returns `Content-Type: text/event-stream` with `data: {...}` lines
- **THEN** each `data` line is parsed, delta content extracted and appended to the visible message

#### Scenario: Stream ends with [DONE]
- **WHEN** `data: [DONE]` is received
- **THEN** streaming stops, final response is committed to history

#### Scenario: Non-streaming API response
- **WHEN** API returns `Content-Type: application/json` (non-streaming fallback)
- **THEN** system uses original blocking fetch and displays the complete response

### Requirement: Visual streaming indicator

The chat message UI SHALL show a distinct visual state while streaming.

#### Scenario: Tokens arriving
- **WHEN** tokens are actively being received
- **THEN** the message bubble shows a thin animated cursor/blinking indicator at the end of the text

### Requirement: Streaming preserves formatting

Streamed content SHALL be rendered incrementally, with markdown formatting applied on the fly.

#### Scenario: Code block in streaming
- **WHEN** a code block is being streamed as multiple SSE chunks
- **THEN** the code block renders progressively without breaking formatting
