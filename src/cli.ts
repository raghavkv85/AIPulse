/**
 * AI Newsletter System — CLI
 *
 * Simple command-line interface for manual operations.
 * Usage: npx tsx src/cli.ts <command> [args...]
 */

import { v4 as uuidv4 } from 'uuid';
import type { Source } from './types';

const VALID_SOURCE_TYPES = ['rss', 'atom', 'scrape', 'tool-radar'] as const;

function printUsage(): void {
  console.log(`
AI Newsletter CLI

Usage: npx tsx src/cli.ts <command> [args...]

Commands:
  run-pipeline                                   Manually trigger the newsletter pipeline
  add-source <name> <url> <type> <categories>    Add a new content source
                                                   type: rss | atom | scrape | tool-radar
                                                   categories: comma-separated list
  remove-source <id>                             Remove a source by ID
  list-sources                                   List all configured sources
  add-subscriber <email>                         Subscribe an email address
  remove-subscriber <id>                         Unsubscribe by subscriber ID
  list-subscribers                               List all active subscribers
  list-archive                                   List archived newsletter digests
`.trim());
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exit(1);
  }

  // Lazy-import to avoid running index.ts side-effects (scheduler start, etc.)
  // until we actually need the instances.
  const {
    aggregator,
    subscriberManager,
    archive,
    runPipeline,
  } = await import('./index');

  try {
    switch (command) {
      case 'run-pipeline': {
        console.log('Starting newsletter pipeline...');
        await runPipeline();
        console.log('Pipeline complete.');
        break;
      }

      case 'add-source': {
        const [, name, url, type, categoriesStr] = args;
        if (!name || !url || !type || !categoriesStr) {
          console.error('Error: add-source requires <name> <url> <type> <categories>');
          console.error('  type: rss | atom | scrape | tool-radar');
          console.error('  categories: comma-separated list (e.g. "openai,google")');
          process.exit(1);
        }
        if (!VALID_SOURCE_TYPES.includes(type as typeof VALID_SOURCE_TYPES[number])) {
          console.error(`Error: Invalid source type "${type}". Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`);
          process.exit(1);
        }
        const source: Source = {
          id: uuidv4(),
          name,
          url,
          type: type as Source['type'],
          categories: categoriesStr.split(',').map((c) => c.trim()),
          enabled: true,
        };
        aggregator.addSource(source);
        console.log(`Source added: ${source.name} (${source.id})`);
        break;
      }

      case 'remove-source': {
        const sourceId = args[1];
        if (!sourceId) {
          console.error('Error: remove-source requires <id>');
          process.exit(1);
        }
        aggregator.removeSource(sourceId);
        console.log(`Source removed: ${sourceId}`);
        break;
      }

      case 'list-sources': {
        const sources = aggregator.getSources();
        if (sources.length === 0) {
          console.log('No sources configured.');
        } else {
          console.log(`Sources (${sources.length}):\n`);
          for (const s of sources) {
            console.log(`  [${s.enabled ? 'ON' : 'OFF'}] ${s.name}`);
            console.log(`        ID: ${s.id}`);
            console.log(`        URL: ${s.url}`);
            console.log(`        Type: ${s.type}`);
            console.log(`        Categories: ${s.categories.join(', ')}`);
            console.log();
          }
        }
        break;
      }

      case 'add-subscriber': {
        const email = args[1];
        if (!email) {
          console.error('Error: add-subscriber requires <email>');
          process.exit(1);
        }
        const subscriber = await subscriberManager.subscribe(email);
        console.log(`Subscriber added: ${subscriber.email} (${subscriber.id}) — status: ${subscriber.status}`);
        break;
      }

      case 'remove-subscriber': {
        const subscriberId = args[1];
        if (!subscriberId) {
          console.error('Error: remove-subscriber requires <id>');
          process.exit(1);
        }
        await subscriberManager.unsubscribe(subscriberId);
        console.log(`Subscriber removed: ${subscriberId}`);
        break;
      }

      case 'list-subscribers': {
        const subscribers = await subscriberManager.getActiveSubscribers();
        if (subscribers.length === 0) {
          console.log('No active subscribers.');
        } else {
          console.log(`Active subscribers (${subscribers.length}):\n`);
          for (const sub of subscribers) {
            console.log(`  ${sub.email}`);
            console.log(`        ID: ${sub.id}`);
            console.log(`        Since: ${sub.subscribedAt.toISOString()}`);
            console.log();
          }
        }
        break;
      }

      case 'list-archive': {
        const digests = archive.listArchive();
        if (digests.length === 0) {
          console.log('No archived digests.');
        } else {
          console.log(`Archived digests (${digests.length}):\n`);
          for (const d of digests) {
            console.log(`  ${d.publishedAt.toISOString()} — ${d.id}`);
            if (d.archiveUrl) {
              console.log(`        URL: ${d.archiveUrl}`);
            }
            console.log();
          }
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}\n`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

main();
