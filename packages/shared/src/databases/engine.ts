import {
  type DateValue,
  hasOptions,
  isEmptyValue,
  type OptionColor,
  type Property,
  type PropertyType,
  propertiesById,
  TITLE_PROPERTY_ID,
} from './properties'
import {
  CHECKBOX_OPERATORS,
  DATE_OPERATORS,
  type FilterGroup,
  type FilterRule,
  type GroupBy,
  MULTI_OPTION_OPERATORS,
  NUMBER_OPERATORS,
  OPTION_OPERATORS,
  type SortRule,
  TEXT_OPERATORS,
  VALUELESS_OPERATORS,
  type ViewConfig,
} from './views'

/*
 * Moteur de filtre, de tri et de regroupement des vues (spec 6.6), en TypeScript pur : il lit la
 * configuration d'une vue et l'applique aux lignes d'une base. Pour le MVP le calcul est fait côté
 * client ; s'il passe un jour côté serveur, le contrat reste le même (config en entrée, lignes en
 * sortie).
 */

/** Une ligne de base : une page, avec ses valeurs de propriétés. */
export type DatabaseRow = {
  id: string
  title: string
  properties: Record<string, unknown>
  position: string
}

/** « Aujourd'hui » et le fuseau de l'utilisateur, pour les dates relatives et les heures. */
export type EngineContext = { today: string; timeZone?: string }

const formatters = new Map<string, Intl.DateTimeFormat>()

/** Date et heure locales (« AAAA-MM-JJTHH:MM:SS ») d'un instant, dans le fuseau donné. */
function localDateTime(instant: string, timeZone?: string): string {
  const key = timeZone ?? ''
  let format = formatters.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    formatters.set(key, format)
  }
  const parts = Object.fromEntries(
    format.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
}

/** La date du jour (« AAAA-MM-JJ ») dans un fuseau. */
export function todayIn(timeZone?: string, now: Date = new Date()): string {
  return localDateTime(now.toISOString(), timeZone).slice(0, 10)
}

/** Le jour d'une date : tel quel pour une journée entière, dans le fuseau local pour un instant. */
function dayOf(value: string, timeZone?: string): string {
  return value.includes('T') ? localDateTime(value, timeZone).slice(0, 10) : value
}

/** Clé de tri d'une date, comparable entre journées entières et instants. */
function dateSortKey(value: string, timeZone?: string): string {
  return value.includes('T') ? localDateTime(value, timeZone) : `${value}T00:00:00`
}

function shiftDay(day: string, offset: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, date + offset)).toISOString().slice(0, 10)
}

