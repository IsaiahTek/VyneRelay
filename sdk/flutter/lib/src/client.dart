// ignore_for_file: unused_field

import 'dart:async'; // VynRelay Flutter SDK - Updated
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:nanoid/nanoid.dart';
import 'package:flutter/foundation.dart';
import 'types.dart';

/// VynClientOptions specify how you want to connect to a VynRelay Realtime Messaging server.
class VynClientOptions {
  /// The URL of the VynRelay server.
  final String url;

  /// The username to use for authentication.
  final String? username; // Identity hint for initial handshake

  /// Optional function to retrieve an authentication token.
  final Future<String> Function()? getToken;

  /// Whether to automatically connect to the server.
  final bool autoConnect;

  /// The interval in milliseconds at which to reconnect to the server.
  final int reconnectIntervalMs;

  /// The interval in milliseconds at which to send heartbeat pings.
  final int heartbeatIntervalMs;

  /// Whether to fall back to SSE if WebSocket fails.
  final bool useSSEFallback;

  /// The maximum number of reconnect attempts.
  final int maxReconnectAttempts;

  /// Creates a new instance of VynClientOptions.
  VynClientOptions({
    required this.url,
    this.username,
    this.getToken,
    this.autoConnect = true,
    this.reconnectIntervalMs = 5000,
    this.heartbeatIntervalMs = 30000,
    this.useSSEFallback = true,
    this.maxReconnectAttempts = 5,
  });
}

/// VynClient is a Dart client for connecting to a VynRelay Realtime Messaging server.
class VynClient {
  /// The options used to configure the client.
  final VynClientOptions options;
  
  WebSocketChannel? _channel;
  bool __connected = false;
  bool _initialized = false;
  String? _clientId;
  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;
  String? _currentToken;
  int _reconnectAttempts = 0;
  String _transport = 'ws'; // 'ws' or 'sse'
  StreamSubscription? _sseSubscription;

  final Map<String, Set<VynMessageHandler>> _subscriptions = {};
  final List<VynPacket> _messageQueue = [];
  void Function(bool)? _statusCallback;

  /// Creates a new instance of VynClient.
  VynClient(this.options) {
    if (options.autoConnect) {
      connect();
    }
  }

  set _connected(bool value) {
    if (__connected != value) {
      __connected = value;
      _statusCallback?.call(__connected);
    }
  }

  bool get _connected => __connected;

  bool get isConnected => _connected;

  /// Sets the callback to be called when the client's connection status changes.
  void onStatusChange(void Function(bool) callback) {
    _statusCallback = callback;
    // Immediate callback with current state
    callback(_connected);
  }

  /// Gets the current transport method (WS or SSE).
  String get transport => _transport.toUpperCase();

  /// Connects to the VynRelay server.
  Future<void> connect() async {
    if (_connected) return;

    if (_transport == 'sse') {
      return _connectSse();
    }

    try {
      Uri uri = Uri.parse(options.url);
      if (options.username != null) {
        final queryParams = Map<String, String>.from(uri.queryParameters);
        queryParams['x-username'] = options.username!;
        uri = uri.replace(queryParameters: queryParams, fragment: '');
      }

      debugPrint('VynRelay: Connecting to $uri (WS)...');
      _channel = WebSocketChannel.connect(uri);

      _channel!.stream.listen(
        (data) => _handleMessage(data),
        onDone: () => _handleDisconnect(),
        onError: (err) {
          debugPrint('VynRelay: WebSocket Error: $err');
          _handleDisconnect();
        },
      );

      _reconnectAttempts = 0;
      _transport = 'ws';

      _startHeartbeat();

      if (options.getToken != null) {
        final token = await options.getToken!();
        await authenticate(token);
      }
    } catch (e) {
      debugPrint('VynRelay: Connection Error: $e');
      _handleDisconnect();
    }
  }

  /// Disconnects from the VynRelay server.
  void disconnect() {
    _connected = false;
    _channel?.sink.close();
    _heartbeatTimer?.cancel();
    _reconnectTimer?.cancel();
    _sseSubscription?.cancel();
  }

  /// Authenticates the client using the provided token.
  Future<void> authenticate(String token) async {
    _currentToken = token;
    if (!_connected) return;

    _send(VynPacket(
      id: nanoid(),
      op: VynOp.auth,
      payload: {'token': token},
      timestamp: DateTime.now().millisecondsSinceEpoch,
    ));
  }

  /// Subscribes to a topic and registers a message handler.
  void subscribe(String topic, VynMessageHandler handler) {
    if (!_subscriptions.containsKey(topic)) {
      _subscriptions[topic] = {};
      _send(VynPacket(
        id: nanoid(),
        op: VynOp.sub,
        topic: topic,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      ));
    }
    _subscriptions[topic]!.add(handler);
  }

  /// Unsubscribes from a topic and removes a message handler.
  void unsubscribe(String topic, VynMessageHandler handler) {
    if (!_subscriptions.containsKey(topic)) return;
    _subscriptions[topic]!.remove(handler);

    if (_subscriptions[topic]!.isEmpty) {
      _subscriptions.remove(topic);
      _send(VynPacket(
        id: nanoid(),
        op: VynOp.unsub,
        topic: topic,
        timestamp: DateTime.now().millisecondsSinceEpoch,
      ));
    }
  }

  /// Publishes a message to a topic.
  void publish(String topic, dynamic payload) {
    _send(VynPacket(
      id: nanoid(),
      op: VynOp.pub,
      topic: topic,
      payload: payload,
      timestamp: DateTime.now().millisecondsSinceEpoch,
    ));
  }

