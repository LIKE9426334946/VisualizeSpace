export const COLORS = ['#6261d9', '#dc8461', '#2c9c93', '#ce649c', '#4c92c8', '#a78b3c', '#8267aa', '#69904c'];
export const DEFAULT_VECTORS = [[2, 1, 1], [1, 3, 2], [-2, 1, 2], [-1, -2, 1], [2, -2, 3]];
export const IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export const transpose = matrix => matrix[0].map((_, i) => matrix.map(row => row[i]));

export function parseVectors(text) {
  const source = text.trim();
  if (!source) throw new Error('请输入至少一个三维向量。');
  let rows;
  if (source.startsWith('[')) {
    try { rows = JSON.parse(source); }
    catch { throw new Error('JSON 格式有误，例如 [[1, 2, 3], [4, 5, 6]]。'); }
    if (Array.isArray(rows) && rows.every(value => typeof value === 'number')) rows = [rows];
  } else {
    rows = source.split(/[\n;；]+/).map(row => row.trim()).filter(Boolean)
      .map(row => row.split(/[,，\s]+/).map(Number));
  }
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw new Error('请输入 1–500 个向量。');
  rows.forEach((row, i) => {
    if (!Array.isArray(row) || row.length !== 3 || row.some(n => typeof n !== 'number' || !Number.isFinite(n))) {
      throw new Error(`第 ${i + 1} 行需要三个有限数字：x、y、z。`);
    }
    if (row.some(n => Math.abs(n) > 1e6)) throw new Error(`第 ${i + 1} 行坐标的绝对值不能超过 1,000,000。`);
  });
  return rows;
}

export function validateMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 3 || matrix.some(row => !Array.isArray(row) || row.length !== 3 || row.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e6))) {
    throw new Error('变换矩阵需要 3 × 3 个有限数字，绝对值不超过 1,000,000。');
  }
  return matrix;
}

// 每行存储一个向量。row: X′ = XM；column: X′ = (MXᵀ)ᵀ。
export function transform(vector, matrix, convention = 'row') {
  const m = convention === 'row' ? transpose(matrix) : matrix;
  return m.map(row => row.reduce((sum, value, i) => sum + value * vector[i], 0));
}

export const interpolate = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
export const magnitude = v => Math.hypot(...v);
export const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
export const determinant = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
export function format(value) {
  if (Math.abs(value) < 1e-10) return '0';
  if (Math.abs(value) >= 1e5 || Math.abs(value) < 0.001) return value.toExponential(2);
  return Number(value.toFixed(3)).toString();
}
export const coordinates = vector => `(${vector.map(format).join(', ')})`;

export function presetMatrix(name, convention = 'row') {
  const c = Math.SQRT1_2;
  const presets = {
    identity: IDENTITY,
    rotateZ: [[c, -c, 0], [c, c, 0], [0, 0, 1]],
    rotateX: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    scale: [[1.5, 0, 0], [0, 0.75, 0], [0, 0, 1.25]],
    shear: [[1, 0.8, 0], [0, 1, 0], [0, 0, 1]],
    project: [[1, 0, 0], [0, 1, 0], [0, 0, 0]]
  };
  const matrix = presets[name] || IDENTITY;
  return (convention === 'row' ? transpose(matrix) : matrix).map(row => [...row]);
}

// 正交投影的三个正交基。Z 朝上，depth 越大越靠近观察者。
export function cameraBasis(yaw, pitch) {
  const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return { right: [-s, c, 0], up: [-sp * c, -sp * s, cp], back: [cp * c, cp * s, sp] };
}
export function project(point, camera, width, height) {
  const b = cameraBasis(camera.yaw, camera.pitch);
  return {
    x: width / 2 + camera.panX + dot(point, b.right) * camera.scale,
    y: height / 2 + camera.panY - dot(point, b.up) * camera.scale,
    depth: dot(point, b.back)
  };
}
export function gridStep(radius) {
  const raw = Math.max(radius, 1e-12) / 5;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
}
