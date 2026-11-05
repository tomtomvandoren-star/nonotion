import { z } from 'zod'
import { propertyIdSchema } from './properties'

/*
 * Une vue = une configuration, jamais une copie des données (P6). Contenu de `views.config`
 * (spec 4.2) : filtres, tris, regroupement, colonnes visibles, ouverture des pages.
 */

export const VIEW_TYPES = ['table', 'board', 'list', 'calendar', 'gallery'] as const
export type ViewType = (typeof VIEW_TYPES)[number]

/** Opérateurs de filtre, par famille de types. */
export const TEXT_OPERATORS = [
  'contains',
  'does_not_contain',
  'is',
  'is_not',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
] as const
export const NUMBER_OPERATORS = [
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
  'greater_or_equal',
  'less_or_equal',
  'is_empty',
  'is_not_empty',
] as const
export const CHECKBOX_OPERATORS = ['is'] as const
export const DATE_OPERATORS = [
  'is',
  'before',
  'after',
  'on_or_before',
  'on_or_after',
  'is_empty',
  'is_not_empty',
] as const
export const OPTION_OPERATORS = ['is', 'is_not', 'is_empty', 'is_not_empty'] as const
export const MULTI_OPTION_OPERATORS = [
  'contains',
  'does_not_contain',
  'is_empty',
  'is_not_empty',
] as const

export const FILTER_OPERATORS = [
  ...new Set([
    ...TEXT_OPERATORS,
    ...NUMBER_OPERATORS,
    ...CHECKBOX_OPERATORS,
    ...DATE_OPERATORS,
    ...OPTION_OPERATORS,
    ...MULTI_OPTION_OPERATORS,
  ]),
] as [string, ...string[]]

/** Opérateurs qui ne prennent pas de valeur. */
export const VALUELESS_OPERATORS = new Set(['is_empty', 'is_not_empty'])

/** Dates relatives d'un filtre de date ; sinon une date « AAAA-MM-JJ ». */
export const RELATIVE_DATES = ['today', 'tomorrow', 'yesterday'] as const

export const filterRuleSchema = z.object({
  property: propertyIdSchema,
  op: z.enum(FILTER_OPERATORS),
  value: z.unknown().optional(),
})

export const filterGroupSchema = z.object({
  operator: z.enum(['and', 'or']),
  rules: z.array(filterRuleSchema).max(50),
})

export const sortRuleSchema = z.object({
  property: propertyIdSchema,
  direction: z.enum(['asc', 'desc']),
})

export const groupBySchema = z.object({
  property: propertyIdSchema,
  hide_empty: z.boolean().optional(),
  /** Sections masquées (une option, « true »/« false », ou « :empty » pour « Sans … »). */
  hidden: z.array(z.string().max(32)).max(200).optional(),
})

export const OPEN_PAGES_IN = ['side_peek', 'center_modal', 'full_page'] as const

export const viewConfigSchema = z.object({
  filters: filterGroupSchema.optional(),
  sorts: z.array(sortRuleSchema).max(20).optional(),
  group_by: groupBySchema.nullable().optional(),
  /** Colonnes affichées, dans l'ordre. Absent : toutes, dans l'ordre du schéma. */
  visible_properties: z.array(propertyIdSchema).max(100).optional(),
  /** Largeur des colonnes du tableau, en pixels. */
  property_widths: z.record(propertyIdSchema, z.number().int().min(60).max(1000)).optional(),
  calendar_by: propertyIdSchema.nullable().optional(),
  /** Calendrier : un mois ou une semaine (spec 6.8). */
  calendar_mode: z.enum(['month', 'week']).optional(),
  open_pages_in: z.enum(OPEN_PAGES_IN).optional(),
  card_size: z.enum(['small', 'medium', 'large']).optional(),
})

export type FilterRule = z.infer<typeof filterRuleSchema>
export type FilterGroup = z.infer<typeof filterGroupSchema>
export type SortRule = z.infer<typeof sortRuleSchema>
export type GroupBy = z.infer<typeof groupBySchema>
export type ViewConfig = z.infer<typeof viewConfigSchema>
