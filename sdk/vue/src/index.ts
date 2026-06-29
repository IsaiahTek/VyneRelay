import { inject, onMounted, onUnmounted, ref, type App, type InjectionKey } from 'vue';
import { VynClient, type VynClientOptions } from '@vynelix/vynrelay-sdk';

const VYN_CLIENT_KEY: InjectionKey<VynClient> = Symbol('VYN_CLIENT');

/**
 * VynPlugin — Vue 3 plugin to register VynRelay globally.
 */
export const VynPlugin = {
  install(app: App, options: VynClientOptions) {
    const client = new VynClient(options);
    app.provide(VYN_CLIENT_KEY, client);
    
    // Connect on install
    client.connect();
  }
};

/**
 * useVynClient — Composable to access the VynClient instance.
 */
export function useVynClient() {
  const client = inject(VYN_CLIENT_KEY);
  if (!client) {
    throw new Error('VynPlugin not installed or useVynClient used outside of app context');
  }
  return client;
}

/**
 * useVynSubscription — Composable to subscribe to a topic.
 * 
 * @param topic The topic to subscribe to.
 * @param callback Optional immediate callback for messages.
 * @returns A reactive ref containing the latest message data.
 */
export function useVynSubscription<T = any>(
  topic: string | (() => string),
  callback?: (data: T) => void
) {
  const client = useVynClient();
  const data = ref<T | null>(null);

  const getTopic = () => (typeof topic === 'function' ? topic() : topic);

  const handleMessage = (payload: T) => {
    data.value = payload;
    if (callback) callback(payload);
  };

  onMounted(() => {
    const t = getTopic();
    if (t) client.subscribe(t, handleMessage);
  });

  onUnmounted(() => {
    const t = getTopic();
    if (t) client.unsubscribe(t, handleMessage);
  });

  return data;
}

export * from '@vynelix/vynrelay-sdk';
