import { RotateCcw, Trash2 } from 'lucide-react'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { displayTitle } from '@/features/pages/displayTitle'
import { PageGlyph } from '@/features/pages/PageGlyph'
import { useDeletePermanently, useRestorePage, useTrash } from '@/features/pages/queries'

const dateFormat = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'medium', timeStyle: 'short' })

/** Corbeille (spec 6.13) : restauration en un clic ; la purge définitive a lieu après 30 jours. */
export function TrashPanel({ trigger }: { trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const trash = useTrash(open)
  const restore = useRestorePage()
  const deletePermanently = useDeletePermanently()
  const [confirming, setConfirming] = useState<{ id: string; title: string } | null>(null)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-80 p-2">
          <p className="px-2 pt-1 pb-2 text-xs text-muted-foreground">
            Les pages restent ici 30 jours, puis sont supprimées définitivement.
          </p>
          {trash.isPending && (
            <p className="px-2 py-3 text-sm text-muted-foreground">Chargement…</p>
          )}
          {trash.data?.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">La corbeille est vide.</p>
          )}
          <ul className="max-h-80 overflow-y-auto" aria-label="Pages à la corbeille">
            {trash.data?.map((item) => (
              <li
                key={item.id}
                className="group/trash flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent"
              >
                <PageGlyph icon={item.icon} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{displayTitle(item.title)}</p>
                  <p className="text-xs text-muted-foreground">
                    {dateFormat.format(new Date(item.deleted_at))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => restore.mutate(item.id)}
                  aria-label={`Restaurer ${displayTitle(item.title)}`}
                  className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground touch:size-10"
                >
                  <RotateCcw aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming({ id: item.id, title: displayTitle(item.title) })}
                  aria-label={`Supprimer définitivement ${displayTitle(item.title)}`}
                  className="flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-destructive touch:size-10"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>

      <AlertDialog open={confirming !== null} onOpenChange={(next) => !next && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement « {confirming?.title} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              La page et ses sous-pages seront effacées pour de bon. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => confirming && deletePermanently.mutate(confirming.id)}
            >
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
