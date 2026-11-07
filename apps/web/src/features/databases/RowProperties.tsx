import { importedLocks, newProperty, type PageDetail } from '@nonotion/shared'
import { CalendarDays, GitMerge, Plus } from 'lucide-react'
import { useState } from 'react'
import { useUpdatePage } from '@/features/pages/queries'
import { formatDate } from './values'
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
  const locked = importedLocks(database.data, row ?? page)
  const source = database.data.sources.find((item) => item.id === (row ?? page).calendar_source_id)

  return (
    <div role="list" aria-label="Propriétés" className="my-3 grid gap-0.5">
      {source && (
        // Un événement importé (spec 6.9) : son titre, sa date, son lieu et son lien suivent
        // l'agenda. Synchronisé avec Google ou iCloud (spec 6.15) : il se modifie des deux côtés.
        <p className="mb-1 flex items-center gap-1.5 rounded-sm bg-muted/60 px-2 py-1.5 text-xs text-muted-foreground">
          <CalendarDays aria-hidden className="size-3.5 shrink-0" />
          <span>
            {source.kind !== 'ics' && source.writable
              ? `Synchronisé avec l’agenda « ${source.name} » (${source.url_host}) : vos modifications y partent, et les siennes arrivent ici.`
              : `Importé de l’agenda « ${source.name} » (${source.url_host}) : le titre, la date, le lieu et le lien se modifient dans l’agenda d’origine.`}
          </span>
        </p>
      )}
      {page.sync_conflict && source && <ConflictNotice page={page} provider={source.kind} />}
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
              readOnly={locked.has(property.id)}
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

/**
 * Modifié des deux côtés (spec 6.15) : la version la plus récente a gagné, l'autre reste ici, pour
 * la recopier si besoin, jusqu'à ce qu'on l'ignore.
 */
function ConflictNotice({ page, provider }: { page: PageDetail; provider: string }) {
  const updatePage = useUpdatePage()
  const conflict = page.sync_conflict!
  const where = provider === 'google' ? 'Google Agenda' : 'iCloud'
  const lost = conflict.lost === 'local' ? 'Nonotion' : where
  const kept = conflict.lost === 'local' ? where : 'Nonotion'
  return (
    <div
      role="status"
      className="mb-1 grid gap-1 rounded-sm bg-amber-500/10 px-2 py-1.5 text-xs text-foreground"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <GitMerge aria-hidden className="size-3.5 shrink-0 text-amber-600" />
        Modifié des deux côtés : la version de {kept}, plus récente, a été gardée.
      </p>
      <p className="text-muted-foreground">
        Celle de {lost} : « {conflict.title || 'Sans titre'} »
        {conflict.date.start &&
          `, ${formatDate({ start: conflict.date.start, end: conflict.date.end ?? null })}`}
        {conflict.location && `, ${conflict.location}`}.
      </p>
      <button
        type="button"
        onClick={() => updatePage.mutate({ pageId: page.id, patch: { sync_conflict: null } })}
        className="justify-self-start rounded-sm px-1 py-0.5 font-medium hover:bg-amber-500/15"
      >
        Ignorer
      </button>
    </div>
  )
}
