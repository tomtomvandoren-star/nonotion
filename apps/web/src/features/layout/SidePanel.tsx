import { X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * Un panneau à droite de l'écran, par-dessus la page : l'aperçu d'une ligne (spec 6.4), l'import
 * d'un agenda, le lien ICS d'une base. Volontairement simple (ni calque, ni piège à focus) : il
 * s'affiche de la même façon dans tous les navigateurs et dans les applications, et la page reste
 * visible à côté.
 */
export function SidePanel({
  label,
  actions,
  closeLabel = 'Fermer',
  escapeInFields = true,
  className,
  onClose,
  children,
}: {
  /** Le nom du panneau pour les lecteurs d'écran (rôle dialog). */
  label: string
  /** Les boutons à gauche de la croix de fermeture. */
  actions?: React.ReactNode
  closeLabel?: string
  /** Échap ferme aussi pendant une saisie ; pas dans l'aperçu d'une page, où il sert à autre chose. */
  escapeInFields?: boolean
  /** La largeur, entre autres (par défaut 720 px au plus). */
  className?: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      const typing =
        target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
      if (!typing || escapeInFields) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, escapeInFields])

  // À la fermeture, le focus revient là où il était (le bouton qui a ouvert le panneau), s'il existe encore.
  useEffect(() => {
    const before = document.activeElement
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus()
    }
  }, [])

  return createPortal(
    <aside
      role="dialog"
      aria-label={label}
      className={cn(
        'fixed inset-y-0 right-0 z-40 flex w-full max-w-[min(720px,100vw)] flex-col border-l border-border bg-background shadow-xl',
        className,
      )}
    >
      <div className="flex items-center gap-1 px-3 py-2">
        {actions}
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className="ml-auto flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent touch:size-10"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>,
    document.body,
  )
}
