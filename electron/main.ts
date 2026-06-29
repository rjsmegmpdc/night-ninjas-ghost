import { app, BrowserWindow, shell } from 'electron';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import path from 'path';

const PORT = 3579;

// In dev __dirname = <project>/electron/
// Packaged: __dirname = resources/app[.asar]/electron/
// Either way, parent is the Next.js root.
const APP_DIR = path.join(__dirname, '..');

let mainWindow: BrowserWindow | null = null;

// Enforce single instance — second launch focuses the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0A0A0A',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'VELOCITY',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // External links open in the OS browser, never inside Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`http://127.0.0.1:${PORT}`)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Run Next.js programmatically inside the same process.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nextModule = require('next');
  const nextApp = (nextModule.default ?? nextModule)({
    dev: !app.isPackaged,
    dir: APP_DIR,
    hostname: '127.0.0.1',
    port: PORT,
  });

  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const parsedUrl = parse(req.url ?? '/', true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Request error:', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  }).listen(PORT, '127.0.0.1', () => {
    createWindow();
  });
});

// macOS: re-create window when dock icon is clicked and no windows are open.
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Windows/Linux: quit when all windows are closed.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
