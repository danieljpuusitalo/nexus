import { app, BrowserWindow, shell, screen, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { getDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc'
import { startBriefingLoop, stopBriefingLoop } from './meeting-briefing'
import { startGoogleContactsAutoSync, stopGoogleContactsAutoSync } from './google-contacts-sync'
import { startMicrosoftContactsAutoSync, stopMicrosoftContactsAutoSync } from './microsoft-contacts-sync'
import { autoUpdater } from 'electron-updater'

// Single instance lock — prevent duplicate app windows
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

// When a second instance is launched, focus the existing window
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// --- Window State Persistence ---
interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

function getStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState(): WindowState {
  try {
    const data = fs.readFileSync(getStatePath(), 'utf8')
    const state = JSON.parse(data) as WindowState

    // Validate saved position is visible on a connected display
    if (state.x !== undefined && state.y !== undefined) {
      const displays = screen.getAllDisplays()
      const visible = displays.some(d => {
        const b = d.bounds
        return state.x! >= b.x && state.x! < b.x + b.width &&
               state.y! >= b.y && state.y! < b.y + b.height
      })
      if (!visible) {
        // Window was on a disconnected monitor — reset position
        delete state.x
        delete state.y
      }
    }

    return state
  } catch {
    return { width: 1200, height: 800, maximized: false }
  }
}

function saveWindowState(): void {
  if (!mainWindow) return
  const maximized = mainWindow.isMaximized()
  const bounds = maximized ? loadWindowState() : mainWindow.getBounds()
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width || 1200,
    height: bounds.height || 800,
    maximized
  }
  try {
    fs.writeFileSync(getStatePath(), JSON.stringify(state), 'utf8')
  } catch {
    // ignore write errors
  }
}

function createWindow(): void {
  const state = loadWindowState()

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#09090b',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: !app.isPackaged
    }
  })

  if (state.maximized) {
    mainWindow.maximize()
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Save window state on resize/move
  mainWindow.on('resize', saveWindowState)
  mainWindow.on('move', saveWindowState)
  mainWindow.on('maximize', saveWindowState)
  mainWindow.on('unmaximize', saveWindowState)
  mainWindow.on('close', saveWindowState)

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Handle renderer crashes gracefully
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Nexus] Renderer process crashed:', details.reason)
    if (!mainWindow) return
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Nexus encountered an error',
      message: 'The application ran into a problem. Would you like to reload?',
      buttons: ['Reload', 'Close']
    }).then(({ response }) => {
      if (response === 0) mainWindow?.reload()
      else mainWindow?.close()
    })
  })

  // In dev, load Vite dev server; in prod, load built files
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Initialize database
  getDatabase()

  // Register IPC handlers
  registerIpcHandlers()

  // Start pre-meeting briefing loop (checks for upcoming calendar events)
  startBriefingLoop(getDatabase())

  // Start contact auto-sync loops (if enabled by user)
  startGoogleContactsAutoSync(getDatabase())
  startMicrosoftContactsAutoSync(getDatabase())

  createWindow()

  // Check for updates after a 5-second delay (non-blocking)
  setTimeout(() => {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // Silently ignore update check failures (offline, no releases, etc.)
    })
  }, 5000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopBriefingLoop()
  stopGoogleContactsAutoSync()
  stopMicrosoftContactsAutoSync()
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
