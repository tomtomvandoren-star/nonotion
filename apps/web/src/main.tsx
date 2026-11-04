import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ApiError, setUnauthorizedHandler } from '@/lib/api/client'
import { endSession, restoreSession } from '@/lib/session'
import { router } from './router'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Pas de nouvel essai sur une erreur du client (401, 404…) : ce ne serait pas plus juste la 2e fois.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      refetchOnWindowFocus: true,
    },
  },
})

// Jeton refusé (révoqué, mot de passe changé ailleurs…) : retour à la connexion.
setUnauthorizedHandler(() => {
  void endSession().then(() => {
    queryClient.clear()
    void router.navigate({ to: '/login' })
  })
})

const root = document.getElementById('root')
if (!root) throw new Error('Élément #root introuvable dans index.html')

void restoreSession().then(() => {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
})
