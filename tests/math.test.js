import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVectors, validateMatrix, transform, interpolate, presetMatrix, determinant, project, cameraBasis, dot, gridStep, dragVector, dotMetrics } from '../public/math.js';

const close = (actual, expected) => actual.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) < 1e-9, `${actual} ≠ ${expected}`));

test('读取多行矩阵、JSON、空格、中文逗号、科学计数与单向量', () => {
  assert.deepEqual(parseVectors('1, 2, 3\n-1 0 2\n1e-3，2，3'), [[1, 2, 3], [-1, 0, 2], [0.001, 2, 3]]);
  assert.deepEqual(parseVectors('[[1,2,3],[4,5,6]]'), [[1, 2, 3], [4, 5, 6]]);
  assert.deepEqual(parseVectors('[1,2,3]'), [[1, 2, 3]]);
  assert.deepEqual(parseVectors('1 2 3; 4 5 6'), [[1, 2, 3], [4, 5, 6]]);
});

test('拒绝维度错误、非有限数、过量向量和不完整矩阵', () => {
  for (const text of ['', '[]', '{}', '1,2', '1,2,3,4', '1,Infinity,3', '[[1,"2",3]]', '1000001,2,3', '[1,2,3,]']) assert.throws(() => parseVectors(text));
  assert.throws(() => parseVectors(JSON.stringify(Array.from({ length: 501 }, () => [1, 2, 3]))));
  assert.throws(() => validateMatrix([[1, 2], [3, 4]]));
  assert.throws(() => validateMatrix([[1, 0, 0], [0, NaN, 0], [0, 0, 1]]));
});

test('非对称矩阵的右乘和左乘与手算结果一致', () => {
  const matrix = [[1, 2, 0], [0, 1, 0], [4, 0, 2]];
  close(transform([1, 2, 3], matrix, 'row'), [13, 4, 6]);
  close(transform([1, 2, 3], matrix, 'column'), [5, 2, 10]);
});

test('两种乘法约定的旋转预设均保持右手规则和向量长度', () => {
  for (const convention of ['row', 'column']) {
    close(transform([1, 0, 0], presetMatrix('rotateZ', convention), convention), [Math.SQRT1_2, Math.SQRT1_2, 0]);
    close(transform([0, 1, 0], presetMatrix('rotateX', convention), convention), [0, 0, 1]);
    assert.ok(Math.abs(determinant(presetMatrix('rotateZ', convention)) - 1) < 1e-9);
  }
});

test('零向量、零矩阵、缩放、剪切及降维投影可计算', () => {
  close(transform([0, 0, 0], presetMatrix('rotateZ')), [0, 0, 0]);
  close(transform([1, -2, 3], [[0, 0, 0], [0, 0, 0], [0, 0, 0]]), [0, 0, 0]);
  close(transform([1, -2, 3], presetMatrix('project')), [1, -2, 0]);
  close(transform([2, 4, 4], presetMatrix('scale')), [3, 3, 5]);
  close(transform([1, 2, 3], presetMatrix('shear')), [2.6, 2, 3]);
  assert.equal(determinant(presetMatrix('project')), 0);
});

test('轨迹端点与中间位置符合线性插值', () => {
  const a = [-2, 3, 1], b = [4, -1, 5];
  close(interpolate(a, b, 0), a); close(interpolate(a, b, 1), b);
  close(interpolate(a, b, 0.25), [-0.5, 2, 2]);
});

test('三维相机基正交归一，XY/XZ/YZ 正视方向正确', () => {
  const basis = cameraBasis(-0.8, 0.5);
  for (const v of Object.values(basis)) assert.ok(Math.abs(dot(v, v) - 1) < 1e-12);
  assert.ok(Math.abs(dot(basis.right, basis.up)) < 1e-12);
  assert.ok(Math.abs(dot(basis.up, basis.back)) < 1e-12);
  const camera = { yaw: -Math.PI / 2, pitch: Math.PI / 2, scale: 10, panX: 0, panY: 0 };
  const xy = project([2, 3, 99], camera, 200, 100);
  close([xy.x, xy.y], [120, 20]);
  camera.pitch = 0;
  const xz = project([2, 99, 3], camera, 200, 100); close([xz.x, xz.y], [120, 20]);
  camera.yaw = 0;
  const yz = project([99, 2, 3], camera, 200, 100); close([yz.x, yz.y], [120, 20]);
});

test('大量向量、极大和极小坐标下数值与网格保持有限', () => {
  const vectors = parseVectors(JSON.stringify(Array.from({ length: 500 }, (_, i) => [i, -i, i / 2])));
  assert.equal(vectors.length, 500);
  for (const radius of [0, 1e-12, 0.1, 1, 1e6, 1e12]) assert.ok(Number.isFinite(gridStep(radius)) && gridStep(radius) > 0);
  const result = transform([1e6, -1e6, 1e6], [[1e6, 0, 0], [0, 1e6, 0], [0, 0, 1e6]]);
  close(result, [1e12, -1e12, 1e12]);
});

test('点积与夹角覆盖锐角、垂直、反向和零向量', () => {
  assert.equal(dotMetrics([2, 0, 0], [1, 2, 0]).value, 2);
  assert.ok(Math.abs(dotMetrics([2, 0, 0], [1, 2, 0]).angle - 63.4349488229) < 1e-8);
  assert.deepEqual(dotMetrics([1, 0, 0], [0, 3, 0]), { value: 0, angle: 90 });
  assert.deepEqual(dotMetrics([2, 0, 0], [-3, 0, 0]), { value: -6, angle: 180 });
  assert.deepEqual(dotMetrics([0, 0, 0], [1, 2, 3]), { value: 0, angle: null });
  assert.equal(dotMetrics([1e-200, 0, 0], [0, 1e-200, 0]).angle, 90);
});

test('端点反投影跟随鼠标且保持深度，三个正视图分别保留第三个坐标', () => {
  const vector = [2, -1, 3];
  for (const [yaw, pitch, unchanged] of [[-0.8, 0.5, -1], [-Math.PI / 2, Math.PI / 2, 2], [-Math.PI / 2, 0, 1], [0, 0, 0]]) {
    const camera = { yaw, pitch, scale: 50, panX: 12, panY: -10 };
    const next = dragVector(vector, 40, -25, camera);
    const before = project(vector, camera, 800, 500), after = project(next, camera, 800, 500);
    close([after.x - before.x, after.y - before.y, after.depth], [40, -25, before.depth]);
    if (unchanged >= 0) assert.ok(Math.abs(next[unchanged] - vector[unchanged]) < 1e-9);
  }
  const limited = dragVector([1e6 - 1, 0, 0], 1e9, 0, { yaw: -Math.PI / 2, pitch: 0, scale: 1 });
  assert.ok(limited.every(n => Number.isFinite(n) && Math.abs(n) <= 1e6));
});
