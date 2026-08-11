-- Метрики кампании (SRS §10.3, PRD §1.3, BRD §8).
--
-- Prometheus и Grafana не разворачиваются: ~250 МБ памяти при бюджете SRS §12 — цена
-- несоразмерная, а данные и есть метрики. Файл запускается вручную раз в неделю;
-- автоматизация появится, когда координатор начнёт делать это чаще.
--
--   docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T db \
--     psql -U ravonroad -d ravonroad -f - < docs/metrics.sql
--
-- Или по одному запросу — они независимы и читают только `report`,
-- `report_status_history`, `abuse_signal` и `form_open_counter`.
--
-- Две метрики §10.3 здесь отсутствуют намеренно: P-2 (доля отказов геозабора) считается
-- по событиям `report_rejected_geofence` в логах, потому что отклонённая заявка в базу
-- не попадает вовсе, а глубины очередей пишут воркеры событием `queue_depth` — в базе
-- лежит их мгновенное значение, а не история.

\echo '== North Star (BRD §8): отремонтировано ям =='
SELECT count(*) FILTER (WHERE status = 'DONE')                         AS done,
       10000                                                           AS goal,
       round(100.0 * count(*) FILTER (WHERE status = 'DONE') / 10000, 1) AS goal_pct,
       count(*)                                                        AS reports_total
  FROM report;

\echo '== P-1: конверсия формы за 14 дней (открытий → заявок) =='
-- Знаменатель — `form_open_counter`: посуточное число открытий без cookie и адресов,
-- потому что всё остальное было бы профилированием (PRD §9.4).
SELECT o.day,
       o.count                              AS form_opens,
       count(r.id)                          AS reports,
       CASE WHEN o.count = 0 THEN NULL
            ELSE round(100.0 * count(r.id) / o.count, 1) END AS conversion_pct
  FROM form_open_counter o
  LEFT JOIN report r ON r.created_at::date = o.day
 WHERE o.day >= current_date - 14
 GROUP BY o.day, o.count
 ORDER BY o.day DESC;

\echo '== P-3: доля заявок с флагом антиабуза, по правилам =='
SELECT s.rule,
       count(DISTINCT s.report_id)                                             AS flagged,
       round(100.0 * count(DISTINCT s.report_id) / nullif((SELECT count(*) FROM report), 0), 1) AS pct_of_reports
  FROM abuse_signal s
 GROUP BY s.rule
 ORDER BY flagged DESC;

\echo '== P-4: DONE без фотографии «после» — ОБЯЗАН вернуть 0 строк =='
-- Инвариант BR-006 держит транзакция перехода (SRS §2.2, §11.3). Строки здесь означают,
-- что инвариант обошли — правкой в psql или миграцией, ослабившей проверку.
SELECT r.public_number, r.done_at
  FROM report r
 WHERE r.status = 'DONE'
   AND NOT EXISTS (SELECT 1 FROM report_photo p
                    WHERE p.report_id = r.id AND p.kind = 'AFTER' AND p.state = 'READY')
 ORDER BY r.done_at;

\echo '== P-5: заявки без района — страховка от миграции, ослабившей NOT NULL =='
-- Структурно всегда 0: `district_code` объявлен NOT NULL (§2.2), а заявка без района
-- не создаётся (§3.3). Запрос остаётся именно как страховка.
SELECT count(*) AS reports_without_district
  FROM report
 WHERE district_code IS NULL;

\echo '== P-6: медиана NEW → первое решение, часы =='
-- Первое решение — первый переход из NEW, не отменённый. Отменённые не считаются:
-- нажали и передумали — это не решение (SRS §2.7).
WITH first_decision AS (
  SELECT h.report_id,
         min(h.created_at) AS decided_at
    FROM report_status_history h
   WHERE h.from_status = 'NEW' AND h.undone_at IS NULL
   GROUP BY h.report_id
)
SELECT count(*)                                                                      AS decided_reports,
       round(percentile_cont(0.5) WITHIN GROUP (
         ORDER BY extract(epoch FROM d.decided_at - r.created_at) / 3600)::numeric, 2) AS median_hours,
       round(percentile_cont(0.9) WITHIN GROUP (
         ORDER BY extract(epoch FROM d.decided_at - r.created_at) / 3600)::numeric, 2) AS p90_hours
  FROM first_decision d
  JOIN report r ON r.id = d.report_id;

\echo '== North Star, вторая половина: медиана NEW → DONE, часы =='
SELECT count(*)                                                                       AS done_reports,
       round(percentile_cont(0.5) WITHIN GROUP (
         ORDER BY extract(epoch FROM r.done_at - r.created_at) / 3600)::numeric, 2)    AS median_hours
  FROM report r
 WHERE r.status = 'DONE' AND r.done_at IS NOT NULL;

\echo '== Распределение по статусам =='
SELECT status, count(*) AS reports
  FROM report
 GROUP BY status
 ORDER BY reports DESC;

\echo '== Глубины очередей прямо сейчас (SRS §10.3) =='
-- Мгновенный снимок тех же четырёх чисел, что воркеры пишут событием `queue_depth`.
-- В логах видна их история, здесь — состояние на момент запроса.
SELECT (SELECT count(*) FROM report_photo WHERE state = 'PENDING')       AS photo_queue,
       (SELECT count(*) FROM report_photo WHERE state = 'FAILED')        AS photo_failed,
       (SELECT count(*) FROM telegram_outbox WHERE sent_at IS NULL)      AS delivery_queue,
       (SELECT count(*) FROM report WHERE status = 'NEW')                AS moderation_queue;

\echo '== Сроки хранения: что суточная задача обязана была вычистить (SRS §9.8) =='
-- Обе строки обязаны быть нулевыми. Ненулевые означают, что задача не отрабатывает,
-- и это надо увидеть до того, как спросит кто-то снаружи.
SELECT (SELECT count(*) FROM report
         WHERE created_ip IS NOT NULL AND created_at < now() - interval '30 days') AS ip_overdue,
       (SELECT count(*) FROM report r
         WHERE r.status IN ('DONE', 'REJECTED', 'DUPLICATE', 'OUT_OF_SCOPE')
           AND (r.contact_phone IS NOT NULL OR r.contact_telegram IS NOT NULL)
           AND (SELECT max(h.created_at) FROM report_status_history h
                 WHERE h.report_id = r.id AND h.to_status = r.status AND h.undone_at IS NULL)
               < now() - interval '90 days')                                       AS contacts_overdue;
