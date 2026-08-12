import { useI18n } from '../../i18n/useI18n'
import { COMPACT } from '../control/styles'
import { Glyph } from '../icon/Glyph'

/** Полоса «нет сети · сохранённая версия».
 *
 *  Жёлтая, а не красная, и это не украшение: заявка на месте, страница показывает
 *  то, что уже приехало, и ничего не сломалось. Красный в системе занят статусом
 *  REJECTED — путать «отклонена» и «нет связи» нельзя (Mobile States C).
 *
 *  Жёлтый здесь работает как поле, а не как действие: второе из двух мест, где
 *  дизайн-система сознательно отступает от правила «жёлтый только для действий».
 *  Первое — счётчик кампании. */
export function OfflineBar({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-[var(--s-3)] bg-[var(--accent)] px-[var(--gutter)] py-[var(--s-3)] text-[var(--text-on-accent)]"
    >
      <Glyph name="slash" size={18} />
      <span className="t-chip flex-1">{t('state.offline')}</span>
      <button
        type="button"
        onClick={onRetry}
        className={`${COMPACT} border-2 border-[var(--asphalt-950)] bg-transparent text-[var(--text-on-accent)] hover:bg-[rgba(18,22,28,.08)]`}
      >
        {t('state.offline.refresh')}
      </button>
    </div>
  )
}
