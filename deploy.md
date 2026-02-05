# Инструкция по развертыванию uploading_product_cards_from_wb_with_photos

Пошаговая инструкция для развертывания скрипта выгрузки **карточек товаров Wildberries с фотографиями** на сервере Ubuntu 24.04 с FASTPANEL.

## Описание

Скрипт:
- Использует **WB Content API** (POST /content/v2/get/cards/list)
- Выгружает карточки товаров за последние 30 дней (исключая сегодня)
- Сохраняет все данные в одну таблицу (фото разделены по размерам в отдельные колонки)
- Использует UPSERT для защиты от дубликатов
- Ведёт технические логи выполнения в БД
- Запускается каждые 30 минут через cron

---

## API Wildberries

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| POST | `/content/v2/get/cards/list` | Получить список карточек товаров |

### Базовый URL

```
https://content-api.wildberries.ru
```

### Заголовки авторизации

| Заголовок | Описание |
|-----------|----------|
| `Authorization` | API-ключ (JWT токен) |
| `Content-Type` | `application/json` |

### Лимиты API WB Content

| Ограничение | Значение |
|-------------|----------|
| Запросов в минуту | 100 |
| Интервал между запросами | 600 мс |
| Всплеск | 5 запросов |
| Записей на страницу (limit) | До 100 |

### Структура ответа `/content/v2/get/cards/list`

```json
{
  "cards": [
    {
      "nmID": 12345678,
      "imtID": 123654789,
      "nmUUID": "01bda0b1-5c0b-736c-b2be-d0a6543e9be",
      "subjectID": 7771,
      "subjectName": "Кроссовки",
      "vendorCode": "ARTICLE-001",
      "brand": "Nike",
      "title": "Кроссовки спортивные",
      "description": "Описание товара...",
      "photos": [
        {
          "big": "https://basket-10.wbbasket.ru/.../big/1.webp",
          "c246x328": "https://basket-10.wbbasket.ru/.../c246x328/1.webp",
          "c516x688": "https://basket-10.wbbasket.ru/.../c516x688/1.webp",
          "square": "https://basket-10.wbbasket.ru/.../square/1.webp",
          "tm": "https://basket-10.wbbasket.ru/.../tm/1.webp"
        }
      ],
      "video": "https://...",
      "dimensions": {
        "length": 35,
        "width": 25,
        "height": 15,
        "weightBrutto": 1.2,
        "isValid": true
      },
      "characteristics": [...],
      "sizes": [...],
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-02-01T14:20:00.000Z"
    }
  ],
  "cursor": {
    "updatedAt": "2024-02-01T14:20:00.000Z",
    "nmID": 12345678,
    "total": 100
  }
}
```

### Колонки фотографий в БД

| Колонка | Тип | Описание |
|---------|-----|----------|
| `photos_big` | TEXT[] | Массив URL больших изображений |
| `photos_c246x328` | TEXT[] | Массив URL миниатюр 246x328 |
| `photos_c516x688` | TEXT[] | Массив URL миниатюр 516x688 |
| `photos_square` | TEXT[] | Массив URL квадратных изображений |
| `photos_tm` | TEXT[] | Массив URL маленьких миниатюр |

---

## Требования

- Ubuntu 24.04
- Node.js 18.x или выше
- PostgreSQL (доступ к БД)
- API токен WB (категория "Контент")

---

## Шаг 1: Подключение к серверу

```bash
ssh root@109.73.194.111
# Пароль: w8hDWrMybh6-bH
```

---

## Шаг 2: Проверка Node.js

```bash
node --version
# Ожидается: v18.19.1 или выше

npm --version
# Ожидается: 10.x или выше
```

