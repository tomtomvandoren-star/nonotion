import type { DatabaseDetail, DateValue, Property, PropertyOption } from '@nonotion/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { DateEditor, type EditEnd, NumberEditor, OptionPicker, TextEditor } from './editors'
import { PropertyValueView } from './propertyDisplay'
import { databaseKey, usePropertyMutation } from './queries'
import { isOptionProperty } from './values'

/**
 * La valeur d'une propriété, affichée et modifiable sur place (spec 6.10) : clic = édition, Entrée
 * valide, Échap annule, Tab passe à la cellule suivante. Les textes et nombres s'écrivent dans la
 * cellule ; les dates et les options s'ouvrent juste dessous ; une case se coche d'un clic.
 */
export function PropertyCell({
  database,
  property,
  value,
  editing,
  onStartEdit,
  onEndEdit,
  onChange,
  variant = 'cell',
  className,
}: {
  database: DatabaseDetail
  property: Property
  value: unknown
  editing: boolean
  onStartEdit: () => void
  onEndEdit: (end: EditEnd) => void
  onChange: (value: unknown) => void
  variant?: 'cell' | 'field'
  className?: string
}) {
  const properties = usePropertyMutation(database.id)
  const queryClient = useQueryClient()
  const creating = useRef<Promise<void>>(Promise.resolve())
  const label = property.name

  if (property.type === 'checkbox') {
    return (
      <div className={cn('flex h-full items-center', className)}>
        <input
          type="checkbox"
          aria-label={label}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
      </div>
    )
  }

  const inline = property.type === 'title' || property.type === 'text' || property.type === 'number'
  const display = (
    <button
      type="button"
      aria-label={label}
      onClick={onStartEdit}
      className={cn(
        'flex w-full min-w-0 items-center text-left',
        variant === 'cell'
          ? 'h-full min-h-8 px-2'
          : 'min-h-8 rounded-sm px-1.5 py-1 hover:bg-accent',
        className,
      )}
    >
      <PropertyValueView property={property} value={value} compact={variant === 'cell'} />
      {variant === 'field' && isEmpty(value) && (
        <span className="text-muted-foreground/60">Vide</span>
      )}
    </button>
  )

  if (editing && inline) {
    return (
      <div
        className={cn(
          'flex h-full min-h-8 items-center px-2',
          variant === 'field' && 'px-1.5',
          className,
        )}
      >
        {property.type === 'number' ? (
          <NumberEditor
            ariaLabel={label}
            value={typeof value === 'number' ? value : null}
            onDone={(end, next) => {
              if (end !== 'cancel' && next !== undefined && next !== value) onChange(next)
              onEndEdit(end)
            }}
          />
        ) : (
          <TextEditor
            ariaLabel={label}
            value={typeof value === 'string' ? value : ''}
            placeholder={property.type === 'title' ? 'Sans titre' : undefined}
            onDone={(end, next) => {
              if (end !== 'cancel' && next !== value) onChange(next)
              onEndEdit(end)
            }}
          />
        )}
      </div>
    )
  }

  if (property.type === 'date' || isOptionProperty(property)) {
    return (
      <Popover open={editing} onOpenChange={(open) => !open && onEndEdit('commit')}>
        <PopoverAnchor asChild>{display}</PopoverAnchor>
        <PopoverContent align="start" sideOffset={2} className="w-auto p-0">
          {property.type === 'date' ? (
            <DateEditor
              value={(value as DateValue | null | undefined) ?? null}
              onChange={onChange}
              onDone={onEndEdit}
            />
          ) : isOptionProperty(property) ? (
            <OptionPicker
              property={property}
              value={value}
              onChange={onChange}
              onDone={onEndEdit}
              onCreateOption={(option: PropertyOption) => {
                // Une création après l'autre, chacune à partir des options à jour : deux options
                // tapées vite ne s'effacent pas l'une l'autre.
                const run = creating.current.then(async () => {
                  const current =
                    queryClient
                      .getQueryData<DatabaseDetail>(databaseKey(database.id))
                      ?.schema.find((item) => item.id === property.id) ?? property
                  const options = 'options' in current ? current.options : []
                  await properties.mutateAsync({
                    kind: 'update',
                    property: { ...current, options: [...options, option] } as Property,
                  })
                })
                creating.current = run.catch(() => {})
                return run
              }}
            />
          ) : null}
        </PopoverContent>
      </Popover>
    )
  }

  return display
}

function isEmpty(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}
