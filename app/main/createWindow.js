import { BrowserWindow, globalShortcut, app, screen, shell } from 'electron'
import debounce from 'lodash/debounce'
import EventEmitter from 'events'
import trackEvent from '../lib/trackEvent'

import {
  INPUT_HEIGHT,
  WINDOW_WIDTH
} from './constants/ui'

import buildMenu from './createWindow/buildMenu'
import toggleWindow from './createWindow/toggleWindow'
import handleUrl from './createWindow/handleUrl'
import config from '../lib/config'
import getWindowPosition from '../lib/getWindowPosition'

export default ({ src, isDev }) => {
  const [x, y] = getWindowPosition({})

  const mainWindow = new BrowserWindow({
    alwaysOnTop: true,
    width: WINDOW_WIDTH,
    minWidth: WINDOW_WIDTH,
    height: INPUT_HEIGHT,
    x,
    y,
    frame: false,
    resizable: false,
    // Show main window on launch only when application started for the first time
    show: config.get('firstStart')
  })

  mainWindow.loadURL(src)
  mainWindow.settingsChanges = new EventEmitter()

  // Get global shortcut from app settings
  let shortcut = config.get('hotkey')

  // Function to toggle main window
  const toggleMainWindow = () => toggleWindow(mainWindow)
  // Function to show main window
  const showMainWindow = () => {
    mainWindow.show()
    mainWindow.focus()
  }

  // Setup event listeners for main window
  globalShortcut.register(shortcut, toggleMainWindow)

  mainWindow.on('blur', () => {
    if (!isDev()) {
      // Hide window on blur in production
      // In development we usually use developer tools that can blur a window
      mainWindow.hide()
    }
  })

  // Save window position when it is being moved
  mainWindow.on('move', debounce(() => {
    if (!mainWindow.isVisible()) {
      return
    }
    const display = screen.getPrimaryDisplay()
    const positions = config.get('positions') || {}
    positions[display.id] = mainWindow.getPosition()
    config.set('positions', positions)
  }, 100))

  mainWindow.webContents.on('new-window', (event, url) => {
    shell.openExternal(url)
    event.preventDefault()
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      shell.openExternal(url)
      event.preventDefault()
    }
  })

  // Change global hotkey if it is changed in app settings
  mainWindow.settingsChanges.on('hotkey', (value) => {
    globalShortcut.unregister(shortcut)
    shortcut = value
    globalShortcut.register(shortcut, toggleMainWindow)
  })

  // Change theme css file
  mainWindow.settingsChanges.on('theme', (value) => {
    mainWindow.webContents.send('message', {
      message: 'updateTheme',
      payload: value
    })
  })

  // Handle window.hide: if cleanOnHide value in preferences is true
  // we clear all results and show empty window every time
  const resetResults = () => {
    mainWindow.webContents.send('message', {
      message: 'showTerm',
      payload: ''
    })
  }

  // Handle change of cleanOnHide value in settins
  const handleCleanOnHideChange = (value) => {
    if (value) {
      mainWindow.on('hide', resetResults)
    } else {
      mainWindow.removeListener('hide', resetResults)
    }
  }

  // Set or remove handler when settings changed
  mainWindow.settingsChanges.on('cleanOnHide', handleCleanOnHideChange)

  // Set initial handler if it is needed
  handleCleanOnHideChange(config.get('cleanOnHide'))

  // Show main window when user opens application, but it is already opened
  app.on('open-file', (event, path) => handleUrl(mainWindow, path))
  app.on('open-url', (event, path) => handleUrl(mainWindow, path))
  app.on('activate', showMainWindow)

  // Track app start event
  trackEvent({
    category: 'App Start',
    event: config.get('firstStart') ? 'First' : 'Secondary'
  })

  // Save in config information, that application has been started
  config.set('firstStart', false)

  buildMenu(mainWindow)
  return mainWindow
}
