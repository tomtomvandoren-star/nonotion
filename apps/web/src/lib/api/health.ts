import { healthResponseSchema } from '@nonotion/shared'
import { apiGet } from './client'

export const fetchHealth = () => apiGet('health', healthResponseSchema)
