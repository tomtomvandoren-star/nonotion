import { profileSchema, sessionSchema } from '@nonotion/shared'
import { z } from 'zod'
import { apiGet, apiRequest } from './client'

const messageSchema = z.object({ message: z.string() })
const okSchema = z.object({ status: z.literal('ok') })

export const fetchProfile = () => apiGet('auth/me', profileSchema)

export const login = (email: string, password: string) =>
  apiRequest('POST', 'auth/login', sessionSchema, { email, password, device_name: 'web' })

export const register = (input: {
  name: string
  email: string
  password: string
  password_confirmation: string
}) => apiRequest('POST', 'auth/register', sessionSchema, { ...input, device_name: 'web' })

export const logout = () => apiRequest('POST', 'auth/logout', okSchema)

export const forgotPassword = (email: string) =>
  apiRequest('POST', 'auth/forgot-password', messageSchema, { email })

export const resetPassword = (input: {
  token: string
  email: string
  password: string
  password_confirmation: string
}) => apiRequest('POST', 'auth/reset-password', messageSchema, input)
