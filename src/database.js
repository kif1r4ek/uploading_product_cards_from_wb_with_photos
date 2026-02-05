import pg from 'pg';
import { config } from './config.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    max: 10,
    idleTimeoutMillis: 30000
});

export async function query(text, params) {
    return pool.query(text, params);
}

export async function initDatabase() {
    const sqlPath = join(__dirname, '..', 'sql', 'init.sql');
    const sql = readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('Database initialized');
}

export async function upsertCard(card) {
    const sql = `
        INSERT INTO wb_product_cards (
        nm_id, imt_id, nm_uuid, subject_id, subject_name, vendor_code, brand,
        title, description, video_url, dimensions_length, dimensions_width,
        dimensions_height, dimensions_weight_brutto, dimensions_is_valid,
        characteristics, sizes, photos_big, photos_c246x328, photos_c516x688,
        photos_square, photos_tm, created_at, updated_at, synced_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW())
        ON CONFLICT (nm_id) DO UPDATE SET
        imt_id = EXCLUDED.imt_id,
        nm_uuid = EXCLUDED.nm_uuid,
        subject_id = EXCLUDED.subject_id,
        subject_name = EXCLUDED.subject_name,
        vendor_code = EXCLUDED.vendor_code,
        brand = EXCLUDED.brand,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        video_url = EXCLUDED.video_url,
        dimensions_length = EXCLUDED.dimensions_length,
        dimensions_width = EXCLUDED.dimensions_width,
        dimensions_height = EXCLUDED.dimensions_height,
        dimensions_weight_brutto = EXCLUDED.dimensions_weight_brutto,
        dimensions_is_valid = EXCLUDED.dimensions_is_valid,
        characteristics = EXCLUDED.characteristics,
        sizes = EXCLUDED.sizes,
        photos_big = EXCLUDED.photos_big,
        photos_c246x328 = EXCLUDED.photos_c246x328,
        photos_c516x688 = EXCLUDED.photos_c516x688,
        photos_square = EXCLUDED.photos_square,
        photos_tm = EXCLUDED.photos_tm,
        updated_at = EXCLUDED.updated_at,
        synced_at = NOW()
        RETURNING (xmax = 0) AS inserted
    `;

    const result = await query(sql, [
        card.nmId,
        card.imtId,
        card.nmUuid,
        card.subjectId,
        card.subjectName,
        card.vendorCode,
        card.brand,
        card.title,
        card.description,
        card.videoUrl,
        card.dimensionsLength,
        card.dimensionsWidth,
        card.dimensionsHeight,
        card.dimensionsWeightBrutto,
        card.dimensionsIsValid,
        JSON.stringify(card.characteristics || []),
        JSON.stringify(card.sizes || []),
        card.photosBig || [],
        card.photosC246x328 || [],
        card.photosC516x688 || [],
        card.photosSquare || [],
        card.photosTm || [],
        card.createdAt,
        card.updatedAt
    ]);

    return result.rows[0]?.inserted;
}

export async function createSyncLog(jobStart, dateFrom, dateTo) {
    const result = await query(
        `INSERT INTO wb_cards_sync_log (job_start, date_from, date_to, status) VALUES ($1, $2, $3, 'running') RETURNING id`,
        [jobStart, dateFrom, dateTo]
    );
    return result.rows[0].id;
}

export async function updateSyncLog(logId, data) {
    const fields = [];
    const params = [logId];
    let idx = 2;

    const fieldMap = {
        jobEnd: 'job_end',
        status: 'status',
        cardsFetched: 'cards_fetched',
        cardsInserted: 'cards_inserted',
        cardsUpdated: 'cards_updated',
        httpRequests: 'http_requests',
        retries: 'retries',
        errorMessage: 'error_message'
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
        if (data[key] !== undefined) {
            fields.push(`${dbField} = $${idx++}`);
            params.push(data[key]);
        }
    }

    if (fields.length) {
        await query(`UPDATE wb_cards_sync_log SET ${fields.join(', ')} WHERE id = $1`, params);
    }
}

export async function closePool() {
    await pool.end();
}
