# vynelix_relay_flutter

A production-grade realtime messaging SDK for Flutter, powered by VynRelay. Supports WebSockets with automatic transparent fallback to Server-Sent Events (SSE).

## Features

- **Protocol Fallback**: Automatically switches to SSE if WebSockets are unavailable.
- **Handshake Identity**: Support for identity hinting during initial connection.
- **Heartbeat & Reconnect**: Intelligent background management of the connection lifecycle.
- **JSON First**: Seamlessly handle complex data payloads.

## Getting Started

Add the dependency to your `pubspec.yaml`:

```yaml
dependencies:
  vynelix_relay_flutter: ^1.0.0
```

## Usage

### Initialization

```dart
import 'package:vynelix_relay_flutter/vynelix_relay_flutter.dart';

final client = VynClient(VynClientOptions(
  url: 'ws://your-api.com/vynrelay',
  username: 'FlutterUser', // Identity for the initial handshake
));
```

### Authentication

```dart
await client.authenticate('your-jwt-token');
```

### Messaging

```dart
// Subscribe to a topic
client.subscribe('public.chat', (payload) {
  print('New Message: ${payload['text']}');
});

// Publish a message
client.publish('public.chat', {
  'text': 'Hello from Flutter!',
  'timestamp': DateTime.now().toIso8601String(),
});
```

### Lifecycle Management

```dart
// Check connection status
bool isConnected = client.isConnected;
String transport = client.transport; // 'WS' or 'SSE'

// Close connection
client.disconnect();
```

## Additional Information

For more details on the VynRelay ecosystem, visit [vynrelay.com](https://vynrelay.com).

## License

MIT
