import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VynServer } from '../core/engine.js';
import WebSocket from 'ws';

const TIMEOUT = 8000;

// Helper: open a WS client and collect messages immediately to avoid race conditions
function openClient(port: number): Promise<{ ws: WebSocket; messages: any[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const messages: any[] = [];
    
    ws.on('message', (data) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch (e) {
        console.error('Test Client Parse Error:', e);
      }
    });

    ws.once('open', () => resolve({ ws, messages }));
    ws.once('error', (err) => {
      console.error(`WS Error on port ${port}:`, err);
      reject(err);
    });
  });
}

// Helper: wait for a message in the buffer or arriving later
async function waitForMessage(
  client: { ws: WebSocket; messages: any[] },
  predicate: (msg: any) => boolean,
  timeoutMs = 5000
): Promise<any> {
  // 1. Check existing buffer
  for (const msg of client.messages) {
    if (predicate(msg)) return msg;
  }

  // 2. Wait for future messages
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      console.log('Current buffer before timeout:', client.messages);
      reject(new Error(`waitForMessage timeout on ${client.ws.url}`));
    }, timeoutMs);

    const handler = (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (predicate(msg)) {
          clearTimeout(timer);
          client.ws.off('message', handler);
          resolve(msg);
        }
      } catch {}
    };
    client.ws.on('message', handler);
  });
}

// Helper: send a packet and receive the CONNACK first
async function connectAndAuth(
  port: number,
  token?: string
): Promise<{ ws: WebSocket; messages: any[]; clientId: string }> {
  const client = await openClient(port);
  const connack = await waitForMessage(client, (m) => m.op === 'CONNACK');
  if (token) {
    client.ws.send(JSON.stringify({ id: 'auth-1', op: 'AUTH', payload: { token }, timestamp: Date.now() }));
    await waitForMessage(client, (m) => m.op === 'ACK' && m.id === 'auth-1');
  }
  return { ...client, clientId: connack.payload.clientId };
}

