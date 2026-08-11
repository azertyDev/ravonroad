# Словарь строк по макету — инвентаризация

Источник: `design/` (Home C, Form C, Report C, Desktop C, Mobile States C, Components,
`readme.md`). Собран до вёрстки, чтобы ключи были согласованы заранее, а срез 005
проверял доступность и локали один раз — на финальной разметке.

Узбекский первый: он на 15–20% длиннее, и подписи проектируются по нему.
Колонка «ключ» — предложение; помечено, существует ли ключ в `apps/web/src/shared/i18n`
сегодня (**есть** / **новый** / **правка** — ключ есть, но строка расходится с макетом).

Модификаторные буквы в узбекских строках: `ʻ` U+02BB в `oʻ`/`gʻ`, `ʼ` U+02BC как
tutuq belgisi. Апострофы `'` U+0027 и `’` U+2019 запрещены (`readme.md` › Content
fundamentals).

---

## 1. Общее: шапка, подвал, язык

| Ключ | Oʻzbekcha | Русский | Статус |
| --- | --- | --- | --- |
| `app.name` | RavonRoad | RavonRoad | есть |
| `header.localeNavLabel` | Tilni tanlash | Выбрать язык | правка (было «Sayt tili» / «Язык сайта»; макет: `aria-label="Tilni tanlash · Выбрать язык"`) |
| `locale.uz` | Oʻzbekcha (lotin) | Oʻzbekcha (lotin) | правка (макет уточняет письменность) |
| `locale.ru` | Русский | Русский | есть |
| `footer.volunteers` | Loyihani volontyorlar yuritadi | Проект ведут волонтёры | новый |
| `footer.noState` | Davlat organlari ishtirok etmaydi | Государственные органы не участвуют | новый |
| `footer.telegram` | Telegram · @ravonroad | Telegram · @ravonroad | новый |
| `footer.contact` | Kampaniya bilan bogʻlanish | Связаться с кампанией | есть (в макете нет — оставить, если ссылка задана) |
| `nav.back` | Orqaga | Назад | новый |
| `nav.home` | Bosh sahifa | Главная | новый |
| `action.share` | Ulashish | Поделиться | новый |
| `action.close` | Yopish | Закрыть | правка (`map.close` → общий `action.close`) |

## 2. Главная (Home C, Desktop C)

| Ключ | Oʻzbekcha | Русский | Статус |
| --- | --- | --- | --- |
| `home.titleAction` | Chuqurni belgilang. | Отметьте яму. | **уже в вёрстке** (`feat/design-c`) |
| `home.titlePromise` | Brigada tuzatadi. | Бригада починит. | **уже в вёрстке**; вторая строка выделена цветом, поэтому ключа два, а не один |
| `home.lead` | Davlat organlari ishtirok etmaydi. Faqat siz va volontyorlar. | Государственные органы не участвуют. Только вы и волонтёры. | **уже в вёрстке** |
| `home.titleDesktop` | Toshkent yoʻllarini oʻzimiz taʼmirlaymiz | Дороги Ташкента ремонтируем сами | новый (десктоп даёт другой заголовок) |
| `home.repairedLabel` | Taʼmirlangan chuqurlar | Отремонтированные ямы | правка (было «Отремонтировано ям») |
| `home.goalSuffix` | 10 000 gacha | до 10 000 | новый (подпись под одометром) |
| `home.goalLabel` | Kampaniya maqsadi | Цель кампании | есть (оставлен как есть) |
| `home.goalShort` | Maqsad | Цель | **уже в вёрстке**; короткая подпись под одометром |
| `home.weekDelta` | +128 shu hafta | +128 на этой неделе | новый (число — параметр) |
| `home.averagePace` | oʻrtacha 4 kunda bitta chuqur | в среднем одна яма за 4 дня | новый |
| `home.weekTitle` | Shu hafta | На этой неделе | новый |
| `home.weekCount` | +128 ta | +128 | новый |
| `home.beforeLabel` | Oldin | До | новый |
| `home.afterLabel` | Keyin | После | новый |
| `home.statusesTitle` | Holatlar | Статусы | новый |
| `home.mapLink` | Xarita | Карта | новый (в макете со стрелкой — стрелку рисовать иконкой, не символом) |
| `home.cta` | Chuqur haqida xabar berish | Сообщить о яме | есть (`form.title`, переиспользовать) |
| `home.ctaNote` | Roʻyxatdan oʻtish shart emas · 30 soniya | Без регистрации · 30 секунд | новый |
| `home.queued` | 412 navbatda | 412 в очереди | новый |
| `home.crews` | 27 brigada | 27 бригад | новый |
| `home.districts` | 11 tuman | 11 районов | новый |

