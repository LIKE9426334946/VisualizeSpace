import { COLORS, DEFAULT_VECTORS, parseVectors, validateMatrix, transform, interpolate, magnitude, coordinates, format, determinant, presetMatrix, dotMetrics } from './math.js';
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
  sidebarHidden: stored?.sidebarHidden === true,
  viewLocked: stored?.viewLocked === true,
  dotPair: Array.isArray(stored?.dotPair) ? stored.dotPair.slice(0, 2) : [0, 1]
};
if (state.viewLocked) state.progress = 0;
for (const key of Object.keys(state.options)) if (typeof stored?.options?.[key] === 'boolean') state.options[key] = stored.options[key];
let targets = [], selected = -1, playing = false, frame = 0, lastTime = 0, tableTime = 0;
let currentCells = [], resultRows = [], draft = false;
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
  onGridChange: step => { $('grid-unit').textContent = `网格 ${format(step)} 单位`; },
  onVectorDragStart: index => {
    if (draft) { message('请先点击「应用变换」应用当前输入，再拖动向量。', 'pending'); return false; }
    pause(); select(index, true); return true;
  },
  onVectorChange: moveVector,
  onVectorDragEnd: save
});

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, camera: { yaw: space.camera.yaw, pitch: space.camera.pitch, zoom: space.camera.scale / space.fitScale, panX: space.camera.panX, panY: space.camera.panY } }));
    $('save-status').textContent = '已自动保存在此浏览器';
  } catch { $('save-status').textContent = '浏览器未允许保存，刷新后将恢复默认'; }
}

function message(text, type = '') {
  $('input-status').textContent = text; $('input-status').className = `input-status ${type}`;
}
function markDraft() {
  draft = true; pause(); updateProgress(state.progress, true); message('输入已修改，点击「应用变换」更新画面。', 'pending');
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
    space.setSelected(-1); space.setData(vectors, targets, !state.viewLocked || !space.vectors.length); space.setOptions(state.options);
    $('vector-count').textContent = `${vectors.length} × 3`;
    $('scene-count').textContent = `${vectors.length} 个向量`;
    $('result-count').textContent = vectors.length;
    $('determinant').textContent = format(determinant(matrix));
    $('formula-note').textContent = state.convention === 'row'
      ? '每行是一个向量；计算 X′ = X M（X @ M）。'
      : '逐个计算 v′ = M v；结果仍按行显示，即 X′ = (M Xᵀ)ᵀ。';
    buildResults(); syncDotSelectors(); updateLockUI();
    if (state.viewLocked) state.progress = 0;
    else if (animate) state.progress = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0;
    updateProgress(state.progress, true);
    message(`已应用 ${vectors.length} 个向量。${state.viewLocked ? '视角已固定，可拖动实心端点。' : vectors.length > 24 ? '较多向量时，点击点或表格查看坐标标签。' : '可拖动画面或播放变换。'}`);
    save();
    if (animate && state.progress === 0 && !state.viewLocked) play();
    return true;
  } catch (error) { message(error.message, 'error'); return false; }
}

function buildResults() {
  const fragment = document.createDocumentFragment(); currentCells = []; resultRows = [];
  state.vectors.forEach((vector, index) => {
    const row = document.createElement('tr'); row.dataset.index = index;
    const name = document.createElement('td'), button = document.createElement('button'), swatch = document.createElement('span');
    button.type = 'button'; button.className = 'vector-selector'; button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', `突出显示向量 v${index + 1}`);
    swatch.className = 'vector-dot'; swatch.style.backgroundColor = COLORS[index % COLORS.length];
    button.append(swatch, document.createTextNode(`v${index + 1}`)); name.append(button); row.append(name);
    const values = [coordinates(vector), '', coordinates(targets[index]), `${format(magnitude(vector))} → ${format(magnitude(targets[index]))}`];
    values.forEach((text, col) => { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); if (col === 1) currentCells.push(cell); });
    row.addEventListener('click', () => select(index)); fragment.append(row); resultRows.push(row);
  });
  $('results').replaceChildren(fragment);
}

function select(index, force = false) {
  selected = !force && selected === index ? -1 : index;
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
  updateDot();
}

function moveVector(index, vector) {
  state.vectors[index] = vector;
  targets[index] = transform(vector, state.matrix, state.convention);
  // 只更新向量与坐标，保持相机、缩放和网格不动，避免拖动时画面跳动。
  $('vectors').value = state.vectors.map(v => v.map(n => Number(n.toPrecision(12))).join(', ')).join('\n');
  const cells = resultRows[index].cells;
  cells[1].textContent = coordinates(vector); cells[2].textContent = coordinates(vector);
  cells[3].textContent = coordinates(targets[index]);
  cells[4].textContent = `${format(magnitude(vector))} → ${format(magnitude(targets[index]))}`;
  updateDot();
}

