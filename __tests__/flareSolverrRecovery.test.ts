import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { defaultLoadPageFlareSolverr } from '../src/config'

const mockPost = jest.fn()

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: (...args: unknown[]) => mockPost(...args),
  },
}))

describe('FlareSolverr recovery shell', () => {
  let markerPath: string
  const prevShell = process.env.FLARESOLVERR_RECOVERY_SHELL
  const prevWait = process.env.FLARESOLVERR_RECOVERY_WAIT_MS
  const prevSessionLogs = process.env.FLARESOLVERR_SESSION_LOGS

  beforeEach(() => {
    markerPath = path.join(
      os.tmpdir(),
      `hltv-flare-recovery-test-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
    )
    if (fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath)
    }
    process.env.FLARESOLVERR_RECOVERY_SHELL = `printf recovered > "${markerPath}"`
    process.env.FLARESOLVERR_RECOVERY_WAIT_MS = '0'
    process.env.FLARESOLVERR_SESSION_LOGS = 'false'
    mockPost.mockReset()
  })

  afterEach(() => {
    if (markerPath && fs.existsSync(markerPath)) {
      fs.unlinkSync(markerPath)
    }
    if (prevShell === undefined) {
      delete process.env.FLARESOLVERR_RECOVERY_SHELL
    } else {
      process.env.FLARESOLVERR_RECOVERY_SHELL = prevShell
    }
    if (prevWait === undefined) {
      delete process.env.FLARESOLVERR_RECOVERY_WAIT_MS
    } else {
      process.env.FLARESOLVERR_RECOVERY_WAIT_MS = prevWait
    }
    if (prevSessionLogs === undefined) {
      delete process.env.FLARESOLVERR_SESSION_LOGS
    } else {
      process.env.FLARESOLVERR_SESSION_LOGS = prevSessionLogs
    }
  })

  test('runs FLARESOLVERR_RECOVERY_SHELL after chromedriver-like session.create failure then succeeds', async () => {
    let createCount = 0
    mockPost.mockImplementation(async (_url: string, body: { cmd?: string }) => {
      const cmd = body?.cmd
      if (cmd === 'sessions.create') {
        createCount += 1
        if (createCount === 1) {
          return {
            data: {
              status: 'error',
              message:
                "Error: [Errno 5] Input/output error: '/app/chromedriver'",
            },
          }
        }
        return { data: { status: 'ok', session: 'test_session_1' } }
      }
      if (cmd === 'request.get') {
        return {
          data: {
            status: 'ok',
            solution: { response: '<html><body>ok</body></html>' },
          },
        }
      }
      if (cmd === 'sessions.destroy') {
        return { data: { status: 'ok' } }
      }
      return { data: { status: 'error', message: 'unexpected cmd' } }
    })

    const load = defaultLoadPageFlareSolverr({
      flareSolverrUrl: 'http://127.0.0.1:8199',
      reuseSession: true,
    })

    const html = await load('https://example.com/stats')

    expect(html).toContain('<html>')
    expect(fs.readFileSync(markerPath, 'utf8').trim()).toBe('recovered')
    expect(createCount).toBe(2)
    expect(mockPost).toHaveBeenCalled()
  })

  test('does not run shell when recovery env is unset', async () => {
    delete process.env.FLARESOLVERR_RECOVERY_SHELL

    mockPost.mockImplementation(async (_url: string, body: { cmd?: string }) => {
      const cmd = body?.cmd
      if (cmd === 'sessions.create') {
        return {
          data: {
            status: 'error',
            message: "Error: [Errno 5] Input/output error: '/app/chromedriver'",
          },
        }
      }
      return { data: {} }
    })

    const load = defaultLoadPageFlareSolverr({
      flareSolverrUrl: 'http://127.0.0.1:8199',
      reuseSession: true,
    })

    await expect(load('https://example.com/x')).rejects.toThrow(
      /FlareSolverr session create failed/
    )
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  test('recycles session only after in-flight requests finish', async () => {
    delete process.env.FLARESOLVERR_RECOVERY_SHELL
    process.env.FLARESOLVERR_SESSION_LOGS = 'false'

    const destroyedSessions = new Set<string>()
    let createCount = 0
    let requestGetCount = 0

    mockPost.mockImplementation(async (_url: string, body: { cmd?: string; session?: string }) => {
      const cmd = body?.cmd
      if (cmd === 'sessions.create') {
        createCount += 1
        return { data: { status: 'ok', session: `sess_${createCount}` } }
      }
      if (cmd === 'sessions.destroy') {
        if (body?.session) {
          destroyedSessions.add(body.session)
        }
        return { data: { status: 'ok' } }
      }
      if (cmd === 'request.get') {
        requestGetCount += 1
        const currentOrder = requestGetCount
        // First 2 complete first (threshold), 3rd completes last and still must succeed.
        await new Promise((resolve) =>
          setTimeout(resolve, currentOrder <= 2 ? 5 : 40)
        )
        if (body?.session && destroyedSessions.has(body.session)) {
          return {
            data: {
              status: 'error',
              message:
                "Error solving the challenge. HTTPConnectionPool(host='localhost', port=38681): Failed to establish a new connection: [Errno 111] Connection refused",
            },
          }
        }
        return {
          data: {
            status: 'ok',
            solution: { response: '<html><body>ok</body></html>' },
          },
        }
      }
      return { data: { status: 'error', message: 'unexpected cmd' } }
    })

    const load = defaultLoadPageFlareSolverr({
      flareSolverrUrl: 'http://127.0.0.1:8199',
      reuseSession: true,
      recycleSessionAfterRequests: 2,
    })

    const [r1, r2, r3] = await Promise.all([
      load('https://example.com/stats/1'),
      load('https://example.com/stats/2'),
      load('https://example.com/stats/3'),
    ])

    expect(r1).toContain('<html>')
    expect(r2).toContain('<html>')
    expect(r3).toContain('<html>')
    expect(createCount).toBe(1)
    expect(destroyedSessions.has('sess_1')).toBe(true)
  })
})
