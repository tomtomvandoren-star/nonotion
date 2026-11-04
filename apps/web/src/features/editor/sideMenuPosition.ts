import type { FloatingUIOptions } from '@blocknote/react'

type Middleware = NonNullable<
  NonNullable<FloatingUIOptions['useFloatingOptions']>['middleware']
>[number]

/**
 * Centre le « + » et la poignée sur la première ligne du bloc. BlockNote les décale d'une valeur
 * fixe prévue pour ses propres tailles de titre (48 px pour un titre 1) ; les nôtres (30, 24,
 * 20 px) les laissaient trop bas. On mesure donc la ligne réelle.
 */
const alignWithFirstLine: Middleware = {
  name: 'nonotionAlignWithFirstLine',
  fn: ({ x, y, elements, rects }) => {
    // BlockNote passe un élément virtuel qui porte le vrai bloc dans `contextElement`.
    const reference = elements.reference as Element | { contextElement?: Element }
    const block = reference instanceof Element ? reference : reference.contextElement
    if (!block) return { x, y }
    const line =
      block.querySelector('.bn-inline-content') ?? block.querySelector('.bn-block-content')
    if (!line) return { x, y }
    const box = line.getBoundingClientRect()
    const lineHeight = Number.parseFloat(getComputedStyle(line).lineHeight)
    const firstLine = Number.isFinite(lineHeight) ? Math.min(lineHeight, box.height) : box.height
    const center = box.top - block.getBoundingClientRect().top + firstLine / 2
    return { x, y: rects.reference.y + center - rects.floating.height / 2 }
  },
}

export const SIDE_MENU_FLOATING: Partial<FloatingUIOptions> = {
  useFloatingOptions: { placement: 'left-start', middleware: [alignWithFirstLine] },
}
