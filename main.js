const { app, BrowserWindow, Tray, Menu, screen, nativeImage, ipcMain } = require('electron');
const path = require('path');
const settingsStore = require('./settings');

// Mode test : TRAIL_DEBUG=1 encadre l'écran en rouge. TRAIL_NOGPU=1 coupe l'accélération graphique.
const DEBUG = process.env.TRAIL_DEBUG === '1';
if (process.env.TRAIL_NOGPU === '1') app.disableHardwareAcceleration();

const log = (...args) => console.log('[trail]', ...args);

// Une seule instance à la fois
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log('Une autre instance tourne déjà. Quittez-la (icône > Quitter) ou lancez : taskkill /F /IM electron.exe');
  app.quit();
}

let tray = null;
let enabled = true;
let timer = null;
let lastPoint = { x: -1, y: -1 };
let firstSendLogged = false;
let settings = { ...settingsStore.DEFAULTS };
let settingsWin = null;
let saveTimer = null;
const overlays = new Map(); // id de l'écran -> { win, display }

// Pour la version .exe portable, Windows doit relancer le vrai fichier .exe
// (et non sa copie temporaire).
const loginPath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

function attachDiagnostics(win, label) {
  win.webContents.on('console-message', (...args) => {
    const msg = typeof args[2] === 'string' ? args[2] : (args[0] && args[0].message);
    log(`${label} :`, msg);
  });
  win.webContents.on('preload-error', (_e, file, err) => log(`ERREUR preload (${label}) :`, file, err && err.message));
  win.webContents.on('did-fail-load', (_e, code, desc) => log(`ERREUR chargement (${label}) :`, code, desc));
  win.webContents.on('render-process-gone', (_e, details) => log(`ERREUR page plantée (${label}) :`, details.reason));
}

// ---------- Réglages ----------
function broadcastSettings() {
  for (const { win } of overlays.values()) {
    if (!win.isDestroyed() && !win.webContents.isLoading()) {
      win.webContents.send('settings', settings);
    }
  }
}

function applySettings(next) {
  settings = settingsStore.sanitize(next);
  broadcastSettings();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; settingsStore.save(settings); }, 300);
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 440,
    height: 720,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: 'Curseur Traînée — Réglages',
    backgroundColor: '#0b0d14',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.setMenu(null);
  attachDiagnostics(settingsWin, 'réglages');
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ---------- Fenêtres transparentes (une par écran) ----------
function createOverlay(display) {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,      // ne vole jamais le focus
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  attachDiagnostics(win, 'page');

  win.setAlwaysOnTop(true, 'screen-saver'); // au-dessus de presque tout
  win.setIgnoreMouseEvents(true);           // les clics passent à travers
  win.setBounds(display.bounds);            // corrige les écrans à mise à l'échelle

  // On affiche la fenêtre dès que la page est chargée, avec les réglages courants
  win.webContents.once('did-finish-load', () => {
    if (win.isDestroyed()) return;
    win.webContents.send('settings', settings);
    win.showInactive();
    const b = win.getBounds();
    log(`fenêtre affichée : écran ${display.id}, ${b.width}x${b.height} en (${b.x},${b.y})`);
  });

  win.loadFile(path.join(__dirname, 'overlay.html'), { query: DEBUG ? { debug: '1' } : {} });
  overlays.set(display.id, { win, display });
}

function destroyOverlays() {
  for (const { win } of overlays.values()) {
    if (!win.isDestroyed()) win.destroy();
  }
  overlays.clear();
}

function buildOverlays() {
  destroyOverlays();
  if (!enabled) return;
  const displays = screen.getAllDisplays();
  log(`${displays.length} écran(s) détecté(s)`);
  displays.forEach(createOverlay);
}

// ---------- Position du curseur ----------
// Les fenêtres laissent passer la souris, elles ne reçoivent donc aucun
// événement : le processus principal lit la position et la leur envoie.
function startPolling() {
  stopPolling();
  timer = setInterval(() => {
    const p = screen.getCursorScreenPoint();
    if (p.x === lastPoint.x && p.y === lastPoint.y) return;
    lastPoint = p;
    for (const { win, display } of overlays.values()) {
      if (win.isDestroyed() || win.webContents.isLoading()) continue;
      win.webContents.send('cursor', {
        x: p.x - display.bounds.x,
        y: p.y - display.bounds.y
      });
    }
    if (!firstSendLogged && overlays.size) {
      firstSendLogged = true;
      log(`position du curseur envoyée aux fenêtres : ${p.x},${p.y}`);
    }
  }, 8);
}

function stopPolling() {
  if (timer) clearInterval(timer);
  timer = null;
}

// ---------- Activer / désactiver ----------
function setEnabled(value) {
  enabled = value;
  if (enabled) {
    buildOverlays();
    startPolling();
  } else {
    stopPolling();
    destroyOverlays();
  }
  refreshTray();
}

// ---------- Icône de la zone de notification ----------
function refreshTray() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Réglages…', click: openSettings },
    {
      label: enabled ? 'Désactiver la traînée' : 'Activer la traînée',
      click: () => setEnabled(!enabled)
    },
    {
      label: 'Lancer au démarrage de Windows',
      type: 'checkbox',
      enabled: app.isPackaged, // uniquement pour la version .exe
      checked: app.getLoginItemSettings({ path: loginPath() }).openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, path: loginPath() })
    },
    { type: 'separator' },
    { label: 'Quitter', click: () => app.quit() }
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(enabled ? 'Traînée de curseur : activée (clic = réglages)' : 'Traînée de curseur : désactivée');
}

app.whenReady().then(() => {
  if (!gotLock) return;
  Menu.setApplicationMenu(null);

  const loaded = settingsStore.load();
  settings = loaded.settings;

  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:set', (_e, partial) => {
    applySettings({ ...settings, ...(partial && typeof partial === 'object' ? partial : {}) });
    return settings;
  });
  ipcMain.handle('settings:reset', () => {
    applySettings({ ...settingsStore.DEFAULTS });
    return settings;
  });

  const icon = nativeImage
    .createFromPath(path.join(__dirname, 'icon.png'))
    .resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.on('click', openSettings); // clic gauche = réglages
  refreshTray();

  log(`démarrage (Electron ${process.versions.electron})${DEBUG ? ' [mode test]' : ''}`);
  buildOverlays();
  startPolling();

  // Premier lancement : on ouvre les réglages pour que l'application se découvre
  if (!loaded.existed) openSettings();

  // Branchement / débranchement d'écrans, changement de résolution
  screen.on('display-added', buildOverlays);
  screen.on('display-removed', buildOverlays);
  screen.on('display-metrics-changed', buildOverlays);
});

// Relancer l'application alors qu'elle tourne déjà ouvre les réglages
app.on('second-instance', () => { if (app.isReady()) openSettings(); });

// Enregistre les derniers changements avant de quitter
app.on('before-quit', () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    settingsStore.save(settings);
  }
});

// L'application reste vivante même sans fenêtre (icône de notification)
app.on('window-all-closed', (e) => e.preventDefault());
