import { syncCards } from './services/syncCards.js';
import { initDatabase, closePool } from './database.js';

async function main() {
  console.log('='.repeat(60));
  console.log(`WB Product Cards Sync started at ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  try {
    await initDatabase();
    const result = await syncCards();

    console.log('='.repeat(60));
    console.log('Summary:');
    console.log(`  Period: ${result.dateFrom.toISOString().split('T')[0]} to ${result.dateTo.toISOString().split('T')[0]}`);
    console.log(`  Cards fetched: ${result.cardsFetched}`);
    console.log(`  New cards: ${result.cardsInserted}`);
    console.log(`  Updated cards: ${result.cardsUpdated}`);
    console.log(`  HTTP requests: ${result.httpRequests}`);
    console.log(`  Retries: ${result.retries}`);
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
