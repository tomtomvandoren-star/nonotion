import type { Agenda, CalendarAccount, RemoteCalendar } from '@nonotion/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { calendarError, plural } from '@/features/databases/calendar/calendarQueries'
import { databaseKey } from '@/features/databases/queries'
import { SidePanel } from '@/features/layout/SidePanel'
import { queryKeys } from '@/features/pages/queries'
import { addAccountCalendar, connectICloud, fetchAccountCalendars } from '@/lib/api/calendars'
import { ApiError } from '@/lib/api/client'
import { platform } from '@/platform'
import { nearestColor } from './colors'
import { agendaKey } from './queries'

const field =
  'h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus-visible:border-primary touch:h-11'
const primary =
  'h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 touch:h-11'

/**
 * « Connecter iCloud » (spec 6.15) : Apple n'a pas de connexion directe pour l'agenda ; Nonotion
 * s'y connecte avec l'identifiant Apple et un mot de passe pour application, jamais celui du compte.
 */
export function ICloudPanel({
  workspaceId,
  onConnected,
  onClose,
}: {
  workspaceId: string
  onConnected: (account: CalendarAccount) => void
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const connect = useMutation({
    mutationFn: () => connectICloud(workspaceId, { username: username.trim(), password }),
    onSuccess: (account) => {
      void queryClient.invalidateQueries({ queryKey: agendaKey(workspaceId) })
      toast.success('iCloud est connecté : choisissez les agendas à synchroniser.')
      onConnected(account)
    },
  })
  const error =
    connect.error instanceof ApiError
      ? (connect.error.fieldError('password') ??
        connect.error.fieldError('username') ??
        connect.error.message)
      : connect.error
        ? 'iCloud ne répond pas. Réessayez dans un instant.'
        : null

  return (
    <SidePanel label="Connecter iCloud" className="max-w-[min(480px,100vw)]" onClose={onClose}>
      <form
        className="grid gap-4 px-5 pb-8"
        onSubmit={(event) => {
          event.preventDefault()
          connect.mutate()
        }}
      >
        <header className="grid gap-1">
          <h2 className="text-lg font-semibold">Connecter iCloud</h2>
          <p className="text-sm text-muted-foreground">
            Apple n’a pas de connexion directe pour l’agenda : Nonotion s’y connecte avec votre
            identifiant Apple et un <strong>mot de passe pour application</strong>, jamais celui de
            votre compte. Il reste chiffré sur le serveur, et vous pouvez le révoquer à tout moment
            chez Apple.
          </p>
        </header>
        <ol className="grid list-decimal gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            Sur account.apple.com : Connexion et sécurité → Mots de passe pour les apps (la double
            authentification doit être activée).
          </li>
          <li>Créez-en un nommé « Nonotion », puis collez-le ici.</li>
        </ol>
        <button
          type="button"
          onClick={() =>
            void platform
              .openExternal('https://account.apple.com/account/manage')
              .catch(() => toast.error('Ouvrez account.apple.com dans votre navigateur.'))
          }
          className="flex h-9 items-center justify-center gap-1.5 justify-self-start rounded-md border border-border px-3 text-sm hover:bg-accent"
        >
          <ExternalLink aria-hidden className="size-4" /> Ouvrir account.apple.com
        </button>
        <div className="grid gap-1.5">
          <label htmlFor="icloud-username" className="text-sm font-medium">
            Identifiant Apple
          </label>
          <input
            id="icloud-username"
            type="email"
            required
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className={field}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="icloud-password" className="text-sm font-medium">
            Mot de passe pour application
          </label>
          <input
            id="icloud-password"
            type="password"
            required
            autoComplete="new-password"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={field}
          />
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md px-3 text-sm hover:bg-accent"
          >
            Annuler
          </button>
          <button type="submit" disabled={connect.isPending} className={primary}>
            {connect.isPending ? 'Connexion…' : 'Connecter'}
          </button>
        </div>
      </form>
    </SidePanel>
  )
}