Счётчик кампании и «Statuses» повторяются на десктопе в правой колонке 420 px —
строки те же, ключи не дублируются.

## 3. Карта и её слои (Home C, Desktop C, Components)

| Ключ | Oʻzbekcha | Русский | Статус |
| --- | --- | --- | --- |
| `map.canvasLabel` | Xarita | Карта | есть |
| `map.attribution` | Xarita manbalari | Источники карты | есть |
| `map.layer.map` | Xarita | Карта | новый |
| `map.layer.satellite` | Sputnik | Спутник | новый |
| `map.layer.list` | Roʻyxat | Список | новый |
| `map.locate` | Mening joylashuvim | Моё местоположение | есть |
| `map.districtCount` | Mirzo Ulugʻbek tumani · 412 ta | Мирзо-Улугбекский район · 412 | правка (`list.districtCount`) |
| `map.cluster.label` | Arizalar | Заявки | есть |
| `map.marker.label` | Ariza | Заявка | есть |
| `map.truncated` | Barcha arizalar koʻrsatilmadi — xaritani yaqinlashtiring. | Показаны не все заявки — приблизьте карту. | есть |

## 4. Форма (Form C, Desktop C, Components)

Нумерация шагов `01`–`05` — цифры, а не строки локали. Подписи шагов:

| Ключ | Oʻzbekcha | Русский | Статус |
| --- | --- | --- | --- |
| `form.title` | Chuqur haqida xabar berish | Сообщить о яме | есть |
| `form.step.photo` | Surat | Фото | новый |
| `form.step.point` | Nuqta | Точка | новый |
| `form.step.landmark` | Moʻljal | Ориентир | есть (`form.landmark.label`) |
| `form.step.category` | Toifa | Категория | правка (было «Nuqson turi» / «Тип дефекта») |
| `form.step.contacts` | Aloqa · ixtiyoriy | Контакт · необязательно | правка (`form.contacts.legend`) |
| `form.photos.limit` | 3 tagacha | до 3 | новый |
| `form.photos.add` | Suratga olish | Снять фото | правка (было «Surat qoʻshish» / «Добавить фото») |
| `form.photos.hint` | JPG, HEIC · 10 MB gacha | JPG, HEIC · до 10 МБ | правка |
| `form.photos.dropzone` | Faylni shu yerga tashlang yoki tanlang | Перетащите файл сюда или выберите | новый (только десктоп) |
| `form.photos.progress` | 2 / 3 | 2 / 3 | новый (числа — параметры) |
| `form.photos.failed` | 02-surat yuklanmadi — internet uzildi | Фото 02 не загрузилось — оборвался интернет | новый |
| `form.photos.retry` | Qayta urinish | Повторить | новый |
| `form.photos.remove` | Suratni oʻchirish | Удалить фото | правка |
| `form.point.hintNear` | Buyuk Ipak Yoʻli 12A yaqinida | Рядом с Великим шёлковым путём, 12A | новый (образец, значение подставляется) |
| `form.point.move` | Surish | Сдвинуть | новый |
| `form.point.change` | Oʻzgartirish | Изменить | новый |
| `form.point.marked` | Belgilandi | Отмечено | новый |
| `form.landmark.hint` | Xarita 20 metrga yanglishsa, brigada shu izoh bilan topadi. | Если карта ошиблась на 20 метров, бригада найдёт по этой подсказке. | правка |
| `form.landmark.placeholder` | 12-maktab roʻparasida | Напротив школы 12 | новый |
| `form.description.label` | Tavsif | Описание | новый |
| `form.description.optional` | ixtiyoriy | необязательно | новый |
| `form.description.placeholder` | Chuqurlik chuqur, avtobus har kuni oʻtadi | Яма глубокая, автобус ходит каждый день | новый |
| `form.contacts.notice` | Faqat holat oʻzgarganda yozish uchun. Sizni hech kim roʻyxatga olmaydi. | Только чтобы написать при смене статуса. Вас никто не регистрирует. | правка |
| `form.contacts.phonePlaceholder` | +998 | +998 | новый |
| `form.contacts.telegramPlaceholder` | @telegram | @telegram | новый |
| `form.contacts.telegramError` | Nikda boʻsh joy boʻlmaydi. Masalan: @ravonroad | В нике не бывает пробела. Например: @ravonroad | новый |
| `form.submit` | Yuborish | Отправить | есть |
| `form.submitLong` | Chuqurni yuborish | Отправить заявку | новый (размер lg) |
| `form.submitting` | Yuborilmoqda | Отправляем | правка (без многоточия — макет запрещает многоточия в подписях кнопок) |
| `form.blocked` | Surat va nuqta kerak · 30 soniya | Нужны фото и точка · 30 секунд | новый (подпись под выключенной кнопкой) |
| `form.backgroundUpload` | Surat fon rejimida yuklanadi | Фото загрузится в фоне | новый |
| `form.backgroundUploadLong` | Surat fon rejimida yuklanadi — internet uzilsa ham ariza ketadi. | Фото загрузится в фоне — заявка уйдёт, даже если интернет оборвётся. | новый |
| `form.cancel` | Bekor qilish | Отмена | есть (`track.deleteCancel`, вынести в `action.cancel`) |
| `form.save` | Saqlash | Сохранить | новый |
| `form.add` | Qoʻshish | Добавить | новый |

