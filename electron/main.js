const { app, BrowserWindow, shell, Tray, Menu, dialog } = require('electron')
const { spawn } = require('child_process')
const EmbeddedPostgres = require('embedded-postgres')
const path = require('path')
const fs = require('fs')
const http = require('http')
const crypto = require('crypto')

const resourcesPath = process.resourcesPath || path.join(__dirname, '..')
const userDataDir = app.getPath('userData')
const envPath = path.join(userDataDir, '.env')

let tray = null
let mainWindow = null
let serverProcess = null
let pgInstance = null

// ── Secrets ──────────────────────────────────────────────────────────────────
// Load .env from userData (persists across updates). Auto-generate JWT_SECRET
// on first run. Other secrets (OPENROUTER_API_KEY etc.) stay blank until the
// user fills them in the Settings panel.
function loadOrCreateSecrets() {
  let env = {}
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=')
      if (k && v.length) env[k.trim()] = v.join('=').trim()
    })
  }
  if (!env.JWT_SECRET) {
    env.JWT_SECRET = crypto.randomBytes(32).toString('hex')
    const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n')
    fs.mkdirSync(userDataDir, { recursive: true })
    fs.writeFileSync(envPath, lines + '\n')
  }
  return env
}

// ── Embedded Postgres ─────────────────────────────────────────────────────────
async function startPostgres() {
  const pgData = path.join(userDataDir, 'pgdata')
  pgInstance = new EmbeddedPostgres({
    databaseDir: pgData,
    user: 'opsoul',
    password: 'opsoul_local',
    port: 5433,
    persistent: true,
  })
  await pgInstance.initialise()
  await pgInstance.start()
  // createDatabase throws if DB already exists — ignore that error
  try { await pgInstance.createDatabase('opsoul') } catch (_) {}
}

// ── OpSoul server child process ───────────────────────────────────────────────
// The server source lives in extraResources/server. tsx is bundled under
// server/node_modules/.bin/tsx so no global install is needed.
function startServer(secrets) {
  const serverDir = path.join(resourcesPath, 'server')
  const tsxBin = path.join(serverDir, 'node_modules', '.bin', 'tsx')
  const entry = path.join(serverDir, 'src', 'index.ts')

  const bin = fs.existsSync(tsxBin) ? tsxBin : 'npx'
  const args = fs.existsSync(tsxBin) ? [entry] : ['tsx', entry]

  serverProcess = spawn(bin, args, {
    cwd: serverDir,
    env: {
      ...process.env,
      DATABASE_URL: 'postgres://opsoul:opsoul_local@localhost:5433/opsoul',
      PORT: '3001',
      NODE_ENV: 'production',
      ALLOWED_ORIGIN: 'http://localhost:3001',
      JWT_SECRET: secrets.JWT_SECRET || '',
      APP_URL: 'http://localhost:3001',
      SOVEREIGN_ADMIN_EMAIL: secrets.SOVEREIGN_ADMIN_EMAIL || 'admin@local',
      OPENROUTER_API_KEY: secrets.OPENROUTER_API_KEY || '',
      SENDGRID_API_KEY: secrets.SENDGRID_API_KEY || '',
      LOG_LEVEL: 'info',
    },
    stdio: 'pipe',
  })
  serverProcess.stdout?.on('data', d => console.log('[server]', d.toString().trimEnd()))
  serverProcess.stderr?.on('data', d => console.error('[server]', d.toString().trimEnd()))
  serverProcess.on('exit', code => {
    if (code !== null && code !== 0) {
      console.error(`[server] exited with code ${code}`)
    }
  })
}

// ── Health-check poll ─────────────────────────────────────────────────────────
async function waitForServer(maxMs = 90000) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:3001/api/healthz', resolve)
        req.on('error', reject)
        req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')) })
      })
      return true
    } catch {
      await new Promise(r => setTimeout(r, 2000))
    }
  }
  return false
}

// ── Loading splash ────────────────────────────────────────────────────────────
function showLoadingWindow(message) {
  if (mainWindow) mainWindow.close()
  mainWindow = new BrowserWindow({
    width: 480,
    height: 320,
    resizable: false,
    frame: false,
    transparent: false,
    webPreferences: { nodeIntegration: false },
  })
  mainWindow.loadURL(`data:text/html,<!DOCTYPE html>
<html>
<head><style>
body{font-family:-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#e2e8f0}
h1{font-size:28px;font-weight:700;margin-bottom:8px}
p{font-size:14px;color:#94a3b8}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#6366f1;margin:0 3px;animation:bounce 1.2s infinite}
.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}
@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-10px)}}
</style></head>
<body>
<h1>OpSoul</h1>
<p id="msg">${message}</p>
<div style="margin-top:16px"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
</body></html>`)
  return mainWindow
}

function updateLoadingMessage(win, msg) {
  win?.webContents?.executeJavaScript(
    `document.getElementById('msg').textContent = ${JSON.stringify(msg)}`
  ).catch(() => {})
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png')
  tray = new Tray(iconPath)
  tray.setToolTip('OpSoul')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open OpSoul Console', click: () => shell.openExternal('http://localhost:3001') },
    {
      label: 'Getting Started Guide',
      click: () => {
        const docsPath = path.join(resourcesPath, 'docs', 'getting-started.html')
        shell.openPath(docsPath)
      },
    },
    { type: 'separator' },
    {
      label: 'Stop OpSoul',
      click: () => {
        serverProcess?.kill()
        pgInstance?.stop().catch(() => {}).finally(() => app.quit())
      },
    },
    { label: 'Quit', click: () => app.quit() },
  ]))
  tray.on('click', () => shell.openExternal('http://localhost:3001'))
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  await app.whenReady()

  const loadWin = showLoadingWindow('Starting database…')

  try {
    await startPostgres()
  } catch (err) {
    loadWin.close()
    dialog.showErrorBox('Database error', `Failed to start embedded database:\n\n${err.message}`)
    app.quit()
    return
  }

  updateLoadingMessage(loadWin, 'Starting OpSoul server…')

  const secrets = loadOrCreateSecrets()
  startServer(secrets)

  const ready = await waitForServer(90000)

  loadWin.close()
  mainWindow = null

  if (!ready) {
    dialog.showErrorBox('Startup failed', 'OpSoul did not start within 90 seconds.\n\nCheck the logs for details.')
    app.quit()
    return
  }

  createTray()
  shell.openExternal('http://localhost:3001')
}

main().catch(err => {
  dialog.showErrorBox('Fatal error', err?.message || String(err))
  app.quit()
})

// Keep alive as a tray app — no windows needed
app.on('window-all-closed', e => e.preventDefault())

app.on('before-quit', async () => {
  serverProcess?.kill()
  try { await pgInstance?.stop() } catch {}
})
