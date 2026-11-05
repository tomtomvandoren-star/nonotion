import { type FilterRule, operatorsFor, type Property, VALUELESS_OPERATORS } from '@nonotion/shared'

/** Libellés français des opérateurs de filtre. */
export const OPERATOR_LABELS: Record<string, string> = {
  contains: 'contient',
  does_not_contain: 'ne contient pas',
  is: 'est',
  is_not: 'n’est pas',
  starts_with: 'commence par',
  ends_with: 'finit par',
  is_empty: 'est vide',
  is_not_empty: 'n’est pas vide',
  equals: '=',
  not_equals: '≠',
  greater_than: '>',
  less_than: '<',
  greater_or_equal: '≥',
  less_or_equal: '≤',
  before: 'est avant',
  after: 'est après',
  on_or_before: 'est au plus tard',
  on_or_after: 'est au plus tôt',
}

export const RELATIVE_DATE_LABELS: Record<string, string> = {
  today: 'Aujourd’hui',
  tomorrow: 'Demain',
  yesterday: 'Hier',
}

/** Une règle neuve pour une propriété : son premier opérateur, sans valeur (inactive tant qu'elle est vide). */
export function newRule(property: Property): FilterRule {
  const op = property.type === 'checkbox' ? 'is' : operatorsFor(property.type)[0]!
  return property.type === 'checkbox'
    ? { property: property.id, op, value: true }
    : { property: property.id, op }
}

/** La règle quand on change de propriété ou d'opérateur : la valeur n'est gardée que si elle a encore un sens. */
export function withOperator(rule: FilterRule, property: Property, op: string): FilterRule {
  if (VALUELESS_OPERATORS.has(op)) return { property: property.id, op: op as FilterRule['op'] }
  return { ...rule, property: property.id, op: op as FilterRule['op'] }
}
