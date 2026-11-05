import { newProperty, type PageDetail } from '@nonotion/shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { AddPropertyButton } from './ColumnHeader'
import { PropertyCell } from './PropertyCell'
import { PropertyIcon } from './propertyDisplay'
import { useDatabase, usePropertyMutation, useUpdateRow } from './queries'

/**
 * Les propriétés d'une ligne ouverte (spec 6.4) : en grille, le nom à gauche et la valeur modifiable
 * à droite, entre le titre et le corps. Une valeur changée ici se voit aussitôt dans les vues.
 */
export function RowProperties({ page }: { page: PageDetail }) {
  const databaseId = page.database_id ?? ''
  const database = useDatabase(databaseId)
  const updateRow = useUpdateRow(databaseId)
  const properties = usePropertyMutation(databaseId)
  const [editing, setEditing] = useState<string | null>(null)

  if (!database.data)
    return <div aria-hidden className="my-3 h-16 animate-pulse rounded bg-muted" />
  const row = database.data.rows.find((item) => item.id === page.id)
  const values = row?.properties ?? page.properties ?? {}
  const shown = database.data.schema.filter((property) => property.type !== 'title')

  return (
    <div role="list" aria-label="Propriétés" className="my-3 grid gap-0.5">
      {shown.map((property) => (
        <div role="listitem" key={property.id} className="flex min-h-8 items-start gap-2">
          <div className="flex w-36 shrink-0 items-center gap-1.5 py-1.5 text-sm text-muted-foreground md:w-44">
            <PropertyIcon type={property.type} />
            <span className="truncate">{property.name}</span>
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <PropertyCell
              database={database.data}
              property={property}
              value={values[property.id]}
              variant="field"
              editing={editing === property.id}
              onStartEdit={() => setEditing(property.id)}
              onEndEdit={(end) => {
                if (end !== 'next' && end !== 'prev') return setEditing(null)
                const index = shown.findIndex((item) => item.id === property.id)
                setEditing(shown[index + (end === 'next' ? 1 : -1)]?.id ?? null)
              }}
              onChange={(value) =>
                updateRow.mutate({
                  rowId: page.id,
                  patch: { properties: { [property.id]: value } },
                })
              }
              className={property.type === 'checkbox' ? 'min-h-8 px-1.5' : undefined}
            />
          </div>
        </div>
      ))}
      <AddPropertyButton
        onAdd={(type, name) =>
          properties.mutate({
            kind: 'add',
            property: newProperty(database.data.schema, type, name),
          })
        }
        className="flex h-8 w-fit items-center gap-1.5 rounded-sm px-1.5 text-sm text-muted-foreground hover:bg-accent"
      >
        <Plus aria-hidden className="size-4" /> Ajouter une propriété
      </AddPropertyButton>
    </div>
  )
}
