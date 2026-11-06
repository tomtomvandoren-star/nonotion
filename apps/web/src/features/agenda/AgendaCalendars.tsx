import { type Agenda, OPTION_COLOR_LABELS, OPTION_COLORS, type OptionColor } from '@nonotion/shared'
import { useNavigate } from '@tanstack/react-router'
import { Check, Ellipsis, ExternalLink, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SourceItem } from '@/features/databases/calendar/MyCalendars'
import { OptionPill } from '@/features/databases/propertyDisplay'
import { cn } from '@/lib/utils'
import { useUpdateAgenda } from './queries'

const heading = 'px-1 pb-1 text-xs font-medium text-muted-foreground'

/**
 * « Mes agendas » de l'Agenda (spec 6.15), à gauche de la grille : les bases Nonotion (afficher,
 * couleur, base des nouveaux éléments) et les agendas abonnés par lien (ceux de 6.9, à l'échelle
 * de l'espace de travail). Chacun avec sa case et sa pastille de couleur.
 */
export function AgendaCalendars({
  workspaceId,
  agenda,
  onImport,
}: {
  workspaceId: string
  agenda: Agenda
  onImport: () => void
}) {
  const update = useUpdateAgenda(workspaceId)
  const { settings } = agenda
  const bases = agenda.databases.filter((base) => !base.imported_only)
  const toggle = (list: readonly string[], id: string, visible: boolean) =>
    visible ? list.filter((item) => item !== id) : [...list, id]

  return (
    <aside aria-label="Mes agendas" className="grid gap-4 text-sm">
      <section aria-label="Bases Nonotion">
        <h2 className={heading}>Bases Nonotion</h2>
        {bases.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">Aucune base n’a encore de date.</p>
        ) : (
          <ul className="grid gap-0.5">
            {bases.map((base) => (
              <DatabaseItem
                key={base.id}
                base={base}
                color={settings.colors[base.id] ?? 'default'}
                visible={!settings.hidden_databases.includes(base.id)}
                isDefault={settings.default_database_id === base.id}
                onToggle={(visible) =>
                  update.mutate({
                    hidden_databases: toggle(settings.hidden_databases, base.id, visible),
                  })
                }
                onColor={(color) =>
                  update.mutate({ colors: { ...settings.colors, [base.id]: color } })
                }
                onDefault={() => update.mutate({ default_database_id: base.id })}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Agendas abonnés">
        <h2 className={heading}>Agendas abonnés</h2>
        <ul className="grid gap-1">
          {agenda.sources.map((source) => (
            <SourceItem
              key={source.id}
              source={source}
              visible={!settings.hidden_sources.includes(source.id)}
              onToggle={(visible) =>
                update.mutate({
                  hidden_sources: toggle(settings.hidden_sources, source.id, visible),
                })
              }
            />
          ))}
        </ul>
        <button
          type="button"
          onClick={onImport}
          className="mt-0.5 flex h-8 w-full items-center gap-1.5 rounded-sm px-1 text-left text-muted-foreground hover:bg-accent touch:h-10"
        >
          <Plus aria-hidden className="size-4" /> Ajouter un agenda (ICS)
        </button>
      </section>
    </aside>
  )
}

function DatabaseItem({
  base,
  color,
  visible,
  isDefault,
  onToggle,
  onColor,
  onDefault,
}: {
  base: Agenda['databases'][number]
  color: OptionColor
  visible: boolean
  isDefault: boolean
  onToggle: (visible: boolean) => void
  onColor: (color: OptionColor) => void
  onDefault: () => void
}) {
  const navigate = useNavigate()
  const title = base.title || 'Sans titre'
  return (
    <li
      aria-label={title}
      className="group/base flex items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-accent/50"
    >
      <input
        type="checkbox"
        aria-label={`Afficher ${title}`}
        checked={visible}
        onChange={(event) => onToggle(event.target.checked)}
        className="size-4 shrink-0 accent-[var(--accent)]"
      />
      <span
        aria-hidden
        data-color={color === 'default' ? undefined : color}
        className={cn(
          'size-2.5 shrink-0 rounded-full',
          color === 'default' ? 'bg-primary' : 'nn-tint',
        )}
      />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options de la base ${title}`}
            className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover/base:opacity-100 hover:bg-accent focus-visible:opacity-100 data-[state=open]:opacity-100 touch:opacity-100"
          >
            <Ellipsis aria-hidden className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={onDefault}>
            <Check aria-hidden className={cn(!isDefault && 'invisible')} />
            Les nouveaux éléments vont ici
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void navigate({ to: '/p/$pageId', params: { pageId: base.page_id } })}
          >
            <ExternalLink aria-hidden /> Ouvrir la base
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Couleur
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={color}
            onValueChange={(value) => onColor(value as OptionColor)}
          >
            {OPTION_COLORS.map((option) => (
              <DropdownMenuRadioItem key={option} value={option}>
                {option === 'default' ? (
                  'Couleur du thème'
                ) : (
                  <OptionPill option={{ name: OPTION_COLOR_LABELS[option], color: option }} />
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