Если Node.js не установлен:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs
```

---

## Шаг 3: Копирование проекта на сервер

### Вариант A: Через SCP (папка)
```bash
scp -r uploading_product_cards_from_wb_with_photos root@109.73.194.111:/opt/
# Пароль: w8hDWrMybh6-bH
```

### Вариант B: Через SCP (архив)
```bash
scp uploading_product_cards_from_wb_with_photos.zip root@109.73.194.111:/opt/
ssh root@109.73.194.111
cd /opt
unzip uploading_product_cards_from_wb_with_photos.zip
```

### Вариант C: Через Git
```bash
cd /opt
git clone <URL_репозитория> uploading_product_cards_from_wb_with_photos
```

---

## Шаг 4: Установка зависимостей

```bash
cd /opt/uploading_product_cards_from_wb_with_photos
npm install
```

### Ожидаемый вывод:
```
added 2 packages in 2s
```

---

## Шаг 5: Настройка конфигурации (.env)

```bash
nano .env
```

Заполните `.env`:

```env
# Wildberries API
WB_API_KEY=eyJhbGciOiJFUzI1NiIsImtpZCI6IjIwMjUwOTA0djEiLCJ0eXAiOiJKV1QifQ...
WB_API_URL=https://content-api.wildberries.ru

# PostgreSQL Database
PG_HOST=176.124.219.60
PG_PORT=5432
PG_USER=gen_user
PG_PASSWORD=y>D4~;f^YLgFA|
PG_DATABASE=default_db

# Настройки запросов
REQUEST_LIMIT=100
REQUEST_DELAY_MS=600
MAX_RETRIES=5
RETRY_BACKOFF_MS=2000
DAYS_TO_FETCH=30
```

Сохраните: `Ctrl+X`, затем `Y`, затем `Enter`.

### Параметры конфигурации

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `WB_API_KEY` | API-ключ из личного кабинета WB | - |
| `WB_API_URL` | Базовый URL API | `https://content-api.wildberries.ru` |
| `REQUEST_LIMIT` | Записей на страницу (макс. 100) | `100` |
| `REQUEST_DELAY_MS` | Задержка между запросами | `600` |
| `MAX_RETRIES` | Макс. повторов при ошибке | `5` |
| `RETRY_BACKOFF_MS` | Базовая задержка для backoff | `2000` |
| `DAYS_TO_FETCH` | Глубина выборки в днях | `30` |

### Где найти API ключ WB

1. Войдите в личный кабинет WB Seller: https://seller.wildberries.ru/
2. Перейдите: **Настройки** → **Доступ к API**
3. Создайте новый токен с категорией **Контент**
4. Скопируйте полученный JWT токен

---

## Шаг 6: Создание таблиц в БД

### Способ 1: Через npm скрипт
```bash
cd /opt/uploading_product_cards_from_wb_with_photos
npm run init-db
```

### Способ 2: Через psql
```bash
apt update && apt install -y postgresql-client
psql -h 176.124.219.60 -U gen_user -d default_db -f /opt/uploading_product_cards_from_wb_with_photos/sql/init.sql
# Введите пароль: y>D4~;f^YLgFA|
```

### Способ 3: Подключиться и выполнить вручную
```bash
psql -h 176.124.219.60 -U gen_user -d default_db
# Введите пароль

# В psql:
\i /opt/uploading_product_cards_from_wb_with_photos/sql/init.sql

# Проверьте создание таблиц:
\dt

# Должны появиться:
#  wb_product_cards
#  wb_cards_sync_log

\q
```

### Структура таблиц

| Таблица | Назначение |
|---------|------------|
| `wb_product_cards` | Карточки товаров (все данные, фото в отдельных колонках по размерам) |
| `wb_cards_sync_log` | Логи выполнения синхронизации |

---

## Шаг 7: Тестовый запуск

```bash
cd /opt/uploading_product_cards_from_wb_with_photos
node src/app.js
```

### Ожидаемый вывод:

```
============================================================
WB Product Cards Sync started at 2025-02-04T12:00:00.000Z
============================================================
Database initialized
Fetching cards from 2025-01-05T00:00:00.000Z to 2025-02-03T23:59:59.999Z...
Processed 100 cards...
Processed 200 cards...
Sync completed: 350 cards (300 new, 50 updated)
============================================================
Summary:
  Period: 2025-01-05 to 2025-02-03
  Cards fetched: 350
  New cards: 300
  Updated cards: 50
  HTTP requests: 4
  Retries: 0
============================================================
```

