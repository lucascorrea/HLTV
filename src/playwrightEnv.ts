/**
 * Drops a bogus PLAYWRIGHT_BROWSERS_PATH before playwright-core resolves it.
 *
 * IDE/sandbox shells (and `pm2 restart --update-env`) can inject a browsers dir
 * that was never downloaded, making every launch fail with
 * "Executable doesn't exist at .../chrome-headless-shell".
 *
 * Must be imported BEFORE playwright/playwright-extra: playwright-core reads the
 * variable once, at import time.
 */
import { existsSync } from 'fs'

export function sanitizePlaywrightBrowsersPath(): void {
  const configured = process.env.PLAYWRIGHT_BROWSERS_PATH

  // "0" is not a path — it means "use the package-local browsers dir".
  if (!configured || configured === '0') {
    return
  }

  if (existsSync(configured)) {
    return
  }

  console.warn(
    `[playwrightEnv] ignoring PLAYWRIGHT_BROWSERS_PATH=${configured} ` +
      `(directory does not exist) — falling back to the Playwright default`
  )
  delete process.env.PLAYWRIGHT_BROWSERS_PATH
}

sanitizePlaywrightBrowsersPath()
