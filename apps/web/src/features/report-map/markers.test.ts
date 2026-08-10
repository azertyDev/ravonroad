import { REPORT_STATUSES } from '@ravonroad/shared-types'
import { describe, expect, it } from 'vitest'
import { isMapStatus, MAP_STATUSES, MARKER_LOOK } from './markers'

describe('маркеры карты', () => {
  it('скрывает REJECTED и DUPLICATE и показывает остальные пять статусов', () => {
    const visible = REPORT_STATUSES.filter(isMapStatus)

    expect(visible).toEqual([...MAP_STATUSES])
    expect(isMapStatus('REJECTED')).toBe(false)
    expect(isMapStatus('DUPLICATE')).toBe(false)
    expect(isMapStatus('OUT_OF_SCOPE')).toBe(true)
  })

  it('даёт каждому видимому статусу свою форму и свой цвет', () => {
    const looks = MAP_STATUSES.map((status) => MARKER_LOOK[status])

    // Форма важнее цвета: при дейтеранопии цвета пинов сближаются, и одинаковая форма
    // у DONE и OUT_OF_SCOPE сделала бы реестр неотличимым от отремонтированного.
    expect(new Set(looks.map((look) => look.shape)).size).toBe(MAP_STATUSES.length)
    expect(new Set(looks.map((look) => look.color)).size).toBe(MAP_STATUSES.length)
  })
})
