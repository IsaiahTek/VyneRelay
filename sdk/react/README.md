# @vynelix/vynrelay-react

React bindings for **VynRelay**. This package provides a React context and hooks for easy integration of realtime messaging into your React applications.

## 📦 Installation

```bash
npm install @vynelix/vynrelay-react @vynelix/vynrelay-sdk
```

## 🚀 Setup

Wrap your application in the `VynProvider` to initialize the connection.

```tsx
import { VynProvider } from '@vynelix/vynrelay-react';

const App = () => {
  const options = {
    url: 'ws://localhost:3000',
    autoReconnect: true,
  };

  return (
    <VynProvider options={options}>
      <MyChatComponent />
    </VynProvider>
  );
};
```

## 🎣 Hooks

### `useVynSubscription`

Subscribe to a topic and get the latest message as a state variable.

```tsx
import { useVynSubscription } from '@vynelix/vynrelay-react';

const MyChatComponent = () => {
  const latestMessage = useVynSubscription('chat.room.1');

  return (
    <div>
      <h3>Latest Message:</h3>
      <pre>{JSON.stringify(latestMessage, null, 2)}</pre>
    </div>
  );
};
```

### `useVynClient`

Access the underlying `VynClient` instance to publish messages or manage the connection manually.

```tsx
import { useVynClient } from '@vynelix/vynrelay-react';

const SendButton = () => {
  const client = useVynClient();

  const handleSend = () => {
    client.publish('chat.room.1', { text: 'Hello!' });
  };

  return <button onClick={handleSend}>Send Hello</button>;
};
```

## 📋 Features

- **Context-driven**: Single WebSocket instance shared across the component tree.
- **Auto-Cleanup**: Automatically unsubscribes from topics when components unmount.
- **TypeScript Support**: Full type safety for hooks and options.
- **Offline Sync support**: Leverages the core SDK's offline-first capabilities.

## 📄 License

MIT
