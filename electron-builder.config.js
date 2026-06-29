/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.nightninjas.velocity',
  productName: 'VELOCITY',
  copyright: 'Copyright © 2025 Night Ninjas',

  directories: {
    output: 'dist-electron',
    buildResources: 'electron-assets',
  },

  // Files to include in the packaged app.
  // node_modules is handled separately by electron-builder (production deps only).
  files: [
    'electron/main.js',
    'electron/preload.js',
    '.next/**/*',
    'public/**/*',
    'package.json',
    'next.config.mjs',
  ],

  // Pack into asar but extract native addons — .node files can't load from inside asar.
  asar: true,
  asarUnpack: [
    'node_modules/better-sqlite3/**/*',
    'node_modules/keytar/**/*',
  ],

  // ── Windows ─────────────────────────────────────────────────────────────────
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    // icon: 'electron-assets/icon.ico',  // add a 256x256 .ico to enable
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'VELOCITY',
  },

  // ── macOS ────────────────────────────────────────────────────────────────────
  mac: {
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    category: 'public.app-category.sports',
    darkModeSupport: true,
    identity: null, // unsigned — users right-click → Open on first launch
    // icon: 'electron-assets/icon.icns',  // add a .icns to enable
  },
  dmg: {
    title: 'VELOCITY',
    window: { width: 540, height: 380 },
    contents: [
      { x: 140, y: 200, type: 'file' },
      { x: 400, y: 200, type: 'link', path: '/Applications' },
    ],
  },
};
