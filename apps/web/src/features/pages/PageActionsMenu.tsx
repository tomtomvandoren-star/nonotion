import { useNavigate, useParams } from '@tanstack/react-router'
import { Copy, CornerUpRight, PencilLine, Star, StarOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MovePageDialog } from './MovePageDialog'
import { useDuplicatePage, useTrashPage, useTree, useUpdatePage } from './queries'

/**
 * Menu « ⋯ » d'une page (spec 6.1) : renommer, dupliquer, favori, déplacer, supprimer.
 * Le même menu sert à la ligne de la barre latérale et à la barre du haut.
 */
export function PageActionsMenu({
  pageId,
  trigger,
  onRename,
  align = 'start',
}: {
  pageId: string
  trigger: React.ReactNode
  /** Absent : l'entrée « Renommer » n'est pas proposée (dans la page, on renomme dans le titre). */
  onRename?: () => void
  align?: 'start' | 'end'
}) {
  const tree = useTree()
  const updatePage = useUpdatePage()
  const duplicatePage = useDuplicatePage()
  const trashPage = useTrashPage()
  const navigate = useNavigate()
  const currentPageId = useParams({ strict: false }).pageId
  const [moving, setMoving] = useState(false)

  const page = tree.data?.find((item) => item.id === pageId)
  const isFavorite = page?.is_favorite ?? false

  const trash = () => {
    trashPage.mutate(pageId)
    if (currentPageId === pageId) void navigate({ to: '/' })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56">
          {onRename && (
            <DropdownMenuItem onSelect={onRename}>
              <PencilLine /> Renommer
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => updatePage.mutate({ pageId, patch: { is_favorite: !isFavorite } })}
          >
            {isFavorite ? <StarOff /> : <Star />}
            {isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => duplicatePage.mutate(pageId)}>
            <Copy /> Dupliquer
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMoving(true)}>
            <CornerUpRight /> Déplacer vers…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={trash}>
            <Trash2 /> Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MovePageDialog pageId={pageId} open={moving} onOpenChange={setMoving} />
    </>
  )
}
