import { defaultStatusOptions, type Property, type PropertyType } from '@nonotion/shared'

const OPTION_TYPES = new Set<PropertyType>(['select', 'multi_select', 'status'])

/** La propriété dans un autre type : on garde ses options, ou on en donne par défaut (statut). */
export function retyped(property: Property, type: Exclude<PropertyType, 'title'>): Property {
  const base = { id: property.id, name: property.name }
  if (!OPTION_TYPES.has(type)) return { ...base, type } as Property
  const options = 'options' in property ? property.options : []
  if (type === 'status')
    return {
      ...base,
      type,
      options:
        options.length > 0
          ? options.map((option) => ({
              ...option,
              group: 'group' in option ? option.group : 'todo',
            }))
          : defaultStatusOptions(),
    } as Property
  return {
    ...base,
    type,
    options: options.map(({ id, name, color }) => ({ id, name, color })),
  } as Property
}