  /// Replays messages from a topic.
  void replay(String topic, {String? sinceId, int? sinceTimestamp}) {
    _send(VynPacket(
      id: nanoid(),
      op: VynOp.replay,
      topic: topic,
      payload: {
        if (sinceId != null) 'sinceId': sinceId,
        if (sinceTimestamp != null) 'sinceTimestamp': sinceTimestamp,
      },
      timestamp: DateTime.now().millisecondsSinceEpoch,
    ));
  }

  void _handleMessage(dynamic data) {
    try {
      final json = jsonDecode(data.toString());
      final packet = VynPacket.fromJson(json);

      switch (packet.op) {
        case VynOp.connack:
          _clientId = packet.payload['clientId'];
          _connected = true;
          _initialized = true;
          debugPrint('VynRelay: Registered with ClientID $_clientId');
          
          // Resubscribe to all active topics
          _subscriptions.keys.forEach((topic) {
            _send(VynPacket(
              id: nanoid(),
              op: VynOp.sub,
              topic: topic,
              timestamp: DateTime.now().millisecondsSinceEpoch,
            ));
          });
          _flushQueue();
          break;
        case VynOp.pub:
          if (packet.topic != null &&
              _subscriptions.containsKey(packet.topic)) {
            for (final handler in _subscriptions[packet.topic]!) {
              handler(packet.payload);
            }
          }
          if (packet.ack == true) {
            _send(VynPacket(
              id: packet.id,
              op: VynOp.ack,
              timestamp: DateTime.now().millisecondsSinceEpoch,
            ));
          }
          break;
        case VynOp.error:
          print('VynRelay Error: ${packet.payload}');
          break;
        default:
          break;
      }
    } catch (e) {
      print('VynRelay Parse Error: $e');
    }
  }

  void _handleDisconnect() {
    if (!_connected && _reconnectTimer?.isActive == true) return;

    _connected = false;
    _heartbeatTimer?.cancel();
    _channel?.sink.close();
    _sseSubscription?.cancel();

    _reconnectAttempts++;

    if (options.useSSEFallback &&
        _reconnectAttempts > options.maxReconnectAttempts &&
        _transport == 'ws') {
      print('VynRelay: WebSocket failed. Falling back to SSE...');
      _connectSse();
      return;
    }

    final delay = (options.reconnectIntervalMs *
            (1 << (_reconnectAttempts > 5 ? 5 : _reconnectAttempts)))
        .clamp(1000, 30000);
    print(
        'VynRelay: Disconnected. Reconnecting in ${delay}ms... (Attempt $_reconnectAttempts)');

    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(Duration(milliseconds: delay), () {
      if (_transport == 'ws') {
        connect();
      } else {
        _connectSse();
      }
    });
  }

  Future<void> _connectSse() async {
    _transport = 'sse';
    String baseUrl = options.url.replaceFirst('ws', 'http');
    if (baseUrl.endsWith('/vynrelay')) {
      baseUrl = baseUrl.substring(0, baseUrl.length - 9);
    }

    String sseUrl = '$baseUrl/vynrelay/sse';
    if (options.username != null) {
      final joiner = sseUrl.contains('?') ? '&' : '?';
      sseUrl += '${joiner}x-username=${Uri.encodeComponent(options.username!)}';
    }

    try {
      final client = http.Client();
      final request = http.Request('GET', Uri.parse(sseUrl));
      request.headers['Accept'] = 'text/event-stream';
      request.headers['Cache-Control'] = 'no-cache';

      final response = await client.send(request);
      _connected = true;

      _sseSubscription = response.stream
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen((line) {
        if (line.startsWith('data: ')) {
          _handleMessage(line.substring(6));
        }
      },
              onDone: () => _handleDisconnect(),
              onError: (e) => _handleDisconnect());

      _startHeartbeat();
    } catch (e) {
      _handleDisconnect();
    }
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(
        Duration(milliseconds: options.heartbeatIntervalMs), (timer) {
      if (_connected) {
        _send(VynPacket(
          id: nanoid(),
          op: VynOp.ping,
          timestamp: DateTime.now().millisecondsSinceEpoch,
        ));
      }
    });
  }

  void _send(VynPacket packet) {
    if (_connected) {
      final json = jsonEncode(packet.toJson());

      if (_transport == 'ws' && _channel != null) {
        try {
          _channel!.sink.add(json);
        } catch (e) {
          debugPrint('VynRelay: Failed to send WS packet: $e');
          _handleDisconnect();
        }
      } else {
        _sendSse(packet);
      }
    } else {
      debugPrint('VynRelay: Offline. Queuing packet ${packet.op}');
      _messageQueue.add(packet);
    }
  }

  void _flushQueue() {
    if (_messageQueue.isNotEmpty && _connected) {
      debugPrint('VynRelay: Flushing ${_messageQueue.length} queued messages');
      while (_messageQueue.isNotEmpty && _connected) {
        final packet = _messageQueue.removeAt(0);
        _send(packet);
      }
    }
  }

  void _sendSse(VynPacket packet) {
    final json = jsonEncode(packet.toJson());
    String baseUrl = options.url.replaceFirst('ws', 'http');
    if (baseUrl.endsWith('/vynrelay')) {
      baseUrl = baseUrl.substring(0, baseUrl.length - 9);
    }
    final postUrl = '$baseUrl/vynrelay/packet';
    http
        .post(
      Uri.parse(postUrl),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'clientId': _clientId,
        'packet': packet.toJson(),
      }),
    )
        .then((res) {
      if (res.statusCode != 200) {
        print('VynRelay SSE Send Error: ${res.statusCode}');
      }
    }).catchError((e) {
      print('VynRelay SSE Send Error: $e');
    });
  }
}
