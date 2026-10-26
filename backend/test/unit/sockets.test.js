import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { io as connectClient } from 'socket.io-client';

// env.js lit les variables au moment de l'import : on les définit avant d'importer le module testé.
process.env.JWT_SECRET = 'secret-de-test';
const { initSockets, emitToUser } = await import('../../src/sockets/index.js');

let server;
let io;
let url;

before(async () => {
  server = http.createServer();
  io = initSockets(server);
  await new Promise((resolve) => server.listen(0, resolve)); // port libre choisi par le système
  url = `http://localhost:${server.address().port}`;
});

after(async () => {
  await io.close();
});

const tokenFor = (userId) => jwt.sign({ sub: userId, role: 'user' }, 'secret-de-test');
const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve));

test('un utilisateur connecté reçoit les événements qui lui sont destinés', async () => {
  const client = connectClient(url, { auth: { token: tokenFor('user-1') } });
  await once(client, 'connect');

  const received = once(client, 'message:new');
  emitToUser('user-1', 'message:new', { text: 'Bonjour !' });
  assert.deepEqual(await received, { text: 'Bonjour !' });
  client.close();
});

test('un autre utilisateur ne reçoit pas le message', async () => {
  const alice = connectClient(url, { auth: { token: tokenFor('alice') } });
  const bob = connectClient(url, { auth: { token: tokenFor('bob') } });
  await Promise.all([once(alice, 'connect'), once(bob, 'connect')]);

  let bobReceived = false;
  bob.on('message:new', () => { bobReceived = true; });
  const aliceReceived = once(alice, 'message:new');
  emitToUser('alice', 'message:new', { text: 'pour Alice' });
  await aliceReceived;
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(bobReceived, false);
  alice.close();
  bob.close();
});

test('une connexion sans jeton valide est refusée', async () => {
  const client = connectClient(url, { auth: { token: 'jeton-falsifie' }, reconnection: false });
  const error = await once(client, 'connect_error');
  assert.equal(error.message, 'unauthorized');
  client.close();
});
