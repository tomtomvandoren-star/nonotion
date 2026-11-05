import {
  type DateValue,
  hasTime,
  newId,
  nextOptionColor,
  type PropertyOption,
  type PropertyWithOptions,
  type Repeat,
  REPEAT_UNITS,
  type RepeatUnit,
  repeatLabel,
  STATUS_GROUPS,
  type StatusGroup,
} from '@nonotion/shared'
import { Check, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { OptionPill } from './propertyDisplay'
import { parseNumber } from './values'

/** Comment l'édition se termine : valider, annuler, ou passer à la cellule voisine (Tab). */
export type EditEnd = 'commit' | 'cancel' | 'next' | 'prev'

const inputClass =
  'w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/60 focus-visible:outline-none'

/** Clavier commun des champs d'une cellule (spec 6.10) : Entrée valide, Échap annule, Tab avance. */
function endKey(event: React.KeyboardEvent): EditEnd | null {
  if (event.nativeEvent.isComposing) return null
  if (event.key === 'Enter' && !event.shiftKey) return 'commit'
  if (event.key === 'Escape') return 'cancel'
  if (event.key === 'Tab') return event.shiftKey ? 'prev' : 'next'
  return null
}

/** Texte ou titre : une ligne, enregistrée en sortant du champ. */
export function TextEditor({
  value,
  placeholder,
  onDone,
  ariaLabel,
}: {
  value: string
  placeholder?: string
  ariaLabel: string
  onDone: (end: EditEnd, value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const ended = useRef(false)
  const finish = (end: EditEnd) => {
    if (ended.current) return
    ended.current = true
    onDone(end, draft)
  }
  return (
    <input
      autoFocus
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        const end = endKey(event)
        if (end) {
          event.preventDefault()
          finish(end)
        }
      }}
      onBlur={() => finish('commit')}
      className={inputClass}
    />
  )
}

export function NumberEditor({
  value,
  ariaLabel,
  onDone,
}: {
  value: number | null
  ariaLabel: string
  onDone: (end: EditEnd, value: number | null | undefined) => void
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value).replace('.', ','))
  const ended = useRef(false)
  const finish = (end: EditEnd) => {
    if (ended.current) return
    ended.current = true
    onDone(end, parseNumber(draft))
  }
  return (
    <input
      autoFocus
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        const end = endKey(event)
        if (end) {
          event.preventDefault()
          finish(end)
        }
      }}
      onBlur={() => finish('commit')}
      className={cn(inputClass, 'tabular-nums')}
    />
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const localTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

/** Jour et heure locaux d'une valeur (l'heure vide pour une journée entière). */
function partsOf(text: string | null | undefined): { day: string; time: string } {
  if (!text) return { day: '', time: '' }
  if (!text.includes('T')) return { day: text, time: '' }
  const date = new Date(text)
  return { day: localDay(date), time: localTime(date) }
}

/** Un jour local et une heure locale, en instant UTC (« Z »). */
const toInstant = (day: string, time: string) => new Date(`${day}T${time || '09:00'}`).toISOString()

/**
 * Date (spec 4.3) : début, fin facultative, heure facultative. Une journée entière reste une date
 * sans heure ni fuseau ; avec l'heure, l'instant est enregistré en UTC et affiché dans le fuseau local.
 */
