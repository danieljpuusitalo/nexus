import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { getDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null

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
    return JSON.parse(data) as WindowState
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
    backgroundColor: '#09090B',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
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

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
