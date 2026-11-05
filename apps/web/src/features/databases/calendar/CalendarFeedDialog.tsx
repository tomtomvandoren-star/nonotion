import type { DatabaseDetail } from '@nonotion/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Link2Off } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createFeed, deleteFeed } from '@/lib/api/databases'
import { platform } from '@/platform'
import { databaseKey } from '../queries'

const button =
  'flex h-9 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-accent'

/**
 * Afficher la base dans Google Agenda ou le Calendrier Apple : un lien d'abonnement secret (ICS)
 * que ces agendas relisent d'eux-mêmes. Sans compte à connecter : l'agenda va chercher le lien.
 */
export function CalendarFeedDialog({
  database,
  open,
  onOpenChange,
}: {
  database: DatabaseDetail
  open: boolean
  onOpenChange: (open: boolean) => void
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
    onError: () => toast.error('Le lien n’a pas pu être créé.'),
  })
  const remove = useMutation({
    mutationFn: () => deleteFeed(database.id),
    onSuccess: () => {
      setFeed(null)
      setConfirmOff(false)
      toast.success('Lien désactivé : les agendas abonnés ne recevront plus rien.')
    },
  })

  const url = database.feed_url ?? null
  const webcal = url?.replace(/^https?:/, 'webcal:')
  const google = webcal
    ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Afficher dans votre agenda</DialogTitle>
          <DialogDescription>
            Les éléments datés de « {database.title || 'Sans titre'} » apparaissent dans Google
            Agenda ou le Calendrier Apple, et suivent leurs changements. Les agendas importés ici
            n’y sont pas repris.
          </DialogDescription>
        </DialogHeader>

        {!url ? (
          <button
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate()}
            className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {create.isPending ? 'Création du lien…' : 'Créer le lien d’abonnement'}
          </button>
        ) : (
          <div className="grid gap-2">
            <input
              readOnly
              aria-label="Lien d’abonnement"
              value={url}
              onFocus={(event) => event.target.select()}
              className="h-9 w-full min-w-0 rounded-md border border-border bg-muted/40 px-2 font-mono text-xs"
            />
            <button type="button" onClick={() => platform.openExternal(google!)} className={button}>
              Ajouter à Google Agenda
            </button>
            <button type="button" onClick={() => platform.openExternal(webcal!)} className={button}>
              Ajouter au Calendrier Apple
            </button>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(url)
                  .then(() =>
                    toast.success(
                      'Lien copié (Outlook, Thunderbird… : « S’abonner à un calendrier »).',
                    ),
                  )
              }
              className={button}
            >
              <Copy aria-hidden className="size-4" /> Copier le lien
            </button>
            <p className="text-xs text-muted-foreground">
              Google Agenda relit les agendas abonnés à son rythme (souvent toutes les 8 à 24 h) ;
              le Calendrier Apple, selon son réglage (jusqu’à toutes les 5 minutes). Ce lien est
              secret : quiconque le connaît voit ces éléments.
            </p>
            {confirmOff ? (
              <div className="flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm">
                <span>Les agendas abonnés ne recevront plus rien.</span>
                <button
                  type="button"
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
      </DialogContent>
    </Dialog>
  )
}
