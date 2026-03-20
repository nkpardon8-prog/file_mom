/**
 * FileMom Desktop — Electron Main Process
 *
 * This is a minimal scaffold. To run:
 *   1. Start the API server: cd apps/api && pnpm dev
 *   2. Start the web server: cd apps/web && pnpm dev
 *   3. Run Electron: cd apps/desktop && pnpm dev
 *
 * Future enhancements:
 *   - Bundle API server into Electron (spawn as child process)
 *   - Bundle web app (load from dist/ instead of localhost)
 *   - System tray icon with watcher status
 *   - Auto-start on login
 *   - Native file drag-and-drop → add to watched folders
 *   - Code signing for macOS (.dmg) and Windows (.exe)
 *   - Auto-update via electron-updater
 */

// @ts-nocheck — Electron APIs not available until `electron` is installed
import { app, BrowserWindow } from 'electron';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'FileMom',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // In dev, load from Vite dev server
  // In production, load from bundled dist/
  const url = process.env.FILEMOM_DEV_URL ?? 'http://localhost:5173';
  win.loadURL(url);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
