import type { DatabaseRowData, RowGroup } from '@nonotion/shared'
import { useState } from 'react'
import { PageGlyph } from '@/features/pages/PageGlyph'
import { displayTitle } from '@/features/pages/displayTitle'
import { cn } from '@/lib/utils'
import { filledProperties, visibleColumns } from './columns'
import { NewItemInput } from './NewItemInput'
import { OptionPill, PropertyValueView } from './propertyDisplay'
import { useCompletion } from './completion'
import { TaskCheckbox } from './TaskCheckbox'
import type { ViewBodyProps } from './viewTypes'

type Section = { group: RowGroup<DatabaseRowData> | null; rows: DatabaseRowData[]; key: string }

function sectionsOf(rows: DatabaseRowData[], groups: ViewBodyProps['groups']): Section[] {
  return groups
    ? groups.map((group) => ({ group, rows: group.rows, key: group.key ?? '∅' }))
    : [{ group: null, rows, key: 'all' }]
}

function SectionHeader({ group }: { group: RowGroup<DatabaseRowData> }) {
  return (
    <div className="flex h-9 items-center gap-1.5 px-1 pt-2">
      {group.key === null ? (
        <span className="text-sm text-muted-foreground">{group.label}</span>
      ) : (
        <OptionPill option={{ name: group.label, color: group.color }} />
      )}
      <span className="text-sm text-muted-foreground tabular-nums">{group.rows.length}</span>
    </div>
  )
}

/** Vue Liste : une ligne par élément, son titre et, à droite, ses propriétés visibles. */
export function ListView({ database, view, rows, groups, onOpenRow, inherited }: ViewBodyProps) {
  const columns = visibleColumns(database.schema, view.config)
  const completion = useCompletion(database)
  const [draftIn, setDraftIn] = useState<string | null>(null)

  return (
    <div
      role="list"
      aria-label={database.title || 'Base sans titre'}
      className="border-t border-border"
    >
      {sectionsOf(rows, groups).map(({ group, rows: sectionRows, key }) => (
        <section key={key}>
          {group && <SectionHeader group={group} />}
          {sectionRows.map((row) => (
            <div
              role="listitem"
              key={row.id}
              data-done={completion?.isDone(row) || undefined}
              className="flex items-center border-b border-border hover:bg-accent"
            >
              {completion && <TaskCheckbox row={row} completion={completion} className="ml-2" />}
              <button
                type="button"
                onClick={() => onOpenRow(row.id)}
                className="flex min-h-9 min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left"
              >
                <PageGlyph icon={row.icon} className="text-sm" />
                <span className="nn-task-title min-w-0 flex-1 truncate text-sm font-medium">
                  {displayTitle(row.title)}
                </span>
                <span className="flex min-w-0 shrink items-center gap-2 overflow-hidden text-sm text-muted-foreground">
                  {filledProperties(row, columns).map((property) => (
                    <span key={property.id} className="shrink-0">
                      {property.type === 'checkbox' ? (
                        `✓ ${property.name}`
                      ) : (
                        <PropertyValueView
                          property={property}
                          value={row.properties[property.id]}
                          compact
                        />
                      )}
                    </span>
                  ))}
                </span>
              </button>
            </div>
          ))}
          <NewItemInput
            databaseId={database.id}
            open={draftIn === key}
            onOpen={() => setDraftIn(key)}
            onClose={() => setDraftIn((current) => (current === key ? null : current))}
            values={() => inherited(group ? group.key : undefined)}
          />
        </section>
      ))}
    </div>
  )
}

/** Vue Galerie : des cartes, le titre et les propriétés visibles. */
export function GalleryView({ database, view, rows, groups, onOpenRow, inherited }: ViewBodyProps) {
  const columns = visibleColumns(database.schema, view.config)
  const [draftIn, setDraftIn] = useState<string | null>(null)
  const size = view.config.card_size ?? 'medium'

  return (
    <div aria-label={database.title || 'Base sans titre'} className="border-t border-border pt-3">
      {sectionsOf(rows, groups).map(({ group, rows: sectionRows, key }) => (
        <section key={key} className="mb-4">
          {group && <SectionHeader group={group} />}
          <ul
            className={cn(
              'grid gap-3',
              size === 'small' && 'grid-cols-[repeat(auto-fill,minmax(140px,1fr))]',
              size === 'medium' && 'grid-cols-[repeat(auto-fill,minmax(200px,1fr))]',
              size === 'large' && 'grid-cols-[repeat(auto-fill,minmax(280px,1fr))]',
            )}
          >
            {sectionRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onOpenRow(row.id)}
                  className="flex h-full min-h-24 w-full flex-col gap-1.5 rounded-md border border-border p-3 text-left hover:bg-accent"
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <PageGlyph icon={row.icon} className="text-sm" />
                    <span className="truncate">{displayTitle(row.title)}</span>
                  </span>
                  {filledProperties(row, columns).map((property) => (
                    <span key={property.id} className="text-sm text-muted-foreground">
                      {property.type === 'checkbox' ? (
                        `✓ ${property.name}`
                      ) : (
                        <PropertyValueView
                          property={property}
                          value={row.properties[property.id]}
                        />
                      )}
                    </span>
                  ))}
                </button>
              </li>
            ))}
            <li className="flex min-h-24 items-start rounded-md border border-dashed border-border">
              <NewItemInput
                databaseId={database.id}
                open={draftIn === key}
                onOpen={() => setDraftIn(key)}
                onClose={() => setDraftIn((current) => (current === key ? null : current))}
                values={() => inherited(group ? group.key : undefined)}
                className="h-10"
              />
            </li>
          </ul>
        </section>
      ))}
    </div>
  )
}
