import { z } from 'zod'

/*
 * Propriétés d'une base de données (spec 4.3, types prioritaires) et validation de leurs valeurs.
 * Le serveur applique exactement les mêmes règles (App\Support\Databases\PropertyValue), vérifiées
 * sur les mêmes exemples (fixtures/property-values.json) : une valeur invalide est refusée par l'API,
 * pas seulement par l'interface.
 */

export const PROPERTY_TYPES = [
  'title',
  'text',
  'number',
  'checkbox',
  'date',
  'select',
  'multi_select',
  'status',
] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

/** Les 10 teintes des pastilles (spec 7) : fond pastel et texte de la même teinte, plus foncé. */
export const OPTION_COLORS = [
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const
export type OptionColor = (typeof OPTION_COLORS)[number]

/** Les groupes d'un Statut (spec 4.3) : À faire, En cours, Terminé. */
export const STATUS_GROUPS = ['todo', 'in_progress', 'complete'] as const
export type StatusGroup = (typeof STATUS_GROUPS)[number]

/** L'identifiant de la propriété Titre : c'est le titre de la page, pas une valeur de `properties`. */
export const TITLE_PROPERTY_ID = 'title'

export const propertyIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/)
const nameSchema = z.string().trim().min(1).max(100)

export const optionSchema = z.object({
  id: propertyIdSchema,
  name: nameSchema,
  color: z.enum(OPTION_COLORS),
})
export const statusOptionSchema = optionSchema.extend({ group: z.enum(STATUS_GROUPS) })

const base = { id: propertyIdSchema, name: nameSchema }

export const propertySchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('title') }),
  z.object({ ...base, type: z.literal('text') }),
  z.object({ ...base, type: z.literal('number') }),
  z.object({ ...base, type: z.literal('checkbox') }),
  z.object({ ...base, type: z.literal('date') }),
  z.object({ ...base, type: z.literal('select'), options: z.array(optionSchema).max(200) }),
  z.object({ ...base, type: z.literal('multi_select'), options: z.array(optionSchema).max(200) }),
  z.object({ ...base, type: z.literal('status'), options: z.array(statusOptionSchema).max(200) }),
])

export type Property = z.infer<typeof propertySchema>
export type PropertyOption = z.infer<typeof optionSchema>
export type StatusOption = z.infer<typeof statusOptionSchema>
export type PropertyWithOptions = Extract<Property, { options: unknown }>

/** Le schéma d'une base : ses propriétés dans l'ordre, dont exactement un Titre. */
export const databaseSchemaSchema = z
  .array(propertySchema)
  .max(100)
  .refine((schema) => schema.filter((property) => property.type === 'title').length === 1, {
    message: 'Une base a exactement une propriété Titre.',
  })
  .refine((schema) => new Set(schema.map((property) => property.id)).size === schema.length, {
    message: 'Deux propriétés ont le même identifiant.',
  })

export function hasOptions(property: Property): property is PropertyWithOptions {
  return 'options' in property
}

/*
 * Dates : « 2026-11-05 » pour une journée entière (jamais convertie de fuseau, spec 6.8), ou un
 * instant ISO 8601 avec son décalage (« 2026-11-05T13:30:00Z ») quand l'heure compte.
 * Une plage a une fin du même genre, qui n'est pas avant le début.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/

function isValidDay(value: string): boolean {
  if (!DAY.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

function isValidInstant(value: string): boolean {
  return INSTANT.test(value) && isValidDay(value.slice(0, 10)) && !Number.isNaN(Date.parse(value))
}

export const dateValueSchema = z
  .object({ start: z.string(), end: z.string().nullable().optional() })
  .strict()
  .refine(({ start }) => isValidDay(start) || isValidInstant(start), { message: 'Date invalide.' })
  .refine(
    ({ start, end }) =>
      end === null ||
      end === undefined ||
      (isValidDay(start) && isValidDay(end) && end >= start) ||
      (isValidInstant(start) && isValidInstant(end) && Date.parse(end) >= Date.parse(start)),
    { message: 'La fin doit être du même genre que le début, et pas avant lui.' },
  )

export type DateValue = z.infer<typeof dateValueSchema>

/** La date « a une heure » : un instant, pas une journée entière. */
export function hasTime(value: DateValue): boolean {
  return value.start.includes('T')
}

/** Le schéma Zod de la valeur d'une propriété (le Titre n'en a pas : c'est le titre de la page). */
export function valueSchemaFor(property: Property): z.ZodType {
  switch (property.type) {
    case 'title':
      return z.never()
    case 'text':
      return z.string().max(10_000)
    case 'number':
      return z.number().finite().nullable()
    case 'checkbox':
      return z.boolean()
    case 'date':
      return dateValueSchema.nullable()
    case 'select':
    case 'status': {
      const ids = new Set(property.options.map((option) => option.id))
      return z
        .string()
        .refine((id) => ids.has(id), { message: 'Option inconnue.' })
        .nullable()
    }
    case 'multi_select': {
      const ids = new Set(property.options.map((option) => option.id))
      return z
        .array(z.string().refine((id) => ids.has(id), { message: 'Option inconnue.' }))
        .max(100)
        .refine((list) => new Set(list).size === list.length, { message: 'Option en double.' })
    }
  }
}

export function isValidValue(property: Property, value: unknown): boolean {
  return valueSchemaFor(property).safeParse(value).success
}

/** Une valeur absente ou vide (« », aucune option, case non cochée comptent comme vides). */
export function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    value === false ||
    (Array.isArray(value) && value.length === 0)
  )
}

/** Les propriétés indexées par identifiant. */
export function propertiesById(schema: readonly Property[]): Map<string, Property> {
  return new Map(schema.map((property) => [property.id, property]))
}
