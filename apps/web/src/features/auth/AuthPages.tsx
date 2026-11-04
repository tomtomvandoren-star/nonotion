import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { queryKeys } from '@/features/pages/queries'
import { forgotPassword, login, register, resetPassword } from '@/lib/api/auth'
import { ApiError } from '@/lib/api/client'
import { startSession } from '@/lib/session'
import { AuthCard, Field, FormError, SubmitButton } from './AuthForm'

const errorOf = (error: unknown, field: string) =>
  error instanceof ApiError ? error.fieldError(field) : undefined

/** Message général : erreurs hors champ (inscriptions fermées, réseau…). */
function generalError(error: unknown, fields: string[]): string | undefined {
  if (!error) return undefined
  if (error instanceof ApiError) {
    if (fields.some((field) => error.fieldError(field))) return undefined
    return error.status >= 500
      ? 'Le serveur ne répond pas. Réessayez dans un instant.'
      : error.message
  }
  return 'Connexion au serveur impossible. Vérifiez votre réseau.'
}

function useSessionStart() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return async (session: Awaited<ReturnType<typeof login>>, redirect?: string) => {
    await startSession(session.token)
    queryClient.setQueryData(queryKeys.profile, {
      user: session.user,
      workspaces: session.workspaces,
    })
    if (redirect?.startsWith('/') && !redirect.startsWith('//')) void navigate({ to: redirect })
    else void navigate({ to: '/' })
  }
}

export function LoginPage({ redirect }: { redirect?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const begin = useSessionStart()
  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: (session) => begin(session, redirect),
  })

  return (
    <AuthCard
      title="Connexion"
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Créer un compte
          </Link>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => (event.preventDefault(), mutation.mutate())}
        noValidate
      >
        <FormError message={generalError(mutation.error, ['email', 'password'])} />
        <Field
          label="Adresse e-mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errorOf(mutation.error, 'email')}
          autoFocus
        />
        <Field
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errorOf(mutation.error, 'password')}
        />
        <SubmitButton pending={mutation.isPending}>Se connecter</SubmitButton>
        <Link
          to="/forgot-password"
          className="justify-self-center text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          Mot de passe oublié ?
        </Link>
      </form>
    </AuthCard>
  )
}

export function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', password_confirmation: '' })
  const begin = useSessionStart()
  const mutation = useMutation({
    mutationFn: () => register(form),
    onSuccess: (session) => begin(session),
  })
  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }))

  return (
    <AuthCard
      title="Créer un compte"
      footer={
        <>
          Déjà un compte ?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => (event.preventDefault(), mutation.mutate())}
        noValidate
      >
        <FormError message={generalError(mutation.error, ['name', 'email', 'password'])} />
        <Field
          label="Nom"
          autoComplete="name"
          required
          value={form.name}
          onChange={set('name')}
          error={errorOf(mutation.error, 'name')}
          autoFocus
        />
        <Field
          label="Adresse e-mail"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={set('email')}
          error={errorOf(mutation.error, 'email')}
        />
        <Field
          label="Mot de passe (8 caractères minimum)"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={set('password')}
          error={errorOf(mutation.error, 'password')}
        />
        <Field
          label="Confirmer le mot de passe"
          type="password"
          autoComplete="new-password"
          required
          value={form.password_confirmation}
          onChange={set('password_confirmation')}
        />
        <SubmitButton pending={mutation.isPending}>Créer mon compte</SubmitButton>
      </form>
    </AuthCard>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const mutation = useMutation({ mutationFn: () => forgotPassword(email) })

  return (
    <AuthCard
      title="Mot de passe oublié"
      footer={
        <Link to="/login" className="font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
      }
    >
      {mutation.isSuccess ? (
        <p role="status" className="text-sm">
          {mutation.data.message}
        </p>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(event) => (event.preventDefault(), mutation.mutate())}
          noValidate
        >
          <p className="text-sm text-muted-foreground">
            Indiquez votre adresse : vous recevrez un lien pour choisir un nouveau mot de passe.
          </p>
          <FormError message={generalError(mutation.error, ['email'])} />
          <Field
            label="Adresse e-mail"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errorOf(mutation.error, 'email')}
            autoFocus
          />
          <SubmitButton pending={mutation.isPending}>Envoyer le lien</SubmitButton>
        </form>
      )}
    </AuthCard>
  )
}

export function ResetPasswordPage({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const navigate = useNavigate()
  const mutation = useMutation({
    mutationFn: () =>
      resetPassword({ token, email, password, password_confirmation: confirmation }),
    onSuccess: (result) => {
      toast.success(result.message)
      void navigate({ to: '/login' })
    },
  })

  return (
    <AuthCard title="Nouveau mot de passe">
      <form
        className="grid gap-4"
        onSubmit={(event) => (event.preventDefault(), mutation.mutate())}
        noValidate
      >
        <p className="text-sm text-muted-foreground">Pour le compte {email}.</p>
        <FormError
          message={
            errorOf(mutation.error, 'email') ?? generalError(mutation.error, ['password', 'email'])
          }
        />
        <Field
          label="Nouveau mot de passe (8 caractères minimum)"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errorOf(mutation.error, 'password')}
          autoFocus
        />
        <Field
          label="Confirmer le mot de passe"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
        <SubmitButton pending={mutation.isPending}>Enregistrer le mot de passe</SubmitButton>
      </form>
    </AuthCard>
  )
}
