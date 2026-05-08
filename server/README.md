# @vynelix/vynrelay-server

The core engine of VynRelay. A high-performance, resilient real-time messaging server with built-in WebSocket and SSE support.

## Features

- **Protocol Agnostic**: Seamlessly handles WebSockets and SSE on the same routes.
- **Resilient Delivery**: Supports message persistence and delivery acknowledgments.
- **ACL Engine**: Flexible hooks for per-topic read/write permissions.
- **Topic Wildcards**: Efficiently manage thousands of topics with pattern matching.
- **Hard Hijack Interception**: Patented logic to intercept traffic on shared ports before it reaches underlying frameworks like Express.

## Installation

```bash
npm install @vynelix/vynrelay-server
```

## Standalone Usage

```typescript
import { VynServer } from '@vynelix/vynrelay-server';

const server = new VynServer({
  port: 3000,
  upgradeHandler: async (req) => {
    return { id: 'admin' };
  },
  aclHandler: async (user, topic, action) => {
    return true;
  }
});
```

## Advanced Configuration

### Persistence

VynRelay supports pluggable persistence adapters. By default, it uses an in-memory store.

```typescript
import { VynServer, RedisPersistence } from '@vynelix/vynrelay-server';

const server = new VynServer({
  port: 3000,
  persistence: new RedisPersistence({
    host: 'localhost',
    port: 6379
  })
});
```

### Topic Configuration

Control the behavior of individual topics:

```typescript
server.setTopicConfig('orders.*', {
  persistence: true,
  ackRequired: true,
  maxDeliveryAttempts: 5
});
```

## License

MIT © [Vynelix](https://vynelix.com)
