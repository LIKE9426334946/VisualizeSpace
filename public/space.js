import { COLORS, coordinates, format, gridStep, interpolate, magnitude, project, cameraBasis, dot, dragVector } from './math.js';

export class Space {
  constructor(canvas, { onSelect, onViewChange, onCameraChange, onGridChange, onVectorDragStart = () => true, onVectorChange = () => {}, onVectorDragEnd = () => {} }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSelect = onSelect;
    this.onViewChange = onViewChange;
    this.onCameraChange = onCameraChange;
    this.onGridChange = onGridChange;
    this.onVectorDragStart = onVectorDragStart;
    this.onVectorChange = onVectorChange;
    this.onVectorDragEnd = onVectorDragEnd;
    this.locked = false; this.vectorDrag = null;
    this.camera = { yaw: -0.88, pitch: 0.48, scale: 50, panX: 0, panY: 0 };
    this.options = { rays: true, trails: true, original: true, labels: true, grid: true };
    this.vectors = []; this.targets = []; this.progress = 1; this.selected = -1;
    this.pointers = new Map(); this.hits = []; this.radius = 4; this.fitScale = 50;
    this.tooltip = document.getElementById('tooltip');
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.bindControls();
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const old = Math.min(this.width || rect.width, this.height || rect.height);
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    const ratio = old ? Math.min(this.width, this.height) / old : 1;
    this.camera.scale *= ratio; this.fitScale *= ratio;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.requestDraw();
  }

  setData(vectors, targets, fit = true) {
    this.vectors = vectors; this.targets = targets;
    this.radius = Math.max(0.1, ...vectors.map(magnitude), ...targets.map(magnitude));
    this.step = gridStep(this.radius);
    this.extent = Math.ceil(this.radius / this.step) * this.step;
    this.onGridChange(this.step);
    if (fit) this.fit();
    this.requestDraw();
  }

  fit() {
    if (this.locked) return;
    this.fitScale = Math.min(this.width, this.height) / (this.radius * 2.8);
    this.camera.scale = this.fitScale;
    this.camera.panX = 0; this.camera.panY = 14;
    this.requestDraw();
  }

  setView(view) {
    if (this.locked) return;
    const positions = { iso: [-0.88, 0.48], xy: [-Math.PI / 2, Math.PI / 2], xz: [-Math.PI / 2, 0], yz: [0, 0] };
    [this.camera.yaw, this.camera.pitch] = positions[view] || positions.iso;
    this.fit(); this.onViewChange(view); this.onCameraChange();
  }

  zoom(factor) {
    if (this.vectorDrag) return;
    this.camera.scale = Math.max(this.fitScale * 0.12, Math.min(this.fitScale * 16, this.camera.scale * factor));
    this.requestDraw();
  }

