// Les icônes des applications mobiles, depuis celles que Tauri tire de apps/desktop/app-icon.svg
// (`pnpm --filter @nonotion/desktop icons` d'abord) : les PNG d'Android pour les versions sans
// icône adaptative (7.x), l'icône d'iOS. L'icône adaptative d'Android est dessinée à la main
// (res/drawable/ic_launcher_foreground.xml), car celle de Tauri remplit toute la zone et serait
// rognée par le masque du téléphone.
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tauri = join(root, '../desktop/src-tauri/icons')
if (!existsSync(join(tauri, 'ios'))) {
  console.error('Lancer d’abord : pnpm --filter @nonotion/desktop icons')
  process.exit(1)
}

const res = join(root, 'android/app/src/main/res')
for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    copyFileSync(
      join(tauri, 'android', `mipmap-${density}`, name),
      join(res, `mipmap-${density}`, name),
    )
  }
  rmSync(join(res, `mipmap-${density}`, 'ic_launcher_foreground.png'), { force: true })
}

copyFileSync(
  join(tauri, 'ios/AppIcon-512@2x.png'),
  join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'),
)
console.log('Icônes Android et iOS à jour.')
