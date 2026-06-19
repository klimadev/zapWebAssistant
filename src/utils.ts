// ── Pure utility functions (testable, no DOM/chrome deps) ──────────

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarkdown(text: string): string {
  const raw = String(text ?? '');
  let html = escapeHtml(raw);

  // Block-level (before paragraph wrap)
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Inline
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Lists — match each contiguous block then wrap all items
  html = html.replace(/(?:^|\n)([-*])\s+(.+?)(?=\n\n|$)/gs, (_match) => {
    const items = _match
      .trim()
      .split(/\n/)
      .map((line: string) => {
        const trimmed = line.replace(/^[-*]\s+/, '').trim();
        return trimmed ? `<li>${trimmed}</li>` : '';
      })
      .filter(Boolean)
      .join('');
    return items ? `<ul>${items}</ul>` : '';
  });
  html = html.replace(/(?:^|\n)(\d+)\.\s+(.+?)(?=\n\n|$)/gs, (_match) => {
    const items = _match
      .trim()
      .split(/\n/)
      .map((line: string) => {
        const trimmed = line.replace(/^\d+\.\s+/, '').trim();
        return trimmed ? `<li>${trimmed}</li>` : '';
      })
      .filter(Boolean)
      .join('');
    return items ? `<ol>${items}</ol>` : '';
  });

  // Paragraphs
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Cleanup empty wrappers
  html = html.replace(/<p>\s*(<(h\d|ul|ol|pre|blockquote)[\s\S]*?>[\s\S]*?<\/(h\d|ul|ol|pre|blockquote)>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

export function extractAssistantText(data: Record<string, unknown>): string {
  const choice = (data.choices as Array<Record<string, unknown>> | undefined)?.[0];
  const content = choice?.message as Record<string, unknown> | undefined;
  if (content?.content) {
    const c = content.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      const text = (c as Array<Record<string, string>>)
        .filter((p) => (p.type === 'text' || p.type === 'output_text') && p.text)
        .map((p) => p.text)
        .join('\n')
        .trim();
      if (text) return text;
    }
  }

  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;

  if (Array.isArray(data.output)) {
    const text = (data.output as Array<Record<string, unknown>>)
      .flatMap((item) => (item.content as Array<Record<string, string>>) ?? [])
      .filter((p) => p?.type === 'output_text' && p.text)
      .map((p) => p.text)
      .join('\n')
      .trim();
    if (text) return text;
  }

  return '';
}

export function toChatCompletionsInput(
  messages: Array<{ role: string; content: string | unknown[] }>,
): Array<{ role: string; content: unknown }> {
  return messages.map((msg) => {
    if (msg.role === 'system') return { role: 'system', content: msg.content };

    const role = msg.role === 'assistant' ? 'assistant' : 'user';

    if (typeof msg.content === 'string') {
      return { role, content: msg.content };
    }

    if (Array.isArray(msg.content)) {
      const contentParts = (msg.content as Array<Record<string, unknown>>)
        .map((part) => {
          if (!part?.type) return null;
          if (part.type === 'input_audio') {
            return {
              type: 'input_audio',
              audio: {
                data: ((part as any).audio?.data ?? (part as any).data) as string,
                format: (part as any).audio?.format as string | undefined,
              },
            };
          }
          if (part.type === 'input_text' || part.type === 'output_text' || part.type === 'text') {
            return { type: 'text', text: (part as Record<string, string>).text ?? '' };
          }
          if (part.type === 'input_file') {
            return { type: 'input_file', file_data: (part.input_file as Record<string, string>)?.data ?? part.data ?? '' };
          }
          return null;
        })
        .filter(Boolean);

      return {
        role,
        content: contentParts.length > 0 ? contentParts : [{ type: 'text', text: '' }],
      };
    }

    return { role, content: String(msg.content ?? '') };
  });
}
