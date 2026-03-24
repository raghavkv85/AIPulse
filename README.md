# AI Pulse

Automated AI newsletter system that curates and delivers twice-weekly digests for builders — solo founders, product managers, and vibe coders.

## How It Works

```
Content Sources (RSS / Atom / Scrape / Hacker News)
        ↓
   Aggregator  →  Fetch & parse articles
        ↓
     Curator   →  Filter → Dedupe → Rank → Generate treatments
        ↓
    Delivery   →  Render HTML/text → Send emails via Resend
        ↓
     Archive   →  Store digests as HTML files
```

The curator uses LLM-based classification (with keyword fallback) to keep content strictly technical — legal, regulatory, geopolitical, and financial articles are filtered out automatically.

## Coverage Categories

| Category | Keywords |
|----------|----------|
| Anthropic/Claude | anthropic, claude, sonnet, opus, haiku |
| OpenAI | openai, gpt, chatgpt, dall-e, sora, o1, o3 |
| Google | google, gemini, deepmind, bard, vertex |
| AWS | aws, amazon, bedrock, sagemaker, titan |
| Builder Tools & OSS | framework, sdk, langchain, llamaindex, huggingface, ollama, vllm |

## Default Sources

- Anthropic Blog, OpenAI Blog, Google AI Blog, DeepMind Blog
- AWS ML Blog, AWS News
- Hugging Face Blog, The Verge AI, TechCrunch AI, Ars Technica AI
- Hacker News (Tool Radar)

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
- **Groq / Anthropic / OpenAI** — LLM-based content curation
- **rss-parser** + **cheerio** — feed parsing and web scraping
- **node-cron** — scheduling
- **vitest** — testing

## Project Structure

```
src/
├── index.ts              # Entry point & pipeline orchestration
├── cli.ts                # CLI for manual operations
├── config.ts             # Configuration & defaults
├── types.ts              # TypeScript type definitions
├── database.ts           # SQLite setup
├── aggregator/           # Content fetching (RSS, scrape, HN)
├── curator/              # Filter, dedupe, rank, treatments, tool radar
├── delivery/             # HTML/text rendering, email sending
├── scheduler/            # Cron scheduling
├── archive/              # Digest archival
├── repositories/         # Data access layer
└── config/               # Runtime category management
```

## License

Private.
