import { parse as markedParse, Renderer } from 'marked';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

const safeMarkdownRenderer = new Renderer();
safeMarkdownRenderer.html = (token) => escapeHtml(token.text);

export function renderMarkdown(text: string): string {
  try {
    return markedParse(text, { async: false, renderer: safeMarkdownRenderer }) as string;
  } catch {
    return escapeHtml(text);
  }
}

export function sectionHtml(text: string, markdownEnabled: boolean): string {
  return markdownEnabled ? renderMarkdown(text) : escapeHtml(text);
}
