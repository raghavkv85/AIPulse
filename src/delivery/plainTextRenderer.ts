import { Digest, DigestSection, CuratedArticle, ToolRadarEntry } from '../types';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function renderArticle(article: CuratedArticle): string {
  const lines: string[] = [];

  lines.push(article.title);
  lines.push(article.url);
  lines.push('');
  lines.push(article.summary);

  if (article.whyItMatters) {
    lines.push('');
    lines.push('Why This Matters:');
    lines.push(article.whyItMatters);
  }

  if (article.useCases.length > 0) {
    lines.push('');
    lines.push('What You Can Build:');
    for (const uc of article.useCases) {
      lines.push(`  - ${uc}`);
    }
  }

  return lines.join('\n');
}

function renderSection(section: DigestSection): string {
  const lines: string[] = [];

  lines.push(section.category.toUpperCase());
  lines.push('---');

  for (let i = 0; i < section.articles.length; i++) {
    if (i > 0) lines.push('');
    lines.push(renderArticle(section.articles[i]));
  }

  return lines.join('\n');
}

function renderToolRadarEntry(entry: ToolRadarEntry): string {
  const lines: string[] = [];
  lines.push(`${entry.name} — ${entry.oneLiner}`);
  lines.push(entry.description);
  lines.push(`Best for: ${entry.bestFor}`);
  lines.push(entry.url);
  return lines.join('\n');
}

export function renderPlainText(digest: Digest, unsubscribeBaseUrl: string): string {
  const lines: string[] = [];

  // Header
  lines.push('AI Pulse');
  lines.push(formatDate(digest.publishedAt));
  lines.push('===');
  lines.push('');

  // Stats
  const start = formatShortDate(digest.periodStart);
  const end = formatShortDate(digest.periodEnd);
  lines.push(`${digest.totalArticleCount} stories | ${digest.categoryCount} categories | ${start} – ${end}`);
  lines.push('');

  // Editorial intro
  lines.push(digest.editorialIntro);
  lines.push('');
  lines.push('===');

  // Sections
  for (const section of digest.sections) {
    lines.push('');
    lines.push(renderSection(section));
  }

  // Tool Radar
  if (digest.toolRadar.length > 0) {
    lines.push('');
    lines.push('TOOL RADAR');
    lines.push('---');
    for (let i = 0; i < digest.toolRadar.length; i++) {
      if (i > 0) lines.push('');
      lines.push(renderToolRadarEntry(digest.toolRadar[i]));
    }
  }

  // Footer
  lines.push('');
  lines.push('===');
  lines.push('');
  lines.push(`Unsubscribe: ${unsubscribeBaseUrl}`);
  lines.push('');
  lines.push('Built for builders.');

  return lines.join('\n');
}
