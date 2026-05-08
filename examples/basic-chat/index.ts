import { VynClient } from '../../sdk/typescript/dist/client.js';
import { WebSocket } from 'ws';

const client1 = new VynClient({
  url: 'ws://localhost:3000',
  webSocketImpl: WebSocket,
});

const client2 = new VynClient({
  url: 'ws://localhost:3000',
  webSocketImpl: WebSocket,
});

const topic = 'chat.general';

client1.subscribe(topic, (payload, t) => {
  console.log(`[Client 1] Received on ${t}:`, payload);
});

client2.subscribe(topic, (payload, t) => {
  console.log(`[Client 2] Received on ${t}:`, payload);
});

async function main() {
  return new Promise((resolve) => {
    // Wait for connection then publish
    setTimeout(() => {
      console.log('--- Publishing message from Client 1 ---');
      client1.publish(topic, { user: 'Alice', text: 'Hello everyone!' });

      setTimeout(() => {
        console.log('--- Publishing message from Client 2 ---');
        client2.publish(topic, { user: 'Bob', text: 'Hey Alice!' });

        setTimeout(() => {
          console.log('--- Requesting Replay on Client 2 ---');
          client2.requestReplay(topic, { sinceTimestamp: Date.now() - 10000 });
          resolve(true);
        }, 1000);
      }, 1000);
    }, 2000);
  });
}

await main();

// client1.unsubscribe(topic);
// client1.publish(topic, { user: 'Alice', text: 'Hello Bob!, I am back' });


