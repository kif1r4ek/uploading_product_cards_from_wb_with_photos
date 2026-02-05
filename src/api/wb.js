import { config } from '../config.js';

const { apiKey, apiUrl } = config.wb;
const { limit, delayMs, maxRetries, retryBackoffMs } = config.request;

let httpRequestCount = 0;
let retryCount = 0;

export function getStats() {
	return { httpRequestCount, retryCount };
}

export function resetStats() {
	httpRequestCount = 0;
	retryCount = 0;
}

async function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiRequest(endpoint, body = {}, method = 'POST', attempt = 1) {
	httpRequestCount++;
	
	try {
		const options = {
			method,
			headers: {
				'Authorization': apiKey,
				'Content-Type': 'application/json'
			}
		};
		
		if (method === 'POST') {
			options.body = JSON.stringify(body);
		}
		
		const response = await fetch(`${apiUrl}${endpoint}`, options);
		
		if (response.status === 429 || response.status >= 500) {
			if (attempt <= maxRetries) {
				retryCount++;
				const waitTime = retryBackoffMs * Math.pow(2, attempt - 1);
				console.log(`Retry ${attempt}/${maxRetries} after ${waitTime}ms (HTTP ${response.status})`);
				await sleep(waitTime);
				return apiRequest(endpoint, body, method, attempt + 1);
			}
		}
		
		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`HTTP ${response.status}: ${errorText}`);
		}
		
		return response.json();
	} catch (error) {
		if (attempt <= maxRetries && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
			retryCount++;
			const waitTime = retryBackoffMs * Math.pow(2, attempt - 1);
			console.log(`Retry ${attempt}/${maxRetries} after ${waitTime}ms (${error.code})`);
			await sleep(waitTime);
			return apiRequest(endpoint, body, method, attempt + 1);
		}
		throw error;
	}
}

function parseCard(card) {
	const dimensions = card.dimensions || {};
	const photos = card.photos || [];

	return {
		nmId: card.nmID,
		imtId: card.imtID,
		nmUuid: card.nmUUID,
		subjectId: card.subjectID,
		subjectName: card.subjectName,
		vendorCode: card.vendorCode,
		brand: card.brand,
		title: card.title,
		description: card.description,
		videoUrl: card.video || null,
		dimensionsLength: dimensions.length || null,
		dimensionsWidth: dimensions.width || null,
		dimensionsHeight: dimensions.height || null,
		dimensionsWeightBrutto: dimensions.weightBrutto || null,
		dimensionsIsValid: dimensions.isValid || null,
		characteristics: card.characteristics || [],
		sizes: card.sizes || [],
		photosBig: photos.map(p => p.big).filter(Boolean),
		photosC246x328: photos.map(p => p.c246x328).filter(Boolean),
		photosC516x688: photos.map(p => p.c516x688).filter(Boolean),
		photosSquare: photos.map(p => p.square).filter(Boolean),
		photosTm: photos.map(p => p.tm).filter(Boolean),
		createdAt: card.createdAt || null,
		updatedAt: card.updatedAt || null
	};
}

export async function* fetchAllCards(dateFrom, dateTo) {
	let cursor = { limit };
	let hasMore = true;
	
	while (hasMore) {
		const body = {
			settings: {
				sort: { ascending: true },
				cursor,
				filter: { withPhoto: -1 }
			}
		};
		
		const data = await apiRequest('/content/v2/get/cards/list', body);
		
		if (data.error) {
			throw new Error(data.errorText || 'API Error');
		}
		
		const cards = data.cards || [];
		
		for (const card of cards) {
			const parsed = parseCard(card);
			
			if (dateFrom && dateTo) {
				const cardDate = new Date(parsed.updatedAt || parsed.createdAt);
				if (cardDate >= dateFrom && cardDate <= dateTo) {
					yield parsed;
				}
			} else {
				yield parsed;
			}
		}
		
		const responseCursor = data.cursor || {};
		const total = responseCursor.total || 0;
		
		if (total < limit || !responseCursor.nmID) {
			hasMore = false;
		} else {
			cursor = {
				limit,
				updatedAt: responseCursor.updatedAt,
				nmID: responseCursor.nmID
			};
			await sleep(delayMs);
		}
	}
}
