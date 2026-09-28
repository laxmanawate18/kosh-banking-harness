import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/services/chatSocket.ts', import.meta.url), 'utf8')
  .replace("import { get, post } from './api';", 'const get = () => {}; const post = () => {};');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { ChatSocketManager } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
class FakeSocket {
  static OPEN = 1;
  static instances = [];
  readyState = 0;
  sent = [];
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  close() { this.readyState = 3; }
  send(data) { this.sent.push(JSON.parse(data)); }
  ready(id) { this.readyState = 1; this.onmessage({data: JSON.stringify({type: 'connection_ready', session_id: id})}); }
}
globalThis.WebSocket = FakeSocket;
globalThis.window = {location: {protocol: 'http:', host: 'localhost:3001'}, setTimeout, clearTimeout};

test('waits for server readiness and uses the current origin proxy', async () => {
  const manager = new ChatSocketManager();
  let ready = false;
  const promise = manager.connect(undefined, true).then(() => {ready = true;});
  const socket = FakeSocket.instances.at(-1);
  assert.equal(socket.url, 'ws://localhost:3001/ws/chat?visitor=true');
  socket.readyState = 1;
  await Promise.resolve();
  assert.equal(ready, false);
  socket.ready('GUEST-one');
  await promise;
  manager.sendPrompt('Hello');
  assert.deepEqual(socket.sent, [{type: 'prompt', prompt: 'Hello', language: 'en'}]);
  manager.disconnect(); socket.onclose();
});

test('late close and messages from replaced sockets cannot corrupt a new session', async () => {
  const manager = new ChatSocketManager();
  const events = [];
  manager.subscribe(e => events.push(e));
  const first = manager.connect('old', true);
  const old = FakeSocket.instances.at(-1); old.ready('old'); await first;
  const second = manager.connect('new', false);
  const current = FakeSocket.instances.at(-1); current.ready('new'); await second;
  old.onclose();
  old.onmessage({data: JSON.stringify({type:'text_delta', text:'private old content'})});
  manager.sendPrompt('New account');
  assert.equal(current.sent.length, 1);
  assert.equal(events.some(e => e.type === 'disconnected' || e.textDelta), false);
  current.onclose();
  assert.equal(events.at(-1).type, 'disconnected');
  assert.throws(() => manager.sendPrompt('Disconnected'), /not open/);
});

test('server rejection before readiness settles the connection promise', async () => {
  const manager = new ChatSocketManager();
  const promise = manager.connect('missing-session');
  FakeSocket.instances.at(-1).onclose();
  await assert.rejects(promise, /closed/);
});

test('adopting the server assigned guest id reuses the connection', async () => {
  const manager = new ChatSocketManager();
  const first = manager.connect(undefined, true);
  const socket = FakeSocket.instances.at(-1); socket.ready('GUEST-server'); await first;
  const count = FakeSocket.instances.length;
  await manager.connect('GUEST-server', true);
  assert.equal(FakeSocket.instances.length, count);
  manager.disconnect(); socket.onclose();
});
