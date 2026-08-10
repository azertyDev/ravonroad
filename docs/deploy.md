# Развёртывание

Одна и та же composition поднимается локально, на dev и на проде; различаются оверлей
лимитов и `.env` (SRS §12). Образы собирает GitHub Actions и кладёт в GHCR — **на серверах
только `docker pull`**, `docker build` на 1 ГБ упирается в память (SRS §12.2 п.1).

| Среда | Машина | Оверлей | Адрес |
| --- | --- | --- | --- |
| local | ноутбук | `docker-compose.dev.yml` | `http://localhost` |
| dev | GCE e2-micro, 1 ГБ, us-central1 | `docker-compose.dev.yml` | `http://34.46.68.126` |
| prod | VPS AHOST, 2 ГБ | `docker-compose.prod.yml` | пока не поднят |

## Локально

```sh
cp .env.example .env          # заполнить POSTGRES_*, остальное можно оставить пустым
pnpm install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
pnpm --filter @ravonroad/api exec prisma migrate deploy
pnpm dev
```

Весь стек в контейнерах, как на сервере:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
docker compose run --rm migrate
curl http://localhost/health
```

## Выкатка на dev

Автоматическая: push в `dev` → `build` собирает три образа с тегом `<sha>` → по его
успеху `deploy-dev` заходит по ssh и запускает на сервере
`/opt/ravonroad/deploy/deploy.sh <sha>`.

`deploy.sh` по шагам:

1. подтягивает `docker-compose*.yml` из выкатываемого коммита — конфиг обязан
   соответствовать коду;
2. тянет образы **по одному** (`migrate`, `api`, `edge`): при ~44 МБ запаса поверх
   лимитов параллельная распаковка трёх слоёв уводит машину в swap (SRS §12.2);
3. накатывает миграции одноразовым контейнером: `docker compose run --rm migrate`,
   внутри — только `prisma migrate deploy`;
4. пересоздаёт `api` и `edge` (`--no-deps`, база и edge-роутинг не перезапускаются зря);
5. 12 попыток по 5 секунд стучится в `http://localhost/health`;
6. прошло — записывает в `.env` новый `IMAGE_TAG`, а прежний в `PREVIOUS_IMAGE_TAG`.
   Не прошло — откатывается сам (см. ниже).

Красный health-check = ненулевой код выхода `ssh` = красный workflow.

Руками то же самое:

```sh
ssh deploy@34.46.68.126
/opt/ravonroad/deploy/deploy.sh 4f2a91c
```

**Миграции только вперёд.** `prisma db push` и `prisma migrate reset` запрещены на всех
средах, включая dev: первая расходится с историей миграций, вторая стирает базу.

**Тег — всегда `<sha>`, никогда `latest`.** По `latest` нельзя сказать, что развёрнуто;
`docker compose ps --format '{{.Image}}'` на сервере должен отвечать конкретным коммитом.

## Откат

Автоматический — часть `deploy.sh`: если health-check провалился, скрипт берёт
`PREVIOUS_IMAGE_TAG` из `.env`, тянет его образы, пересоздаёт `api` и `edge` и проверяет
здоровье ещё раз. `.env` при провале не переписывается: `IMAGE_TAG` остаётся указывать на
работающую версию.

Ручной откат:

1. `ssh deploy@34.46.68.126 && cd /opt/ravonroad`
2. `grep IMAGE_TAG .env` — `PREVIOUS_IMAGE_TAG` и есть цель отката. Другая версия берётся
   из истории `dev` или из списка тегов пакета в GHCR;
3. `./deploy/deploy.sh <тег>` — обычная выкатка, просто на старый тег. Образы уже
   собраны, `build` заново не нужен;
4. проверить: `curl -f http://34.46.68.126/health` и
   `docker compose -f docker-compose.yml -f docker-compose.dev.yml ps`.

Через GitHub: вкладка Actions → workflow `deploy-dev` → Run workflow → указать sha.

**Чего откат не делает: не отыгрывает миграции.** Схема остаётся новой. Откат кода
поверх новой схемы работает, пока миграция обратно совместима — поэтому DoD и требует
плана отката для миграции (SRS §13). Несовместимая миграция чинится вперёд, новым
коммитом, а не откатом.

## Логи

```sh
cd /opt/ravonroad
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f --tail=200 api
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs --tail=200 edge db
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
```

Драйвер режет логи на `max-size=10m`, `max-file=3` — диск e2-micro заканчивается раньше
памяти (SRS §12.2 п.5). Что искать: `correlationId` из ответа api есть и в логах nginx
(SRS §8.3). Лог выкатки из GitHub Actions — в самом workflow `deploy-dev`.

