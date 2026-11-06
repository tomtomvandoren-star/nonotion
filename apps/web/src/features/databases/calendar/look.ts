import { displayTitle } from '@/features/pages/displayTitle'
import type { Completion } from '../completion'
import type { CalendarItem } from './dates'
import type { Source } from './SourceBadge'

/** Comment montrer un élément dans la grille. */
export type ItemLook = {
  /** Sa couleur (agenda importé, ou base dans l'Agenda) ; null : celle du thème. */
  color: string | null
  /** Un événement importé (spec 6.9) : ses dates viennent de l'agenda d'origine, il ne se glisse pas. */
  locked: boolean
  /** La case « c'est fait » de sa base, s'il en a une. */
  completion: Completion | null
  /** L'Agenda (spec 6.15) montre la case à cocher dans la grille, et d'où vient l'élément. */
  checkable: boolean
  source: Source | null
}

export const plainLook = (color: string | null, completion: Completion | null): ItemLook => ({
  color,
  locked: color !== null,
  completion,
  checkable: false,
  source: null,
})

/** Le nom accessible d'un élément : son titre, sa date, et sa source dans l'Agenda. */
export const itemLabel = (item: CalendarItem, look: ItemLook, when: string) =>
  [displayTitle(item.row.title), when, look.source?.label].filter(Boolean).join(', ') +
  (item.ghost ? ' (prochaine fois)' : '')
