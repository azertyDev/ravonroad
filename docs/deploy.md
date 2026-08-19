# Развёртывание

Одна и та же composition поднимается локально, на dev и на проде; различаются оверлей
лимитов и `.env` (SRS §12). Образы собирает GitHub Actions и кладёт в GHCR — **на серверах
только `docker pull`**, `docker build` на 1 ГБ упирается в память (SRS §12.2 п.1).

| Среда | Машина | Оверлей | Адрес |
| --- | --- | --- | --- |
| local | ноутбук | `docker-compose.dev.yml` | `http://localhost` |
| dev | GCE e2-micro, 1 ГБ, us-central1 | `docker-compose.dev.yml` | `http://34.46.68.126` |
| prod | Contabo Cloud VPS 4, 8 ГБ, регион EU | `docker-compose.prod.yml` | `http://169.58.202.96`, стек не поднят |

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
2. удаляет неиспользуемые образы старше 72 часов. Образы тегируются `sha`, поэтому
   каждая выкатка приносит три новых и ни одного не убирает: на стенде за день набралось
   65 образов и 25 ГБ, диск кончился, Postgres упал с `No space left on device` и ушёл
   в цикл восстановления. Сайт лёг не от нагрузки и не от кода, а от собственных выкаток.
   Порог в 72 часа оставляет цель отката на диске; даже если её уберут, откат начинается
   с `pull`, который вернёт её из GHCR;
3. тянет образы **по одному** (`migrate`, `api`, `edge`): при ~44 МБ запаса поверх
   лимитов параллельная распаковка трёх слоёв уводит машину в swap (SRS §12.2);
4. накатывает миграции одноразовым контейнером: `docker compose run --rm migrate`,
   внутри — только `prisma migrate deploy`;
5. пересоздаёт `api` и `edge` (`--no-deps`, база и edge-роутинг не перезапускаются зря);
6. 12 попыток по 5 секунд стучится в `http://localhost/health`;
7. прошло — записывает в `.env` новый `IMAGE_TAG`, а прежний в `PREVIOUS_IMAGE_TAG`.
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

## Выкатка на прод

**Только руками и только полным sha.** Автоматической выкатки у прода нет: dev получает
каждый мерж, прод — то, что на dev уже поработало. Actions → `deploy-prod` → Run workflow
→ вписать sha. Образы пересобирать не нужно, они лежат в GHCR с момента push в `dev`.

Тег — **полный sha из 40 символов**. `build` тегирует `git rev-parse HEAD`, а из интерфейса
GitHub копируется короткий: короткий даёт `not found` уже на сервере, посреди выкатки.
Workflow проверяет это до ssh, но проверка стоит здесь ради тех, кто запускает `deploy.sh`
руками.

Секреты репозитория: `PROD_SSH_HOST`, `PROD_SSH_USER`, `PROD_SSH_KEY`. Ключ хоста
не снимается keyscan, как на dev, а лежит в `deploy/known_hosts.prod`: адрес прода
постоянный, и доверять первому ответу сети незачем.

### Оверлей задаётся явно

`deploy.sh` и `issue-cert.sh` берут файл лимитов из `COMPOSE_OVERLAY` в `.env` и значения
по умолчанию не имеют. Перепутанный оверлей ломает машину молча: прод с dev-лимитами —
это api в 256 МБ на восьмигигабайтной машине без единой ошибки в логе, dev с прод-лимитами —
1312 МБ там, где доступно 604. Обе среды пишут переменную в `.env` при подготовке.

### Подготовка прод-машины

`bootstrap-dev.sh` на проде **не работает**: он берёт секреты из Secret Manager проекта
`ravonroad-dev`, а у Contabo своего GCP нет. Прод готовится вручную:

```sh
sudo mkdir -p /opt/ravonroad && sudo chown deploy:deploy /opt/ravonroad
git clone --depth 1 -b dev https://github.com/azertyDev/ravonroad.git /opt/ravonroad
```