## 5. Отправлено (Form C · 3, Components · States)

| Ключ | Oʻzbekcha | Русский | Статус |
| --- | --- | --- | --- |
| `done.title` | Ariza yuborildi | Заявка отправлена | правка (было «Ariza qabul qilindi» / «Заявка принята») |
| `done.lead` | Brigada 1–2 kun ichida tekshiradi. Holat oʻzgarsa — shu havolada koʻrinadi. | Бригада проверит за 1–2 дня. Смена статуса появится по этой ссылке. | новый |
| `done.numberLabel` | Ariza raqami | Номер заявки | есть |
| `done.linkWarning` | Havolani saqlang — kuzatish uchun kirish shart emas. | Сохраните ссылку — вход для отслеживания не нужен. | правка |
| `done.copyLink` | Havolani nusxalash | Скопировать ссылку | есть |
| `done.toMap` | Xaritaga qaytish | Вернуться на карту | новый |
| `done.telegramNotice` | Telegram nik qoldirdingiz — brigada holat oʻzgarganda yozadi. | Вы оставили ник в Telegram — бригада напишет при смене статуса. | новый |
| `done.another` | Yangi ariza | Новая заявка | правка (было «Yana bir ariza yuborish») |

## 6. Страница заявки (Report C, Desktop C)

| Ключ | Oʻzbekcha | Русский | Статус |
| --- | --- | --- | --- |
| `report.history` | Holat tarixi | История статуса | правка (было «Holatlar tarixi» / «История статусов») |
| `report.photosBefore` | Oldin | До | правка (было «Taʼmirdan oldin» / «До ремонта») |
| `report.photosAfter` | Keyin | После | правка |
| `report.photoPending` | Keyin surati kutilmoqda | Ждём фото «после» | новый |
| `report.photoCount` | 2 surat | 2 фото | новый |
| `report.crew` | Brigada 4 | Бригада 4 | новый |
| `report.depth` | ~0,8 m | ~0,8 м | новый (значение — параметр) |
| `report.coordinates` | 41.3111, 69.2797 | 41.3111, 69.2797 | новый |
| `report.source.site` | saytdan | с сайта | новый |
| `report.days` | 4 kunda | за 4 дня | новый |
| `report.showOnMap` | Xaritada koʻrsatish | Показать на карте | новый |
| `report.oneOfGoal` | Bu chuqur 10 000 dan biri | Эта яма — одна из 10 000 | новый |
| `report.newPending` | Ariza saytdan keldi va tekshirilmoqda. Brigada yangi arizalarni 1–2 kunda koʻrib chiqadi. | Заявка пришла с сайта и проверяется. Новые заявки бригада смотрит за 1–2 дня. | новый |
| `report.inProgressNote` | Brigada bugun ertalab yoʻlga chiqdi. Keyin surati ish yopilganda paydo boʻladi. | Бригада выехала сегодня утром. Фото «после» появится, когда работу закроют. | новый |
| `report.trackOnlyByLink` | Kuzatish faqat shu havola bilan — kabinet yoʻq. | Отслеживание только по этой ссылке — кабинета нет. | правка (`track.contacts` рядом) |
| `report.nearby` | Yaqin atrofda | Рядом | новый |

