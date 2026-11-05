import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { useUi } from '@/stores/ui'
import { useCreatePage } from './queries'

let titleFocusFor: string | null = null

/** Demande que la page, à son ouverture, ait le curseur dans son titre (page ou ligne de base neuve). */
export function requestTitleFocus(pageId: string) {
  titleFocusFor = pageId
}

/** Une page tout juste créée s'ouvre avec le curseur dans son titre. */
export function consumeTitleFocus(pageId: string): boolean {
  if (titleFocusFor !== pageId) return false
  titleFocusFor = null
  return true
}

/**
 * Crée une page (à la racine, ou sous `parentId`) et l'ouvre, titre en édition :
 * c'est le geste derrière « Nouvelle page », le « + » de la barre latérale et Ctrl+N.
 */
export function useNewPage() {
  const createPage = useCreatePage()
  const navigate = useNavigate()
  const setExpanded = useUi((s) => s.setExpanded)

  return useCallback(
    (parentId: string | null = null) => {
      createPage.mutate(
        { parent_page_id: parentId },
        {
          onSuccess: (page) => {
            if (parentId) setExpanded(parentId, true)
            titleFocusFor = page.id
            void navigate({ to: '/p/$pageId', params: { pageId: page.id } })
          },
        },
      )
    },
    [createPage, navigate, setExpanded],
  )
}
