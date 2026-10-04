import { COLORS, DEFAULT_VECTORS, parseVectors, validateMatrix, transform, interpolate, magnitude, coordinates, format, determinant, presetMatrix } from './math.js';
import { Space } from './space.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'visualize-space-v1';
let stored = null;
try {
  stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (stored) { parseVectors(JSON.stringify(stored.vectors)); validateMatrix(stored.matrix); }
} catch { stored = null; }
const state = {
  vectors: stored?.vectors || DEFAULT_VECTORS.map(v => [...v]),
  matrix: stored?.matrix || presetMatrix('rotateZ'),
  convention: stored?.convention === 'column' ? 'column' : 'row',
  options: { rays: true, trails: true, original: true, labels: true, grid: true },
  theme: stored?.theme === 'dark' ? 'dark' : 'light',
  progress: stored && Number.isFinite(stored.progress) ? Math.max(0, Math.min(1, stored.progress)) : 1,
  speed: [0.5, 1, 2].includes(stored?.speed) ? stored.speed : 1,
  sidebarHidden: stored?.sidebarHidden === true
};
for (const key of Object.keys(state.options)) if (typeof stored?.options?.[key] === 'boolean') state.options[key] = stored.options[key];
let targets = [], selected = -1, playing = false, frame = 0, lastTime = 0, tableTime = 0;
let currentCells = [], draft = false;
document.documentElement.dataset.theme = state.theme;
$('workspace').classList.toggle('sidebar-hidden', state.sidebarHidden);
$('vectors').value = state.vectors.map(v => v.join(', ')).join('\n');
$('convention').value = state.convention;
$('speed').value = String(state.speed);
const matrixInputs = [];
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 3; col++) {
    const input = document.createElement('input');
    input.type = 'text'; input.inputMode = 'decimal'; input.spellcheck = false;
    input.setAttribute('aria-label', `M 第 ${row + 1} 行第 ${col + 1} 列`);
    input.value = String(state.matrix[row][col]);
    input.addEventListener('input', () => { $('preset').value = 'custom'; markDraft(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter') apply(true); });
    $('matrix-grid').append(input); matrixInputs.push(input);
  }
}
if (stored) $('preset').value = 'custom';
const space = new Space($('space'), {
  onSelect: select,
  onViewChange: view => document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === view; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  }),
  onCameraChange: save,
  onGridChange: step => { $('grid-unit').textContent = `网格 ${format(step)} 单位`; }
});

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, camera: { yaw: space.camera.yaw, pitch: space.camera.pitch, zoom: space.camera.scale / space.fitScale } }));
    $('save-status').textContent = '已自动保存在此浏览器';
  } catch { $('save-status').textContent = '浏览器未允许保存，刷新后将恢复默认'; }
}

function message(text, type = '') {
  $('input-status').textContent = text; $('input-status').className = `input-status ${type}`;
}
function markDraft() {
  draft = true; pause(); message('输入已修改，点击「应用变换」更新画面。', 'pending');
}
function writeMatrix(matrix) {
  matrix.flat().forEach((value, index) => { matrixInputs[index].value = String(Number(value.toPrecision(12))); });
}
function readMatrix() {
  const values = matrixInputs.map(input => input.value.trim() === '' ? NaN : Number(input.value));
  return validateMatrix([values.slice(0, 3), values.slice(3, 6), values.slice(6, 9)]);
}

function apply(animate = false) {
  try {
    const vectors = parseVectors($('vectors').value), matrix = readMatrix();
    pause(); state.vectors = vectors; state.matrix = matrix; state.convention = $('convention').value;
    targets = vectors.map(v => transform(v, matrix, state.convention));
    selected = -1; draft = false;
    space.setSelected(-1); space.setData(vectors, targets); space.setOptions(state.options);
    $('vector-count').textContent = `${vectors.length} × 3`;
    $('scene-count').textContent = `${vectors.length} 个向量`;
    $('result-count').textContent = vectors.length;
    $('determinant').textContent = format(determinant(matrix));
    $('formula-note').textContent = state.convention === 'row'
      ? '每行是一个向量；计算 X′ = X M（X @ M）。'
      : '逐个计算 v′ = M v；结果仍按行显示，即 X′ = (M Xᵀ)ᵀ。';
    buildResults();
    if (animate) state.progress = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0;
    updateProgress(state.progress, true);
    message(`已应用 ${vectors.length} 个向量。${vectors.length > 24 ? '较多向量时，点击点或表格查看坐标标签。' : '可拖动画面或播放变换。'}`);
    save();
    if (animate && state.progress === 0) play();
  } catch (error) { message(error.message, 'error'); }
}

function buildResults() {
  const fragment = document.createDocumentFragment(); currentCells = [];
  state.vectors.forEach((vector, index) => {
    const row = document.createElement('tr'); row.dataset.index = index;
    const name = document.createElement('td'), button = document.createElement('button'), swatch = document.createElement('span');
    button.type = 'button'; button.className = 'vector-selector'; button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', `突出显示向量 v${index + 1}`);
    swatch.className = 'vector-dot'; swatch.style.backgroundColor = COLORS[index % COLORS.length];
    button.append(swatch, document.createTextNode(`v${index + 1}`)); name.append(button); row.append(name);
    const values = [coordinates(vector), '', coordinates(targets[index]), `${format(magnitude(vector))} → ${format(magnitude(targets[index]))}`];
    values.forEach((text, col) => { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); if (col === 1) currentCells.push(cell); });
    row.addEventListener('click', () => select(index)); fragment.append(row);
  });
  $('results').replaceChildren(fragment);
}