Дальше `/opt/ravonroad/.env` с правами 600 по образцу `.env.example`, обязательно
с `COMPOSE_OVERLAY=docker-compose.prod.yml` и `GHCR_REPO`. Первая выкатка откатываться
никуда не будет: `PREVIOUS_IMAGE_TAG` ещё пуст, и при провале стек останется лежать
с понятным сообщением.

#### Выключение паролей в ssh: имя файла решает

Образ Contabo кладёт в `/etc/ssh/sshd_config.d/` свой `50-cloud-init.conf`
с `PasswordAuthentication yes`. **sshd берёт первое встреченное значение параметра**,
а файлы читаются по алфавиту — значит собственный запрет в `99-*.conf` не применяется
никогда, молча. Проверка глазами показывает `PasswordAuthentication no` в своём файле
и создаёт полную уверенность, что пароли выключены.

Поэтому файл называется `01-ravonroad.conf`, а проверяется **действующая** конфигурация,
а не содержимое своего файла:

```sh
sshd -T | grep -iE '^passwordauthentication|^permitrootlogin'
```

Ответ обязан быть `passwordauthentication no` и `permitrootlogin without-password`.
Контрольный выстрел с ноутбука — попытка войти именно паролем:

```sh
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no root@<ip>
# ожидаемое: Permission denied (publickey).
```

На dev-стенде этой ловушки нет: образ GCE кладёт единственный `90_google_keyexchange.conf`
и парольный вход выключает сам.

### Продление сертификата

Cron на прод-машине, под root:

```
0 3 * * 1 /opt/ravonroad/deploy/issue-cert.sh >>/var/log/ravonroad-cert.log 2>&1
```

Отдельного пути продления нет и не должно быть: `--keep-until-expiring` не трогает
сертификат, которому осталось больше 30 дней, поэтому один вызов годится и для выпуска,
и для продления. До первой выкатки скрипт падает на пустом `IMAGE_TAG` — **до** обращения
к Let's Encrypt, чтобы не жечь попытки проверки владения (их не больше пяти в час на имя).

### TLS без домена

Пока домена кампании нет, сертификат выпускается на имя из IP — `sslip.io` отдаёт
A-запись прямо из имени, покупать ничего не нужно:

```
TLS_DOMAIN=169.58.202.96.sslip.io
PUBLIC_ORIGIN=https://169.58.202.96.sslip.io
PUBLIC_SITE_URL=https://169.58.202.96.sslip.io
```

Та же запись, что у стенда (`34.46.68.126.sslip.io`): имя читается как адрес, и никто
не гадает, чей это хост.

Это не косметика: без защищённого контекста браузер не даёт ни геолокацию, ни
`crypto.randomUUID`, а Telegram не принимает webhook — то есть без https не работает
ни форма, ни модерация. Появится домен — меняются эти три строки, `deploy/issue-cert.sh`
и `setWebhook`; в коде не меняется ничего.

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
памяти (SRS §12.2 п.5). Весь поток api — JSON, один объект на строку, включая сообщения
самого Nest, поэтому читается `jq`. Что искать: `correlationId` из ответа api есть и
в логах nginx (SRS §8.3). Полностью — `docs/ops/observability.md`. Лог выкатки
из GitHub Actions — в самом workflow `deploy-dev`.

## Подготовка сервера с нуля

На машине уже должны быть Docker, docker compose, swap и `gcloud`, залогиненный под
сервисным аккаунтом с доступом к секретам проекта `ravonroad-dev`.

**На проде `gcloud` нет и не будет**: машина стоит у Contabo, Secret Manager проекта
`ravonroad-dev` к ней отношения не имеет. `bootstrap-dev.sh` — скрипт dev-стенда, на
проде он не запускается, и `/opt/ravonroad/.env` там пишется руками из этого файла.
Свой скрипт прод получит вместе со своим workflow выкатки.

```sh
sudo mkdir -p /opt/ravonroad && sudo chown deploy:deploy /opt/ravonroad
git clone --depth 1 -b dev https://github.com/azertyDev/ravonroad.git /opt/ravonroad
/opt/ravonroad/deploy/bootstrap-dev.sh
```

