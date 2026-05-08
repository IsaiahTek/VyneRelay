// ignore_for_file: unused_field

import 'dart:async'; // VynRelay Flutter SDK - Updated
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:nanoid/nanoid.dart';
import 'types.dart';

class VynClientOptions {
  final String url;
  final String? username; // Identity hint for initial handshake
  final Future<String> Function()? getToken;
  final bool autoConnect;
  final int reconnectIntervalMs;
  final int heartbeatIntervalMs;
  final bool useSSEFallback;
  final int maxReconnectAttempts;

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

class VynClient {
  final VynClientOptions options;
  WebSocketChannel? _channel;
  bool _connected = false;
  bool _initialized = false;
  String? _clientId;
  Timer? _heartbeatTimer;
  Timer? _reconnectTimer;
  String? _currentToken;
  int _reconnectAttempts = 0;
  String _transport = 'ws'; // 'ws' or 'sse'
  StreamSubscription? _sseSubscription;

  final Map<String, Set<VynMessageHandler>> _subscriptions = {};

  VynClient(this.options) {
    if (options.autoConnect) {
      connect();
    }
  }

  bool get isConnected => _connected;
  String get transport => _transport.toUpperCase();

  Future<void> connect() async {
    if (_connected) return;

    if (_transport == 'sse') {
      return _connectSse();
    }

    try {
      String url = options.url;
      if (options.username != null) {
        final joiner = url.contains('?') ? '&' : '?';
        url += '${joiner}x-username=${Uri.encodeComponent(options.username!)}';
      }

      _channel = WebSocketChannel.connect(Uri.parse(url));
      _connected = true;

      _channel!.stream.listen(
        (data) => _handleMessage(data),
        onDone: () => _handleDisconnect(),
        onError: (err) => _handleDisconnect(),
      );

      _reconnectAttempts = 0;
      _transport = 'ws';

      _startHeartbeat();
      
      if (options.getToken != null) {
        final token = await options.getToken!();
        await authenticate(token);
      }
    } catch (e) {
      _handleDisconnect();
    }
  }

  void disconnect() {
    _connected = false;
    _channel?.sink.close();
    _heartbeatTimer?.cancel();
    _reconnectTimer?.cancel();
    _sseSubscription?.cancel();
  }

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

  void publish(String topic, dynamic payload) {
    _send(VynPacket(
      id: nanoid(),
      op: VynOp.pub,
      topic: topic,
      payload: payload,
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
          _initialized = true;
          _subscriptions.keys.forEach((topic) {
             _send(VynPacket(
                id: nanoid(),
                op: VynOp.sub,
                topic: topic,
                timestamp: DateTime.now().millisecondsSinceEpoch,
              ));
          });
          break;
        case VynOp.pub:
          if (packet.topic != null && _subscriptions.containsKey(packet.topic)) {
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
    
    if (options.useSSEFallback && _reconnectAttempts > options.maxReconnectAttempts && _transport == 'ws') {
      print('VynRelay: WebSocket failed. Falling back to SSE...');
      _connectSse();
      return;
    }

    final delay = (options.reconnectIntervalMs * (1 << (_reconnectAttempts > 5 ? 5 : _reconnectAttempts))).clamp(1000, 30000);
    print('VynRelay: Disconnected. Reconnecting in ${delay}ms... (Attempt $_reconnectAttempts)');

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
      }, onDone: () => _handleDisconnect(), onError: (e) => _handleDisconnect());

      _startHeartbeat();
    } catch (e) {
      _handleDisconnect();
    }
  }

  void _startHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(Duration(milliseconds: options.heartbeatIntervalMs), (timer) {
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
    if (!_connected) return;
    
    final json = jsonEncode(packet.toJson());
    
    if (_transport == 'ws' && _channel != null) {
      _channel!.sink.add(json);
    } else {
      String baseUrl = options.url.replaceFirst('ws', 'http');
      if (baseUrl.endsWith('/vynrelay')) {
        baseUrl = baseUrl.substring(0, baseUrl.length - 9);
      }
      final postUrl = '$baseUrl/vynrelay/packet';
      http.post(
        Uri.parse(postUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'clientId': _clientId,
          'packet': packet.toJson(),
        }),
      ).then((res) {
        if (res.statusCode != 200) {
          print('VynRelay SSE Send Error: ${res.statusCode}');
        }
      }).catchError((e) {
        print('VynRelay SSE Send Error: $e');
      });
    }
  }
}
