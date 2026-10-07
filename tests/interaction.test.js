import test from 'node:test';
import assert from 'node:assert/strict';
import { Space } from '../public/space.js';
import { dotMetrics, transform, presetMatrix } from '../public/math.js';

function setup() {
  const listeners = new Map(), context = { measureText: () => ({ width: 80 }) };
  for (const name of ['setTransform', 'clearRect', 'setLineDash', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'closePath', 'fillRect', 'fillText', 'arc']) context[name] = () => {};
  const canvas = {
    getContext: () => context, getBoundingClientRect: () => ({ width: 900, height: 540, left: 0, top: 0 }),
    addEventListener: (name, callback) => listeners.set(name, callback),
    classList: { add() {}, remove() {}, toggle() {} }, focus() {}, setPointerCapture() {}
  };
  globalThis.document = { documentElement: {}, getElementById: () => ({ hidden: true, style: {} }) };
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#999' });
  const vectors = [[2, 0, 0], [1, 2, 0]], matrix = presetMatrix('project');
  const targets = vectors.map(v => transform(v, matrix));
  const changes = [], ends = [];
  const space = new Space(canvas, {
    onSelect: index => space.setSelected(index), onViewChange() {}, onCameraChange() {}, onGridChange() {},
    onVectorDragStart: index => space.setSelected(index),
    onVectorChange: (index, vector) => { vectors[index] = vector; targets[index] = transform(vector, matrix); changes.push(dotMetrics(vectors[0], vectors[1]).value); },
    onVectorDragEnd: () => ends.push(true)
  });
  space.setData(vectors, targets); space.setView('xy'); space.setLocked(true); space.draw();
  const emit = (name, props = {}) => listeners.get(name)({ type: name, pointerId: 1, pointerType: 'mouse', button: 0, preventDefault() {}, ...props });
  const drag = (index, dx, dy, pointerType = 'mouse') => {
    const p = space.project(vectors[index]);
    emit('pointerdown', { clientX: p.x, clientY: p.y, pointerType });
    emit('pointermove', { clientX: p.x + dx, clientY: p.y + dy, pointerType });
    emit('pointerup', { clientX: p.x + dx, clientY: p.y + dy, pointerType });
  };
  return { space, vectors, targets, emit, drag, changes, ends };
}

test('固定视角下分别拖动两个向量，点积立即改变，相机和比例尺保持不变', () => {
  const { space, vectors, targets, drag, changes, ends } = setup();
  const camera = { ...space.camera }, scale = camera.scale;
  drag(0, scale, 0);
  assert.ok(Math.abs(vectors[0][0] - 3) < 1e-9);
  assert.ok(Math.abs(changes[0] - 3) < 1e-9);
  drag(1, -2 * scale, 0, 'touch');
  assert.ok(Math.abs(changes[1] + 3) < 1e-9);
  assert.equal(targets[1][2], 0);
  assert.deepEqual(space.camera, camera);
  assert.equal(ends.length, 2);
});

test('固定视角阻止空白拖动、右键平移、键盘旋转和视角复位，仍可缩放', () => {
  const { space, emit, changes } = setup(), before = { ...space.camera };
  for (const button of [0, 2]) {
    emit('pointerdown', { clientX: 5, clientY: 5, button });
    emit('pointermove', { clientX: 80, clientY: 50, button });
    emit('pointerup', { clientX: 80, clientY: 50, button });
  }
  emit('keydown', { key: 'ArrowLeft' }); emit('keydown', { key: 'Home' });
  space.setView('iso'); space.fit();
  assert.deepEqual(space.camera, before); assert.equal(changes.length, 0);
  emit('wheel', { deltaY: -100 });
  assert.ok(space.camera.scale > before.scale); assert.equal(space.camera.yaw, before.yaw);
});

test('关闭固定后恢复旋转；隐藏原点连线时端点仍可拖动', () => {
  const { space, drag, changes, emit } = setup();
  space.setOptions({ rays: false }); space.draw();
  assert.equal(space.hits.length, 2);
  drag(0, 20, -20); assert.equal(changes.length, 1);
  space.setLocked(false);
  const yaw = space.camera.yaw;
  emit('pointerdown', { clientX: 5, clientY: 5 });
  emit('pointermove', { clientX: 60, clientY: 5 });
  emit('pointerup', { clientX: 60, clientY: 5 });
  assert.notEqual(space.camera.yaw, yaw);
});

test('拖动期间禁用缩放，取消手势或加入第二指后不会继续修改向量', () => {
  const { space, vectors, emit, changes, ends } = setup(), p = space.project(vectors[0]), scale = space.camera.scale;
  emit('pointerdown', { clientX: p.x, clientY: p.y });
  emit('wheel', { deltaY: -100 }); space.zoom(2);
  assert.equal(space.camera.scale, scale);
  emit('pointermove', { clientX: p.x + 10, clientY: p.y });
  emit('pointercancel');
  emit('pointermove', { clientX: p.x + 20, clientY: p.y });
  assert.equal(changes.length, 1); assert.equal(ends.length, 1);
  const q = space.project(vectors[0]);
  emit('pointerdown', { clientX: q.x, clientY: q.y, pointerType: 'touch' });
  emit('pointerdown', { pointerId: 2, clientX: q.x + 40, clientY: q.y, pointerType: 'touch' });
  emit('pointermove', { clientX: q.x + 60, clientY: q.y, pointerType: 'touch' });
  assert.equal(changes.length, 1); assert.equal(ends.length, 2);
});

test('重叠端点优先编辑已选向量；拒绝开始编辑时不覆盖输入', () => {
  const { space, vectors, drag, changes } = setup();
  vectors[1] = [...vectors[0]]; space.setSelected(1);
  drag(0, 10, 0); assert.equal(vectors[0][0], 2); assert.ok(vectors[1][0] > 2);
  const length = changes.length;
  space.onVectorDragStart = () => false;
  drag(1, 10, 0); assert.equal(changes.length, length);
});
