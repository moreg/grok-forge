/**
 * Persist clipboard / data-URL attachments to the workspace cache so task
 * snapshots can store cheap paths instead of multi-MB base64 blobs.
 *
 * Cache lives under `{workspace}/.grok-forge/` — ensure that path is gitignored
 * (see ensureWorkspaceGrokForgeGitignore).
 */

export const GROK_FORGE_DIR = '.grok-forge'
export const ATTACHMENT_CACHE_DIR = `${GROK_FORGE_DIR}/attachments`
export const ATTACHMENT_CACHE_EXT = '.dataurl'
export const GITIGNORE_ENTRY = '.grok-forge/'

export function joinWorkspacePath(workspacePath: string, ...parts: string[]) {
  const base = workspacePath.replace(/[\\/]+$/, '')
  const sep = workspacePath.includes('\\') ? '\\' : '/'
  return [base, ...parts].join(sep)
}

export function isCachedDataUrlPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  return (
    normalized.includes(`/${ATTACHMENT_CACHE_DIR}/`)
    || normalized.includes(`${ATTACHMENT_CACHE_DIR}/`)
  ) && normalized.endsWith(ATTACHMENT_CACHE_EXT)
}

export function makeAttachmentCachePath(workspacePath: string, id?: string): string {
  const token = id ?? `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return joinWorkspacePath(workspacePath, ATTACHMENT_CACHE_DIR, `${token}${ATTACHMENT_CACHE_EXT}`)
}

/**
 * Ensure the workspace .gitignore lists `.grok-forge/` so attachment blobs
 * are not committed. Best-effort; never throws.
 */
export async function ensureWorkspaceGrokForgeGitignore(
  workspacePath: string,
  writeTextFile: (path: string, content: string) => Promise<void>,
  readTextFile?: (path: string) => Promise<string>,
): Promise<void> {
  const gitignorePath = joinWorkspacePath(workspacePath, '.gitignore')
  let existing = ''
  if (readTextFile) {
    try {
      existing = await readTextFile(gitignorePath)
    } catch {
      existing = ''
    }
  }
  const lines = existing.split(/\r?\n/)
  const already = lines.some((line) => {
    const trimmed = line.trim()
    return trimmed === GITIGNORE_ENTRY || trimmed === '.grok-forge' || trimmed === '.grok-forge/**'
  })
  if (already) return
  const next = existing.trimEnd()
  const body = next.length > 0
    ? `${next}\n\n# Grok Forge local cache (attachments, etc.)\n${GITIGNORE_ENTRY}\n`
    : `# Grok Forge local cache (attachments, etc.)\n${GITIGNORE_ENTRY}\n`
  await writeTextFile(gitignorePath, body)
}

/**
 * If value is a data: URL and a workspace is available, write it to disk and
 * return the cache path. Otherwise return the original value.
 */
export async function persistDataUrlAttachment(
  value: string,
  workspacePath: string | undefined,
  writeTextFile: (path: string, content: string) => Promise<void>,
  readTextFile?: (path: string) => Promise<string>,
): Promise<string> {
  if (!value.startsWith('data:') || !workspacePath?.trim()) return value
  const root = workspacePath.trim()
  try {
    await ensureWorkspaceGrokForgeGitignore(root, writeTextFile, readTextFile)
  } catch {
    // ignore gitignore write failures
  }
  const path = makeAttachmentCachePath(root)
  await writeTextFile(path, value)
  return path
}

export async function persistAttachmentList(
  values: string[],
  workspacePath: string | undefined,
  writeTextFile: (path: string, content: string) => Promise<void>,
  readTextFile?: (path: string) => Promise<string>,
): Promise<string[]> {
  const next: string[] = []
  for (const value of values) {
    try {
      next.push(await persistDataUrlAttachment(value, workspacePath, writeTextFile, readTextFile))
    } catch {
      // Keep the in-memory data URL if disk write fails (preview / permission).
      next.push(value)
    }
  }
  return next
}

/**
 * Resolve a stored attachment to something the UI / agent can consume.
 * Cached paths are read back into data: URLs; plain paths pass through.
 */
export async function resolveAttachmentForUse(
  value: string,
  readTextFile: (path: string) => Promise<string>,
): Promise<string> {
  if (!isCachedDataUrlPath(value)) return value
  try {
    const raw = await readTextFile(value)
    return raw.startsWith('data:') ? raw : value
  } catch {
    return value
  }
}

export async function resolveAttachmentList(
  values: string[],
  readTextFile: (path: string) => Promise<string>,
): Promise<string[]> {
  return Promise.all(values.map((value) => resolveAttachmentForUse(value, readTextFile)))
}
