import type { Agenda } from '@nonotion/shared'
import {
  CalendarClock,
  CalendarRange,
  Copy,
  CopyPlus,
  Ellipsis,
  Link2,
  Pause,
  Pencil,
  Play,
  Trash2,
} from 'lucide-react'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidePanel } from '@/features/layout/SidePanel'
import { copyLink, useLinkMutations, useLinks } from '@/features/scheduling/queries'
import { minutesLabel } from '@/features/scheduling/time'
import type { DatedRange, SchedulingLink } from '@/lib/api/scheduling'
import { LinkEditor } from './LinkEditor'

const createButton =
  'flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent touch:h-11'

/** Les plages d'un lien ponctuel en cours de modification : tracées aussi sur la grille de l'Agenda. */
export type DrawnRanges = {
  ranges: DatedRange[] | null
  set: (ranges: DatedRange[] | null) => void
}

type View = { kind: 'list' } | { kind: 'edit'; linkId: string | null; type: SchedulingLink['type'] }

/**
 * Les liens de planification (spec 6.17, 3.4 ; raccourci S) : la liste, avec copier, modifier,
 * désactiver, dupliquer et supprimer, et la création d'un lien récurrent ou ponctuel.
 */
export function LinksPanel({
  workspaceId,
  agenda,
  drawn,
  onClose,
}: {
  workspaceId: string
  agenda: Agenda
  drawn: DrawnRanges
  onClose: () => void
}) {
  const links = useLinks(workspaceId)
  const [view, setView] = useState<View>({ kind: 'list' })
  const editing =
    view.kind === 'edit' && view.linkId
      ? (links.data?.find((link) => link.id === view.linkId) ?? null)
      : null

  return (
    <SidePanel
      label="Liens de planification"
      className="max-w-[min(520px,100vw)]"
      escapeInFields={false}
      onClose={onClose}
    >
      {view.kind === 'edit' ? (
        <LinkEditor
          key={view.linkId ?? `new-${view.type}`}
          workspaceId={workspaceId}
          agenda={agenda}
          link={editing}
          type={editing?.type ?? view.type}
          drawn={drawn}
          onDone={() => setView({ kind: 'list' })}
        />
      ) : (
        <div className="grid gap-4 px-5 pb-8">
          <header className="grid gap-1">
            <h2 className="text-lg font-semibold">Liens de planification</h2>
            <p className="text-sm text-muted-foreground">
              Une page publique où l’on choisit un créneau parmi vos disponibilités ; le rendez-vous
              arrive dans votre Agenda.
            </p>
          </header>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={createButton}
              onClick={() => setView({ kind: 'edit', linkId: null, type: 'recurring' })}
            >
              <CalendarClock aria-hidden className="size-4" /> Créer un lien récurrent
            </button>
            <button
              type="button"
              className={createButton}
              onClick={() => setView({ kind: 'edit', linkId: null, type: 'one_off' })}
            >
              <CalendarRange aria-hidden className="size-4" /> Créer un lien ponctuel
            </button>
          </div>
          {links.isPending ? (
            <p className="text-sm text-muted-foreground">Chargement des liens…</p>
          ) : links.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Les liens n’ont pas pu être chargés.
            </p>
          ) : links.data.length === 0 ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Aucun lien pour l’instant. Un lien récurrent sert à tout le monde (entretiens,
              permanences) ; un lien ponctuel, à un rendez-vous précis.
            </p>
          ) : (
            <ul aria-label="Mes liens" className="grid gap-1">
              {links.data.map((link) => (
                <LinkItem
                  key={link.id}
                  workspaceId={workspaceId}
                  link={link}
                  onEdit={() => setView({ kind: 'edit', linkId: link.id, type: link.type })}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </SidePanel>
  )
}

/** Ce qui empêche de réserver, en un mot. */
function statusLabel(link: SchedulingLink): string | null {
  if (link.status === 'disabled') return 'Désactivé'
  if (link.status === 'consumed') return 'Déjà réservé'
  if (link.unavailable_reason) return 'Expiré'
  return null
}

function LinkItem({
  workspaceId,
  link,
  onEdit,
}: {
  workspaceId: string
  link: SchedulingLink
  onEdit: () => void
}) {
  const { update, duplicate, remove } = useLinkMutations(workspaceId)
  const [confirm, setConfirm] = useState(false)
  const status = statusLabel(link)
  const meta = [
    minutesLabel(link.duration_minutes),
    link.type === 'recurring'
      ? 'récurrent'
      : link.single_use
        ? 'ponctuel, usage unique'
        : 'ponctuel',
    link.upcoming_count > 0
      ? `${link.upcoming_count} rendez-vous à venir`
      : 'aucun rendez-vous à venir',
  ].join(' · ')

  return (
    <li
      aria-label={link.title}
      className="group/link flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
    >
      <button type="button" onClick={onEdit} className="grid min-w-0 flex-1 text-left">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{link.title}</span>
          {status && (
            <span className="shrink-0 rounded-sm bg-muted px-1.5 text-xs text-muted-foreground">
              {status}
            </span>
          )}
        </span>
        <span className="truncate text-xs text-muted-foreground">{meta}</span>
      </button>
      <button
        type="button"
        aria-label={`Copier le lien ${link.title}`}
        title="Copier le lien"
        onClick={() => void copyLink(link.url)}
        className="flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent touch:size-10"
      >
        <Link2 aria-hidden className="size-4" />
      </button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options du lien ${link.title}`}
            className="flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent touch:size-10"
          >
            <Ellipsis aria-hidden className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuItem onSelect={() => setTimeout(onEdit, 0)}>
            <Pencil aria-hidden /> Modifier
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyLink(link.url)}>
            <Copy aria-hidden /> Copier le lien
          </DropdownMenuItem>
          {link.status === 'active' ? (
            <DropdownMenuItem
              onSelect={() => update.mutate({ id: link.id, input: { status: 'disabled' } })}
            >
              <Pause aria-hidden /> Désactiver
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => update.mutate({ id: link.id, input: { status: 'active' } })}
            >
              <Play aria-hidden /> Réactiver
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => duplicate.mutate(link.id)}>
            <CopyPlus aria-hidden /> Dupliquer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 aria-hidden /> Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le lien « {link.title} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Plus personne ne pourra réserver par ce lien. Les rendez-vous déjà pris restent
              valables, dans votre Agenda comme chez vos invités.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate(link.id)}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
