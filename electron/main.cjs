const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

let mainWindow;
let projectPath = null;
const isDev = !app.isPackaged;

function sendAction(action) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('menu:action', action);
}

function createMenu() {
  const item = (label, action, accelerator) => ({
    label,
    accelerator,
    click: () => sendAction(action),
  });
  const template = [
    { label: 'Файл', submenu: [
      item('Создать новый проект', 'new', 'CmdOrCtrl+N'),
      item('Открыть проект…', 'open', 'CmdOrCtrl+O'),
      { type: 'separator' },
      item('Сохранить', 'save', 'CmdOrCtrl+S'),
      item('Сохранить как…', 'saveAs', 'CmdOrCtrl+Shift+S'),
      { type: 'separator' },
      item('Экспортировать в PNG…', 'exportPng'),
      item('Экспортировать в PDF…', 'exportPdf'),
      { type: 'separator' },
      item('Закрыть проект', 'closeProject'),
    ] },
    { label: 'Правка', submenu: [
      item('Отменить', 'undo', 'CmdOrCtrl+Z'), item('Повторить', 'redo', 'CmdOrCtrl+Y'),
      { type: 'separator' }, item('Вырезать', 'cut', 'CmdOrCtrl+X'),
      item('Копировать', 'copy', 'CmdOrCtrl+C'), item('Вставить', 'paste', 'CmdOrCtrl+V'),
      item('Дублировать', 'duplicate', 'CmdOrCtrl+D'),
      { type: 'separator' }, item('Выделить всё', 'selectAll', 'CmdOrCtrl+A'),
      item('Удалить выбранное', 'delete', 'Delete'),
    ] },
    { label: 'Вид', submenu: [
      item('Увеличить масштаб', 'zoomIn', 'CmdOrCtrl+Plus'),
      item('Уменьшить масштаб', 'zoomOut', 'CmdOrCtrl+-'),
      item('Сбросить масштаб', 'zoomReset', 'CmdOrCtrl+0'),
      item('Подогнать под экран', 'fitView', 'CmdOrCtrl+Shift+F'),
      { type: 'separator' }, item('Показать/скрыть сетку', 'toggleGrid'),
      item('Полноэкранный режим', 'fullscreen', 'F11'),
    ] },
    { label: 'Вставка', submenu: [
      item('Добавить текстовый блок', 'addBlock'), item('Добавить заметку', 'addNote'),
      item('Добавить заголовок', 'addHeading'), item('Добавить чек-лист', 'addChecklist'),
      item('Добавить группу', 'addGroup'),
    ] },
    { label: 'Настройки', submenu: [
      item('Тема', 'theme'), item('Настройки холста', 'canvasSettings'),
      item('Настройки автосохранения', 'autosaveSettings'),
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 850,
    minHeight: 600,
    frame: false,
    icon: process.platform === 'win32'
      ? path.join(__dirname, '..', 'assets', 'visual-notebook.ico')
      : path.join(__dirname, '..', 'assets', 'icons', '512x512.png'),
    backgroundColor: '#111214',
    title: 'Visual Notebook',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (isDev) mainWindow.loadURL('http://127.0.0.1:5173');
  else mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

async function writeProject(filePath, data) {
  if (typeof data !== 'string' || data.length > 100 * 1024 * 1024) throw new Error('Недопустимый размер проекта.');
  JSON.parse(data);
  const temporary = `${filePath}.tmp`;
  await fs.writeFile(temporary, data, 'utf8');
  await fs.rename(temporary, filePath);
}

ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'Visual Notebook', extensions: ['vnote'] }, { name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf8');
  JSON.parse(content);
  projectPath = filePath;
  return { content, filePath };
});

ipcMain.handle('project:save', async (_event, data) => {
  if (!projectPath) return null;
  await writeProject(projectPath, data);
  return { filePath: projectPath };
});

ipcMain.handle('project:save-as', async (_event, data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: projectPath || 'Untitled.vnote',
    filters: [{ name: 'Visual Notebook', extensions: ['vnote'] }],
  });
  if (result.canceled || !result.filePath) return null;
  const filePath = result.filePath.toLowerCase().endsWith('.vnote') ? result.filePath : `${result.filePath}.vnote`;
  await writeProject(filePath, data);
  projectPath = filePath;
  return { filePath };
});

ipcMain.handle('project:autosave', async (_event, data) => {
  const filePath = path.join(app.getPath('userData'), 'recovery.vnote');
  await writeProject(filePath, data);
  return true;
});

ipcMain.on('project:autosave-sync', (_event, data) => {
  if (typeof data !== 'string' || data.length > 100 * 1024 * 1024) return;
  try {
    JSON.parse(data);
    fsSync.writeFileSync(path.join(app.getPath('userData'), 'recovery.vnote'), data, 'utf8');
  } catch (error) {
    console.error('Autosave failed:', error);
  }
});

ipcMain.handle('project:restore', async () => {
  const filePath = path.join(app.getPath('userData'), 'recovery.vnote');
  try {
    return { content: await fs.readFile(filePath, 'utf8'), filePath: null };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
});

ipcMain.handle('project:export-image', async (_event, data, extension) => {
  const ext = extension === 'pdf' ? 'pdf' : 'png';
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `VisualNotebook.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (result.canceled || !result.filePath) return null;
  const filePath = result.filePath.toLowerCase().endsWith(`.${ext}`) ? result.filePath : `${result.filePath}.${ext}`;
  const base64 = data.replace(/^data:(image\/png|application\/pdf);base64,/, '');
  await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
  return filePath;
});

ipcMain.on('window:action', (_event, action) => {
  if (!mainWindow) return;
  if (action === 'minimize') mainWindow.minimize();
  if (action === 'maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  if (action === 'fullscreen') mainWindow.setFullScreen(!mainWindow.isFullScreen());
  if (action === 'close') mainWindow.close();
});

app.whenReady().then(() => {
  createMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
