-- Нагрузочный сид: 5 000 заявок для замеров порогов PRD §8.1 (SRS §11.5).
--
--   docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
--     psql -U ravonroad -d ravonroad -v reports=5000 -f - < scripts/seed-load.sql
--
-- SQL, а не скрипт на TypeScript: сид нужен там, где лежат данные, а на серверах
-- кампании нет ни node_modules, ни права их поставить (SRS §12.2 п.3). Пять тысяч строк
-- целиком генерирует БД — приложению в этом участвовать незачем.
--
-- **Только для стенда замеров.** На проде с настоящими заявками не запускается: строки
-- становятся неотличимы от живых, а счётчик отремонтированного — враньём.
--
-- Что сид намеренно не создаёт:
--   * DUPLICATE — CHECK требует duplicate_of_id, а связывать случайные пары незачем;
--   * контакты и created_ip — персональных данных в синтетике не бывает (SRS §15);
--   * telegram_outbox — доставка карточек мерится отдельно, а 5 000 записей в очереди
--     воркер честно попытается отправить.

\set ON_ERROR_STOP on
\if :{?reports}
\echo 'сид: число заявок задано ключом -v reports'
\else
\set reports 5000
\endif

BEGIN;

-- Точка кладётся внутрь bbox района, и district_code ставится его же: колонки bbox_* уже
-- посчитаны при сиде районов, а ST_Contains на пять тысяч точек — минуты работы PostGIS
-- ради координат, которые всё равно синтетические (SRS §2.6).
WITH districts AS (
  SELECT code, bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon,
         row_number() OVER (ORDER BY code) - 1 AS idx,
         count(*) OVER () AS total
    FROM district
),
categories AS (
  SELECT id, row_number() OVER (ORDER BY sort_order) - 1 AS idx, count(*) OVER () AS total
    FROM category WHERE is_active
),
-- Одна настоящая фотография на весь сид, если в бакете уже что-то лежит: битые картинки
-- исказили бы LCP списка ровно там, где он и меряется.
sample AS (
  SELECT object_key, preview_key FROM report_photo
   WHERE state = 'READY' AND object_key IS NOT NULL LIMIT 1
),
numbers AS (SELECT generate_series(1, :reports) AS n),
seeded AS (
  SELECT n.n,
         d.code AS district_code,
         c.id   AS category_id,
         -- Статусы в пропорции кампании: очередь модерации живая, половина заявок закрыта.
         (CASE WHEN n.n % 10 < 3 THEN 'NEW'
               WHEN n.n % 10 < 4 THEN 'ACCEPTED'
               WHEN n.n % 10 < 5 THEN 'IN_PROGRESS'
               WHEN n.n % 10 < 9 THEN 'DONE'
               ELSE 'REJECTED' END)::report_status AS status,
         -- 60 дней истории: список и карта сортируются по created_at, и одинаковая
         -- отметка у всех строк сделала бы измерение бессмысленным.
         now() - (n.n % 60) * interval '1 day' - (n.n % 1440) * interval '1 minute' AS created_at,
         d.bbox_min_lat + (d.bbox_max_lat - d.bbox_min_lat) * ((n.n * 37 % 1000)::numeric / 1000) AS lat,
         d.bbox_min_lon + (d.bbox_max_lon - d.bbox_min_lon) * ((n.n * 53 % 1000)::numeric / 1000) AS lon,
         1 + n.n % 3 AS photo_count
    FROM numbers n
    JOIN districts  d ON d.idx = n.n % d.total
    JOIN categories c ON c.idx = n.n % c.total
),
inserted AS (
  INSERT INTO report (public_number, status, category_id, district_code, latitude, longitude,
                      landmark, tracking_token, created_at, updated_at, done_at, status_reason)
  SELECT nextval('report_public_number_seq'),
         s.status,
         s.category_id,
         s.district_code,
         round(s.lat, 6),
         round(s.lon, 6),
         'сид ' || s.n,
         -- 22 символа, как у настоящего токена. Секретности здесь не требуется: строки
         -- синтетические, а уникальность даёт сам номер.
         substr(md5('seed-load-' || s.n), 1, 22),
         s.created_at,
         s.created_at,
         CASE WHEN s.status = 'DONE' THEN s.created_at + interval '2 days' END,
         -- REJECTED без причины не проходит CHECK, и это не формальность: житель видит
         -- причину на странице отслеживания (US-013).
         CASE WHEN s.status = 'REJECTED' THEN 'spam' END
    FROM seeded s
  RETURNING id, public_number, status, created_at
)
INSERT INTO report_photo (report_id, kind, sort_order, state, object_key, preview_key, sha256,
                          width, height, bytes, created_at)
SELECT i.id,
       kind.kind::photo_kind,
       kind.slot,
       'READY',
       COALESCE((SELECT object_key FROM sample), 'p/seed/' || i.id || '-' || kind.slot || '.jpg'),
       COALESCE((SELECT preview_key FROM sample), 'p/seed/' || i.id || '-' || kind.slot || '-p.jpg'),
       -- sha256 уникален в пределах заявки и вида: photo_dedup_idx этого и требует.
       md5(i.id::text || kind.kind || kind.slot) || md5(kind.kind || i.id::text),
       1600, 1200, 240000,
       i.created_at
  FROM inserted i
  CROSS JOIN LATERAL (
    SELECT 'BEFORE' AS kind, generate_series(0, i.public_number % 3) AS slot
    UNION ALL
    -- Инвариант BR-006: у DONE обязана быть фотография «после», иначе заявка не имеет
    -- права быть закрытой (SRS §2.2), и метрика P-4 покажет её строкой.
    SELECT 'AFTER', 0 WHERE i.status = 'DONE'
  ) AS kind;

-- История: создание у всех, решение у закрытых. Без неё P-6 (медиана NEW → первое
-- решение) не считается, а именно её и смотрят после всплеска.
INSERT INTO report_status_history (report_id, from_status, to_status, actor_type, created_at, reason)
SELECT r.id, NULL, 'NEW', 'SYSTEM', r.created_at, NULL
  FROM report r WHERE r.landmark LIKE 'сид %';

INSERT INTO report_status_history (report_id, from_status, to_status, actor_type, created_at, reason)
SELECT r.id, 'NEW', r.status, 'MODERATOR', r.created_at + interval '4 hours',
       CASE WHEN r.status = 'REJECTED' THEN 'spam' END
  FROM report r WHERE r.landmark LIKE 'сид %' AND r.status <> 'NEW';

COMMIT;

ANALYZE report;
ANALYZE report_photo;
ANALYZE report_status_history;

SELECT count(*) FILTER (WHERE status = 'NEW')  AS new,
       count(*) FILTER (WHERE status = 'DONE') AS done,
       count(*)                                AS total
  FROM report;
