import { describe, expect, it } from 'vitest';
import { renderMarkdown, sectionHtml } from '../utils/markdown';

describe('renderMarkdown', () => {
  it('renders markdown formatting', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
  });

  it('escapes raw html instead of rendering it', () => {
    const html = renderMarkdown('hello <script>alert(1)</script> world');

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});

describe('sectionHtml', () => {
  it('keeps plain-text mode escaped', () => {
    expect(sectionHtml('<img src=x onerror=alert(1)>', false)).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
  });
});
