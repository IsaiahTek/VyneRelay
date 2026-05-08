import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VynServer } from '../core/engine.js';
import http from 'http';

describe('SSE Transport', () => {
  let server: VynServer;
  const PORT = 4500;

  beforeEach(() => { server = new VynServer({ port: PORT }); });
  afterEach(async () => { await server.close(); });

  it('allows connection via SSE and receives CONNACK', async () => {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${PORT}/vynrelay/sse`, (res) => {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toBe('text/event-stream');

            res.on('data', (chunk) => {
                const raw = chunk.toString();
                console.log('Received chunk:', raw);
                const lines = raw.split('\n\n');
                for (let line of lines) {
                    if (!line.trim().startsWith('data: ')) continue;
                    const jsonStr = line.replace('data: ', '').trim();
                    try {
                        const data = JSON.parse(jsonStr);
                        console.log('Parsed SSE data:', data.op);
                        if (data.op === 'CONNACK') {
                            expect(data.payload.clientId).toBeTruthy();
                            req.destroy();
                            resolve(true);
                        }
                    } catch (e) {
                        console.error('Parse error in test:', e, 'on line:', jsonStr);
                    }
                }
            });
        });
        req.on('error', reject);
    });
  });

  it('delivers a message via SSE after subscribing via HTTP POST', async () => {
    let clientId: string = '';
    
    // 1. Connect via SSE
    const ssePromise = new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${PORT}/vynrelay/sse`, (res) => {
            res.on('data', async (chunk) => {
                const lines = chunk.toString().split('\n\n');
                for (let line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.replace('data: ', '').trim();
                    if (!jsonStr) continue;
                    
                    try {
                        const data = JSON.parse(jsonStr);
                        
                        if (data.op === 'CONNACK') {
                            clientId = data.payload.clientId;
                            // 2. Subscribe via POST
                            const subPacket = {
                                clientId,
                                packet: { id: 's1', op: 'SUB', topic: 'sse.test', timestamp: Date.now() }
                            };
                            const postReq = http.request({
                                hostname: 'localhost',
                                port: PORT,
                                path: '/vynrelay/packet',
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' }
                            }, (postRes) => {
                                expect(postRes.statusCode).toBe(200);
                            });
                            postReq.write(JSON.stringify(subPacket));
                            postReq.end();
                        } else if (data.op === 'PUB') {
                            expect(data.topic).toBe('sse.test');
                            expect(data.payload.hello).toBe('sse');
                            req.destroy();
                            resolve(true);
                        }
                    } catch (e) {
                        console.error('Test parse error:', e, 'on line:', jsonStr);
                    }
                }
            });
        });
        req.on('error', reject);
    });

    // Wait a bit for subscription to register
    await new Promise(r => setTimeout(r, 200));

    // 3. Publish a message (using internal trigger or another client)
    const pubPacket = {
        clientId: 'any', // server-side internal publish would be better but let's use a dummy session or just trigger it
        packet: { id: 'p1', op: 'PUB', topic: 'sse.test', payload: { hello: 'sse' }, timestamp: Date.now() }
    };
    
    // We need a session to publish, or we can use the same SSE session to publish
    // Since handleMessage requires a valid session:
    await new Promise((resolve) => {
        const postReq = http.request({
            hostname: 'localhost',
            port: PORT,
            path: '/vynrelay/packet',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, (res) => resolve(res));
        postReq.write(JSON.stringify({ clientId, packet: pubPacket.packet }));
        postReq.end();
    });

    return ssePromise;
  });
});
