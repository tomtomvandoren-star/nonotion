import {
  type CalendarSource,
  type DatabaseDetail,
  OPTION_COLOR_LABELS,
  OPTION_COLORS,
} from '@nonotion/shared'
import { ChevronRight, Ellipsis, Pencil, RefreshCw, Trash } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useInstantValue } from '@/lib/useInstantValue'
import { cn } from '@/lib/utils'
import { OptionPill } from '../propertyDisplay'
import {
  calendarError,
  plural,
  useDeleteCalendar,
  useSyncCalendar,
  useUpdateCalendar,
} from './calendarQueries'

const relative = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })

/** « il y a 5 minutes », « il y a 2 heures »… */
function since(iso: string | null): string {
  if (!iso) return 'jamais synchronisé'
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000)
  if (minutes > -1) return 'synchronisé à l’instant'
  if (minutes > -60) return `synchronisé ${relative.format(minutes, 'minute')}`
  const hours = Math.round(minutes / 60)
  if (hours > -24) return `synchronisé ${relative.format(hours, 'hour')}`
  return `synchronisé ${relative.format(Math.round(hours / 24), 'day')}`
}

/**
 * « Mes agendas » (spec 6.8), panneau repliable à gauche du calendrier : chaque agenda importé
 * avec sa case (afficher ou masquer ses événements), sa pastille de couleur, son état, et un
 * menu « ⋯ » : Resynchroniser, Modifier, Supprimer.
 */
export function MyCalendars({
  database,
  hidden,
  onToggle,
}: {
  database: DatabaseDetail
  hidden: ReadonlySet<string>
  onToggle: (sourceId: string, visible: boolean) => void
}) {
  const [open, setOpen] = useState(true)
  return (
    <aside aria-label="Mes agendas" className="text-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-full items-center gap-1 rounded-sm px-1 text-muted-foreground hover:bg-accent"
      >
        <ChevronRight
          aria-hidden
          className={cn('size-4 transition-transform', open && 'rotate-90')}
        />
        Mes agendas
      </button>
      {open && (
        <ul className="grid gap-1 pt-1">
          {database.sources.map((source) => (
            <SourceItem
              key={source.id}
              source={source}
              visible={!hidden.has(source.id)}
              onToggle={(visible) => onToggle(source.id, visible)}
            />
          ))}
        </ul>
      )}
    </aside>
  )
}

/**
 * Un agenda de « Mes agendas » : sa case (afficher ou masquer), sa pastille, son état et son menu.
 * Aussi dans l'Agenda de l'espace (spec 6.15).
 */
export function SourceItem({
  source,
  visible,
  onToggle,
}: {
  source: CalendarSource
  visible: boolean
  onToggle: (visible: boolean) => void
}) {
  const sync = useSyncCalendar()
  const update = useUpdateCalendar()
  const remove = useDeleteCalendar()
  const [renaming, setRenaming] = useState(false)
  const [shown, setShown] = useInstantValue(visible)
  const [confirm, setConfirm] = useState(false)
  const failed = source.status === 'error'

  return (
    <li aria-label={source.name} className="group/source rounded-sm px-1 py-0.5 hover:bg-accent/50">
      <div className="flex items-center gap-1.5">
        <input
          type="checkbox"
          aria-label={`Afficher ${source.name}`}
          checked={shown}
          onChange={(event) => {
            setShown(event.target.checked)
            onToggle(event.target.checked)
          }}
          className="size-4 shrink-0 accent-[var(--accent)]"
        />
        <span
          aria-hidden
          data-color={source.color}
          className="nn-tint size-2.5 shrink-0 rounded-full"
        />
        {renaming ? (
          <input
            autoFocus
            aria-label="Nom de l’agenda"
            defaultValue={source.name}
            maxLength={100}
            onBlur={(event) => {
              const name = event.target.value.trim()
              if (name && name !== source.name) update.mutate({ source, patch: { name } })
              setRenaming(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') event.currentTarget.value = source.name
              if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur()
            }}
            className="h-7 min-w-0 flex-1 rounded-sm border border-border bg-background px-1.5 outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{source.name}</span>
        )}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Options de l’agenda ${source.name}`}
              className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover/source:opacity-100 hover:bg-accent focus-visible:opacity-100 data-[state=open]:opacity-100 touch:opacity-100"
            >
              <Ellipsis aria-hidden className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {source.mode === 'subscription' && (
              <DropdownMenuItem disabled={sync.isPending} onSelect={() => sync.mutate(source.id)}>
                <RefreshCw aria-hidden /> Resynchroniser
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil aria-hidden /> Renommer
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Couleur</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={source.color}
                  onValueChange={(color) =>
                    update.mutate({ source, patch: { color: color as CalendarSource['color'] } })
                  }
                >
                  {OPTION_COLORS.filter((color) => color !== 'default').map((color) => (
                    <DropdownMenuRadioItem key={color} value={color}>
                      <OptionPill option={{ name: OPTION_COLOR_LABELS[color], color }} />
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Mise à jour</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={source.mode}
                  onValueChange={(mode) =>
                    update.mutate({ source, patch: { mode: mode as CalendarSource['mode'] } })
                  }
                >
                  <DropdownMenuRadioItem value="subscription">Abonnement</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="one_shot">Import unique</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
              <Trash aria-hidden /> Supprimer l’agenda
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p
        className={cn(
          'truncate pl-[1.375rem] text-xs',
          failed ? 'text-destructive' : 'text-muted-foreground',
        )}
        title={source.url_host}
      >
        {sync.isPending
          ? 'Synchronisation…'
          : failed
            ? (source.error_message ?? 'La synchronisation a échoué.')
            : `${source.url_host} · ${source.mode === 'subscription' ? since(source.last_sync_at) : 'import unique'}`}
      </p>
      {sync.isError && !failed && (
        <p role="alert" className="pl-[1.375rem] text-xs text-destructive">
          {calendarError(sync.error)}
        </p>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l’agenda « {source.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              {source.events_count > 0
                ? `Ses ${plural(source.events_count, 'événement')} importé${source.events_count > 1 ? 's' : ''} vont à la corbeille (30 jours pour les récupérer). L’agenda d’origine n’est pas touché.`
                : 'L’agenda d’origine n’est pas touché.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate(source)}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
