import { X } from 'lucide-react'
import { useState } from 'react'
import { SidePanel } from '@/features/layout/SidePanel'
import { useShareMutations, useShares } from '@/features/scheduling/queries'
import { ApiError } from '@/lib/api/client'

/**
 * « Qui peut voir mes disponibilités » (spec 6.17, 2.3) : un consentement explicite, par adresse
 * e-mail. Ces personnes voient des blocs « Occupé » seulement, jamais un titre ni un détail.
 */
export function SharesPanel({ onClose }: { onClose: () => void }) {
  const shares = useShares(true)
  const { add, remove } = useShareMutations()
  const [email, setEmail] = useState('')
  const error =
    add.error instanceof ApiError
      ? (add.error.fieldError('email') ?? add.error.message)
      : add.error
        ? 'L’adresse n’a pas pu être ajoutée.'
        : null

  return (
    <SidePanel
      label="Qui peut voir mes disponibilités"
      className="max-w-[min(480px,100vw)]"
      onClose={onClose}
    >
      <div className="grid gap-4 px-5 pb-8 text-sm">
        <header className="grid gap-1">
          <h2 className="text-lg font-semibold">Qui peut voir mes disponibilités</h2>
          <p className="text-muted-foreground">
            Ces personnes, avec leur compte Nonotion, peuvent afficher vos disponibilités dans leur
            Agenda : des blocs « Occupé » seulement, jamais le titre ni le détail de vos événements.
          </p>
        </header>
        <form
          className="grid gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            if (email.trim())
              add.mutate(email.trim(), {
                onSuccess: () => setEmail(''),
              })
          }}
        >
          <div className="flex gap-2">
            <input
              type="email"
              aria-label="Adresse e-mail"
              placeholder="adresse@exemple.be"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 outline-none focus-visible:border-primary touch:h-11"
            />
            <button
              type="submit"
              disabled={add.isPending || !email.trim()}
              className="h-9 rounded-md bg-primary px-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 touch:h-11"
            >
              Autoriser
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </form>
        {shares.isPending ? (
          <p className="text-muted-foreground">Chargement…</p>
        ) : (shares.data ?? []).length === 0 ? (
          <p className="text-muted-foreground">Personne pour l’instant.</p>
        ) : (
          <ul aria-label="Personnes autorisées" className="grid gap-0.5">
            {shares.data!.map((share) => (
              <li
                key={share.id}
                className="flex items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-accent/50"
              >
                <span className="min-w-0 flex-1 truncate">{share.email}</span>
                <button
                  type="button"
                  aria-label={`Retirer ${share.email}`}
                  onClick={() => remove.mutate(share.id)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent touch:size-10"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SidePanel>
  )
}
