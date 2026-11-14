/** Les 32 caractères de Crockford, en minuscules comme les identifiants de Laravel. */
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/**
 * Un identifiant ULID choisi sur l'appareil, pour un objet créé hors ligne (spec 6.16) : 10
 * caractères pour l'heure (ils se trient dans l'ordre de création), 16 au hasard.
 */
export function newId(now = Date.now()): string {
  let time = ''
  for (let i = 0, t = now; i < 10; i++, t = Math.floor(t / 32)) time = ALPHABET[t % 32] + time
  const random = crypto.getRandomValues(new Uint8Array(16))
  let rest = ''
  for (const byte of random) rest += ALPHABET[byte % 32]
  return time + rest
}