function syncDotSelectors() {
  const count = state.vectors.length;
  const a = Number.isInteger(state.dotPair[0]) && state.dotPair[0] >= 0 && state.dotPair[0] < count ? state.dotPair[0] : 0;
  const b = Number.isInteger(state.dotPair[1]) && state.dotPair[1] >= 0 && state.dotPair[1] < count && state.dotPair[1] !== a
    ? state.dotPair[1] : (count > 1 ? (a === 0 ? 1 : 0) : -1);
  state.dotPair = [a, b];
  ['dot-a', 'dot-b'].forEach((id, side) => {
    const select = $(id); select.replaceChildren();
    state.vectors.forEach((_, index) => {
      const option = document.createElement('option'); option.value = index; option.textContent = `v${index + 1}`; select.append(option);
    });
    select.value = String(state.dotPair[side]); select.disabled = count < 2;
  });
  updateDot();
}

function updateDot() {
  const [aIndex, bIndex] = state.dotPair;
  if (!state.vectors[aIndex] || !state.vectors[bIndex] || !targets[aIndex] || !targets[bIndex]) {
    $('dot-value').textContent = '—'; $('dot-angle').textContent = '—';
    $('dot-formula').textContent = '请至少输入两个向量，或点击「两向量示例」。';
    $('dot-context').textContent = '需要两个不同的向量才能进行比较。';
    return;
  }
  const a = interpolate(state.vectors[aIndex], targets[aIndex], state.progress);
  const b = interpolate(state.vectors[bIndex], targets[bIndex], state.progress);
  const { value, angle } = dotMetrics(a, b);
  // 展示到 6 位有效数字；计算始终使用未舍入的坐标。
  const number = n => Object.is(n, -0) || n === 0 ? '0' : String(Number(n.toPrecision(6)));
  $('dot-value').textContent = number(value);
  $('dot-angle').textContent = angle === null ? '无定义' : `${Number(angle.toFixed(2))}°`;
  $('dot-formula').textContent = `v${aIndex + 1} · v${bIndex + 1} = ${a.map((n, i) => `(${number(n)} × ${number(b[i])})`).join(' + ')} = ${number(value)}`;
  $('dot-context').textContent = angle === null ? '包含零向量：点积为 0，夹角没有定义。'
    : state.viewLocked ? '拖动任一实心端点，点积与夹角实时更新；数据为原始向量。'
      : '根据两个向量在画面中的当前位置计算，播放变换时同步更新。';
  $('dot-a').style.borderLeftColor = COLORS[aIndex % COLORS.length];
  $('dot-b').style.borderLeftColor = COLORS[bIndex % COLORS.length];
}

function updateLockUI() {
  space.setLocked(state.viewLocked);
  $('lock-view').setAttribute('aria-pressed', String(state.viewLocked));
  $('lock-view').textContent = state.viewLocked ? '已固定 · 关闭拖动' : '固定视角 / 拖动';
  $('edit-hint').hidden = !state.viewLocked;
  $('scene-card').classList.toggle('editing', state.viewLocked);
  for (const id of ['play', 'restart', 'progress', 'speed', 'reset-camera', 'fit']) $(id).disabled = state.viewLocked;
  document.querySelectorAll('[data-view]').forEach(button => { button.disabled = state.viewLocked; });
  $('scene-description').textContent = state.viewLocked ? '拖动实心端点，观察两个向量的点积。' : '从一个位置，到另一个位置。';
  $('gesture-hint').replaceChildren();
  if (state.viewLocked) $('gesture-hint').textContent = '视角已固定 · 沿屏幕平面拖动端点';
  else {
    ['拖动旋转', '·', '滚轮缩放', '·', '右键平移', '单指旋转 · 双指缩放 / 平移'].forEach((text, i) => {
      const item = document.createElement(i === 1 || i === 3 ? 'b' : 'span'); item.textContent = text;
      if (i === 5) item.className = 'touch-hint'; $('gesture-hint').append(item);
    });
  }
  $('space').setAttribute('aria-label', state.viewLocked
    ? '固定视角的三维向量图。拖动实心端点修改原始向量；滚轮或加减号缩放。点积与坐标同步显示。'
    : '三维向量图。拖动旋转，滚轮缩放，右键平移。方向键旋转，加减号缩放，Home 复位。');
}

$('lock-view').addEventListener('click', () => {
  pause(); state.viewLocked = !state.viewLocked; updateLockUI();
  updateProgress(state.viewLocked ? 0 : state.progress, true); save();
});
['dot-a', 'dot-b'].forEach((id, side) => $(id).addEventListener('change', event => {
  const previous = state.dotPair[side]; state.dotPair[side] = Number(event.target.value);
  if (state.dotPair[side] === state.dotPair[1 - side]) state.dotPair[1 - side] = previous;
  syncDotSelectors(); save();
}));
$('dot-example').addEventListener('click', () => {
  const wasLocked = state.viewLocked;
  $('vectors').value = '2, 0, 0\n1, 2, 0';
  state.dotPair = [0, 1]; state.viewLocked = true;
  if (!apply()) state.viewLocked = wasLocked;
});

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
  if (state.viewLocked) return;
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
  if (Number.isFinite(stored.camera.panX)) space.camera.panX = stored.camera.panX;
  if (Number.isFinite(stored.camera.panY)) space.camera.panY = stored.camera.panY;
  space.onViewChange('free'); space.requestDraw();
}
save();
