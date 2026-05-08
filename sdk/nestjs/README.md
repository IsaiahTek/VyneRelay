# @vynelix/vynrelay-nestjs

Seamless NestJS integration for VynRelay. Add real-time messaging to your existing NestJS application on the **same port** with zero configuration.

## Features

- **Shared Port Architecture**: Runs on your existing HTTP server (Express or Fastify) without needing a second port.
- **Declarative Subscriptions**: Use the `@SubscribeTopic()` decorator to handle messages in any Provider or Controller.
- **ACL & Auth Hooks**: Native support for custom authentication and access control logic.
- **Global Injection**: Inject the `VynServer` instance anywhere in your app.

## Installation

```bash
npm install @vynelix/vynrelay-nestjs @vynelix/vynrelay-server
```

## Setup

### 1. Register the Module

Import `VynRelayModule` in your `AppModule`.

```typescript
import { Module } from '@nestjs/common';
import { VynRelayModule } from '@vynelix/vynrelay-nestjs';

@Module({
  imports: [
    VynRelayModule.forRoot({
      // Shared port mode is active by default (no 'port' property provided)
      
      upgradeHandler: async (req) => {
        // Handle identity during the initial handshake (Cookies or Query string)
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const username = url.searchParams.get('x-username');
        return username ? { id: username } : null;
      },
      
      aclHandler: async (user, topic, action) => {
        // Enforce permissions
        return topic.startsWith('public.');
      }
    }),
  ],
})
export class AppModule {}
```

### 2. Subscribe to Topics

Use the `@SubscribeTopic` decorator.

```typescript
import { Injectable } from '@nestjs/common';
import { SubscribeTopic } from '@vynelix/vynrelay-nestjs';

@Injectable()
export class NotificationService {
  @SubscribeTopic('alerts.global')
  onGlobalAlert(payload: any) {
    console.log('Broadcast alert:', payload.message);
  }
}
```

### 3. Publish Messages

Inject the `VynServer` instance to push messages from your services.

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { VynServer } from '@vynelix/vynrelay-server';
import { VYN_RELAY_SERVER } from '@vynelix/vynrelay-nestjs';

@Injectable()
export class OrderService {
  constructor(
    @Inject(VYN_RELAY_SERVER) private readonly relay: VynServer
  ) {}

  async createOrder(data: any) {
    // ... logic ...
    this.relay.publish('orders.new', { orderId: 123 });
  }
}
```

## License

MIT © [Vynelix](https://vynelix.com)
