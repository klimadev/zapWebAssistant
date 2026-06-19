import { describe, it, expect } from 'vitest';
import { escapeHtml, renderMarkdown, extractAssistantText, toChatCompletionsInput } from './utils';

describe('escapeHtml', () => {
  it('escapes & < > " \'', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
  it('passes plain text through', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('renderMarkdown', () => {
  it('renders bold', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
  });
  it('renders italic', () => {
    expect(renderMarkdown('*italic*')).toContain('<em>italic</em>');
  });
  it('renders inline code', () => {
    expect(renderMarkdown('`code`')).toContain('<code>code</code>');
  });
  it('renders code block', () => {
    const result = renderMarkdown('```\nconst x = 1;\n```');
    expect(result).toContain('<pre><code>');
    expect(result).toContain('const x = 1;');
  });
  it('renders headings', () => {
    expect(renderMarkdown('# H1')).toContain('<h1>H1</h1>');
    expect(renderMarkdown('## H2')).toContain('<h2>H2</h2>');
    expect(renderMarkdown('### H3')).toContain('<h3>H3</h3>');
  });
  it('renders paragraphs', () => {
    const result = renderMarkdown('a\n\nb');
    expect(result).toMatch(/<p>a<\/p>/);
    expect(result).toMatch(/<p>b<\/p>/);
  });
  it('renders blockquote', () => {
    expect(renderMarkdown('> quote')).toContain('<blockquote>quote</blockquote>');
  });
  it('escapes HTML in markdown', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).toContain('&lt;script&gt;');
  });
  it('renders unordered list', () => {
    const result = renderMarkdown('- item1\n- item2');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>item1</li>');
    expect(result).toContain('<li>item2</li>');
  });
  it('renders ordered list', () => {
    const result = renderMarkdown('1. first\n2. second');
    expect(result).toContain('<ol>');
    expect(result).toContain('<li>first</li>');
    expect(result).toContain('<li>second</li>');
  });
});

describe('extractAssistantText', () => {
  it('extracts from choices[0].message.content (string)', () => {
    const data = { choices: [{ message: { content: 'Hello!' } }] };
    expect(extractAssistantText(data)).toBe('Hello!');
  });

  it('extracts from choices[0].message.content (array with text parts)', () => {
    const data = {
      choices: [{
        message: {
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'World' },
          ],
        },
      }],
    };
    expect(extractAssistantText(data)).toBe('Hello \nWorld');
  });

  it('extracts output_text', () => {
    expect(extractAssistantText({ output_text: 'Direct output' })).toBe('Direct output');
  });

  it('extracts from output array with content parts', () => {
    const data = {
      output: [{ content: [{ type: 'output_text', text: 'Nested' }] }],
    };
    expect(extractAssistantText(data)).toBe('Nested');
  });

  it('returns empty string for unknown format', () => {
    expect(extractAssistantText({ foo: 'bar' })).toBe('');
  });
});

describe('toChatCompletionsInput', () => {
  it('converts system message', () => {
    const result = toChatCompletionsInput([{ role: 'system', content: 'You are a bot' }]);
    expect(result).toEqual([{ role: 'system', content: 'You are a bot' }]);
  });

  it('converts user string message', () => {
    const result = toChatCompletionsInput([{ role: 'user', content: 'Hi' }]);
    expect(result).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('converts assistant string message', () => {
    const result = toChatCompletionsInput([{ role: 'assistant', content: 'Hello' }]);
    expect(result).toEqual([{ role: 'assistant', content: 'Hello' }]);
  });

  it('converts multimodal content array with text', () => {
    const result = toChatCompletionsInput([
      { role: 'user', content: [{ type: 'text', text: 'desc' } as unknown] },
    ]);
    expect(result).toEqual([{ role: 'user', content: [{ type: 'text', text: 'desc' }] }]);
  });

  it('converts audio parts', () => {
    const result = toChatCompletionsInput([
      { role: 'user', content: [{ type: 'input_audio', audio: { data: 'base64...' } } as unknown] },
    ]);
    expect(result[0]?.content).toEqual(
      [{ type: 'input_audio', audio: { data: 'base64...' } }],
    );
  });

  it('returns text placeholder for empty content array', () => {
    const result = toChatCompletionsInput([
      { role: 'user', content: [] as unknown[] },
    ]);
    expect(result).toEqual([{ role: 'user', content: [{ type: 'text', text: '' }] }]);
  });
});
