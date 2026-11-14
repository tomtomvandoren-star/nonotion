import {
  comparePositions,
  positionBetween,
  type DatabaseDetail,
  type DatabaseRowData,
  type DatabaseView,
  type Property,
  type ViewConfig,
  type ViewType,
} from '@nonotion/shared'

/*
 * Ce que le serveur ferait d'une modification de base, refait sur l'appareil : hors ligne (spec
 * 6.16), l'écran montre le résultat tout de suite, et le serveur le confirmera au retour de la
 * connexion. Mêmes règles que l'API (Databases.php, PropertyController, ViewController).
 */

export type PropertyChange =
  | { kind: 'add'; property: Property }
  | { kind: 'update'; property: Property }
  | { kind: 'delete'; propertyId: string }

/** La configuration d'une vue sans une propriété supprimée (Databases::configWithout). */
export function configWithoutProperty(config: ViewConfig, propertyId: string): ViewConfig {
  const next: ViewConfig = { ...config }
  if (next.filters)
    next.filters = {
      ...next.filters,
      rules: next.filters.rules.filter((rule) => rule.property !== propertyId),
    }
  if (next.sorts) next.sorts = next.sorts.filter((sort) => sort.property !== propertyId)
  if (next.group_by?.property === propertyId) next.group_by = null
  if (next.visible_properties)
    next.visible_properties = next.visible_properties.filter((id) => id !== propertyId)
  if (next.property_widths && propertyId in next.property_widths) {
    const widths = { ...next.property_widths }
    delete widths[propertyId]
    next.property_widths = widths
  }
  if (next.calendar_by === propertyId) next.calendar_by = null
  return next
}

/** La base après l'ajout, la modification ou la suppression d'une propriété. */
export function withPropertyChange(
  database: DatabaseDetail,
  change: PropertyChange,
): DatabaseDetail {
  if (change.kind === 'add')
    return {
      ...database,
      schema: [...database.schema, change.property],
      // Une vue qui choisit ses colonnes montre la nouvelle (Databases::appendProperty).
      views: database.views.map((view) =>
        view.config.visible_properties
          ? {
              ...view,
              config: {
                ...view.config,
                visible_properties: [...view.config.visible_properties, change.property.id],
              },
            }
          : view,
      ),
    }
  if (change.kind === 'update')
    return {
      ...database,
      schema: database.schema.map((property) =>
        property.id === change.property.id ? change.property : property,
      ),
    }
  const id = change.propertyId
  return {
    ...database,
    schema: database.schema.filter((property) => property.id !== id),
    rows: database.rows.map((row) => {
      if (!(id in row.properties)) return row
      const properties = { ...row.properties }
      delete properties[id]
      return { ...row, properties }
    }),
    views: database.views.map((view) => ({
      ...view,
      config: configWithoutProperty(view.config, id),
    })),
  }
}

const lastPosition = (positions: string[]) => positions.sort(comparePositions).at(-1) ?? null

/** La place après la dernière ligne : une ligne créée va en fin de base (comme sur le serveur). */
export function endRowPosition(database: DatabaseDetail | undefined): string {
  return positionBetween(lastPosition((database?.rows ?? []).map((row) => row.position)), null)
}

/** Une ligne neuve telle que le serveur la renverrait : Statut « À faire » par défaut. */
export function localRow(
  database: DatabaseDetail | undefined,
  input: { id: string; title?: string; properties?: Record<string, unknown>; position: string },
): DatabaseRowData {
  const defaults: Record<string, unknown> = {}
  for (const property of database?.schema ?? []) {
    if (property.type !== 'status') continue
    const todo = property.options.find((option) => option.group === 'todo')
    if (todo) defaults[property.id] = todo.id
  }
  const now = new Date().toISOString()
  return {
    id: input.id,
    title: input.title ?? '',
    icon: null,
    properties: { ...defaults, ...input.properties },
    position: input.position,
    calendar_source_id: null,
    ics_uid: null,
    created_at: now,
    updated_at: now,
  }
}

/** Une vue neuve, en fin de rangée d'onglets. */
export function localView(
  database: DatabaseDetail | undefined,
  input: { id: string; name: string; type: ViewType; config: ViewConfig },
): DatabaseView {
  return {
    id: input.id,
    database_id: database?.id ?? '',
    name: input.name.trim() || 'Vue',
    type: input.type,
    position: positionBetween(
      lastPosition((database?.views ?? []).map((view) => view.position)),
      null,
    ),
    config: input.config,
  }
}

/** La copie d'une vue, juste après elle (ViewController::duplicate). */
export function localViewCopy(
  database: DatabaseDetail | undefined,
  viewId: string,
  id: string,
): DatabaseView | null {
  const views = [...(database?.views ?? [])].sort((a, b) =>
    comparePositions(a.position, b.position),
  )
  const index = views.findIndex((view) => view.id === viewId)
  const view = views[index]
  if (!view) return null
  return {
    ...view,
    id,
    name: `${view.name} (copie)`.slice(0, 100),
    position: positionBetween(view.position, views[index + 1]?.position ?? null),
  }
}
