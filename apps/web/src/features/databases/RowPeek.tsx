import { useNavigate } from '@tanstack/react-router'
import { Maximize2, X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { PageView } from '@/features/page/PageView'

/** Échap ferme l'aperçu, sauf pendant une saisie (champ, éditeur) où il sert à autre chose. */
function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
      if (event.key === 'Escape' && !event.defaultPrevented && !typing) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])
}

/**
 * Une ligne ouverte (spec 6.4, « ligne = page ») : en aperçu à droite ou au centre, selon la vue.
 * C'est la page elle-même : propriétés en grille en haut, puis le corps en blocs.
 */
export function RowPeek({
  rowId,
  mode,
  onClose,
}: {
  rowId: string
  mode: 'side' | 'center'
  onClose: () => void
}) {
  const navigate = useNavigate()
  useEscape(onClose)

  const actions = (
    <div className="flex items-center gap-1 px-3 py-2">
      <button
        type="button"
        onClick={() => void navigate({ to: '/p/$pageId', params: { pageId: rowId } })}
        className="flex h-7 items-center gap-1.5 rounded-sm px-2 text-sm text-muted-foreground hover:bg-accent"
      >
        <Maximize2 aria-hidden className="size-4" /> Ouvrir en pleine page
      </button>
      <button
        type="button"
        aria-label="Fermer l’aperçu"
        onClick={onClose}
        className="ml-auto flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )

  if (mode === 'center')
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[85dvh] max-w-3xl flex-col gap-0 p-0 sm:max-w-3xl"
        >
          <DialogTitle className="sr-only">Aperçu de la page</DialogTitle>
          {actions}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PageView pageId={rowId} variant="peek" />
          </div>
        </DialogContent>
      </Dialog>
    )

  return createPortal(
    <aside
      role="dialog"
      aria-label="Aperçu de la page"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[min(720px,100vw)] flex-col border-l border-border bg-background shadow-xl"
    >
      {actions}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PageView pageId={rowId} variant="peek" />
      </div>
    </aside>,
    document.body,
  )
}
