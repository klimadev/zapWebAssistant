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
  // Protect pre blocks and code from processing
  const preBlocks: string[] = [];
  let html = escapeHtml(raw);
  html = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (_m, code) => {
    preBlocks.push(`<pre><code>${code}</code></pre>`);
    return `\x00PREBLOCK${preBlocks.length - 1}\x00`;
  });

  // Headings (must be after pre protection, before lists)
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Horizontal rules
  html = html.replace(/^(?:[-*_]){3,}\s*$/gm, '<hr>');

  // Blockquotes
  html = html.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');

  // ── Task lists ─────────────────────────────────────────────────
  // Must be before regular unordered lists
  html = html.replace(/^(?:[-*])\s+\[(.)\]\s+(.+)$/gm, (_m, check: string, text: string) => {
    const checked = check === 'x' || check === 'X';
    return `<li class="task-item${checked ? ' done' : ''}"><input type="checkbox"${checked ? ' checked' : ''} disabled> ${text}</li>`;
  });
  // Wrap consecutive task items
  html = html.replace(/((?:<li class="task-item.*?<\/li>\n?)+)/g, '<ul class="task-list">$1</ul>');

  // ── Unordered lists ────────────────────────────────────────────
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
    if (!items) return '';
    // Check if already wrapped as task-list
    if (items.includes('task-item')) return items;
    return `<ul>${items}</ul>`;
  });

  // ── Ordered lists ──────────────────────────────────────────────
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

  // ── Tables ───────────────────────────────────────────────────
  html = html.replace(/^\|(.+)\|\s*$/gm, (_m, row: string) => {
    const cells = row.split('|').map((c: string) => c.trim()).filter(Boolean);
    return cells.map((c: string) => `<td>${c}</td>`).join('');
  });
  // Detect separator rows (|---|---|) and convert to <th>
  html = html.replace(/((?:<td>[-:]+\s*)+<\/td>)/g, (_m) => {
    return _m.replace(/<td>[-:]+\s*<\/td>/g, ''); // remove separator row
  });
  // Wrap consecutive <td> rows in table
  html = html.replace(/((?:<td>.*?<\/td>\n?)+)/g, (_match, content: string) => {
    const rows = content.trim().split(/\n/).filter(Boolean);
    if (rows.length < 2) return content; // ponytail: only if header + at least 1 data row
    const theadRows = rows.slice(0, 1);
    const tbodyRows = rows.slice(1);
    return `<table><thead><tr>${theadRows.join('')}</tr></thead><tbody>${tbodyRows.map((r: string) => `<tr>${r}</tr>`).join('')}</tbody></table>`;
  });

  // ── Inline ────────────────────────────────────────────────────
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // ── Paragraphs ────────────────────────────────────────────────
  // Single \n inside a paragraph becomes <br>
  html = html.replace(/\n(?!\n)/g, '<br>\n');
  // Double \n becomes paragraph boundary
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Cleanup empty wrappers and misplaced <br> after block elements
  html = html.replace(/<p>\s*(<(h\d|hr|table|ul|ol|pre|blockquote)[\s\S]*?>[\s\S]*?<\/(h\d|hr|table|ul|ol|pre|blockquote)>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/(<\/(h\d|table|ul|ol|pre|blockquote|tr)>)\s*<br>\s*/g, '$1');
  html = html.replace(/<br>\s*(<\/(h\d|table|ul|ol|pre|blockquote)>)/g, '$1');
  // Remove <br> right after opening block elements
  html = html.replace(/(<(h\d|ul|ol|pre|blockquote|table|thead|tbody|tr)>)\s*<br>\s*/g, '$1');

  // Restore pre blocks
  html = html.replace(/\x00PREBLOCK(\d+)\x00/g, (_m, i: string) => preBlocks[parseInt(i)] ?? _m);

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