---

## Шаг 8: Настройка Cron (каждые 30 минут)

```bash
crontab -e
```

Добавьте строку:
```cron
*/30 * * * * cd /opt/uploading_product_cards_from_wb_with_photos && /usr/bin/node src/app.js >> /var/log/uploading_product_cards_from_wb_with_photos.log 2>&1
```

Сохраните и выйдите.

### Проверка cron:
```bash
crontab -l
```

### Создание файла лога:
```bash
touch /var/log/uploading_product_cards_from_wb_with_photos.log
chmod 644 /var/log/uploading_product_cards_from_wb_with_photos.log
```

---

## Шаг 9: Проверка работы

### Просмотр логов в реальном времени:
```bash
tail -f /var/log/uploading_product_cards_from_wb_with_photos.log
```

### Проверка данных в БД:
```bash
psql -h 176.124.219.60 -U gen_user -d default_db
# Введите пароль: y>D4~;f^YLgFA|
```

```sql
-- Количество карточек
SELECT COUNT(*) FROM wb_product_cards;

-- Последние добавленные карточки
SELECT
    nm_id, vendor_code, brand, title,
    updated_at, synced_at
FROM wb_product_cards
ORDER BY synced_at DESC
LIMIT 10;

-- Карточки с количеством фотографий
SELECT
    nm_id, vendor_code, title,
    array_length(photos_big, 1) as photos_count
FROM wb_product_cards
ORDER BY synced_at DESC
LIMIT 10;

-- Получить все фото конкретного товара
SELECT
    nm_id, vendor_code,
    photos_big,
    photos_c246x328,
    photos_c516x688,
    photos_square,
    photos_tm
FROM wb_product_cards
WHERE nm_id = 12345678;

-- Получить только большие фото (первое фото каждого товара)
SELECT
    nm_id, vendor_code,
    photos_big[1] as first_photo
FROM wb_product_cards
LIMIT 10;

-- Развернуть все большие фото товара в строки
SELECT
    nm_id, vendor_code,
    unnest(photos_big) as photo_url
FROM wb_product_cards
WHERE nm_id = 12345678;

-- Карточки без фотографий
SELECT
    nm_id, vendor_code, title
FROM wb_product_cards
WHERE photos_big IS NULL OR array_length(photos_big, 1) IS NULL
LIMIT 10;

-- Карточки по брендам
SELECT
    brand, COUNT(*) as cards_count
FROM wb_product_cards
GROUP BY brand
ORDER BY cards_count DESC
LIMIT 10;

-- Карточки по категориям
SELECT
    subject_name, COUNT(*) as cards_count
FROM wb_product_cards
GROUP BY subject_name
ORDER BY cards_count DESC
LIMIT 10;

-- Логи синхронизации
SELECT
    job_start, job_end, status,
    cards_fetched, cards_inserted, cards_updated,
    http_requests, retries,
    EXTRACT(EPOCH FROM (job_end - job_start))::int AS duration_sec
FROM wb_cards_sync_log
ORDER BY job_start DESC
LIMIT 10;

-- Ошибки синхронизации
SELECT job_start, status, error_message
FROM wb_cards_sync_log
WHERE status = 'failed'
ORDER BY job_start DESC
LIMIT 5;
```

---

## Структура проекта

```
uploading_product_cards_from_wb_with_photos/
├── src/
│   ├── app.js              # Точка входа
│   ├── config.js           # Конфигурация из .env
│   ├── database.js         # Подключение к PostgreSQL
│   ├── api/
│   │   └── wb.js           # WB Content API
│   ├── services/
│   │   └── syncCards.js    # Логика синхронизации
│   └── utils/
│       └── logger.js       # Логирование
├── sql/
│   └── init.sql            # SQL для создания таблиц
├── .env                    # Конфигурация (НЕ коммитить!)
├── .env.example            # Пример конфигурации
├── .gitignore
├── package.json
└── deploy.md               # Эта инструкция
```

---

