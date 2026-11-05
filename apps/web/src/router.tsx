import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
} from '@tanstack/react-router'
import { z } from 'zod'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from '@/features/auth/AuthPages'
import { HomePage } from '@/features/home/HomePage'
import { AppLayout } from '@/features/layout/AppLayout'
import { UpdateNotifier } from '@/features/layout/UpdateNotifier'
import { PageView } from '@/features/page/PageView'
import { getToken } from '@/lib/session'

const rootRoute = createRootRoute({
  component: () => (
    <TooltipProvider delayDuration={400}>
      <Outlet />
      <Toaster position="bottom-center" />
      <UpdateNotifier />
    </TooltipProvider>
  ),
  notFoundComponent: () => (
    <div className="mx-auto mt-24 max-w-[700px] px-4 text-center">
      <p className="text-lg font-medium">Cette adresse ne mène nulle part.</p>
      <Link to="/" className="mt-2 inline-block text-sm text-primary hover:underline">
        Revenir à l’accueil
      </Link>
    </div>
  ),
})

/** Écrans de connexion : inutiles si l'on est déjà connecté. */
const guestRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'guest',
  beforeLoad: () => {
    if (getToken()) throw redirect({ to: '/' })
  },
})

const loginRoute = createRoute({
  getParentRoute: () => guestRoute,
  path: '/login',
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: function Login() {
    const { redirect: target } = loginRoute.useSearch()
    return <LoginPage redirect={target} />
  },
})

const registerRoute = createRoute({
  getParentRoute: () => guestRoute,
  path: '/register',
  component: RegisterPage,
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => guestRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => guestRoute,
  path: '/reset-password',
  validateSearch: z.object({ token: z.string().catch(''), email: z.string().catch('') }),
  component: function ResetPassword() {
    const { token, email } = resetPasswordRoute.useSearch()
    return <ResetPasswordPage token={token} email={email} />
  },
})

/** L'application : réservée aux utilisateurs connectés. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: ({ location }) => {
    if (!getToken()) throw redirect({ to: '/login', search: { redirect: location.href } })
  },
  component: AppLayout,
})

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: HomePage,
})

const pageRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/p/$pageId',
  component: function Page() {
    const { pageId } = pageRoute.useParams()
    return <PageView pageId={pageId} />
  },
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    guestRoute.addChildren([loginRoute, registerRoute, forgotPasswordRoute, resetPasswordRoute]),
    appRoute.addChildren([homeRoute, pageRoute]),
  ]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
