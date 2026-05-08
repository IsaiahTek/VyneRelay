# @vynelix/vynrelay-vue

Vue 3 plugin and composables for **VynRelay**. This package provides a reactive way to integrate realtime messaging into your Vue applications.

## 📦 Installation

```bash
npm install @vynelix/vynrelay-vue @vynelix/vynrelay-sdk
```

## 🚀 Setup

Register the `VynPlugin` in your main Vue app file.

```typescript
import { createApp } from 'vue';
import { VynPlugin } from '@vynelix/vynrelay-vue';
import App from './App.vue';

const app = createApp(App);

app.use(VynPlugin, {
  url: 'ws://localhost:3000',
  autoReconnect: true,
});

app.mount('#app');
```

## 🧪 Composables

### `useVynSubscription`

Subscribe to a topic and get a reactive ref containing the latest message.

```vue
<script setup>
import { useVynSubscription } from '@vynelix/vynrelay-vue';

// Subscribe to a static topic
const latestMessage = useVynSubscription('chat.room.1');

// Or a dynamic topic (using a getter function)
const topic = ref('chat.room.1');
const dynamicMessage = useVynSubscription(() => topic.value);
</script>

<template>
  <div>
    <h3>Latest Message:</h3>
    <pre>{{ latestMessage }}</pre>
  </div>
</template>
```

### `useVynClient`

Access the underlying `VynClient` instance.

```typescript
import { useVynClient } from '@vynelix/vynrelay-vue';

const client = useVynClient();

const sendMessage = () => {
  client.publish('chat.room.1', { text: 'Hello from Vue!' });
};
```

## 📋 Features

- **Vue 3 Optimized**: Built specifically for the Composition API.
- **Reactive Hooks**: Messages are stored in Vue `ref` objects for automatic UI updates.
- **Auto-Cleanup**: Automatically unsubscribes when the component is unmounted.
- **TypeScript Support**: Full type definitions for options and return values.

## 📄 License

MIT