## Устранение неполадок

### Ошибка подключения к БД

1. Проверьте доступность PostgreSQL:
   ```bash
   nc -zv 176.124.219.60 5432
   ```

2. Проверьте данные в `.env`

3. Тест подключения:
   ```bash
   psql -h 176.124.219.60 -U gen_user -d default_db -c "SELECT 1;"
   ```

### Ошибка API (401 Unauthorized)

1. Проверьте `WB_API_KEY` в `.env`
2. Убедитесь, что токен активен в личном кабинете WB
3. Проверьте, что токен создан с категорией **Контент**

### Ошибка API (403 Forbidden)

1. Проверьте права доступа API токена
2. Убедитесь, что токен имеет доступ к методам контента

### Ошибка API (429 Too Many Requests)

Скрипт автоматически обрабатывает rate limiting с экспоненциальным backoff.
Если ошибка повторяется:
1. Увеличьте `REQUEST_DELAY_MS` в `.env` до 1000
2. Уменьшите `REQUEST_LIMIT` до 50

### Ошибка API (5xx Server Error)

Скрипт автоматически делает до 5 повторов с увеличивающейся задержкой.
Если проблема сохраняется — проверьте статус WB API: https://dev.wildberries.ru/wb-status

### Cron не работает

1. Проверьте статус cron:
   ```bash
   systemctl status cron
   ```

2. Проверьте логи:
   ```bash
   grep CRON /var/log/syslog
   ```

3. Перезапустите cron:
   ```bash
   systemctl restart cron
   ```

4. Проверьте путь к node:
   ```bash
   which node
   # Должно быть: /usr/bin/node
   ```

---

## Полезные команды

```bash
# Ручной запуск
cd /opt/uploading_product_cards_from_wb_with_photos && node src/app.js

# Просмотр последних логов
tail -100 /var/log/uploading_product_cards_from_wb_with_photos.log

# Статистика синхронизаций
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT status, COUNT(*),
          AVG(EXTRACT(EPOCH FROM (job_end - job_start)))::int as avg_sec,
          SUM(cards_fetched) as total_cards
   FROM wb_cards_sync_log GROUP BY status;"

# Очистка старых логов (старше 30 дней)
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "DELETE FROM wb_cards_sync_log WHERE job_start < NOW() - INTERVAL '30 days';"

# Количество записей
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT 'wb_product_cards' as table_name, COUNT(*) FROM wb_product_cards
   UNION ALL SELECT 'wb_cards_sync_log', COUNT(*) FROM wb_cards_sync_log;"

# Карточки с максимальным количеством фото
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT nm_id, vendor_code, title, array_length(photos_big, 1) as photos_count
   FROM wb_product_cards
   WHERE photos_big IS NOT NULL
   ORDER BY photos_count DESC LIMIT 10;"

# Экспорт карточек в CSV (с первым фото)
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "COPY (SELECT nm_id, vendor_code, brand, title, photos_big[1] as photo FROM wb_product_cards)
   TO STDOUT WITH CSV HEADER;" > cards_export.csv

# Экспорт всех фото в CSV
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "COPY (SELECT nm_id, vendor_code, unnest(photos_big) as photo_url FROM wb_product_cards)
   TO STDOUT WITH CSV HEADER;" > photos_export.csv

# Найти карточку по артикулу
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT nm_id, vendor_code, brand, title
   FROM wb_product_cards WHERE vendor_code LIKE '%ARTICLE%';"
```

---

## Мониторинг

### Проверка последней успешной синхронизации
```bash
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT job_start, job_end, cards_fetched
   FROM wb_cards_sync_log WHERE status = 'success'
   ORDER BY job_start DESC LIMIT 1;"
```

### Алерт если синхронизация не работает более 1 часа
```bash
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT CASE
     WHEN MAX(job_start) < NOW() - INTERVAL '1 hour' THEN 'ALERT: No sync in last hour!'
     ELSE 'OK: Last sync at ' || MAX(job_start)::text
   END FROM wb_cards_sync_log WHERE status = 'success';"
```

---
