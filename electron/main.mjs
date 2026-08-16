import { app, BrowserWindow, Menu, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

function openExternal(url) {
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1540,
    height: 980,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    backgroundColor: '#f7f7f5',
    icon: path.join(currentDirectory, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file:')) return
    event.preventDefault()
    openExternal(url)
  })
  window.once('ready-to-show', () => window.show())
  void window.loadFile(path.join(currentDirectory, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
