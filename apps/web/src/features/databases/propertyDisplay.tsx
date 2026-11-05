import {
  type DateValue,
  hasTime,
  type Property,
  type PropertyOption,
  type PropertyType,
} from '@nonotion/shared'
import {
  AlignLeft,
  Calendar,
  CircleChevronDown,
  CircleDashed,
  Hash,
  type LucideIcon,
  SquareCheck,
  Tags,
  Type,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const PROPERTY_ICONS: Record<PropertyType, LucideIcon> = {
  title: Type,
  text: AlignLeft,
  number: Hash,
  checkbox: SquareCheck,
  date: Calendar,
  select: CircleChevronDown,
  multi_select: Tags,
  status: CircleDashed,
}

export function PropertyIcon({ type, className }: { type: PropertyType; className?: string }) {
  const Icon = PROPERTY_ICONS[type]
  return <Icon aria-hidden className={cn('size-3.5 shrink-0 text-muted-foreground', className)} />
}

/** Une pastille d'option (spec 7) : fond pastel, texte de la même teinte plus foncé, rayon 3 px. */
export function OptionPill({
  option,
  className,
  children,
}: {
  option: Pick<PropertyOption, 'name' | 'color'>
  className?: string
  children?: React.ReactNode
}) {
  return (
    <span data-color={option.color} className={cn('nn-pill', className)}>
      <span className="truncate">{option.name}</span>
      {children}
    </span>
  )
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** « 5 nov. 2026 », « 5 nov. 2026 14:30 », « 5 nov. 2026 → 7 nov. 2026 ». */
function formatDate(value: DateValue): string {
  const one = (text: string) => {
    if (!text.includes('T')) {
      const [year, month, day] = text.split('-').map(Number) as [number, number, number]
      // Journée entière : jamais convertie de fuseau (spec 6.8).
      return dayFormat.format(new Date(year, month - 1, day))
    }
    const date = new Date(text)
    return `${dayFormat.format(date)} ${timeFormat.format(date)}`
  }
  return value.end ? `${one(value.start)} → ${one(value.end)}` : one(value.start)
}

const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 10 })

/** La valeur d'une propriété en lecture, pour une cellule, une carte ou la grille d'une page. */
export function PropertyValueView({
  property,
  value,
  compact = false,
}: {
  property: Property
  value: unknown
  compact?: boolean
}) {
  switch (property.type) {
    case 'title':
    case 'text':
      return typeof value === 'string' && value !== '' ? (
        <span className={cn(compact && 'truncate')}>{value}</span>
      ) : null
    case 'number':
      return typeof value === 'number' ? (
        <span className="tabular-nums">{numberFormat.format(value)}</span>
      ) : null
    case 'checkbox':
      return null
    case 'date': {
      const date = value as DateValue | null | undefined
      return date ? (
        <span className={cn('whitespace-nowrap', hasTime(date) && 'tabular-nums')}>
          {formatDate(date)}
        </span>
      ) : null
    }
    case 'select':
    case 'status': {
      const option = property.options.find((item) => item.id === value)
      return option ? <OptionPill option={option} /> : null
    }
    case 'multi_select': {
      const ids = Array.isArray(value) ? value : []
      const options = property.options.filter((option) => ids.includes(option.id))
      return options.length > 0 ? (
        <span className={cn('flex gap-1', compact ? 'overflow-hidden' : 'flex-wrap')}>
          {options.map((option) => (
            <OptionPill key={option.id} option={option} />
          ))}
        </span>
      ) : null
    }
  }
}
