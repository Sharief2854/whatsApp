const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Configure autoUpdater logging and settings
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow = null;
let serverInstance = null;

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 960,
    minHeight: 650,
    title: 'WhatsApp Automation Hub - Developed by Sharief',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });

  // Load the running Express application on whichever port was bound
  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates once window is ready in production
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('Auto-updater check error:', err.message);
    });
  }
}

// Auto-updater event handling
autoUpdater.on('update-available', (info) => {
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info.version);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  dialog
    .showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded. Restart now to install?`,
      buttons: ['Restart Now', 'Later']
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
});

let activePort = 3000;

app.whenReady().then(async () => {
  try {
    const { startServer } = require('./server.js');
    activePort = await startServer(3000);
    console.log(`Electron launched server on port ${activePort}`);
    createWindow(activePort);
  } catch (err) {
    console.error('Failed to start internal server:', err);
    dialog.showErrorBox('Server Error', `Could not start internal server: ${err.message}`);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(activePort);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Kill any dangling processes if needed
});
