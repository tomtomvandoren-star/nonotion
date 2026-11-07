import {
  type Agenda,
  type CalendarAccount,
  OPTION_COLOR_LABELS,
  OPTION_COLORS,
  type OptionColor,
} from '@nonotion/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CalendarSearch, Check, Ellipsis, ExternalLink, Plus, Unplug } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { calendarError, plural } from '@/features/databases/calendar/calendarQueries'
import { SourceItem } from '@/features/databases/calendar/MyCalendars'
import { SourceBadge } from '@/features/databases/calendar/SourceBadge'
import { OptionPill } from '@/features/databases/propertyDisplay'
import { connectGoogle, disconnectAccount } from '@/lib/api/calendars'
import { useInstantValue } from '@/lib/useInstantValue'
import { cn } from '@/lib/utils'
import { platform } from '@/platform'
import { agendaKey, useUpdateAgenda } from './queries'

const heading = 'px-1 pb-1 text-xs font-medium text-muted-foreground'

const linkButton =
  'mt-0.5 flex h-8 w-full items-center gap-1.5 rounded-sm px-1 text-left text-muted-foreground hover:bg-accent touch:h-10'

/**
 * « Mes agendas » de l'Agenda (spec 6.15), à gauche de la grille : les bases Nonotion (afficher,
 * couleur, base des nouveaux éléments), les agendas abonnés par lien (ceux de 6.9, à l'échelle de
 * l'espace de travail) et les comptes Google et iCloud connectés, avec leurs agendas. Chacun avec
 * sa case et sa pastille de couleur.
 */
export function AgendaCalendars({
  workspaceId,
  agenda,
  onImport,
  onConnectICloud,
  onAccountCalendars,
}: {
  workspaceId: string
  agenda: Agenda
  onImport: () => void
  onConnectICloud: () => void
  onAccountCalendars: (account: CalendarAccount) => void
}) {
  const update = useUpdateAgenda(workspaceId)
  const { settings } = agenda
  const bases = agenda.databases.filter((base) => !base.imported_only)
  const toggle = (list: readonly string[], id: string, visible: boolean) =>
    visible ? list.filter((item) => item !== id) : [...list, id]
  const sourceItem = (source: Agenda['sources'][number]) => (
    <SourceItem
      key={source.id}
      source={source}
      visible={!settings.hidden_sources.includes(source.id)}
      onToggle={(visible) =>
        update.mutate({ hidden_sources: toggle(settings.hidden_sources, source.id, visible) })
      }
    />
  )
  const google = useMutation({
    mutationFn: () => connectGoogle(workspaceId),
    onSuccess: ({ url }) => {
      // Sur le web, la page de Google remplace l'Agenda, puis y revient. Dans l'application, elle
      // s'ouvre dans le navigateur ; l'Agenda montre le compte au retour dans l'application.
      if (platform.kind === 'web') window.location.assign(url)
      else
        void platform
          .openExternal(url)
          .then(() => toast('Terminez la connexion dans votre navigateur, puis revenez ici.'))
    },
    onError: (error) => toast.error(calendarError(error)),
  })

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
          {agenda.sources.filter((source) => source.kind === 'ics').map(sourceItem)}
        </ul>
        <button type="button" onClick={onImport} className={linkButton}>
          <Plus aria-hidden className="size-4" /> Ajouter un agenda (ICS)
        </button>
      </section>

      <section aria-label="Comptes connectés">
        <h2 className={heading}>Comptes connectés</h2>
        <ul className="grid gap-2">
          {agenda.accounts.map((account) => (
            <AccountItem
              key={account.id}
              workspaceId={workspaceId}
              account={account}
              onCalendars={() => onAccountCalendars(account)}
            >
              {agenda.sources.filter((source) => source.account_id === account.id).map(sourceItem)}
            </AccountItem>
          ))}
        </ul>
        {agenda.google_available && (
          <button
            type="button"
            disabled={google.isPending}
            onClick={() => google.mutate()}
            className={linkButton}
          >
            <SourceBadge source={{ kind: 'google', label: 'Google' }} className="size-4" />
            {google.isPending ? 'Ouverture de Google…' : 'Connecter Google Agenda'}
          </button>
        )}
        <button type="button" onClick={onConnectICloud} className={linkButton}>
          <SourceBadge source={{ kind: 'icloud', label: 'iCloud' }} className="size-4" />
          Connecter iCloud
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
  const [shown, setShown] = useInstantValue(visible)
  return (
    <li
      aria-label={title}
      className="group/base flex items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-accent/50"
    >
      <input
        type="checkbox"
        aria-label={`Afficher ${title}`}
        checked={shown}
        onChange={(event) => {
          setShown(event.target.checked)
          onToggle(event.target.checked)
        }}
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

/** Un compte connecté : son adresse, son état, ses agendas, et son menu (agendas, déconnexion). */
function AccountItem({
  workspaceId,
  account,
  onCalendars,
  children,
}: {
  workspaceId: string
  account: CalendarAccount
  onCalendars: () => void
  children: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const provider = account.provider === 'google' ? 'Google Agenda' : 'iCloud'
  const disconnect = useMutation({
    mutationFn: () => disconnectAccount(account.id),
    onSuccess: ({ moved_to_trash }) => {
      void queryClient.invalidateQueries({ queryKey: agendaKey(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: ['database'] })
      toast.success(
        moved_to_trash > 0
          ? `${provider} déconnecté : ${plural(moved_to_trash, 'événement')} à la corbeille.`
          : `${provider} déconnecté.`,
      )
    },
    onError: () => toast.error('Le compte n’a pas pu être déconnecté.'),
  })

  return (
    <li aria-label={`${provider} · ${account.account_email}`} className="group/account">
      <div className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-accent/50">
        <SourceBadge source={{ kind: account.provider, label: provider }} className="size-4" />
        <span className="min-w-0 flex-1 truncate" title={account.account_email}>
          {account.account_email}
        </span>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Options du compte ${account.account_email}`}
              className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover/account:opacity-100 hover:bg-accent focus-visible:opacity-100 data-[state=open]:opacity-100 touch:opacity-100"
            >
              <Ellipsis aria-hidden className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <DropdownMenuItem onSelect={() => setTimeout(onCalendars, 0)}>
              <CalendarSearch aria-hidden /> Choisir les agendas…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
              <Unplug aria-hidden /> Déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {account.status === 'error' && (
        <p role="alert" className="px-1 text-xs text-destructive">
          {account.error_message ?? 'La synchronisation a échoué.'}
        </p>
      )}
      <ul className="grid gap-1 pt-0.5 pl-3">{children}</ul>
      <button type="button" onClick={onCalendars} className={cn(linkButton, 'pl-4')}>
        <Plus aria-hidden className="size-4" /> Ajouter un agenda de ce compte
      </button>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Déconnecter {account.account_email} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ses agendas quittent Nonotion et leurs événements vont à la corbeille (30 jours pour
              les récupérer). Rien n’est effacé dans {provider}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => disconnect.mutate()}>
              Déconnecter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