/** La date visée par un filtre : « today », « tomorrow », « yesterday » ou « AAAA-MM-JJ ». */
export function resolveFilterDate(value: unknown, ctx: EngineContext): string | null {
  if (value === 'today') return ctx.today
  if (value === 'tomorrow') return shiftDay(ctx.today, 1)
  if (value === 'yesterday') return shiftDay(ctx.today, -1)
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

/** Les opérateurs proposés pour un type de propriété. */
export function operatorsFor(type: PropertyType): readonly string[] {
  switch (type) {
    case 'title':
    case 'text':
      return TEXT_OPERATORS
    case 'number':
      return NUMBER_OPERATORS
    case 'checkbox':
      return CHECKBOX_OPERATORS
    case 'date':
      return DATE_OPERATORS
    case 'select':
    case 'status':
      return OPTION_OPERATORS
    case 'multi_select':
      return MULTI_OPTION_OPERATORS
  }
}

/** La valeur d'une propriété pour une ligne (le Titre est celui de la page). */
export function valueOf(row: DatabaseRow, property: Property): unknown {
  return property.id === TITLE_PROPERTY_ID || property.type === 'title'
    ? row.title
    : row.properties[property.id]
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * Une règle dont la valeur n'est pas encore choisie (filtre en cours de création) ne filtre rien :
 * sinon ajouter un filtre ferait disparaître toutes les lignes avant même qu'on l'ait rempli.
 */
export function isActiveRule(rule: FilterRule, property: Property | undefined): boolean {
  if (!property || !operatorsFor(property.type).includes(rule.op)) return false
  if (VALUELESS_OPERATORS.has(rule.op)) return true
  switch (property.type) {
    case 'title':
    case 'text':
      return typeof rule.value === 'string' && rule.value !== ''
    case 'number':
      return typeof rule.value === 'number' && Number.isFinite(rule.value)
    case 'checkbox':
      return typeof rule.value === 'boolean'
    case 'date':
      return resolveFilterDate(rule.value, { today: '2000-01-01' }) !== null
    case 'select':
    case 'status':
    case 'multi_select':
      return typeof rule.value === 'string' && property.options.some((o) => o.id === rule.value)
  }
}

function matchesRule(
  row: DatabaseRow,
  property: Property,
  rule: FilterRule,
  ctx: EngineContext,
): boolean {
  const value = valueOf(row, property)
  if (rule.op === 'is_empty') return isEmptyValue(value)
  if (rule.op === 'is_not_empty') return !isEmptyValue(value)

  switch (property.type) {
    case 'title':
    case 'text': {
      const text = normalize(typeof value === 'string' ? value : '')
      const target = normalize(String(rule.value))
      if (rule.op === 'contains') return text.includes(target)
      if (rule.op === 'does_not_contain') return !text.includes(target)
      if (rule.op === 'is') return text === target
      if (rule.op === 'is_not') return text !== target
      if (rule.op === 'starts_with') return text.startsWith(target)
      if (rule.op === 'ends_with') return text.endsWith(target)
      return true
    }
    case 'number': {
      const target = rule.value as number
      if (typeof value !== 'number') return rule.op === 'not_equals'
      if (rule.op === 'equals') return value === target
      if (rule.op === 'not_equals') return value !== target
      if (rule.op === 'greater_than') return value > target
      if (rule.op === 'less_than') return value < target
      if (rule.op === 'greater_or_equal') return value >= target
      if (rule.op === 'less_or_equal') return value <= target
      return true
    }
    case 'checkbox':
      return (value === true) === rule.value
    case 'date': {
      const target = resolveFilterDate(rule.value, ctx)
      const date = value as DateValue | null | undefined
      if (!target || !date) return false
      const start = dayOf(date.start, ctx.timeZone)
      const end = date.end ? dayOf(date.end, ctx.timeZone) : start
      if (rule.op === 'is') return start <= target && target <= end
      if (rule.op === 'before') return start < target
      if (rule.op === 'after') return start > target
      if (rule.op === 'on_or_before') return start <= target
      if (rule.op === 'on_or_after') return start >= target
      return true
    }
    case 'select':
    case 'status':
      // Une ligne sans statut « n'est pas Terminé » : elle reste visible dans une vue des tâches à faire.
      if (rule.op === 'is') return value === rule.value
      if (rule.op === 'is_not') return value !== rule.value
      return true
    case 'multi_select': {
      const list = Array.isArray(value) ? value : []
      if (rule.op === 'contains') return list.includes(rule.value)
      if (rule.op === 'does_not_contain') return !list.includes(rule.value)
      return true
    }
  }
}

/** La ligne passe-t-elle les filtres (règles ET, ou règles OU) ? Les règles inactives ne comptent pas. */
export function matchesFilters(
  row: DatabaseRow,
  schema: readonly Property[],
  filters: FilterGroup | undefined,
  ctx: EngineContext,
): boolean {
  if (!filters) return true
  const byId = propertiesById(schema)
  const active = filters.rules.flatMap((rule) => {
    const property = byId.get(rule.property)
    return property && isActiveRule(rule, property) ? [{ rule, property }] : []
  })
  if (active.length === 0) return true
  const test = ({ rule, property }: (typeof active)[number]) =>
    matchesRule(row, property, rule, ctx)
  return filters.operator === 'or' ? active.some(test) : active.every(test)
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })

/** Compare deux valeurs non vides d'une propriété (ordre croissant). */
function compareValues(property: Property, a: unknown, b: unknown, ctx: EngineContext): number {
  switch (property.type) {
    case 'title':
    case 'text':
      return collator.compare(String(a), String(b))
    case 'number':
      return (a as number) - (b as number)
    case 'checkbox':
      return Number(a === true) - Number(b === true)
    case 'date': {
      const keyA = dateSortKey((a as DateValue).start, ctx.timeZone)
      const keyB = dateSortKey((b as DateValue).start, ctx.timeZone)
      return keyA < keyB ? -1 : keyA > keyB ? 1 : 0
    }
    case 'select':
    case 'status':
    case 'multi_select': {
      const order = new Map(property.options.map((option, index) => [option.id, index]))
      const rank = (value: unknown) => {
        const first = Array.isArray(value) ? value[0] : value
        return order.get(first as string) ?? Number.MAX_SAFE_INTEGER
      }
      return rank(a) - rank(b)
    }
  }
}

/**
 * Trie les lignes selon les règles, dans l'ordre. Les valeurs vides vont toujours à la fin, quel que
 * soit le sens : c'est là qu'on les cherche. Sans règle (ou à égalité), l'ordre manuel (`position`).
 */
export function sortRows(
  rows: readonly DatabaseRow[],
  schema: readonly Property[],
  sorts: readonly SortRule[] | undefined,
  ctx: EngineContext,
): DatabaseRow[] {
  const byId = propertiesById(schema)
  const rules = (sorts ?? []).flatMap((sort) => {
    const property = byId.get(sort.property)
    // Une case à cocher n'est jamais « vide » pour le tri : non cochée passe avant cochée.
    return property ? [{ property, sign: sort.direction === 'desc' ? -1 : 1 }] : []
  })

  return [...rows].sort((a, b) => {
    for (const { property, sign } of rules) {
      const valueA = valueOf(a, property)
      const valueB = valueOf(b, property)
      const emptyA = property.type !== 'checkbox' && isEmptyValue(valueA)
      const emptyB = property.type !== 'checkbox' && isEmptyValue(valueB)
      if (emptyA !== emptyB) return emptyA ? 1 : -1
      if (emptyA) continue
      const result = compareValues(property, valueA, valueB, ctx)
      if (result !== 0) return result * sign
    }
    return a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1
  })
}

/** Les lignes d'une vue : recherche, filtres puis tris. */
export function applyView(
  rows: readonly DatabaseRow[],
  schema: readonly Property[],
  config: ViewConfig,
  ctx: EngineContext,
  search = '',
): DatabaseRow[] {
  const query = normalize(search.trim())
  const kept = rows.filter(
    (row) =>
      (query === '' || normalize(row.title).includes(query)) &&
      matchesFilters(row, schema, config.filters, ctx),
  )
  return sortRows(kept, schema, config.sorts, ctx)
}

/** Une section d'une vue regroupée. `key` est l'option (ou « true »/« false »), null pour « vide ». */
export type RowGroup = {
  key: string | null
  label: string
  color: OptionColor
  rows: DatabaseRow[]
}

/** Les types par lesquels une vue peut être regroupée. */
export const GROUPABLE_TYPES: readonly PropertyType[] = [
  'select',
  'status',
  'multi_select',
  'checkbox',
]

/**
 * Regroupe des lignes (déjà filtrées et triées) par une propriété : une section par option, dans
 * l'ordre du schéma, plus « Sans … » pour les lignes vides (seulement s'il y en a). Une ligne à
 * plusieurs options apparaît dans chacune. `hide_empty` masque les sections sans ligne.
 */
export function groupRows(
  rows: readonly DatabaseRow[],
  schema: readonly Property[],
  groupBy: GroupBy | null | undefined,
): RowGroup[] | null {
  const property = groupBy ? propertiesById(schema).get(groupBy.property) : undefined
  if (!groupBy || !property || !GROUPABLE_TYPES.includes(property.type)) return null

  let groups: RowGroup[]
  if (property.type === 'checkbox') {
    groups = [
      { key: 'true', label: 'Cochée', color: 'default', rows: [] },
      { key: 'false', label: 'Non cochée', color: 'default', rows: [] },
    ]
    for (const row of rows) groups[valueOf(row, property) === true ? 0 : 1]!.rows.push(row)
  } else if (hasOptions(property)) {
    const empty: RowGroup = {
      key: null,
      label: `Sans ${property.name}`,
      color: 'default',
      rows: [],
    }
    const byOption = new Map(
      property.options.map((option) => [
        option.id,
        { key: option.id, label: option.name, color: option.color, rows: [] } as RowGroup,
      ]),
    )
    for (const row of rows) {
      const value = valueOf(row, property)
      const ids = (Array.isArray(value) ? value : [value]).filter((id) =>
        byOption.has(id as string),
      )
      if (ids.length === 0) empty.rows.push(row)
      for (const id of ids) byOption.get(id as string)!.rows.push(row)
    }
    groups = [...(empty.rows.length > 0 ? [empty] : []), ...byOption.values()]
  } else {
    return null
  }

  return groupBy.hide_empty ? groups.filter((group) => group.rows.length > 0) : groups
}

/**
 * Les valeurs qu'un nouvel élément hérite de la vue (spec 6.6, « le + hérite du contexte ») :
 * dans une vue filtrée sur Statut = « En cours », « Nouveau » crée une tâche déjà en cours.
 * Seules les règles qui fixent une valeur, dans un filtre ET (ou une règle seule), comptent.
 */
export function prefillFromFilters(
  schema: readonly Property[],
  filters: FilterGroup | undefined,
  ctx: EngineContext,
): Record<string, unknown> {
  if (!filters) return {}
  const byId = propertiesById(schema)
  const active = filters.rules.filter((rule) => isActiveRule(rule, byId.get(rule.property)))
  if (filters.operator === 'or' && active.length > 1) return {}

  const values: Record<string, unknown> = {}
  for (const rule of active) {
    const property = byId.get(rule.property)!
    if (property.type === 'title') continue
    if ((property.type === 'select' || property.type === 'status') && rule.op === 'is')
      values[property.id] = rule.value
    else if (property.type === 'multi_select' && rule.op === 'contains')
      values[property.id] = [...((values[property.id] as string[] | undefined) ?? []), rule.value]
    else if (property.type === 'checkbox' && rule.op === 'is') values[property.id] = rule.value
    else if (property.type === 'text' && rule.op === 'is') values[property.id] = rule.value
    else if (property.type === 'number' && rule.op === 'equals') values[property.id] = rule.value
    else if (property.type === 'date' && rule.op === 'is')
      values[property.id] = { start: resolveFilterDate(rule.value, ctx) }
  }
  return values
}

/** Les valeurs d'un élément créé depuis une section (« + » de l'en-tête d'un groupe). */
export function prefillFromGroup(
  schema: readonly Property[],
  groupBy: GroupBy | null | undefined,
  key: string | null,
): Record<string, unknown> {
  const property = groupBy ? propertiesById(schema).get(groupBy.property) : undefined
  if (!property || key === null) return {}
  if (property.type === 'checkbox') return { [property.id]: key === 'true' }
  if (property.type === 'multi_select') return { [property.id]: [key] }
  if (property.type === 'select' || property.type === 'status') return { [property.id]: key }
  return {}
}