/**
 * Les agendas d'un compte connecté (spec 6.15) : chacun s'ajoute à Nonotion, dans une nouvelle base
 * d'événements (par défaut) ou dans une base existante, puis se synchronise dans les deux sens.
 */
export function AccountCalendarsPanel({
  workspaceId,
  account,
  agenda,
  onClose,
}: {
  workspaceId: string
  account: CalendarAccount
  agenda: Agenda
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const calendars = useQuery({
    queryKey: ['account-calendars', account.id],
    queryFn: () => fetchAccountCalendars(account.id),
  })
  const [destination, setDestination] = useState('new')
  const add = useMutation({
    mutationFn: (calendar: RemoteCalendar) =>
      addAccountCalendar(account.id, {
        remote_id: calendar.id,
        name: calendar.name,
        color: nearestColor(calendar.color),
        ...(destination === 'new' ? { workspace_id: workspaceId } : { database_id: destination }),
      }),
    onSuccess: ({ database, page, imported }, calendar) => {
      queryClient.setQueryData(databaseKey(database.id), database)
      if (page) {
        queryClient.setQueryData(queryKeys.page(page.id), page)
        void queryClient.invalidateQueries({ queryKey: queryKeys.tree(workspaceId) })
      }
      void queryClient.invalidateQueries({ queryKey: agendaKey(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: ['account-calendars', account.id] })
      toast.success(
        `« ${calendar.name} » : ${plural(imported, 'événement')} synchronisé${imported > 1 ? 's' : ''}.`,
      )
    },
  })
  const provider = account.provider === 'google' ? 'Google Agenda' : 'iCloud'

  return (
    <SidePanel label="Agendas du compte" className="max-w-[min(480px,100vw)]" onClose={onClose}>
      <div className="grid gap-4 px-5 pb-8">
        <header className="grid gap-1">
          <h2 className="text-lg font-semibold">Agendas du compte</h2>
          <p className="text-sm text-muted-foreground">
            {provider} · {account.account_email}. Un agenda ajouté se synchronise dans les deux sens
            : ce que vous modifiez dans Nonotion y part, et l’inverse.
          </p>
        </header>
        <div className="grid gap-1.5">
          <label htmlFor="account-destination" className="text-sm font-medium">
            Ranger ses événements dans
          </label>
          <select
            id="account-destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            className={field}
          >
            <option value="new">Une nouvelle base par agenda</option>
            {agenda.databases.map((base) => (
              <option key={base.id} value={base.id}>
                La base « {base.title || 'Sans titre'} »
              </option>
            ))}
          </select>
        </div>
        {calendars.isPending ? (
          <p className="text-sm text-muted-foreground">Lecture des agendas…</p>
        ) : calendars.isError ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {calendarError(calendars.error)}
          </p>
        ) : (
          <ul aria-label="Agendas" className="grid gap-1">
            {calendars.data.map((calendar) => (
              <li
                key={calendar.id}
                aria-label={calendar.name}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: calendar.color ?? 'var(--primary)' }}
                />
                <span className="min-w-0 flex-1 truncate">
                  {calendar.name}
                  {!calendar.writable && (
                    <span className="text-muted-foreground"> · lecture seule</span>
                  )}
                </span>
                {calendar.source_id ? (
                  <span className="text-xs text-muted-foreground">Synchronisé</span>
                ) : (
                  <button
                    type="button"
                    disabled={add.isPending}
                    onClick={() => add.mutate(calendar)}
                    className="h-8 rounded-md border border-border px-2.5 hover:bg-accent disabled:opacity-50"
                  >
                    {add.isPending && add.variables?.id === calendar.id ? 'Ajout…' : 'Ajouter'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {add.isError && (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {calendarError(add.error)}
          </p>
        )}
      </div>
    </SidePanel>
  )
}
