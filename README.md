# AI Pulse

Automated AI newsletter system that curates and delivers twice-weekly digests for builders — solo founders, product managers, and vibe coders.

## How It Works

```
15+ Sources (RSS / Scrape / Reddit / Google News / Hacker News)
        ↓
   Aggregator  →  Fetch & parse articles from dynamic + static sources
        ↓
     Curator   →  LLM Filter → Dedupe → LLM Categorize → Rank → Generate treatments
        ↓
    Delivery   →  Render HTML/text → Send emails via Resend
        ↓
     Archive   →  Store digests as HTML files
```

### Smart Curation (not just keywords)

The system uses **LLM-based intelligence** at two critical stages:

1. **Content filtering** — The LLM classifies each article as include/exclude based on whether it's actionable technical content. Opinion pieces, regulatory news, lawsuits, and corporate financials are filtered out automatically.

2. **Category assignment** — Instead of keyword matching, the LLM uses its knowledge of the AI ecosystem to categorize articles. "Gemma 4" gets categorized under Google without needing the word "google" in the article. "Kiro" maps to AWS. "Llama 4" maps to Meta.

Both stages fall back to keyword-based heuristics if the LLM is unavailable.

### Article Treatment

Every article that passes curation gets a 3-layer treatment:
- **Summary** — 2-3 sentence factual description
- **Why It Matters** — implications for builders and product development
- **What You Can Build** — 3-4 concrete, actionable use cases

## Coverage Categories

| Category | Examples |
|----------|----------|
| Anthropic/Claude | claude, sonnet, opus, haiku, claude code |
| OpenAI | gpt, chatgpt, dall-e, sora, o1, o3, o4, codex, whisper |
| Google | gemini, gemma, deepmind, vertex, veo, imagen |
| AWS | bedrock, sagemaker, titan, amazon q |
| Meta AI | llama, codellama |
| Builder Tools & OSS | cursor, copilot, windsurf, kiro, antigravity, deepseek, mistral, grok, langchain, ollama, huggingface, and 30+ more |

## Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

Edit `.env` with your keys:

```
RESEND_API_KEY=re_your_resend_api_key_here
LLM_API_KEY=sk-your-llm-api-key-here
ARCHIVE_BASE_PATH=./archive
```

The default LLM provider is **Groq** (`llama-3.3-70b-versatile`). You can switch to Anthropic or OpenAI by modifying the config.

## Usage

### Start the scheduler

Runs the pipeline automatically on Monday and Friday at 6:00 AM CST:

```bash
npm start
```

### CLI commands

```bash
# Manually trigger the newsletter pipeline
npx tsx src/cli.ts run-pipeline

# Manage sources
npx tsx src/cli.ts list-sources
npx tsx src/cli.ts add-source <name> <url> <type> <categories>
npx tsx src/cli.ts remove-source <id>

# Manage subscribers
npx tsx src/cli.ts list-subscribers
npx tsx src/cli.ts add-subscriber <email>
npx tsx src/cli.ts remove-subscriber <id>

# View archived digests
npx tsx src/cli.ts list-archive
```

Source types: `rss`, `atom`, `scrape`, `tool-radar`

## Adding a Subscriber

To manually add an email address to the newsletter:

```bash
npx tsx src/cli.ts add-subscriber user@example.com
```

This creates a subscriber with `pending` status and sends a confirmation email via Resend. The subscriber must click the confirmation link to start receiving newsletters. Once confirmed, their status changes to `active`.

To view or remove existing subscribers:

```bash
npx tsx src/cli.ts list-subscribers
npx tsx src/cli.ts remove-subscriber <id>
```

A default subscriber is seeded automatically on first run (configured in `src/config.ts`).

## GitHub Actions

The included workflow (`.github/workflows/newsletter.yml`) runs the pipeline on a cron schedule (Monday & Friday at 12:00 UTC). It can also be triggered manually via `workflow_dispatch`.

Required repository secrets: `RESEND_API_KEY`, `LLM_API_KEY`.

## Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Watch mode
npm run test:watch
```

## Tech Stack

- **TypeScript** + Node.js
- **SQLite** (better-sqlite3) — article storage, subscriber management, delivery logs
- **Resend** — email delivery
- **Groq / Anthropic / OpenAI** — LLM-based content curation and categorization
- **rss-parser** + **cheerio** — feed parsing and web scraping
- **node-cron** — scheduling
- **vitest** — testing

## License

Private.
