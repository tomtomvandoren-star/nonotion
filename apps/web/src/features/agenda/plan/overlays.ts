import type { OptionColor } from '@nonotion/shared'
import type { Person } from '@/lib/api/scheduling'

/** Une couleur par personne affichée, distincte de celles des bases (spec 6.17, 2.1). */
const PERSON_COLORS: OptionColor[] = ['purple', 'orange', 'green', 'pink', 'blue', 'red', 'brown']

/** Une personne affichée en superposition : celle du moment, ou une épinglée. */
export type Overlay = { person: Person; color: OptionColor; pinned: boolean }

export function overlaysOf(shown: Person | null, pinned: readonly Person[]): Overlay[] {
  const people = [
    ...pinned.map((person) => ({ person, pinned: true })),
    ...(shown && !pinned.some((person) => person.id === shown.id)
      ? [{ person: shown, pinned: false }]
      : []),
  ]
  return people.map((entry, i) => ({ ...entry, color: PERSON_COLORS[i % PERSON_COLORS.length]! }))
}

/** Ce que transporte une personne glissée sur la grille (créer un rendez-vous avec elle). */
export const PERSON_DRAG_TYPE = 'application/x-nonotion-person'
