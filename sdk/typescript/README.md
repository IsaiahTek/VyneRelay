# @vynelix/vynrelay-sdk

Universal real-time messaging SDK for VynRelay. Supports WebSockets with automatic transparent fallback to Server-Sent Events (SSE).

## Features

- **Universal**: Works in Browsers and Node.js.
- **Smart Fallback**: Automatically switches to SSE if WebSockets are blocked (e.g., by restrictive firewalls or corporate proxies).
- **Identity Hinting**: Passes user identity during the initial handshake to support strict server-side routing.
- **Auto-Sync**: Automatically resubscribes and requests message replays after a reconnection.
- **Shared Port Support**: Designed to work seamlessly on the same port as your NestJS/Express application.

## Installation

```bash
npm install @vynelix/vynrelay-sdk
```

## Quick Start

### Basic Initialization

```typescript
import { VynClient } from '@vynelix/vynrelay-sdk';

const client = new VynClient({
  url: 'ws://your-api.com/vynrelay',
  username: 'Alice', // Identity hint for the server handshake
  autoReconnect: true,
});
```

### Messaging

```typescript
// Subscribe to a topic
const unsubscribe = client.subscribe('public.chat', (payload) => {
  console.log('Received:', payload);
});

// Publish a message
client.publish('public.chat', {
  text: 'Hello VynRelay!',
  timestamp: Date.now()
});

// Cleanup
unsubscribe();
```

### Authentication

If your server requires token-based authentication (bearer tokens):

```typescript
await client.authenticate('your-jwt-token');
```

## Advanced Usage

### SSE Fallback Configuration

By default, the client will try to reconnect via WebSocket 10 times before falling back to SSE. You can customize this behavior:

```typescript
const client = new VynClient({
  url: 'ws://api.com/vynrelay',
  maxReconnectAttempts: 3, // Fallback faster
  useSSEFallback: true
});
```

### Node.js Support

To use the SDK in Node.js, you need to provide WebSocket and EventSource implementations:

```typescript
import { VynClient } from '@vynelix/vynrelay-sdk';
import { WebSocket } from 'ws';
import EventSource from 'eventsource';

const client = new VynClient({
  url: 'ws://localhost:3000/vynrelay',
  webSocketImpl: WebSocket,
  eventSourceImpl: EventSource
});
```

## License

MIT © [Vynelix](https://vynelix.com)