// ─────────────────────────────────────────────────────────────────────────
// Suite 1: Basic Pub/Sub & Connection
// ─────────────────────────────────────────────────────────────────────────
describe('Basic Pub/Sub', () => {
  let server: VynServer;
  const PORT = 4100;

  beforeEach(() => { server = new VynServer({ port: PORT }); });
  afterEach(async () => { await server.close(); });

  it('sends CONNACK with a clientId on connection', async () => {
    const client = await openClient(PORT);
    const msg = await waitForMessage(client, (m) => m.op === 'CONNACK');
    expect(msg.payload.clientId).toBeTruthy();
    client.ws.close();
  }, TIMEOUT);

  it('delivers a published message to a subscriber', async () => {
    const publisher = await openClient(PORT);
    await waitForMessage(publisher, (m) => m.op === 'CONNACK');

    const subscriber = await openClient(PORT);
    await waitForMessage(subscriber, (m) => m.op === 'CONNACK');

    subscriber.ws.send(JSON.stringify({ id: 's1', op: 'SUB', topic: 'test.topic', timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 100));

    publisher.ws.send(JSON.stringify({ id: 'p1', op: 'PUB', topic: 'test.topic', payload: { hello: 'world' }, timestamp: Date.now() }));

    const msg = await waitForMessage(subscriber, (m) => m.op === 'PUB' && m.id === 'p1');
    expect(msg.payload).toEqual({ hello: 'world' });

    publisher.ws.close(); subscriber.ws.close();
  }, TIMEOUT);

  it('does NOT deliver to a client that unsubscribed', async () => {
    const pub = await connectAndAuth(PORT);
    const sub = await connectAndAuth(PORT);

    sub.ws.send(JSON.stringify({ id: 's1', op: 'SUB', topic: 'unsub.test', timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 100));
    sub.ws.send(JSON.stringify({ id: 'u1', op: 'UNSUB', topic: 'unsub.test', timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 100));

    let received = false;
    sub.ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.op === 'PUB') received = true; });

    pub.ws.send(JSON.stringify({ id: 'p1', op: 'PUB', topic: 'unsub.test', payload: {}, timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 500));

    expect(received).toBe(false);
    pub.ws.close(); sub.ws.close();
  }, TIMEOUT);
});

// ─────────────────────────────────────────────────────────────────────────
// Suite 2: Authentication Middleware
// ─────────────────────────────────────────────────────────────────────────
describe('Authentication — Bearer Token (AUTH packet)', () => {
  let server: VynServer;
  const PORT = 4200;

  beforeEach(() => {
    server = new VynServer({
      port: PORT,
      authHandler: async (token) => {
        if (token === 'valid-token') return { id: 'user-1', role: 'admin' };
        return null;
      },
    });
  });
  afterEach(async () => { await server.close(); });

  it('allows PUB after successful AUTH', async () => {
    const sub = await connectAndAuth(PORT, 'valid-token');
    const pub = await connectAndAuth(PORT, 'valid-token');

    sub.ws.send(JSON.stringify({ id: 's1', op: 'SUB', topic: 'auth.test', timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 100));

    pub.ws.send(JSON.stringify({ id: 'p1', op: 'PUB', topic: 'auth.test', payload: { ok: true }, timestamp: Date.now() }));

    const msg = await waitForMessage(sub, (m) => m.op === 'PUB');
    expect(msg.payload.ok).toBe(true);

    pub.ws.close(); sub.ws.close();
  }, TIMEOUT);

  it('rejects PUB when not authenticated (no AUTH sent)', async () => {
    const client = await openClient(PORT);
    await waitForMessage(client, (m) => m.op === 'CONNACK');

    client.ws.send(JSON.stringify({ id: 'p1', op: 'PUB', topic: 'auth.test', payload: {}, timestamp: Date.now() }));

    const err = await waitForMessage(client, (m) => m.op === 'ERROR');
    expect(err.payload.code).toBe(4001);
    client.ws.close();
  }, TIMEOUT);

  it('rejects with invalid token', async () => {
    const client = await openClient(PORT);
    await waitForMessage(client, (m) => m.op === 'CONNACK');

    client.ws.send(JSON.stringify({ id: 'auth-bad', op: 'AUTH', payload: { token: 'wrong-token' }, timestamp: Date.now() }));

    const err = await waitForMessage(client, (m) => m.op === 'ERROR');
    expect(err.payload.code).toBe(4001);
    client.ws.close();
  }, TIMEOUT);
});

// ─────────────────────────────────────────────────────────────────────────
// Suite 3: Topic-Level ACLs
// ─────────────────────────────────────────────────────────────────────────
describe('ACL — Topic-Level Access Control', () => {
  let server: VynServer;
  const PORT = 4300;

  beforeEach(() => {
    server = new VynServer({
      port: PORT,
      authHandler: async (token) => ({ id: token, role: token === 'admin' ? 'admin' : 'user' }),
      aclHandler: async (user, topic, action) => {
        if (topic === 'admin.only') return user.role === 'admin';
        return true; // everything else is open
      },
    });
  });
  afterEach(async () => { await server.close(); });

  it('allows admin to publish on restricted topic', async () => {
    const adminPub = await connectAndAuth(PORT, 'admin');
    const adminSub = await connectAndAuth(PORT, 'admin');

    adminSub.ws.send(JSON.stringify({ id: 's1', op: 'SUB', topic: 'admin.only', timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 100));

    adminPub.ws.send(JSON.stringify({ id: 'p1', op: 'PUB', topic: 'admin.only', payload: { secret: true }, timestamp: Date.now() }));

    const msg = await waitForMessage(adminSub, (m) => m.op === 'PUB');
    expect(msg.payload.secret).toBe(true);
    adminPub.ws.close(); adminSub.ws.close();
  }, TIMEOUT);

  it('blocks a regular user from publishing on restricted topic', async () => {
    const client = await connectAndAuth(PORT, 'regular-user');

    client.ws.send(JSON.stringify({ id: 'p1', op: 'PUB', topic: 'admin.only', payload: {}, timestamp: Date.now() }));

    const err = await waitForMessage(client, (m) => m.op === 'ERROR');
    expect(err.payload.code).toBe(403);
    client.ws.close();
  }, TIMEOUT);

  it('blocks a user from subscribing to a restricted topic', async () => {
    const client = await connectAndAuth(PORT, 'regular-user');

    client.ws.send(JSON.stringify({ id: 's1', op: 'SUB', topic: 'admin.only', timestamp: Date.now() }));

    const err = await waitForMessage(client, (m) => m.op === 'ERROR');
    expect(err.payload.code).toBe(403);
    client.ws.close();
  }, TIMEOUT);
});

// ─────────────────────────────────────────────────────────────────────────
// Suite 4: At-Least-Once Delivery (ACKs)
// ─────────────────────────────────────────────────────────────────────────
describe('At-Least-Once Delivery (ACKs)', () => {
  let server: VynServer;
  const PORT = 4400;

  beforeEach(() => {
    server = new VynServer({ port: PORT });
    server.setTopicConfig('reliable.topic', {
      ackRequired: true,
      ackTimeoutMs: 300,    // short timeout so tests are fast
      maxDeliveryAttempts: 3,
    });
  });
  afterEach(async () => { await server.close(); });

  it('sends ack:true flag on PUB packets for ackRequired topics', async () => {
    const pub = await connectAndAuth(PORT);
    const sub = await connectAndAuth(PORT);

    sub.ws.send(JSON.stringify({ id: 's1', op: 'SUB', topic: 'reliable.topic', timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 100));

    pub.ws.send(JSON.stringify({ id: 'p1', op: 'PUB', topic: 'reliable.topic', payload: { data: 1 }, timestamp: Date.now() }));

    const msg = await waitForMessage(sub, (m) => m.op === 'PUB');
    expect(msg.ack).toBe(true);
    pub.ws.close(); sub.ws.close();
  }, TIMEOUT);

  it('retries delivery when client does NOT send ACK back', async () => {
    const pub = await connectAndAuth(PORT);
    const sub = await connectAndAuth(PORT);

    sub.ws.send(JSON.stringify({ id: 's1', op: 'SUB', topic: 'reliable.topic', timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 100));

    const received: any[] = [];
    // Sub intentionally does NOT send ACK — just records messages
    sub.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.op === 'PUB') received.push(m);
    });

    pub.ws.send(JSON.stringify({ id: 'retry-test', op: 'PUB', topic: 'reliable.topic', payload: {}, timestamp: Date.now() }));

    // Wait long enough for at least 2 retries (300ms * 2 + buffer)
    await new Promise(r => setTimeout(r, 1200));
    expect(received.length).toBeGreaterThanOrEqual(2);
    pub.ws.close(); sub.ws.close();
  }, TIMEOUT);

  it('stops retrying once client sends ACK', async () => {
    const pub = await connectAndAuth(PORT);
    const sub = await connectAndAuth(PORT);

    sub.ws.send(JSON.stringify({ id: 's1', op: 'SUB', topic: 'reliable.topic', timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 100));

    let count = 0;
    sub.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.op === 'PUB') {
        count++;
        // Properly ACK the first delivery
        sub.ws.send(JSON.stringify({ id: m.id, op: 'ACK', timestamp: Date.now() }));
      }
    });

    pub.ws.send(JSON.stringify({ id: 'ack-stop-test', op: 'PUB', topic: 'reliable.topic', payload: {}, timestamp: Date.now() }));

    // Wait much longer than the retry window — should only have been delivered once
    await new Promise(r => setTimeout(r, 1200));
    expect(count).toBe(1);
    pub.ws.close(); sub.ws.close();
  }, TIMEOUT);

  it('does NOT set ack:true on non-ackRequired topics', async () => {
    const pub = await connectAndAuth(PORT);
    const sub = await connectAndAuth(PORT);

    sub.ws.send(JSON.stringify({ id: 's1', op: 'SUB', topic: 'ephemeral.topic', timestamp: Date.now() }));
    await new Promise(r => setTimeout(r, 100));

    pub.ws.send(JSON.stringify({ id: 'e1', op: 'PUB', topic: 'ephemeral.topic', payload: {}, timestamp: Date.now() }));

    const msg = await waitForMessage(sub, (m) => m.op === 'PUB');
    expect(msg.ack).toBeFalsy();
    pub.ws.close(); sub.ws.close();
  }, TIMEOUT);
});
