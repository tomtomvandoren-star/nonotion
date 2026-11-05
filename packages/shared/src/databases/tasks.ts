import { type DatabaseRow, valueOf } from './engine'
import type { Property, PropertyWithOptions, Repeat, RepeatUnit, StatusOption } from './properties'

/*
 * Les gestes d'une liste de tâches (spec 6.7) : la case « c'est fait » d'un tableau pilote le
 * Statut ; une tâche terminée est grisée.
 */

type StatusProperty = Extract<Property, { type: 'status' }>

/** Le Statut qui pilote la case de complétion : le premier de la base, s'il y en a un. */
export function completionProperty(schema: readonly Property[]): StatusProperty | undefined {
  return schema.find((property): property is StatusProperty => property.type === 'status')
}

/** La ligne est-elle terminée (son statut est dans le groupe « Terminé ») ? */
export function isDone(row: DatabaseRow, status: StatusProperty): boolean {
  const id = valueOf(row, status)
  return status.options.some((option) => option.id === id && option.group === 'complete')
}

/**
 * La valeur du Statut quand on coche (premier statut « Terminé ») ou décoche (premier « À faire »).
 * Null si la base n'a pas d'option de ce groupe.
 */
export function completionValue(status: StatusProperty, done: boolean): string | null {
  const group: StatusOption['group'] = done ? 'complete' : 'todo'
  return status.options.find((option) => option.group === group)?.id ?? null
}

/** Les propriétés par lesquelles un Board peut se regrouper (une colonne par valeur). */
export function boardGroupable(schema: readonly Property[]): PropertyWithOptions[] {
  return schema.filter(
    (property): property is PropertyWithOptions =>
      property.type === 'status' || property.type === 'select' || property.type === 'multi_select',
  )
}

const REPEAT_WORDS: Record<RepeatUnit, [every: string, unit: string]> = {
  day: ['Tous les', 'jours'],
  week: ['Toutes les', 'semaines'],
  month: ['Tous les', 'mois'],
  year: ['Tous les', 'ans'],
}

/** « Tous les jours », « Toutes les 2 semaines », « Tous les 3 mois »… */
export function repeatLabel(repeat: Repeat): string {
  const [every, unit] = REPEAT_WORDS[repeat.unit]
  return repeat.interval === 1 ? `${every} ${unit}` : `${every} ${repeat.interval} ${unit}`
}