## 7. Фильтры и список (Mobile States C · 4–5, Components · 07)

| Ключ | Oʻzbekcha | Русский | Статус |
| --- | --- | --- | --- |
| `filters.title` | Filtrlar | Фильтры | есть |
| `filters.reset` | Tozalash | Сбросить | правка (было «Filtrlarni tozalash»; длинный вариант оставить для пустого состояния) |
| `filters.status` | Holat | Статус | правка (было «Holati») |
| `filters.category` | Toifa | Категория | правка |
| `filters.district` | Tuman | Район | есть |
| `filters.date` | Sana | Дата | правка (`filters.from`/`filters.to` — внутри) |
| `filters.today` | bugun | сегодня | новый |
| `filters.apply` | 412 ta chuqurni koʻrsatish | Показать 412 ям | новый (число пересчитывается до применения) |
| `filters.wholeCity` | Butun Toshkent boʻyicha | По всему Ташкенту | новый |
| `list.nearby` | Yaqin atrofda | Рядом | новый |
| `list.more` | Yana 20 ta | Ещё 20 | правка |
| `list.distance` | 180 m · RR-3471 | 180 м · RR-3471 | новый (формат строки) |
| `list.countInDistrict` | 412 ta · Mirzo Ulugʻbek | 412 · Мирзо-Улугбек | правка |
| `sheet.list` | Roʻyxat | Список | новый |

## 8. Состояния: пусто, офлайн, ошибка (Mobile States C · 1–3, Desktop C · 4–6, Components · 10)

| Ключ | Oʻzbekcha | Русский | Статус |
| --- | --- | --- | --- |
| `empty.title` | Bu hududda chuqur yoʻq | В этом районе ям нет | правка (было «Tanlangan filtrlar boʻyicha ariza topilmadi») |
| `empty.lead` | Filtrlarni boʻshatib koʻring yoki xaritani boshqa tumanga surib qoʻying. | Ослабьте фильтры или подвиньте карту в другой район. | новый |
| `empty.resetFilters` | Filtrlarni tozalash | Сбросить фильтры | есть |
| `empty.wholeCity` | Butun Toshkent | Весь Ташкент | новый |
| `empty.counterMuted` | Filtr yoqilgan — umumiy hisob koʻrsatilmaydi | Фильтр включён — общий счёт не показан | новый |
| `empty.whatToDo` | Nima qilish mumkin | Что можно сделать | новый |
| `offline.title` | Internet yoʻq · saqlangan holat | Нет интернета · сохранённая версия | правка (было «Aloqa yoʻq. Xarita yangilanmadi.») |
| `offline.lead` | Ariza qurilmada saqlandi va aloqa paydo boʻlishi bilan oʻzi yuboriladi. | Заявка сохранена на устройстве и отправится сама, когда появится связь. | новый |
| `offline.retryNow` | Hozir urinish | Попробовать сейчас | новый |
| `offline.queued` | Navbatda | В очереди | новый |
| `offline.queuedSize` | 2 surat · 1,8 MB · aloqa paydo boʻlganda yuboriladi | 2 фото · 1,8 МБ · отправятся при связи | новый |
| `offline.snapshotTime` | Xarita 09:12 holatiga koʻra | Карта по состоянию на 09:12 | новый |
| `error.mapTitle` | Xarita yuklanmadi | Карта не загрузилась | новый |
| `error.mapLead` | Server javob bermayapti. Brigada Telegramda buni allaqachon koʻrmoqda — ariza yuborish esa ishlaydi. | Сервер не отвечает. Бригада уже видит это в Telegram — отправка заявки работает. | новый |
| `error.refresh` | Yangilash | Обновить | правка (`state.retry` = «Qayta urinish», оставить оба: «повторить» и «обновить» — разные действия) |
| `error.reportWithoutMap` | Xaritasiz xabar berish | Сообщить без карты | новый |
| `offline.savedVersion` | Net aloqa yoʻq · saqlangan versiya | Нет сети · сохранённая версия | новый (шапка страницы заявки) |

## 9. Доменные коды — таблицей, а не строкой в разметке

### 9.1 Статусы

Слева — код контракта, дальше — макет и текущий словарь. Строки различаются; выбрать
одну пару до вёрстки (см. §10.1).

