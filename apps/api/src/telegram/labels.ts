import type { ReportStatus } from '@ravonroad/shared-types'

/** Все строки бота, обращённые к человеку (SRS §6.3–§6.14, §10.4).
 *
 *  Язык один — узбекская латиница с `ʻ` (U+02BB) и `ʼ` (U+02BC), как в глоссарии
 *  и в словаре локали сайта. Второй локали у бота нет и не будет: группа волонтёров
 *  одна, переключателя языка в ней не существует — в отличие от сайта, где локаль
 *  выбирает житель.
 *
 *  Формулировки статусов и причин берутся из `apps/web/src/shared/i18n/uz.ts` дословно:
 *  житель читает статус на своей странице заявки, волонтёр — в карточке, и это обязан
 *  быть один и тот же текст. Расхождение ловится только чтением двух словарей рядом,
 *  поэтому словарь бота один файл, а не строки по обработчикам.
 *
 *  Сюда не входят `logEvent` и комментарии: их читает не группа, а тот, кто разбирает
 *  инцидент, и они остаются русскими и английскими. */

export const STATUS_LABELS: Record<ReportStatus, string> = {
  NEW: 'Yangi',
  ACCEPTED: 'Qabul qilingan',
  IN_PROGRESS: 'Ish jarayonida',
  DONE: 'Taʼmirlangan',
  REJECTED: 'Rad etilgan',
  DUPLICATE: 'Takroriy',
  OUT_OF_SCOPE: 'Imkoniyatdan tashqari',
}

export const REASON_LABELS: Record<string, string> = {
  not_road_defect: 'Yoʻl qoplamasi nuqsoni emas',
  unreadable_photo: 'Surat qaror qabul qilish uchun yaroqsiz',
  spam: 'Spam yoki mazmunsiz yuborish',
  ground_sinkhole: 'Tuproq choʻkishi yoki oʻpirilishi',
  utilities: 'Kommunikatsiyalar (quduq, issiqlik trassasi)',
  highway: 'Magistral yoki brigada hududidan tashqarida',
  too_large: 'Ish hajmi brigada imkoniyatidan yuqori',
  other: 'Boshqa',
}

export const ABUSE_LABELS: Record<string, string> = {
  HONEYPOT: 'yashirin maydon toʻldirilgan',
  FAST_FILL: 'shakl juda tez toʻldirilgan',
  IP_RATE: 'bitta manzildan koʻp ariza',
}

/** Подписи кнопок перехода: ключ — «откуда:куда». Кнопка называет действие, а не
 *  целевой статус, поэтому «Qabul qilish», а не «Qabul qilingan». */
export const TRANSITION_LABELS: Record<string, string> = {
  'NEW:ACCEPTED': 'Qabul qilish',
  'ACCEPTED:IN_PROGRESS': 'Ishga olish',
  'IN_PROGRESS:ACCEPTED': 'Navbatga qaytarish',
}

export const BUTTONS = {
  reject: 'Rad etish',
  duplicate: 'Takroriy',
  outOfScope: 'Imkoniyatdan tashqari',
  undo: '↩︎ Bekor qilish',
  back: '← Orqaga',
  acceptAll: 'Barchasini qabul qilish',
  rejectAll: 'Barchasini rad etish',
  expand: 'Alohida koʻrsatish',
  undoBatch: '↩︎ Toʻplamni bekor qilish',
  differentPotholes: 'Turli chuqurlar',
  allDuplicates: (rootNumber: string, count: number): string => `${rootNumber} takroriylari (${count})`,
} as const

/** Строки самой карточки: подпись к фотографиям и сообщение с кнопками. */
export const CARD = {
  openMap: 'Xaritada ochish',
  checkPrefix: '⚠️ tekshirish',
  nearbyPrefix: 'yaqin atrofda',
  originalPrefix: 'asl ariza',
  publicationPrefix: 'nashr',
  /** Автор перехода, которого нет в таблице модераторов: фото «после» шлёт любой
   *  участник группы (PRD §12.4). */
  volunteer: 'koʻngilli',
  /** Единственный способ закрыть заявку — фотография «после» ответом на карточку
   *  (BR-006). Пока это не написано в самой карточке, волонтёр этого не знает. */
  inProgressHint: 'Arizani yopish uchun shu kartaga javob qilib taʼmirdan keyingi suratni yuboring',
  /** Ссылка на публикацию принимается только в `DONE` и тоже ответом на карточку
   *  (SRS §6.9). */
  doneHint: 'Nashr havolasini ham shu kartaga javob qilib yuborish mumkin',
  digestTitle: (count: number): string => `Yangi arizalar: ${count}`,
} as const

