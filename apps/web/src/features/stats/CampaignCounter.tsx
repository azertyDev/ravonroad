import { CAMPAIGN_GOAL, type StatsResponse } from '@ravonroad/shared-types'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../shared/api/client'
import { formatNumber, formatPercent } from '../../shared/format/number'
import { useI18n } from '../../shared/i18n/useI18n'

/** PRD требует показать переход в `DONE` за ≤ 60 с. Тридцать даёт запас и совпадает
 *  с TTL обоих рубежей кэша: чаще спрашивать нечего — до `api` запрос всё равно
 *  не дойдёт (SRS §4.7, §7.5). */
const STATS_INTERVAL = 30_000

/** Ячейка одометра. Разряд единиц выделен светлым: это цифра, которая меняется,
 *  и она обязана быть видна отдельно от остальных. */
function Digit({ value, live }: { value: string; live: boolean }) {
  return (
    <span
      className={`t-counter min-w-[56px] rounded-[var(--r-2)] px-[var(--s-1)] py-[var(--s-2)] text-center ${
        live ? 'bg-[var(--asphalt-0)] text-[var(--asphalt-950)]' : 'bg-[var(--asphalt-950)] text-[var(--accent)]'
      }`}
    >
      {value}
    </span>
  )
}

/** Счётчик кампании (US-005) в плакатной подаче направления C: одометр во всю ширину
 *  экрана, каждая цифра в своей ячейке, под ними шкала-дорога с прерывистой разметкой.
 *  Жёлтый работает здесь как поле, а не как действие — одно из двух мест, где
 *  дизайн-система сознательно отступает от правила «жёлтый только для действий».
 *
 *  Цвета ячеек и шкалы взяты абсолютными, а не семантическими: поле остаётся жёлтым
 *  в обеих темах, и текст на нём не вправе следовать теме страницы.
 *
 *  Число берётся из данных и не хранится отдельно — рассинхронизировать нечего (PRD 5.3.2).
 *  Разрядность не сокращается до «3,5k»: обещание кампании — точное число.
 *  Отдельный троттлинг aria-live не нужен: дизайн просит объявлять не чаще раза в 10 с,
 *  а данные обновляются раз в 30. */
export function CampaignCounter() {
  const { t, locale } = useI18n()
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => apiFetch<StatsResponse>('/stats'),
    staleTime: STATS_INTERVAL,
    refetchInterval: STATS_INTERVAL,
  })

  const goal = stats.data?.goal ?? CAMPAIGN_GOAL
  const done = stats.data?.done
  const share = done === undefined || goal <= 0 ? 0 : Math.min(done / goal, 1)
  const digits = done === undefined ? null : formatNumber(done).replace(/\D/g, '').split('')

  return (
    <section className="bg-[var(--accent)] px-[var(--gutter)] py-[var(--s-5)] text-[var(--text-on-accent)]">
      <dl>
        <dt className="t-label">{t('home.repairedLabel')}</dt>
        {/* aria-live: счётчик обновляется сам, и молча меняющееся число пользователь
            скринридера не заметит. Ячейки скрыты от него — иначе 3471 читается как
            четыре отдельных числа, — а рядом лежит то же число одной строкой. */}
        <dd className="mt-[var(--s-3)]" aria-live="polite">
          <span className="sr-only">{done === undefined ? t('state.loading') : formatNumber(done)}</span>
          <span aria-hidden="true" className="flex flex-wrap items-end gap-[var(--s-1)]">
            {digits === null ? (
              <Digit value="—" live={false} />
            ) : (
              // Ключ позиционный: разряд определяется местом в числе, а не значением.
              digits.map((digit, index) => (
                <Digit key={index} value={digit} live={index === digits.length - 1} />
              ))
            )}
          </span>
        </dd>
      </dl>

      {/* Шкала — дорога с прерывистой разметкой. Заполнение задаётся через `right`,
          а не `width`: доля 34,7% — это правый отступ 65,3%, и запись через `inset`
          на этом регулярно спотыкается. Заливка светлая, а не жёлтая: поле само жёлтое. */}
      <div className="relative mt-[var(--s-3)] h-[14px] overflow-hidden rounded-[var(--r-1)] bg-[var(--asphalt-950)]">
        <div
          className="absolute inset-y-0 left-0 bg-[var(--asphalt-0)]"
          style={{ right: `${100 - share * 100}%` }}
        />
        <div
          className="absolute inset-x-0 top-[6px] h-[2px]"
          style={{
            background: 'repeating-linear-gradient(90deg, rgba(18,22,28,.55) 0 10px, transparent 10px 20px)',
          }}
        />
      </div>

      <div className="mt-[var(--s-3)] flex flex-wrap items-baseline justify-between gap-[var(--s-2)]">
        <span className="t-chip">{formatPercent(share, locale)}</span>
        <span className="t-chip">
          {t('home.goalShort')} · {formatNumber(goal)}
        </span>
      </div>
    </section>
  )
}
