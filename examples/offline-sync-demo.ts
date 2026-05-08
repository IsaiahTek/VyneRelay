import { VynClient } from '../sdk/typescript/src/client.js';
import { VynServer } from '../server/src/core/engine.js';
import { WebSocket } from 'ws';

async function runDemo() {
    console.log('--- Starting Offline Sync Demo ---');

    // 1. Start Server
    const server = new VynServer({ port: 3001 });
    server.setTopicConfig('chat.persistent', { persistence: true });

    // 2. Client A connects and subscribes
    const clientA = new VynClient({
        url: 'ws://localhost:3001',
        autoReconnect: true,
        webSocketImpl: WebSocket
    });
    let clientAReceivedCount = 0;

    clientA.subscribe('chat.persistent', (payload) => {
        console.log(`[Client A] Received: ${payload.text} (ID: ${payload.id})`);
        clientAReceivedCount++;
    });

    // Wait for connection
    await new Promise(r => setTimeout(r, 1000));

    // 3. Publish initial message
    console.log('\n--- Publishing initial message ---');
    clientA.publish('chat.persistent', { text: 'Hello while online', id: 1 });

    await new Promise(r => setTimeout(r, 500));

    // 4. "Disconnect" Client A (we'll just use a trick to ignore messages or actually close its socket)
    console.log('\n--- Simulating Client A Disconnect ---');
    // @ts-ignore - reaching into internals for demo purposes
    clientA.ws.close();
    // Client A is now disconnected and will try to reconnect automatically

    await new Promise(r => setTimeout(r, 1000));

    // 5. Publish messages while Client A is offline (using another client)
    const clientB = new VynClient({
        url: 'ws://localhost:3001',
        webSocketImpl: WebSocket
    });
    await new Promise(r => setTimeout(r, 1000));

    console.log('\n--- Publishing messages while Client A is offline ---');
    clientB.publish('chat.persistent', { text: 'Message while offline 1', id: 2 });
    clientB.publish('chat.persistent', { text: 'Message while offline 2', id: 3 });

    await new Promise(r => setTimeout(r, 1000));

    // 6. Client A should have reconnected and automatically requested replay
    console.log(`\n--- Client A Received Count: ${clientAReceivedCount} ---`);
    if (clientAReceivedCount >= 3) {
        console.log('SUCCESS: Client A received all messages including those sent while offline!');
    } else {
        console.log('FAILURE: Client A missed some messages.');
    }

    process.exit(0);
}

runDemo().catch(console.error);