/** Ответы на нажатие кнопки: `answerCallbackQuery`, лимит 200 символов. */
export const ANSWERS = {
  alreadyHandled: 'Allaqachon bajarilgan',
  staleButton: 'Tugma eskirgan',
  reportNotFound: 'Ariza topilmadi',
  moderatorsOnly: 'Bu amal faqat moderatorlar uchun',
  messageUnavailable: 'Xabar mavjud emas',
  chooseReason: 'Sababni tanlang',
  unknownReason: 'Notaʼnish sabab',
  answerWithReason: 'Bot xabariga sabab matni bilan javob bering',
  answerWithOriginal: 'Bot xabariga asl ariza raqami bilan javob bering',
  noAfterPhoto: 'Taʼmirdan keyingi suratsiz arizani yopib boʻlmaydi',
  statusChanged: (status: string): string => `Holat allaqachon «${status}» ga oʻzgargan`,
  moved: (number: string, status: string): string => `${number} → ${status}`,
  undone: (number: string, status: string): string => `${number} → ${status} (bekor qilindi)`,
  undoNotAuthor: 'Faqat oʻzgartirishni qilgan odam bekor qila oladi',
  undoExpired: 'Bekor qilish oynasi tugadi',
  undoNotLast: 'Bu oʻzgarish bekor qilingan yoki undan keyin boshqalari boʻlgan',
  undoNotFound: 'Oʻzgarish topilmadi',
  batchNotFound: 'Toʻplam topilmadi',
  batchAlreadyApplied: 'Toʻplam allaqachon qoʻllangan',
  batchNotApplied: 'Toʻplam hali qoʻllanmagan',
  batchUndoNotAuthor: 'Toʻplamni faqat uni qoʻllagan moderator bekor qila oladi',
  batchExpanded: (count: number): string => `Yuboriladigan kartochkalar: ${count}`,
  batchUndone: (count: number): string => `Bekor qilingan arizalar: ${count}`,
  batchApplied: (status: string, applied: number, total: number, reason: string | null): string =>
    `${status}: ${total} tadan ${applied} tasiga qoʻllandi${reason === null ? '' : `, sabab «${reason}»`}`,
  clusterUnlinked: (count: number): string =>
    `${count} arizada takroriylik gumoni olib tashlandi, holatlar oʻzgarmadi`,
} as const

/** Сообщения бота в группу: подсказки волонтёру и вопросы модератору. */
export const REPLIES = {
  replyToCard: 'Suratlarni aniq bir arizaning kartochkasiga javob qilib yuboring',
  photoDownloadFailed: 'Suratlarni Telegramdan olib boʻlmadi, qayta urinib koʻring',
  wrongStatusForPhotos: (number: string, status: string): string =>
    `${number} — «${status}». Taʼmirdan keyingi suratlar faqat qabul qilingan ` +
    'va ish jarayonidagi arizalarga qoʻshiladi',
  photoLimitReached: (number: string, limit: number): string =>
    `${number}: taʼmirdan keyingi ${limit} ta surat allaqachon bor`,
  photosSkipped: (accepted: number, limit: number): string =>
    ` Dastlabki ${accepted} tasi qabul qilindi: ${limit} tadan koʻp surat boʻlmaydi.`,
  photosAdded: (number: string, tail: string): string => `${number}: suratlar qoʻshildi.${tail}`,
  photosStatusChanged: (number: string): string => `${number}: holat oʻzgardi, suratlar qabul qilinmadi`,
  reportClosed: (number: string, tail: string): string => `${number} arizasi yopildi, rahmat!${tail}`,
  publicationTooEarly: (number: string, status: string): string =>
    `${number} — «${status}». Nashr havolasini ariza yopilgandan keyin qoʻshish mumkin`,
  publicationSaved: (number: string): string => `${number}: havola saqlandi`,
  askOriginal: (number: string, example: string): string =>
    `${number}: asl ariza raqami bilan javob bering, masalan ${example}`,
  askReasonText: (number: string): string => `${number}: sabab matnini yozib javob bering`,
  promptNotYours: 'Faqat oʻzgartirishni boshlagan moderator javob bera oladi',
  promptExpired: 'Vaqt tugadi, qaytadan boshlang',
  promptLost: 'Oʻzgarish yoʻqoldi, qaytadan boshlang',
  reasonRequired: 'Sabab boʻsh boʻlishi mumkin emas',
  needReportNumber: (example: string): string => `Ariza raqami kerak, masalan ${example}`,
  duplicateOfItself: 'Ariza oʻzining takroriysi boʻla olmaydi',
  originalMissing: (number: string): string => `${number} arizasi mavjud emas`,
  originalIsDuplicate: (number: string): string =>
    `${number} oʻzi takroriy deb belgilangan — asl arizani koʻrsating`,
  statusChangedByOther: 'Holatni boshqa moderator oʻzgartirib boʻlgan',
  done: (number: string): string => `${number} — tayyor`,
} as const

/** Алерты в приватный чат координатора (SRS §10.4). Читает их один дежурный человек,
 *  а не группа, но человек — тот же, и язык у него тот же. */
export const ALERTS = {
  title: '⚠️ RavonRoad',
  dbDown: 'Baza ketma-ket ikki tekshiruvda javob bermadi. Sayt arizalarni qabul qilmayapti.',
  deliveryStale: (pending: number, minutes: number): string =>
    `Yetkazish navbati qotib qoldi: ${pending} ta yuborilmagan, eng eskisi ${minutes} daqiqa.`,
  photoQueue: (pending: number, minutes: number): string =>
    `Suratlar navbati: ${pending} ta qayta ishlanmoqda, eng eskisi ${minutes} daqiqa. ` +
    'Vorker ulgurmayapti yoki toʻxtagan.',
  photoFailed: (count: number): string => `Besh urinishdan keyin ham qayta ishlanmagan: ${count} ta surat.`,
  moderationQueue: (count: number): string =>
    `Moderatsiya navbati: NEW holatida ${count} ta ariza. Odam yetishmayapti — toʻplamli amallar vaqti.`,
  webhookMissing: 'Webhook oʻchgan: Telegramda url boʻsh. Moderatsiya toʻxtagan.',
  webhookForeign: 'Webhook yangilanishlarni begona manzilga olib ketmoqda.',
  webhookPending: (count: number): string =>
    `Telegram yangilanishlarni toʻplamoqda: navbatda ${count} ta — biz ularni olmayapmiz.`,
  webhookErrors: (seconds: number): string => `Telegram bizdan xato javob olmoqda: oxirgisi ${seconds} s oldin.`,
} as const
