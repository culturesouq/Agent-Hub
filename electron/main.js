const { app, BrowserWindow, shell, Tray, Menu, dialog } = require('electron')
const { execSync, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { randomBytes } = require('crypto')

// Get the docker-compose.yml from extraResources
const resourcesPath = process.resourcesPath || path.join(__dirname, '..')
const composePath = path.join(resourcesPath, 'docker-compose.yml')
const envTemplatePath = path.join(resourcesPath, '.env.template')

// .env lives in user's app data dir (persists across updates)
const userDataDir = app.getPath('userData')
const envPath = path.join(userDataDir, '.env')

let tray = null
let mainWindow = null

function checkDocker() {
  try {
    execSync('docker info', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function isFirstRun() {
  return !fs.existsSync(envPath)
}

async function waitForServer(maxMs = 90000) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    try {
      await new Promise((resolve, reject) => {
        http.get('http://localhost:3001/api/healthz', resolve).on('error', reject)
      })
      return true
    } catch {
      await new Promise(r => setTimeout(r, 2000))
    }
  }
  return false
}

function startDockerCompose() {
  return spawn('docker', ['compose', '-f', composePath, '--env-file', envPath, 'up', '-d'], {
    cwd: userDataDir,
    stdio: 'pipe'
  })
}

function stopDockerCompose() {
  try {
    execSync(`docker compose -f "${composePath}" --env-file "${envPath}" down`, { cwd: userDataDir })
  } catch {}
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png')
  tray = new Tray(iconPath)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open OpSoul Console', click: () => shell.openExternal('http://localhost:3001') },
    { type: 'separator' },
    { label: 'Stop OpSoul', click: () => { stopDockerCompose(); app.quit() } },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setToolTip('OpSoul')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => shell.openExternal('http://localhost:3001'))
}

function showLoadingWindow(message) {
  if (mainWindow) mainWindow.close()
  mainWindow = new BrowserWindow({
    width: 480,
    height: 320,
    resizable: false,
    frame: false,
    transparent: false,
    webPreferences: { nodeIntegration: false }
  })
  mainWindow.loadURL(`data:text/html,<!DOCTYPE html>
<html>
<head><style>
body { font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
p { font-size: 14px; color: #94a3b8; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #6366f1; margin: 0 3px; animation: bounce 1.2s infinite; }
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-10px)} }
</style></head>
<body>
<h1>OpSoul</h1>
<p>${message}</p>
<div style="margin-top:16px"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
</body></html>`)
}

async function main() {
  await app.whenReady()

  // Check Docker
  if (!checkDocker()) {
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'Docker Required',
      message: 'OpSoul requires Docker Desktop.',
      detail: 'Please install Docker Desktop from https://docker.com/products/docker-desktop and reopen OpSoul.',
      buttons: ['Open Docker Download', 'Quit']
    })
    if (choice === 0) shell.openExternal('https://www.docker.com/products/docker-desktop')
    app.quit()
    return
  }

  // First run: copy env template
  if (isFirstRun()) {
    fs.mkdirSync(userDataDir, { recursive: true })
    fs.copyFileSync(envTemplatePath, envPath)
  }

  createTray()

  // Ensure JWT_SECRET is set — auto-generate if blank
  let envContent = fs.readFileSync(envPath, 'utf8')
  const jwtSet = /^JWT_SECRET=.+/m.test(envContent)
  if (!jwtSet) {
    const secret = randomBytes(32).toString('hex')
    if (/^JWT_SECRET=/m.test(envContent)) {
      envContent = envContent.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`)
    } else {
      envContent += `\nJWT_SECRET=${secret}\n`
    }
    fs.writeFileSync(envPath, envContent)
  }

  // Ensure DB_PASSWORD is set — auto-generate if still the placeholder
  let envContent2 = fs.readFileSync(envPath, 'utf8')
  if (/^DB_PASSWORD=changeme/m.test(envContent2)) {
    const dbPass = randomBytes(16).toString('hex')
    envContent2 = envContent2.replace(/^DB_PASSWORD=.*$/m, `DB_PASSWORD=${dbPass}`)
    fs.writeFileSync(envPath, envContent2)
  }

  showLoadingWindow('Starting OpSoul…')
  startDockerCompose()

  const ready = await waitForServer(90000)

  if (mainWindow) {
    mainWindow.close()
    mainWindow = null
  }

  if (ready) {
    shell.openExternal('http://localhost:3001')
  } else {
    dialog.showErrorBox('Startup failed', 'OpSoul did not start within 90 seconds. Check that Docker Desktop is running and try again.')
  }
}

main().catch(console.error)

// Keep the app running as a tray app even with no windows open
app.on('window-all-closed', (e) => e.preventDefault())

app.on('before-quit', () => {
  // Tray cleanup is handled automatically by Electron
})