## Подготовка сервера с нуля

На машине уже должны быть Docker, docker compose, swap и `gcloud`, залогиненный под
сервисным аккаунтом с доступом к секретам проекта `ravonroad-dev`.

```sh
sudo mkdir -p /opt/ravonroad && sudo chown deploy:deploy /opt/ravonroad
git clone --depth 1 -b dev https://github.com/azertyDev/ravonroad.git /opt/ravonroad
/opt/ravonroad/deploy/bootstrap-dev.sh
```

Что делает `bootstrap-dev.sh`: обновляет клон, проверяет compose-файлы, достаёт пять
секретов из Secret Manager (`ravonroad-dev-telegram-bot-token`,
`ravonroad-dev-telegram-group-id`, `ravonroad-dev-telegram-webhook-secret`,
`ravonroad-dev-s3-access-key`, `ravonroad-dev-s3-secret-key`), пишет `/opt/ravonroad/.env`
с правами 600 и поднимает базу, которая и создаёт том `ravonroad_db-data`.

Существующий `.env` он не перетирает. `--force` перевыпускает его, но **пароль Postgres
переносит из старого файла**: том уже проинициализирован этим паролем, подмена сломала бы
аутентификацию.

Он же обновляет скрипты `deploy/` на сервере — сама выкатка их не трогает, потому что git
переписал бы файл, который в этот момент исполняется. Меняли `deploy.sh` — прогоните
`bootstrap-dev.sh` повторно.

Дальше руками:

1. открыть 80 порт в firewall GCE; 5432 наружу не смотрит — dev-оверлей публикует его
   только на `127.0.0.1`;
2. вписать `TELEGRAM_MODERATOR_IDS` в `/opt/ravonroad/.env`;
3. публичную часть ключа deploy — в `~/.ssh/authorized_keys` пользователя `deploy`,
   приватную — в секрет репозитория `DEPLOY_SSH_KEY`; туда же `DEPLOY_HOST` и
   `DEPLOY_USER`;
4. первая выкатка: push в `dev` либо `./deploy/deploy.sh <sha>` руками. Откатываться ей
   некуда — `PREVIOUS_IMAGE_TAG` ещё пуст, и при провале стек останется лежать
   с понятным сообщением.

Внешний IP dev-машины эфемерный, поэтому ключ хоста не закреплён: workflow снимает его
`ssh-keyscan` перед каждой выкаткой. Появится домен — сюда придёт постоянный
`known_hosts` из секрета.

## Резервные копии

`deploy/backup.sh` делает `pg_dump | gzip` в `/opt/ravonroad/backups/` и держит 7
последних копий. Cron:

```
17 3 * * * /opt/ravonroad/deploy/backup.sh >>/var/log/ravonroad-backup.log 2>&1
```

**На dev cron не ставится**: `pg_dump` там не запускается, восстанавливать нечего
(SRS §12.2 п.4). Скрипт лежит в репозитории ради прода и ради ручного снимка перед
рискованной миграцией.

Расхождение, которое надо развести до прода: SRS §10.5 требует 14 копий и выгрузку
в S3 под отдельным префиксом, скрипт хранит 7 штук локально. Локальные копии не
переживут потерю диска — перед первым прод-релизом либо скрипт догоняет SRS, либо SRS
меняется осознанно. Фотографии не бэкапятся ни там, ни там: их хранилище (GCS на dev,
Cloupard на проде) держит реплики само.

## Чем dev отличается от прода

| | dev | prod |
| --- | --- | --- |
| Память | 1 ГБ, лимиты 560 МБ при ~604 МБ доступных (SRS §12.2) | 2 ГБ, лимиты 1312 МБ (SRS §12.1) |
| Оверлей | `docker-compose.dev.yml` | `docker-compose.prod.yml` |
| `build:` в compose | остаётся: локальная сборка идёт этим же оверлеем | снят через `!reset null` |
| Порт 5432 | наружу закрыт, на хост отдан на `127.0.0.1` | не публикуется вовсе |
| TLS | нет, сайт по IP на 80 порту | обязателен вместе с доменом |
| Хранилище фото | GCS через S3-совместимый XML API, bucket `ravonroad-dev-photos` | Cloupard S3 |
| Секреты | Secret Manager проекта `ravonroad-dev` | заводятся отдельно, вне GCP |
| `pg_dump` | не запускается | суточный по cron |
| Всплеск §1.6 | не воспроизводится, dev — среда разработки | проверяется один раз до анонса |

Прод-выкатки пока нет: `deploy-dev.yml` ходит только на dev. Прод получит свой workflow
и свои секреты, когда машина AHOST поднимется.