| Код | Макет uz | Словарь uz | Макет ru | Словарь ru |
| --- | --- | --- | --- | --- |
| `NEW` | Yangi | Yangi | Новая | Новая |
| `ACCEPTED` | Qabul qilindi | Qabul qilingan | Принята | Принята |
| `IN_PROGRESS` | Ish jarayonida | Ish jarayonida | В работе | В работе |
| `DONE` | Taʼmirlandi | Taʼmirlangan | Отремонтирована | Отремонтирована |
| `REJECTED` | Rad etildi | Rad etilgan | Отклонена | Отклонена |
| `DUPLICATE` | Takroriy | Takroriy | Дубликат | Дубликат |
| `OUT_OF_SCOPE` | Imkoniyatdan tashqari | Imkoniyatdan tashqari | Не по силам бригаде | Не по силам |

Ключи: `status.<CODE>`. Тип словаря выведен из `ReportStatus`, пропуск кода ломает
`pnpm typecheck` (уже сделано, `shared/i18n/messages.ts`).

### 9.2 Причины `REJECTED`

| Код | Oʻzbekcha | Русский |
| --- | --- | --- |
| `not_road_defect` | Yoʻl qoplamasi nuqsoni emas | Не дефект дорожного покрытия |
| `unreadable_photo` | Surat qaror qabul qilish uchun yaroqsiz | Фото непригодно для решения |
| `spam` | Spam yoki mazmunsiz yuborish | Спам или бессмысленная отправка |
| `other` | Boshqa | Другое |

### 9.3 Причины `OUT_OF_SCOPE`

| Код | Oʻzbekcha | Русский |
| --- | --- | --- |
| `ground_sinkhole` | Tuproq choʻkishi yoki oʻpirilishi | Провал или просадка грунта |
| `utilities` | Kommunikatsiyalar (quduq, issiqlik trassasi, yomgʻir suvi tarmogʻi) | Коммуникации (люк, теплотрасса, ливнёвка) |
| `highway` | Magistral yoki brigada ish hududidan tashqaridagi obyekt | Магистраль или объект вне зоны работ бригады |
| `too_large` | Ish hajmi brigada imkoniyatidan yuqori | Объём работ выше возможностей бригады |
| `other` | Boshqa | Другое |

Ключи: `reason.<code>`. `other` общий для обоих списков — один ключ.

### 9.4 Районы — из БД, сверены с `data/geo/tashkent-districts.geojson`

12 названий, посимвольная сверка сида, глоссария и датасета закрыта тестом
`apps/api/src/catalog/district-names.test.ts`. В словари локалей не попадают.
Макет использует короткую форму без слова `tumani` в подписи фильтра
(«Mirzo Ulugʻbek · 412 ta») и полную в карточке заявки («Mirzo Ulugʻbek tumani»).
Короткая форма — не вторая строка перевода, а обрезка: считать её из полной,
а не хранить отдельно.

### 9.5 Категории — из БД, в словари не попадают

| Код (БД) | Oʻzbekcha (БД) | Макет |
| --- | --- | --- |
| `roadway_pothole` | Yoʻl qismidagi chuqur | Chuqurlik |
| `sidewalk_pothole` | Piyodalar yoʻlakchasidagi chuqur | — |
| `yard_damage` | Hovli yoki kvartal ichidagi yoʻl buzilishi | — |
| `sinkhole` | Choʻkish yoki oʻpirilish | Choʻkma |
| `utility_cover` | Quduq qopqogʻi | Quduq qopqogʻi |
| `crack` | Yoriq | Yoriq |
| `other` | Boshqa | Boshqa |

Тест уже запрещает ключи `category.*` в словарях (`shared/i18n/messages.test.ts`).

---

## 10. Нарушения контент-правил и расхождения

Проверка механическая: значения словарей разобраны регуляркой и проверены на
U+0027, U+2019, восклицательные знаки, эмодзи, символы-стрелки, слова
«служба/государство/власть/хокимият», «мы/наш» и канцелярит.
**Результат: 123 ключа в каждой локали, ни одного механического нарушения.**
45 узбекских строк содержат `ʻ`/`ʼ` — все модификаторными буквами.

Настоящие расхождения — смысловые, и все они между макетом и текущими строками.

### 10.0 Чек-лист: конкретные строки, файл и номер