  project(point) { return project(point, this.camera, this.width, this.height); }
  requestDraw() {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => { this.pending = null; this.draw(); });
  }
  setProgress(progress) { this.progress = progress; this.requestDraw(); }
  setSelected(index) { this.selected = index; this.requestDraw(); }
  setOptions(options) { Object.assign(this.options, options); this.requestDraw(); }
  setLocked(locked) {
    this.endVectorDrag(); this.locked = locked;
    this.canvas.classList.toggle('view-locked', locked);
    if (locked) this.setProgress(0);
    this.requestDraw();
  }
  endVectorDrag() {
    if (!this.vectorDrag) return;
    this.vectorDrag = null; this.canvas.classList.remove('vector-dragging');
    this.onVectorDragEnd();
  }

  line(a, b, color, width = 1, dash = [], alpha = 1, arrow = false) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    if (arrow && Math.hypot(b.x - a.x, b.y - a.y) > 14) {
      const angle = Math.atan2(b.y - a.y, b.x - a.x), size = 7;
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - size * Math.cos(angle - 0.4), b.y - size * Math.sin(angle - 0.4));
      ctx.lineTo(b.x - size * Math.cos(angle + 0.4), b.y - size * Math.sin(angle + 0.4));
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  label(text, x, y, color, background = false) {
    const ctx = this.ctx;
    ctx.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
    if (background) {
      ctx.fillStyle = this.theme.background;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(x - 3, y - 11, ctx.measureText(text).width + 6, 15);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  drawGrid() {
    const r = this.extent, step = this.step;
    const ctx = this.ctx;
    if (this.options.grid) {
      // XY 为地面；从正侧面观察时使用对应坐标平面，避免网格挤成一条线。
      const b = cameraBasis(this.camera.yaw, this.camera.pitch);
      const normal = b.back.map(Math.abs).indexOf(Math.max(...b.back.map(Math.abs)));
      const plane = Math.abs(this.camera.pitch) < 0.06 ? (normal === 0 ? [1, 2] : [0, 2]) : [0, 1];
      for (let i = -Math.round(r / step); i <= Math.round(r / step); i++) {
        if (!i) continue;
        const value = i * step;
        const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], d = [0, 0, 0];
        a[plane[0]] = value; b[plane[0]] = value; a[plane[1]] = -r; b[plane[1]] = r;
        c[plane[1]] = value; d[plane[1]] = value; c[plane[0]] = -r; d[plane[0]] = r;
        this.line(this.project(a), this.project(b), this.theme.grid, 0.75, [], 0.75);
        this.line(this.project(c), this.project(d), this.theme.grid, 0.75, [], 0.75);
      }
    }
    const origin = this.project([0, 0, 0]);
    const axisColors = ['#cc7c82', '#65a292', '#7f92c8'];
    for (let axis = 0; axis < 3; axis++) {
      const start = [0, 0, 0], end = [0, 0, 0]; start[axis] = -r; end[axis] = r;
      this.line(this.project(start), origin, this.theme.axis, 1, [3, 4], 0.45);
      const tip = this.project(end);
      this.line(origin, tip, axisColors[axis], 1.2, [], 0.8, true);
      if (Math.hypot(tip.x - origin.x, tip.y - origin.y) > 15) {
        this.label(['X', 'Y', 'Z'][axis], tip.x + 8, tip.y - 6, axisColors[axis]);
        if (this.options.grid) for (let i = -Math.round(r / step); i < Math.round(r / step); i++) {
          if (!i || Math.abs(i) % 2 !== 0) continue;
          const p = [0, 0, 0]; p[axis] = i * step; const screen = this.project(p);
          this.label(format(i * step), screen.x + 5, screen.y + 13, this.theme.label);
        }
      }
    }
    ctx.fillStyle = this.theme.axis; ctx.beginPath(); ctx.arc(origin.x, origin.y, 2.5, 0, Math.PI * 2); ctx.fill();
    this.label('O', origin.x - 14, origin.y + 15, this.theme.label);
  }

  draw() {
    const ctx = this.ctx, style = getComputedStyle(document.documentElement);
    this.theme = { grid: style.getPropertyValue('--grid').trim(), axis: style.getPropertyValue('--axis').trim(), label: style.getPropertyValue('--label').trim(), background: style.getPropertyValue('--point-bg').trim() };
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawGrid(); this.hits = [];
    const segments = [], points = [], origin = this.project([0, 0, 0]);
    this.vectors.forEach((vector, index) => {
      const target = this.targets[index], current = interpolate(vector, target, this.progress);
      const a = this.project(vector), b = this.project(target), p = this.project(current);
      const color = COLORS[index % COLORS.length], active = this.locked || this.selected < 0 || this.selected === index, alpha = active ? 1 : 0.16;
      if (this.options.rays) {
        if (this.options.original && this.progress > 0.001) segments.push({ a: origin, b: a, color, width: 1, dash: [3, 5], alpha: alpha * 0.25 });
        segments.push({ a: origin, b: p, color, width: active ? 1.7 : 1, alpha: alpha * 0.8, arrow: true });
      }
      if (this.options.trails && !this.locked) {
        segments.push({ a, b, color, width: 1.3, dash: [5, 5], alpha: alpha * 0.45 });
        segments.push({ a, b: p, color, width: 2, alpha: alpha * 0.8 });
      }
      if (!this.locked) {
        if (this.options.original) points.push({ ...a, vector, index, color, alpha: alpha * 0.8, type: 'original' });
        points.push({ ...b, vector: target, index, color, alpha: alpha * 0.65, type: 'target' });
      }
      points.push({ ...p, vector: current, index, color, alpha, type: 'current' });
    });
    segments.sort((a, b) => (a.a.depth + a.b.depth) - (b.a.depth + b.b.depth));
    for (const segment of segments) this.line(segment.a, segment.b, segment.color, segment.width, segment.dash, segment.alpha, segment.arrow);
    points.sort((a, b) => a.depth - b.depth || (a.type === 'current' ? 1 : -1));
    for (const point of points) {
      if (point.x < -40 || point.x > this.width + 40 || point.y < -40 || point.y > this.height + 40) continue;
      ctx.globalAlpha = point.alpha; ctx.lineWidth = 1.6; ctx.strokeStyle = point.color;
      ctx.fillStyle = this.theme.background;
      ctx.beginPath();
      if (point.type === 'target') {
        ctx.moveTo(point.x, point.y - 6.5); ctx.lineTo(point.x + 6.5, point.y); ctx.lineTo(point.x, point.y + 6.5); ctx.lineTo(point.x - 6.5, point.y); ctx.closePath();
        ctx.stroke();
      } else {
        ctx.arc(point.x, point.y, point.type === 'current' ? 4.8 : 4, 0, Math.PI * 2);
        if (point.type === 'current') ctx.fillStyle = point.color;
        ctx.fill(); ctx.stroke();
      }
      if (point.type === 'current' && this.selected === point.index) {
        ctx.beginPath(); ctx.arc(point.x, point.y, 10, 0, Math.PI * 2); ctx.globalAlpha = 0.35; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      this.hits.push(point);
      if (this.options.labels && point.type === 'current' && (this.selected === point.index || ((this.selected < 0 || this.locked) && this.vectors.length <= 24))) {
        this.label(`v${point.index + 1} ${coordinates(point.vector)}`, point.x + 12, point.y - 9, point.color, true);
      }
    }
    this.drawCompass();
  }

  drawCompass() {
    const center = { x: 49, y: this.height - 64 }, basis = cameraBasis(this.camera.yaw, this.camera.pitch);
    const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((v, i) => ({ v, i, depth: dot(v, basis.back) })).sort((a, b) => a.depth - b.depth);
    const colors = ['#cc7c82', '#65a292', '#7f92c8'];
    for (const { v, i } of axes) {
      const tip = { x: center.x + dot(v, basis.right) * 26, y: center.y - dot(v, basis.up) * 26 };
      this.line(center, tip, colors[i], 1.5);
      this.label(['x', 'y', 'z'][i], tip.x - 3, tip.y - 5, colors[i]);
    }
  }

  hit(x, y) {
    return [...this.hits].reverse().find(point => Math.hypot(point.x - x, point.y - y) < 12);
  }
  editableHit(x, y, radius) {
    const candidates = this.vectors.map((vector, index) => ({ ...this.project(vector), index }))
      .map(point => ({ ...point, distance: Math.hypot(point.x - x, point.y - y) }))
      .filter(point => point.distance < radius);
    // 重叠时优先拖动表格中选中的向量，其次选择最近端点。
    return candidates.find(point => point.index === this.selected) || candidates.sort((a, b) => a.distance - b.distance)[0];
  }

  bindControls() {
    const canvas = this.canvas;
    const local = event => { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; };
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('wheel', event => { event.preventDefault(); if (this.vectorDrag) return; this.zoom(Math.exp(-Math.max(-150, Math.min(150, event.deltaY)) * 0.002)); this.onCameraChange(); }, { passive: false });
    canvas.addEventListener('pointerdown', event => {
      canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
      const p = local(event);
      this.pointers.set(event.pointerId, p);
      this.drag = { x: p.x, y: p.y, moved: false, pan: event.button === 2 || event.shiftKey };
      if (this.pointers.size > 1) { this.drag.moved = true; this.endVectorDrag(); }
      if (this.locked && this.pointers.size === 1 && event.button === 0) {
        const hit = this.editableHit(p.x, p.y, event.pointerType === 'touch' ? 24 : 14);
        if (hit && this.onVectorDragStart(hit.index) !== false) {
          this.vectorDrag = { pointerId: event.pointerId, index: hit.index, start: p, vector: [...this.vectors[hit.index]], camera: { ...this.camera } };
          canvas.classList.add('vector-dragging');
          this.drag.moved = true;
        }
      }
      canvas.classList.add('dragging'); this.tooltip.hidden = true;
    });
    canvas.addEventListener('pointermove', event => {
      const p = local(event), previous = this.pointers.get(event.pointerId);
      if (!previous) {
        const hit = this.hit(p.x, p.y);
        this.tooltip.hidden = !hit;
        if (hit) {
          this.tooltip.textContent = `v${hit.index + 1} · ${{ original: '原始位置', current: '当前位置', target: '变换终点' }[hit.type]}\n${coordinates(hit.vector)}`;
          this.tooltip.style.left = `${Math.max(8, Math.min(this.width - 205, p.x + 15))}px`;
          this.tooltip.style.top = `${Math.max(8, Math.min(this.height - 70, p.y + 15))}px`;
        }
        return;
      }
      if (Math.hypot(p.x - this.drag.x, p.y - this.drag.y) > 4) this.drag.moved = true;
      const before = [...this.pointers.values()];
      this.pointers.set(event.pointerId, p);
      const after = [...this.pointers.values()];
      if (this.locked) {
        const edit = this.vectorDrag;
        if (edit && edit.pointerId === event.pointerId && after.length === 1) {
          const vector = dragVector(edit.vector, p.x - edit.start.x, p.y - edit.start.y, edit.camera);
          this.onVectorChange(edit.index, vector); this.requestDraw();
        }
        return;
      }
      if (after.length > 1) {
        const oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
        const newDistance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
        if (oldDistance > 1) this.zoom(newDistance / oldDistance);
        this.camera.panX += (after[0].x + after[1].x - before[0].x - before[1].x) / 2;
        this.camera.panY += (after[0].y + after[1].y - before[0].y - before[1].y) / 2;
      } else if (this.drag.pan) {
        this.camera.panX += p.x - previous.x; this.camera.panY += p.y - previous.y;
      } else {
        this.camera.yaw -= (p.x - previous.x) * 0.007;
        this.camera.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.pitch + (p.y - previous.y) * 0.007));
        this.onViewChange('free');
      }
      this.requestDraw();
    });
    const release = event => {
      if (!this.pointers.has(event.pointerId)) return;
      if (this.vectorDrag?.pointerId === event.pointerId) this.endVectorDrag();
      if (event.type === 'pointerup' && this.pointers.size === 1 && !this.drag.moved && event.button === 0) {
        const p = local(event), hit = this.hit(p.x, p.y); this.onSelect(hit ? hit.index : -1);
      }
      this.pointers.delete(event.pointerId);
      if (!this.pointers.size) { canvas.classList.remove('dragging'); this.onCameraChange(); }
      else this.drag.moved = true;
    };
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release); canvas.addEventListener('lostpointercapture', release);
    canvas.addEventListener('pointerleave', () => { this.tooltip.hidden = true; });
    canvas.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (this.locked && !['+', '=', '-'].includes(event.key)) return;
      if (event.key === 'Home') this.setView('iso');
      else if (['+', '=', '-'].includes(event.key)) this.zoom(event.key === '-' ? 1 / 1.15 : 1.15);
      else {
        if (event.key === 'ArrowLeft') this.camera.yaw -= 0.1;
        if (event.key === 'ArrowRight') this.camera.yaw += 0.1;
        if (event.key === 'ArrowUp') this.camera.pitch += 0.1;
        if (event.key === 'ArrowDown') this.camera.pitch -= 0.1;
        this.camera.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.pitch)); this.onViewChange('free');
      }
      this.requestDraw(); this.onCameraChange();
    });
  }
}
