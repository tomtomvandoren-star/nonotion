import { generateKeyBetween } from 'fractional-indexing'

/**
 * Clé d'ordre entre deux voisines (null = début ou fin de liste), pour insérer
 * sans renuméroter (spec 6.1). Même algorithme que App\Support\FractionalIndex côté API.
 *
 * Deux voisines peuvent porter la même clé (créations simultanées sur deux appareils) :
 * on se place alors juste après, l'égalité étant départagée par l'identifiant.
 */
export function positionBetween(before: string | null, after: string | null): string {
  if (before !== null && before === after) {
    return generateKeyBetween(before, null)
  }
  return generateKeyBetween(before, after)
}

/** Comparaison octet par octet, comme la collation utf8mb4_bin de la colonne `position`. */
export function comparePositions(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
