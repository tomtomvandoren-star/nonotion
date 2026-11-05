import { useNavigate } from '@tanstack/react-router'
import { Maximize2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { SidePanel } from '@/features/layout/SidePanel'
import { PageView } from '@/features/page/PageView'

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

  const openFullPage = (
    <button
      type="button"
      onClick={() => void navigate({ to: '/p/$pageId', params: { pageId: rowId } })}
      className="flex h-7 items-center gap-1.5 rounded-sm px-2 text-sm text-muted-foreground hover:bg-accent"
    >
      <Maximize2 aria-hidden className="size-4" /> Ouvrir en pleine page
    </button>
  )

  if (mode === 'center')
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[85dvh] max-w-3xl flex-col gap-0 p-0 sm:max-w-3xl"
        >
          <DialogTitle className="sr-only">Aperçu de la page</DialogTitle>
          <div className="flex items-center gap-1 px-3 py-2">
            {openFullPage}
            <button
              type="button"
              aria-label="Fermer l’aperçu"
              onClick={onClose}
              className="ml-auto flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PageView pageId={rowId} variant="peek" />
          </div>
        </DialogContent>
      </Dialog>
    )

  return (
    <SidePanel
      label="Aperçu de la page"
      actions={openFullPage}
      closeLabel="Fermer l’aperçu"
      escapeInFields={false}
      onClose={onClose}
    >
      <PageView pageId={rowId} variant="peek" />
    </SidePanel>
  )
}
