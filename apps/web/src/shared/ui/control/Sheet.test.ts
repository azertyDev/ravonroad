import { describe, expect, it } from 'vitest'
import { dismissedByBackdrop } from './Sheet'

const dialog = { id: 'dialog' } as unknown as Element
const inside = { id: 'form' } as unknown as EventTarget

describe('dismissedByBackdrop', () => {
  it('закрывает, когда и нажатие, и отпускание пришлись на подложку', () => {
    expect(dismissedByBackdrop(true, dialog, dialog)).toBe(true)
  })

  // Тот самый случай: карту тянут пальцем внутри окна, курсор уезжает за край,
  // `click` приходит на диалог — и форма закрывалась вместе с набранным.
  it('не закрывает жест, начатый внутри окна и законченный на подложке', () => {
    expect(dismissedByBackdrop(false, dialog, dialog)).toBe(false)
  })

  it('не закрывает клик по содержимому', () => {
    expect(dismissedByBackdrop(true, inside, dialog)).toBe(false)
  })
})
