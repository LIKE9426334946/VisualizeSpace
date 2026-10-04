import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createServer } from '../backend/server.js';

test('Node 服务正确提供页面、静态文件、健康检查并隔离源文件', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const get = (path, method = 'GET') => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, agent: false }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end();
  });
  const home = await get('/');
  assert.equal(home.status, 200); assert.match(home.body, /VisualizeSpace/); assert.match(home.headers['content-type'], /text\/html/);
  for (const asset of ['/style.css', '/app.js', '/space.js', '/math.js', '/favicon.svg']) assert.equal((await get(asset)).status, 200, asset);
  const health = await get('/api/health'); assert.equal(JSON.parse(health.body).status, 'ok');
  const head = await get('/', 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body, '');
  assert.ok(Number(head.headers['content-length']) > 1000);
  assert.equal((await get('/', 'POST')).status, 405);
  assert.equal((await get('/%ZZ')).status, 400);
  for (const path of ['/missing.js', '/..%2fpackage.json', '/..%2fbackend%2fserver.js', '/%00.js', '/package.json']) assert.equal((await get(path)).status, 404, path);
});
