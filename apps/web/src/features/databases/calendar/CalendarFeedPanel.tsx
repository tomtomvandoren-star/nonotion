import type { DatabaseDetail } from '@nonotion/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Link2Off } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { SidePanel } from '@/features/layout/SidePanel'
import { createFeed, deleteFeed } from '@/lib/api/databases'
import { platform } from '@/platform'
import { databaseKey } from '../queries'
import { calendarError } from './calendarQueries'

const button =
  'flex h-9 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent touch:h-11'

/** Ouvre un lien hors de l'application ; s'il n'y a rien pour l'ouvrir, on le dit. */
function openOrSay(url: string) {
  platform
    .openExternal(url)
    .catch(() => toast.error('Ce lien ne s’ouvre pas sur cet appareil : copiez-le plutôt.'))
}

/**
 * « Créer un lien ICS » : un lien d'abonnement secret qui publie les éléments datés de la base.
 * Google Agenda, le Calendrier Apple, Outlook… le relisent d'eux-mêmes : aucun compte à connecter.
 * Dans le même panneau à droite que l'aperçu d'une tâche.
 */
export function CalendarFeedPanel({
  database,
  onClose,
}: {
  database: DatabaseDetail
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [confirmOff, setConfirmOff] = useState(false)
  const setFeed = (feed_url: string | null) =>
    queryClient.setQueryData<DatabaseDetail>(databaseKey(database.id), (current) =>
      current ? { ...current, feed_url } : current,
    )
  const create = useMutation({
    mutationFn: () => createFeed(database.id),
    onSuccess: ({ feed_url }) => setFeed(feed_url),
  })
  const remove = useMutation({
    mutationFn: () => deleteFeed(database.id),
    onSuccess: () => {
      setFeed(null)
      setConfirmOff(false)
      toast.success('Lien désactivé : les agendas abonnés ne recevront plus rien.')
    },
    onError: (failure) => toast.error(calendarError(failure)),
  })

  const url = database.feed_url ?? null
  const webcal = url?.replace(/^https?:/, 'webcal:')
  const google = webcal
    ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`
    : null
  const copy = () => {
    if (!url) return
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Lien ICS copié.'))
      .catch(() => toast.error('La copie a échoué : sélectionnez le lien et copiez-le.'))
  }

  return (
    <SidePanel label="Créer un lien ICS" className="max-w-[min(480px,100vw)]" onClose={onClose}>
      <div className="grid gap-4 px-5 pb-8">
        <header className="grid gap-1">
          <h2 className="text-lg font-semibold">Créer un lien ICS</h2>
          <p className="text-sm text-muted-foreground">
            Un lien secret qui publie les éléments datés de « {database.title || 'Sans titre'} » :
            Google Agenda, le Calendrier Apple ou Outlook les affichent et suivent leurs
            changements. Les agendas importés ici n’y sont pas repris.
          </p>
        </header>

        {!url ? (
          <>
            <button
              type="button"
              disabled={create.isPending}
              onClick={() => create.mutate()}
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 touch:h-11"
            >
              {create.isPending ? 'Création du lien…' : 'Créer le lien ICS'}
            </button>
            {create.isError && (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                Le lien n’a pas pu être créé : {calendarError(create.error)}
              </p>
            )}
          </>
        ) : (
          <div className="grid gap-2">
            <label htmlFor="feed-url" className="text-sm font-medium">
              Lien ICS
            </label>
            <input
              id="feed-url"
              readOnly
              value={url}
              onFocus={(event) => event.target.select()}
              className="h-9 w-full min-w-0 rounded-md border border-border bg-muted/40 px-2 font-mono text-xs"
            />
            <button type="button" onClick={copy} className={button}>
              <Copy aria-hidden className="size-4" /> Copier le lien
            </button>
            <button type="button" onClick={() => openOrSay(google!)} className={button}>
              Ajouter à Google Agenda
            </button>
            {/* webcal: n'ouvre le Calendrier Apple que sur Mac, iPhone et iPad. */}
            {platform.isMac ? (
              <button type="button" onClick={() => openOrSay(webcal!)} className={button}>
                Ajouter au Calendrier Apple
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Calendrier Apple : ouvrez Nonotion sur votre iPhone ou votre Mac pour l’y ajouter,
                ou collez le lien dans Réglages → Calendrier → Comptes → Ajouter un compte → Autre →
                Ajouter un calendrier avec abonnement.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Outlook : Ajouter un calendrier → S’abonner à partir du web, puis collez le lien.
              Google Agenda relit les agendas abonnés à son rythme (souvent toutes les 8 à 24 h) ;
              le Calendrier Apple, selon son réglage. Ce lien est secret : quiconque le connaît voit
              ces éléments.
            </p>
            {confirmOff ? (
              <div className="flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm">
                <span>Les agendas abonnés ne recevront plus rien.</span>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                  className="shrink-0 rounded-sm px-2 py-1 font-medium text-destructive hover:bg-destructive/10"
                >
                  Désactiver
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmOff(true)}
                className="flex items-center gap-1.5 justify-self-start rounded-sm px-1 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                <Link2Off aria-hidden className="size-3.5" /> Désactiver le lien
              </button>
            )}
          </div>
        )}
      </div>
    </SidePanel>
  )
}