export function DateEditor({
  value,
  onChange,
  onDone,
}: {
  value: DateValue | null
  onChange: (value: DateValue | null) => void
  onDone: (end: EditEnd) => void
}) {
  const withTime = value ? hasTime(value) : false
  const start = partsOf(value?.start)
  const end = partsOf(value?.end)
  const [withEnd, setWithEnd] = useState(Boolean(value?.end))

  const build = (next: {
    startDay?: string
    startTime?: string
    endDay?: string
    endTime?: string
    time?: boolean
    hasEnd?: boolean
    repeat?: Repeat | null
  }): DateValue | null => {
    const startDay = next.startDay ?? start.day
    if (!startDay) return null
    const time = next.time ?? withTime
    const hasEnd = next.hasEnd ?? withEnd
    const startTime = next.startTime ?? start.time
    const endDay = next.endDay ?? (end.day || startDay)
    const endTime = next.endTime ?? (end.time || startTime)
    const startValue = time ? toInstant(startDay, startTime) : startDay
    let endValue = hasEnd ? (time ? toInstant(endDay, endTime) : endDay) : null
    // Une fin avant le début est ramenée au début.
    if (
      endValue !== null &&
      (time ? Date.parse(endValue) < Date.parse(startValue) : endValue < startValue)
    )
      endValue = startValue
    const repeat = next.repeat === undefined ? value?.repeat : next.repeat
    return { start: startValue, end: endValue, ...(repeat ? { repeat } : {}) }
  }

  const fieldClass =
    'h-8 rounded-sm border border-border bg-background px-2 text-sm outline-none focus-visible:border-primary'

  return (
    <div
      className="grid w-64 gap-2 p-3"
      onKeyDown={(event) => {
        const key = endKey(event)
        if (key === 'cancel' || key === 'next' || key === 'prev') {
          event.preventDefault()
          onDone(key)
        }
      }}
    >
      <label className="grid gap-1 text-xs text-muted-foreground">
        Début
        <div className="flex gap-1">
          <input
            type="date"
            autoFocus
            aria-label="Date de début"
            value={start.day}
            onChange={(event) => onChange(build({ startDay: event.target.value }))}
            className={cn(fieldClass, 'min-w-0 flex-1')}
          />
          {withTime && (
            <input
              type="time"
              aria-label="Heure de début"
              value={start.time}
              onChange={(event) => onChange(build({ startTime: event.target.value }))}
              className={fieldClass}
            />
          )}
        </div>
      </label>
      {withEnd && (
        <label className="grid gap-1 text-xs text-muted-foreground">
          Fin
          <div className="flex gap-1">
            <input
              type="date"
              aria-label="Date de fin"
              value={end.day || start.day}
              onChange={(event) => onChange(build({ endDay: event.target.value }))}
              className={cn(fieldClass, 'min-w-0 flex-1')}
            />
            {withTime && (
              <input
                type="time"
                aria-label="Heure de fin"
                value={end.time || start.time}
                onChange={(event) => onChange(build({ endTime: event.target.value }))}
                className={fieldClass}
              />
            )}
          </div>
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={withEnd}
          onChange={(event) => {
            setWithEnd(event.target.checked)
            if (value) onChange(build({ hasEnd: event.target.checked }))
          }}
        />
        Date de fin
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={withTime}
          disabled={!value}
          onChange={(event) => onChange(build({ time: event.target.checked }))}
        />
        Inclure l’heure
      </label>
      <RepeatField
        value={value?.repeat ?? null}
        disabled={!value}
        onChange={(repeat) => onChange(build({ repeat }))}
        fieldClass={fieldClass}
      />
      <div className="flex justify-between pt-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded-sm px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
        >
          Effacer
        </button>
        <button
          type="button"
          onClick={() => onDone('commit')}
          className="rounded-sm px-2 py-1 text-sm font-medium text-primary hover:bg-accent"
        >
          OK
        </button>
      </div>
    </div>
  )
}

const UNIT_NAMES: Record<RepeatUnit, string> = {
  day: 'jours',
  week: 'semaines',
  month: 'mois',
  year: 'ans',
}

/**
 * « Répéter » (spec 6.7) : tous les jours, semaines, mois, ans, ou « personnalisé » (tous les N …).
 * Quand la tâche passe à « Terminé », le serveur crée la suivante.
 */
function RepeatField({
  value,
  disabled,
  onChange,
  fieldClass,
}: {
  value: Repeat | null
  disabled: boolean
  onChange: (repeat: Repeat | null) => void
  fieldClass: string
}) {
  const [custom, setCustom] = useState(value !== null && value.interval !== 1)
  const choice = value === null ? 'none' : custom ? 'custom' : value.unit

  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <label className="grid gap-1">
        Répéter
        <select
          aria-label="Répéter"
          value={choice}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value
            setCustom(next === 'custom')
            if (next === 'none') onChange(null)
            else if (next === 'custom') onChange({ unit: value?.unit ?? 'week', interval: 2 })
            else onChange({ unit: next as RepeatUnit, interval: 1 })
          }}
          className={cn(fieldClass, 'text-foreground')}
        >
          <option value="none">Jamais</option>
          {REPEAT_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {repeatLabel({ unit, interval: 1 })}
            </option>
          ))}
          <option value="custom">Personnalisé…</option>
        </select>
      </label>
      {choice === 'custom' && value && (
        <div className="flex items-center gap-1 text-sm text-foreground">
          Tous les
          <input
            type="number"
            aria-label="Intervalle de répétition"
            min={1}
            max={365}
            value={value.interval}
            onChange={(event) => {
              const interval = Math.round(Number(event.target.value))
              if (interval >= 1 && interval <= 365) onChange({ ...value, interval })
            }}
            className={cn(fieldClass, 'w-16')}
          />
          <select
            aria-label="Unité de répétition"
            value={value.unit}
            onChange={(event) => onChange({ ...value, unit: event.target.value as RepeatUnit })}
            className={cn(fieldClass, 'min-w-0 flex-1')}
          >
            {REPEAT_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_NAMES[unit]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

const STATUS_GROUP_LABELS: Record<StatusGroup, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  complete: 'Terminé',
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

type PickerItem = { kind: 'option'; option: PropertyOption } | { kind: 'create'; name: string }

/**
 * Choix d'une option (sélection, statut) ou de plusieurs (sélection multiple). Taper filtre la liste ;
 * un nom nouveau propose « Créer », comme dans Notion. Flèches et Entrée au clavier.
 */
export function OptionPicker({
  property,
  value,
  onChange,
  onCreateOption,
  onDone,
}: {
  property: PropertyWithOptions
  value: unknown
  onChange: (value: unknown) => void
  /** Ajoute l'option au schéma de la base et renvoie la nouvelle définition. */
  onCreateOption: (option: PropertyOption) => Promise<void>
  onDone: (end: EditEnd) => void
}) {
  const multi = property.type === 'multi_select'
  const selected = useMemo(
    () =>
      multi ? (Array.isArray(value) ? (value as string[]) : []) : value ? [value as string] : [],
    [multi, value],
  )
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  // La valeur à jour, lue après la création d'une option (le temps que le serveur réponde).
  const latest = useRef(selected)
  useEffect(() => {
    latest.current = selected
  }, [selected])

  const items = useMemo<PickerItem[]>(() => {
    const q = normalize(query)
    const matching = property.options.filter((option) => normalize(option.name).includes(q))
    const exact = property.options.some((option) => normalize(option.name) === q)
    return [
      ...matching.map((option) => ({ kind: 'option' as const, option })),
      ...(q !== '' && !exact ? [{ kind: 'create' as const, name: query.trim() }] : []),
    ]
  }, [property.options, query])

  const choose = async (item: PickerItem) => {
    // Le champ se vide tout de suite : la suite de la frappe est une nouvelle recherche.
    setQuery('')
    setActive(0)
    let id: string
    if (item.kind === 'create') {
      const option: PropertyOption & { group?: StatusGroup } = {
        id: newId(),
        name: item.name.slice(0, 100),
        color: nextOptionColor(property.options),
        ...(property.type === 'status' ? { group: 'todo' as const } : {}),
      }
      await onCreateOption(option)
      id = option.id
    } else {
      id = item.option.id
    }
    const current = latest.current
    if (multi) {
      onChange(current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
    } else {
      onChange(current[0] === id ? null : id)
      onDone('commit')
    }
  }

  const grouped =
    property.type === 'status'
      ? STATUS_GROUPS.map((group) => ({
          label: STATUS_GROUP_LABELS[group],
          items: items.filter(
            (item) =>
              item.kind === 'option' &&
              (item.option as PropertyOption & { group?: StatusGroup }).group === group,
          ),
        })).filter((group) => group.items.length > 0)
      : [{ label: null, items: items.filter((item) => item.kind === 'option') }]
  const createItem = items.find((item) => item.kind === 'create')

  const renderItem = (item: PickerItem) => {
    const index = items.indexOf(item)
    const isSelected = item.kind === 'option' && selected.includes(item.option.id)
    return (
      <li key={item.kind === 'option' ? item.option.id : 'create'}>
        <button
          type="button"
          role="option"
          aria-selected={isSelected}
          data-active={index === active || undefined}
          onMouseEnter={() => setActive(index)}
          // choose() lit la référence après un await, dans le gestionnaire du clic, pas au rendu.
          // eslint-disable-next-line react-hooks/refs
          onClick={() => void choose(item)}
          className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm data-active:bg-accent"
        >
          {item.kind === 'option' ? (
            <>
              <OptionPill option={item.option} />
              {isSelected && <Check aria-hidden className="ml-auto size-4 text-muted-foreground" />}
            </>
          ) : (
            <>
              <span className="text-muted-foreground">Créer</span>
              <OptionPill option={{ name: item.name, color: 'default' }} />
            </>
          )}
        </button>
      </li>
    )
  }

  return (
    <div className="w-64">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
        {selected.map((id) => {
          const option = property.options.find((item) => item.id === id)
          return option ? (
            <OptionPill key={id} option={option}>
              <button
                type="button"
                aria-label={`Retirer ${option.name}`}
                onClick={() => onChange(multi ? selected.filter((x) => x !== id) : null)}
                className="-mr-1 rounded-sm opacity-60 hover:opacity-100"
              >
                <X aria-hidden className="size-3" />
              </button>
            </OptionPill>
          ) : null
        })}
        <input
          autoFocus
          aria-label={`Chercher ou créer une option de ${property.name}`}
          value={query}
          placeholder={selected.length > 0 ? '' : 'Chercher ou créer…'}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const step = event.key === 'ArrowDown' ? 1 : -1
              setActive((current) => (current + step + items.length) % Math.max(1, items.length))
            } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              const item = items[active]
              if (item) void choose(item)
              else onDone('commit')
            } else if (event.key === 'Backspace' && query === '' && multi && selected.length > 0) {
              onChange(selected.slice(0, -1))
            } else {
              const end = endKey(event)
              if (end === 'cancel' || end === 'next' || end === 'prev') {
                event.preventDefault()
                onDone(end === 'cancel' ? 'commit' : end)
              }
            }
          }}
          className={cn(inputClass, 'h-6 min-w-16 flex-1 text-sm')}
        />
      </div>
      <ul role="listbox" aria-label={property.name} className="max-h-64 overflow-y-auto p-1">
        {grouped.map((group) => (
          <li key={group.label ?? 'options'}>
            {group.label && (
              <div className="px-2 pt-1.5 pb-0.5 text-xs text-muted-foreground">{group.label}</div>
            )}
            <ul>{group.items.map(renderItem)}</ul>
          </li>
        ))}
        {createItem && renderItem(createItem)}
        {items.length === 0 && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">Aucune option</li>
        )}
      </ul>
    </div>
  )
}