Состояние на `4f0dd41` (ветка `feat/005-i18n-a11y`). Номера сдвинутся вместе с вёрсткой —
искать по ключу, а не по строке.

**Многоточие в подписи** (`readme.md`: «многоточий в подписях кнопок и фильтров нет»).
Пять ключей, обе локали:

| Ключ | uz | ru |
| --- | --- | --- |
| `state.loading` | `uz.ts:16` | `ru.ts:14` |
| `map.locating` | `uz.ts:34` | `ru.ts:32` |
| `form.point.locating` | `uz.ts:62` | `ru.ts:60` |
| `form.photos.working` | `uz.ts:71` | `ru.ts:69` |
| `form.submitting` | `uz.ts:87` | `ru.ts:85` |

**Юникод-символ вместо иконки** (`readme.md`: «эмодзи и юникод-символы как иконки
не используются: они меняют форму между платформами»).

- `features/report-map/ReportPopup.tsx:95` — крестик закрытия набран символом `✕`.
  Рисовать геометрией, штрих 2–2.5 px, как остальные служебные иконки.

**Чисто, проверено грепом по кодовой точке** (весь `apps/web/src`, `*.ts` и `*.tsx`):

| Правило | Результат |
| --- | --- |
| `'` U+0027 в строках локали | не найдено |
| `’` U+2019 в строках локали | не найдено |
| Восклицательные знаки | не найдено |
| Эмодзи | не найдено |
| «служба», «государство», «власть», «хокимият» | не найдено |
| «мы», «наш» | не найдено |
| `ʻ` U+02BB / `ʼ` U+02BC на месте | 45 узбекских строк, все модификаторными буквами |

Разделитель ` · ` (`routes/$locale/reports/index.tsx:82`) — не нарушение: макет
использует его сам («Yunusobod · 4 kunda · brigada 4»).

### 10.1 Требуют решения до вёрстки

1. **Статусы записаны в двух формах.** Макет: `Qabul qilindi`, `Taʼmirlandi`,
   `Rad etildi` (совершённое действие). Глоссарий и словарь: `Qabul qilingan`,
   `Taʼmirlangan`, `Rad etilgan` (причастие). По `CLAUDE.md` глоссарий главнее кода,
   но макет — принятое направление. Расхождение словаря с глоссарием объявлено ошибкой
   ревью, поэтому нужно поправить один из двух источников, а не выбрать по месту.
2. **`OUT_OF_SCOPE` в макете объявлен непубличным** («Публичны четыре статуса,
   внутренних три»), а в контракте он входит в `PUBLIC_STATUSES`, и BRD §7 требует
   публиковать реестр «не по силам». Одно из двух неверно.
3. **Русская подпись `OUT_OF_SCOPE`:** макет «Не по силам бригаде», глоссарий
   «Не по силам». Глоссарий называет её устойчивым термином кампании и запрещает
   синонимы.
4. **Категорий в макете пять, в БД семь.** `readme.md` сам помечает список как
   предположение (открытый вопрос 3). Категории — данные, вёрстка не должна
   рассчитывать на пять плиток.

### 10.2 Нарушения правил самим макетом

1. **«Мы» в тексте ошибки.** `readme.md` запрещает «мы», а строка состояния Error (ru)
   говорит «**Мы** уже видим это в Telegram бригады». Узбекский вариант правило не
   нарушает: «Brigada Telegramda buni allaqachon koʻrmoqda».
2. **Десятичная запятая в узбекском.** Правило: «десятичная запятая в ru, точка в uz».
   Макет пишет `~0,8 m` и `1,8 MB` в узбекских кадрах.
3. **Стрелка как иконка.** `Xarita →` на главной. Правило: «эмодзи и юникод-символы
   как иконки не используются» — стрелку рисовать геометрией.
4. **Многоточие в подписи кнопки.** Правило: «многоточий в подписях кнопок и фильтров
   нет». Текущий словарь при этом использует `…` в `form.submitting`,
   `map.locating`, `state.loading`, `form.photos.working` — четыре строки под правку.

### 10.3 Текущие строки против content fundamentals

