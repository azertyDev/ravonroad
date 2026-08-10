-- PostGIS ставится первой миграцией и один раз: расширение обязано существовать
-- до первой колонки geography, которая приходит с таблицей district в 002 (SRS §2.14).
CREATE EXTENSION IF NOT EXISTS postgis;