### Переменные, которые задают адреса

Три разных адреса, и путать их дорого:

| Переменная | Кто читает | Что означает |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | compose → `WEB_ORIGIN` api | origin, которому api разрешает CORS |
| `PUBLIC_SITE_URL` | api | адрес сайта в ссылках бота: номер `RR-3471` в карточке группы ведёт на `/uz/reports/3471`. На стенде это `https://<TLS_DOMAIN>` — имя, на которое выпущен сертификат, иначе волонтёр получит предупреждение браузера вместо страницы заявки |
| `TLS_DOMAIN` | edge, `issue-cert.sh` | домен сертификата. Пусто — edge работает по http |

Значение `PUBLIC_SITE_URL` на dev пишет `bootstrap-dev.sh`, собирая его из `TLS_DOMAIN`.
На проде оно появится вместе с доменом кампании. Переменная обязательная: без неё api
не поднимется — молча отправлять карточки с битыми ссылками хуже, чем упасть на старте.

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

`deploy/backup.sh` делает `pg_dump | gzip`, выгружает дамп в S3 под префиксом
`db-backups/` и держит там 14 копий (SRS §10.5). Store of record — S3: локальные копии
не переживают потерю диска, то есть ровно тот случай, ради которого бэкап и делается.
На диске остаются две последних, чтобы откат после неудачной миграции не зависел от сети.
Подписывает запросы сам `curl` (`--aws-sigv4`) — ни `aws-cli`, ни второго контейнера.
Cron:

```
17 3 * * * /opt/ravonroad/deploy/backup.sh >>/var/log/ravonroad-backup.log 2>&1
```

**На dev cron не ставится**: `pg_dump` там не запускается, восстанавливать нечего
(SRS §12.2 п.4). Скрипт лежит в репозитории ради прода и ради ручного снимка перед
рискованной миграцией — на dev он запускается руками:

```sh
COMPOSE_OVERLAY=docker-compose.dev.yml /opt/ravonroad/deploy/backup.sh
```

**Фотографии копируются тем же скриптом** — с переездом снимков на диск сервера (ADR-0009)
единственная копия живёт на этом диске. Выгрузка инкрементальная: по метке
`backups/.photos-synced` уходит только то, что появилось с прошлого удачного прогона.
Метка обновляется после цикла, поэтому оборванная выгрузка повторится, а не потеряется.

До первого прогона копий фотографий не существует вовсе — **на проде `backup.sh` обязан
отработать до анонса**.

Проверка восстановления — раз в квартал, из S3 и в отдельную базу, чтобы не трогать
рабочую: процедура в `docs/ops/observability.md` › «Резервные копии».

## Чем dev отличается от прода

| | dev | prod |
| --- | --- | --- |
| Память | 1 ГБ, лимиты 560 МБ при ~604 МБ доступных (SRS §12.2) | 8 ГБ, лимиты те же 1312 МБ (SRS §12.1) |
| Оверлей | `docker-compose.dev.yml` | `docker-compose.prod.yml` |
| `build:` в compose | остаётся: локальная сборка идёт этим же оверлеем | снят через `!reset null` |
| Порт 5432 | наружу закрыт, на хост отдан на `127.0.0.1` | не публикуется вовсе |
| TLS | нет, сайт по IP на 80 порту | обязателен вместе с доменом |
| Хранилище фото | том `photos` на диске машины | том `photos` на диске машины |
| Копии фото и дампов | GCS, bucket `ravonroad-dev-photos` | GCS, тот же bucket |
| Секреты | Secret Manager проекта `ravonroad-dev` | заводятся отдельно, вне GCP |
| `pg_dump` | не запускается | суточный по cron |
| Всплеск §1.6 | не воспроизводится, dev — среда разработки | проверяется один раз до анонса |

Прод-выкатки пока нет: `deploy-dev.yml` ходит только на dev. Прод получит свой workflow
и свои секреты, когда машина Contabo поднимется.
