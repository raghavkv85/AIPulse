import { Digest, DigestSection, CuratedArticle, ToolRadarEntry } from '../types';

/**
 * Category icon mapping for section headers.
 */
const CATEGORY_ICONS: Record<string, string> = {
  'anthropic': '🟠',
  'claude': '🟠',
  'anthropic/claude': '🟠',
  'anthropic / claude': '🟠',
  'openai': '🟢',
  'google': '🔵',
  'aws': '🟡',
  'builder tools & open source': '🔮',
  'builder tools': '🔮',
};

function getCategoryIcon(category: string): string {
  const key = category.toLowerCase();
  return CATEGORY_ICONS[key] ?? '📌';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

function formatArticleDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function renderArticleCard(article: CuratedArticle): string {
  const useCasesHtml = article.useCases.length > 0
    ? `<div class="use-cases">
        <p class="use-cases-label">💡 What You Can Build</p>
        <ul>${article.useCases.map(uc => `<li>${escapeHtml(uc)}</li>`).join('')}</ul>
      </div>`
    : '';

  const whyItMattersHtml = article.whyItMatters
    ? `<div class="why-matters">
        <p class="why-matters-label">🔥 Why This Matters</p>
        <p>${escapeHtml(article.whyItMatters)}</p>
      </div>`
    : '';

  return `<div class="article-card">
      <p class="article-title"><a href="${escapeHtml(article.url)}">${escapeHtml(article.title)}</a></p>
      <p class="article-summary">${escapeHtml(article.summary)}</p>
      ${whyItMattersHtml}
      ${useCasesHtml}
      <p class="article-meta">${formatArticleDate(article.publishedAt)} · <a href="${escapeHtml(article.url)}">${escapeHtml(extractDomain(article.url))}</a></p>
    </div>`;
}

function renderSection(section: DigestSection): string {
  const icon = getCategoryIcon(section.category);
  const articlesHtml = section.articles.map(renderArticleCard).join('\n');

  return `<div class="section">
    <div class="section-header">
      <span class="section-icon">${icon}</span>
      <h3 class="section-title">${escapeHtml(section.category)}</h3>
    </div>
    ${articlesHtml}
  </div>`;
}

function renderToolRadarCard(entry: ToolRadarEntry): string {
  return `<div style="background: #ffffff; border-radius: 10px; padding: 14px 18px; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #f3f4f6; display: flex; gap: 14px; align-items: flex-start;">
      <span style="font-size: 24px; line-height: 1;">⚡</span>
      <div>
        <p style="font-size: 14px; font-weight: 600; color: #1a1a2e; margin: 0 0 3px;"><a href="${escapeHtml(entry.url)}" style="color: #4f46e5; text-decoration: none;">${escapeHtml(entry.name)}</a> — ${escapeHtml(entry.oneLiner)}</p>
        <p style="font-size: 13px; color: #4b5563; margin: 0 0 4px;">${escapeHtml(entry.description)}</p>
        <p style="font-size: 12px; color: #16a34a; margin: 0;">Best for: ${escapeHtml(entry.bestFor)}</p>
      </div>
    </div>`;
}

function renderToolRadarSection(toolRadar: ToolRadarEntry[]): string {
  if (toolRadar.length === 0) return '';

  const cardsHtml = toolRadar.map(renderToolRadarCard).join('\n');

  return `<div class="section">
    <div class="section-header">
      <span class="section-icon">📡</span>
      <h3 class="section-title">Tool Radar</h3>
    </div>
    <p style="font-size: 13px; color: #6b7280; margin: 0 0 14px;">New and trending tools worth knowing about. Quick hits, no fluff.</p>
    ${cardsHtml}
  </div>`;
}

function renderStatsBar(digest: Digest): string {
  const start = formatShortDate(digest.periodStart);
  const end = formatShortDate(digest.periodEnd);

  return `<div class="stats-bar">
    <span>🛠️ ${digest.totalArticleCount} stories</span>
    <span>🏢 ${digest.categoryCount} categories</span>
    <span>📅 ${start}–${end}</span>
  </div>`;
}

export function renderHtml(digest: Digest, unsubscribeBaseUrl: string): string {
  const editionDate = formatDate(digest.publishedAt);
  const sectionsHtml = digest.sections.map(renderSection).join('\n');
  const toolRadarHtml = renderToolRadarSection(digest.toolRadar);
  const statsBarHtml = renderStatsBar(digest);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Pulse — ${escapeHtml(editionDate)}</title>
<style>
  body {
    margin: 0;
    padding: 0;
    background-color: #f4f4f7;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a2e;
    line-height: 1.6;
  }
  .wrapper {
    max-width: 640px;
    margin: 0 auto;
    padding: 20px;
  }
  .header {
    text-align: center;
    padding: 32px 0 24px;
  }
  .header h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: #1a1a2e;
    letter-spacing: -0.5px;
  }
  .header .tagline {
    margin: 4px 0 0;
    font-size: 14px;
    color: #6b7280;
  }
  .header .edition {
    margin: 12px 0 0;
    font-size: 13px;
    color: #9ca3af;
  }
  .divider {
    border: none;
    border-top: 2px solid #e5e7eb;
    margin: 24px 0;
  }
  .editorial {
    background: linear-gradient(135deg, #eef2ff, #f0fdf4);
    border-radius: 12px;
    padding: 20px 24px;
    margin-bottom: 28px;
    border-left: 4px solid #6366f1;
  }
  .editorial h2 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 600;
    color: #4f46e5;
  }
  .editorial p {
    margin: 0;
    font-size: 15px;
    color: #374151;
  }
  .section { margin-bottom: 28px; }
  .section-header {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb;
  }
  .section-icon { font-size: 20px; }
  .section-title { font-size: 18px; font-weight: 700; color: #1a1a2e; margin: 0; }
  .article-card {
    background: #ffffff; border-radius: 10px; padding: 16px 20px;
    margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border: 1px solid #f3f4f6;
  }
  .article-title { font-size: 15px; font-weight: 600; color: #1a1a2e; margin: 0 0 6px; }
  .article-title a { color: #4f46e5; text-decoration: none; }
  .article-title a:hover { text-decoration: underline; }
  .article-summary { font-size: 14px; color: #4b5563; margin: 0 0 10px; }
  .why-matters {
    background: #fef9ee; border-left: 3px solid #f59e0b;
    border-radius: 0 6px 6px 0; padding: 10px 14px; margin: 0 0 10px;
  }
  .why-matters-label {
    font-size: 11px; font-weight: 700; color: #d97706;
    text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;
  }
  .why-matters p { font-size: 13px; color: #92400e; margin: 0; line-height: 1.5; }
  .use-cases {
    background: #f0fdf4; border-left: 3px solid #22c55e;
    border-radius: 0 6px 6px 0; padding: 10px 14px; margin: 0 0 8px;
  }
  .use-cases-label {
    font-size: 11px; font-weight: 700; color: #16a34a;
    text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 4px;
  }
  .use-cases ul { font-size: 13px; color: #166534; margin: 0; padding-left: 18px; line-height: 1.5; }
  .use-cases li { margin-bottom: 2px; }
  .article-meta { font-size: 12px; color: #9ca3af; }
  .article-meta a { color: #6366f1; text-decoration: none; }
  .footer {
    text-align: center; padding: 24px 0;
    border-top: 2px solid #e5e7eb; margin-top: 12px;
  }
  .footer p { margin: 4px 0; font-size: 13px; color: #9ca3af; }
  .footer a { color: #6366f1; text-decoration: none; }
  .stats-bar {
    display: flex; justify-content: center; gap: 24px;
    margin-bottom: 24px; font-size: 13px; color: #6b7280;
  }
  .stats-bar span { display: flex; align-items: center; gap: 4px; }
</style>
</head>
<body>
<div class="wrapper">

  <div class="header">
    <h1>⚡ AI Pulse</h1>
    <div class="tagline">What shipped, why it matters, and what you can build with it</div>
    <div class="edition">${escapeHtml(editionDate)}</div>
  </div>

  ${statsBarHtml}

  <hr class="divider">

  <div class="editorial">
    <h2>📝 This Week's Pulse</h2>
    <p>${escapeHtml(digest.editorialIntro)}</p>
  </div>

  ${sectionsHtml}

  ${toolRadarHtml}

  <hr class="divider">

  <div class="footer">
    <p>You're receiving this because you subscribed to <strong>AI Pulse</strong>.</p>
    <p><a href="${escapeHtml(unsubscribeBaseUrl)}">Unsubscribe</a> · <a href="#">View in browser</a> · <a href="#">Past editions</a></p>
    <p style="margin-top: 12px;">Built for builders ☕</p>
  </div>

</div>
</body>
</html>`;
}