| Ключ | Что не так | Как по макету |
| --- | --- | --- |
| `home.title` | Существительное вместо глагола: «Ямы на дорогах Ташкента» | «Отметьте яму. Бригада починит.» |
| `state.errorTitle` | «Что-то пошло не так» не называет причину и не даёт действия | «Карта не загрузилась» + причина + «Обновить» |
| `map.offline` | «Нет связи. Карта не обновилась.» читается как сбой | «Нет интернета · сохранённая версия» |
| `form.photos.add` | «Добавить фото» — файловая метафора | «Снять фото»: камера открывается сразу |
| `report.photosBefore/After` | «До ремонта» / «После ремонта» длиннее макета | «Oldin» / «Keyin» |
| `list.empty` | Говорит про фильтры, а не про место | «В этом районе ям нет» + два выхода |
| `form.done.warning` | «Восстановить её невозможно» — запрет вместо действия | «Сохраните ссылку — вход не нужен» |
| `form.submitting`, `map.locating`, `state.loading`, `form.photos.working` | Многоточие в подписи | без многоточия |

### 10.4 Числа

- Разделитель разрядов по макету — тонкий пробел U+2009 (`3 471`). В текущем коде
  стоит U+00A0, потому что в IBM Plex Mono глифа U+2009 нет вовсе. С переходом на
  Inter ограничение снято, и `shared/format/number.ts` переводится на U+2009 —
  это делается в ветке дизайна, здесь только фиксируется связь.
- Счётчик и шкала считаются из одного числа: `3 471 / 10 000` → `inset: 0 65.3% 0 0`.
  Расхождение шкалы с цифрами читается как обман — проверять при каждой правке разметки.
- Номер заявки `RR-3471` — часть контракта (`displayNumber`), не строка локали.

---

## 11. Что из этого уже закрыто в `feat/005-i18n-a11y`

- Тип словаря выведен из union-ов контракта: пропуск статуса или причины ломает
  `pnpm typecheck`.
- Тесты: равенство множеств ключей, различность подписей статусов, запрет ключей
  категорий, запрет U+0027/U+2019 в обеих локалях.
- Названия районов сверены с GeoJSON посимвольно.
- Подписи, которые MapLibre рисует сам (холст, маркер, кнопка источников), берутся
  из словаря — иначе на `/uz` звучит «Map», «Map marker», «Toggle attribution».

Остальное ждёт финальной вёрстки: ключи из §1–§8 проставляются по ней, доступность
проверяется один раз.

---

## 12. Сверка с `feat/design-c` (на `4f9d217`)

Ветка пока переносит основания, а не экраны: гарнитура, шкалы, токены, счётчик,
плашка статуса. Маршруты `Home`, `Form`, `Report` не тронуты, поэтому §2–§8 сверить
с вёрсткой ещё не с чем — ниже только то, что уже видно.

**Строки, которые вёрстка уже взяла — совпали с инвентарём:**
`home.titleAction`, `home.titlePromise`, `home.lead`. Тексты совпали дословно, включая
разбиение заголовка на действие и обещание.

**Строка мимо инвентаря — одна:** `home.goalShort` (`Maqsad` / `Цель`). Короткая подпись
под одометром; в инвентаре её не было, добавлена в §2.

**Ключ из инвентаря, который не понадобился:** `home.title` как единый ключ. Заголовок
набирается двумя, потому что вторая строка выделена цветом — разметка внутри строки
локали была бы хуже.

**Новый компонент `StatusChip`** берёт подпись через ``t(`status.${status}`)`` — ключи
из §9.1, расхождений нет. Подписи статусов в словаре при этом не менялись, то есть
вопрос §10.1 (`Qabul qilindi` против `Qabul qilingan`) вёрстка не закрыла, а унаследовала.

**Расхождение §10.1 п. 2 перестало быть бумажным.** В `statusShape.ts` появился
`INTERNAL_STATUSES = {REJECTED, DUPLICATE, OUT_OF_SCOPE}`, а в контракте
`PUBLIC_STATUSES` содержит `OUT_OF_SCOPE`. Теперь две константы в одном репозитории
утверждают противоположное про один статус: плашка рисует его пунктиром как «этого нет
на публичной карте», сервер отдаёт его в публичной выдаче, BRD §7 требует публиковать
реестр «не по силам». Чинится в одном месте — решением, какой источник прав.

**Числа приведены к макету:** `THOUSANDS_SEPARATOR` переведён на U+2009, добавлен
`formatPercent` с локальным десятичным разделителем (точка в uz, запятая в ru).
Замечание §10.2 п. 2 про `~0,8 m` в узбекских кадрах макета этим не закрыто: оно
про сам макет, а не про код.