function select(index) {
  selected = selected === index ? -1 : index;
  space.setSelected(selected);
  $('results').querySelectorAll('tr').forEach((row, i) => {
    row.classList.toggle('selected', i === selected); row.querySelector('button').setAttribute('aria-pressed', String(i === selected));
  });
}

function updateProgress(value, table = false) {
  state.progress = value; space.setProgress(value);
  $('progress').value = String(Math.round(value * 1000));
  $('progress-value').textContent = `${Math.round(value * 100)}%`;
  $('progress').setAttribute('aria-valuetext', `${Math.round(value * 100)}%`);
  if (table) currentCells.forEach((cell, index) => { cell.textContent = coordinates(interpolate(state.vectors[index], targets[index], value)); });
}

function pause() {
  playing = false; cancelAnimationFrame(frame); frame = 0;
  $('play-icon').textContent = '▶'; $('play').setAttribute('aria-label', '播放变换');
}
function tick(time) {
  if (!playing) return;
  const delta = lastTime ? Math.min(time - lastTime, 100) : 0; lastTime = time;
  const t = Math.min(1, state.progress + delta / 3200 * state.speed);
  const refreshTable = time - tableTime > 100 || t === 1;
  updateProgress(t, refreshTable); if (refreshTable) tableTime = time;
  if (t === 1) { pause(); save(); }
  else frame = requestAnimationFrame(tick);
}
function play() {
  if (draft) { apply(true); return; }
  if (state.progress >= 1) updateProgress(0, true);
  playing = true; lastTime = 0; $('play-icon').textContent = 'Ⅱ'; $('play').setAttribute('aria-label', '暂停变换');
  frame = requestAnimationFrame(tick);
}

$('apply').addEventListener('click', () => apply(true));
$('vectors').addEventListener('input', markDraft);
$('vectors').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') apply(true); });
$('preset').addEventListener('change', () => { writeMatrix(presetMatrix($('preset').value, $('convention').value)); apply(true); });
$('convention').addEventListener('change', () => { $('preset').value = 'custom'; apply(true); });
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
  let vectors = DEFAULT_VECTORS;
  if (button.dataset.example === 'basis') vectors = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  if (button.dataset.example === 'cube') vectors = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z])));
  $('vectors').value = vectors.map(v => v.join(', ')).join('\n'); apply(true);
}));
for (const key of Object.keys(state.options)) {
  const input = $(`show-${key}`); input.checked = state.options[key];
  input.addEventListener('change', () => { state.options[key] = input.checked; space.setOptions(state.options); save(); });
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => space.setView(button.dataset.view)));
$('fit').addEventListener('click', () => { space.fit(); save(); });
$('reset-camera').addEventListener('click', () => space.setView('iso'));
$('zoom-in').addEventListener('click', () => { space.zoom(1.2); save(); });
$('zoom-out').addEventListener('click', () => { space.zoom(1 / 1.2); save(); });
$('play').addEventListener('click', () => { if (playing) { pause(); updateProgress(state.progress, true); save(); } else play(); });
$('restart').addEventListener('click', () => { pause(); updateProgress(0, true); save(); });
$('progress').addEventListener('input', event => { pause(); updateProgress(Number(event.target.value) / 1000, true); });
$('progress').addEventListener('change', save);
$('speed').addEventListener('change', event => { state.speed = Number(event.target.value); save(); });

function updateSidebar() {
  $('workspace').classList.toggle('sidebar-hidden', state.sidebarHidden);
  $('toggle-sidebar').setAttribute('aria-expanded', String(!state.sidebarHidden));
  $('toggle-sidebar').setAttribute('aria-label', state.sidebarHidden ? '显示控制面板' : '隐藏控制面板');
}
updateSidebar();
$('toggle-sidebar').addEventListener('click', () => { state.sidebarHidden = !state.sidebarHidden; updateSidebar(); save(); });
$('theme').addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = state.theme;
  $('theme').setAttribute('aria-label', state.theme === 'dark' ? '切换浅色模式' : '切换深色模式'); space.requestDraw(); save();
});
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    else message('当前浏览器不支持全屏，可隐藏控制面板扩大画布。');
  } catch { message('当前浏览器未允许进入全屏。'); }
});
document.addEventListener('fullscreenchange', () => $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏'));
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); updateProgress(state.progress, true); save(); } });
window.addEventListener('pagehide', save);

apply();
if (stored?.camera && Number.isFinite(stored.camera.yaw) && Number.isFinite(stored.camera.pitch)) {
  space.camera.yaw = stored.camera.yaw; space.camera.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, stored.camera.pitch));
  if (Number.isFinite(stored.camera.zoom)) space.zoom(stored.camera.zoom);
  space.onViewChange('free'); space.requestDraw();
}
