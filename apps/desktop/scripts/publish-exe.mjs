/**
 * Copy the Tauri release executable and NSIS installer to the monorepo root
 * so the entry point lives at E:\trea\grok桌面版 (or the repo root).
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(__dirname, '..')
const repoRoot = resolve(desktopRoot, '..', '..')
const releaseDir = join(desktopRoot, 'src-tauri', 'target', 'release')
const sourceExe = join(releaseDir, 'grok-forge-desktop.exe')

if (!existsSync(sourceExe)) {
  console.error(`[publish-exe] Missing release binary:\n  ${sourceExe}`)
  console.error('Run `npm run desktop:build` first.')
  process.exit(1)
}

const entryName = 'Grok Forge.exe'
const entryPath = join(repoRoot, entryName)
const aliasPath = join(repoRoot, 'grok-forge-desktop.exe')
const distDir = join(repoRoot, 'dist')

copyFileSync(sourceExe, entryPath)
copyFileSync(sourceExe, aliasPath)

const mb = (path) => `${(statSync(path).size / (1024 * 1024)).toFixed(2)} MB`
console.log(`[publish-exe] Entry: ${entryPath} (${mb(entryPath)})`)
console.log(`[publish-exe] Alias: ${aliasPath} (${mb(aliasPath)})`)

const nsisDir = join(releaseDir, 'bundle', 'nsis')
if (existsSync(nsisDir)) {
  mkdirSync(distDir, { recursive: true })
  const { readdirSync } = await import('node:fs')
  for (const name of readdirSync(nsisDir)) {
    if (!name.toLowerCase().endsWith('.exe')) continue
    const from = join(nsisDir, name)
    const to = join(distDir, name)
    copyFileSync(from, to)
    console.log(`[publish-exe] Installer: ${to} (${mb(to)})`)
  }
}

console.log('[publish-exe] Done. Double-click "Grok Forge.exe" in the repo root to launch.')
