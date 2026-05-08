# VynRelay

VynRelay is a production-grade real-time messaging ecosystem designed for high availability and zero-config integration. It uniquely supports **Shared Port Architecture**, allowing you to run your messaging engine on the same port as your existing NestJS or Express application without conflicts.

## Key Features

- **Shared Port Mode**: Intercept and handle real-time traffic (WS/SSE) on your main HTTP port.
- **Dedicated Port Mode**: Run as a separate messaging microservice on its own port.
- **Protocol Resiliency**: Transparent fallback from WebSockets to Server-Sent Events (SSE).
- **Secure by Design**: Pluggable ACL and Authentication hooks for granular control.
- **Cross-Platform**: Native SDKs for TypeScript (Web/Node) and Flutter (iOS/Android).
- **Distributed Persistence**: In-memory by default, with easy Redis/PostgreSQL adapters.

## Ecosystem Packages

| Package | Purpose | Version |
| :--- | :--- | :--- |
| [`@vynelix/vynrelay-server`](./server) | Core Engine & Standalone Server | `1.0.0` |
| [`@vynelix/vynrelay-sdk`](./sdk/typescript) | TypeScript Client (Web & Node) | `1.0.0` |
| [`@vynelix/vynrelay-nestjs`](./sdk/nestjs) | NestJS Module & Decorators | `1.0.0` |
| [`vynelix_relay_flutter`](./sdk/flutter) | Flutter Client (Mobile & Desktop) | `1.0.0` |

## Quick Start (NestJS + Web)

### 1. Install
```bash
npm install @vynelix/vynrelay-nestjs @vynelix/vynrelay-sdk
```

### 2. Configure Backend
```typescript
// app.module.ts
VynRelayModule.forRoot({
  // Omit 'port' for Shared Port Mode (uses NestJS port)
  // Or: port: 3001 for Dedicated Port Mode
  upgradeHandler: async (req) => {
    return { id: 'alice' };
  }
})
```

### 3. Connect Frontend
```typescript
import { VynClient } from '@vynelix/vynrelay-sdk';

const client = new VynClient({
  // Shared Port: Connect to the NestJS URL + /vynrelay
  url: 'ws://localhost:3000/vynrelay',
  
  // Dedicated Port: Connect directly to the VynRelay port
  // url: 'ws://localhost:3001',
  
  username: 'alice'
});

client.subscribe('public.chat', (msg) => console.log(msg));
```

## Documentation

- [Server Configuration](./server/README.md)
- [TypeScript SDK Guide](./sdk/typescript/README.md)
- [NestJS Integration](./sdk/nestjs/README.md)
- [Flutter SDK Guide](./sdk/flutter/README.md)

## License

MIT © [Vynelix](https://vynelix.com)
