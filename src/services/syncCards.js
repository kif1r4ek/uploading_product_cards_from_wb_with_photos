import * as api from '../api/wb.js';
import * as db from '../database.js';
import { config } from '../config.js';

function getDateRange() {
  const now = new Date();

  const dateTo = new Date(now);
  dateTo.setDate(dateTo.getDate() - 1);
  dateTo.setHours(23, 59, 59, 999);

  const dateFrom = new Date(now);
  dateFrom.setDate(dateFrom.getDate() - config.daysToFetch);
  dateFrom.setHours(0, 0, 0, 0);

  return { dateFrom, dateTo };
}

export async function syncCards() {
  const jobStart = new Date();
  const { dateFrom, dateTo } = getDateRange();

  const logId = await db.createSyncLog(jobStart, dateFrom, dateTo);

  api.resetStats();

  let cardsFetched = 0;
  let cardsInserted = 0;
  let cardsUpdated = 0;

  try {
    console.log(`Fetching cards from ${dateFrom.toISOString()} to ${dateTo.toISOString()}...`);

    for await (const card of api.fetchAllCards(dateFrom, dateTo)) {
      cardsFetched++;

      const isNew = await db.upsertCard(card);
      if (isNew) {
        cardsInserted++;
      } else {
        cardsUpdated++;
      }

      if (cardsFetched % 100 === 0) {
        console.log(`Processed ${cardsFetched} cards...`);
      }
    }

    const stats = api.getStats();

    await db.updateSyncLog(logId, {
      jobEnd: new Date(),
      status: 'success',
      cardsFetched,
      cardsInserted,
      cardsUpdated,
      httpRequests: stats.httpRequestCount,
      retries: stats.retryCount
    });

    console.log(`Sync completed: ${cardsFetched} cards (${cardsInserted} new, ${cardsUpdated} updated)`);

    return {
      dateFrom,
      dateTo,
      cardsFetched,
      cardsInserted,
      cardsUpdated,
      httpRequests: stats.httpRequestCount,
      retries: stats.retryCount
    };

  } catch (error) {
    console.error('Sync failed:', error.message);

    const stats = api.getStats();
    await db.updateSyncLog(logId, {
      jobEnd: new Date(),
      status: 'failed',
      cardsFetched,
      cardsInserted,
      cardsUpdated,
      httpRequests: stats.httpRequestCount,
      retries: stats.retryCount,
      errorMessage: error.message
    });

    throw error;
  }
}
