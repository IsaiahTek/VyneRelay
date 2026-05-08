import 'dart:async'; // VynRelay Demo App - Updated
import 'package:flutter/material.dart';
import 'package:vynelix_relay_flutter/vynelix_relay_flutter.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'VynRelay Demo',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2563EB)),
        useMaterial3: true,
      ),
      home: const ChatPage(),
    );
  }
}

class ChatPage extends StatefulWidget {
  const ChatPage({super.key});

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  late VynClient _client;
  final List<Map<String, dynamic>> _messages = [];
  final TextEditingController _controller = TextEditingController();
  final TextEditingController _usernameController = TextEditingController(text: 'FlutterUser');
  final TextEditingController _recipientController = TextEditingController();
  bool _isConnected = false;
  bool _isJoined = false;
  bool _isPrivate = false;
  String transport = 'WS';
  String status = 'Disconnected';

  void _join() async {
    if (_usernameController.text.isEmpty) return;
    
    setState(() {
      _isJoined = true;
    });

    _client = VynClient(VynClientOptions(
      url: 'ws://localhost:3000/vynrelay',
      username: _usernameController.text,
      autoConnect: true,
    ));

    try {
      await Future.delayed(const Duration(milliseconds: 500)); 
      await _client.authenticate(_usernameController.text);
      
      _client.subscribe('user.${_usernameController.text.toLowerCase()}', (payload) {
        if (mounted) {
          setState(() {
            _messages.add({...payload, 'type': 'private'});
          });
        }
      });
    } catch (e) {
      debugPrint('Authentication error: $e');
    }

    Timer.periodic(const Duration(seconds: 1), (timer) {
      if (mounted) {
        setState(() {
          _isConnected = _client.isConnected;
          status = _isConnected ? 'Connected' : 'Connecting...';
          transport = _client.transport;
        });
      } else {
        timer.cancel();
      }
    });

    _client.subscribe('public.chat', (payload) {
      if (mounted) {
        setState(() {
          _messages.add({...payload, 'type': 'public'});
        });
      }
    });
  }

  void _sendMessage() {
    if (_controller.text.isNotEmpty) {
      final topic = _isPrivate && _recipientController.text.isNotEmpty 
          ? 'user.${_recipientController.text.toLowerCase()}' 
          : 'public.chat';

      _client.publish(topic, {
        'text': _controller.text,
        'user': _usernameController.text,
        'timestamp': DateTime.now().toString().substring(11, 16),
      });

      if (_isPrivate) {
        setState(() {
          _messages.add({
            'text': _controller.text,
            'user': 'To: ${_recipientController.text}',
            'type': 'private',
            'timestamp': 'Now'
          });
        });
      }
      _controller.clear();
    }
  }

  @override
  void dispose() {
    if (_isJoined) _client.disconnect();
    _controller.dispose();
    _usernameController.dispose();
    _recipientController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_isJoined) {
      return Scaffold(
        backgroundColor: const Color(0xFF0F172A),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32.0),
            child: Container(
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(32),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.3), blurRadius: 20)],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: const Color(0xFF2563EB),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Icon(Icons.chat_bubble_rounded, color: Colors.white, size: 32),
                  ),
                  const SizedBox(height: 24),
                  const Text('VynRelay', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white)),
                  const SizedBox(height: 32),
                  TextField(
                    controller: _usernameController,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: 'Username (e.g. FlutterDev)',
                      hintStyle: const TextStyle(color: Color(0xFF475569)),
                      filled: true,
                      fillColor: const Color(0xFF0F172A),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: _join,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2563EB),
                      foregroundColor: Colors.white,
                      minimumSize: const Size.fromHeight(56),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: const Text('Start Chatting', style: TextStyle(fontWeight: FontWeight.bold)),
                  )
                ],
              ),
            ),
          ),
        ),
      );
    }

    final filteredMessages = _messages.where((m) => 
      _isPrivate ? m['type'] == 'private' : m['type'] == 'public'
    ).toList();

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_isPrivate ? 'Direct Messages' : '# Global Chat', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            Text('$transport • $status', style: TextStyle(fontSize: 10, color: _isConnected ? Colors.green : Colors.orange)),
          ],
        ),
        backgroundColor: const Color(0xFF1E293B),
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            onPressed: () => setState(() => _isPrivate = !_isPrivate),
            icon: Icon(_isPrivate ? Icons.public : Icons.person_search),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          if (_isPrivate)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: const Color(0xFF1E293B),
              child: Row(
                children: [
                  const Text('To:', style: TextStyle(color: Color(0xFF64748B), fontWeight: FontWeight.bold)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: _recipientController,
                      style: const TextStyle(color: Colors.blue, fontWeight: FontWeight.bold),
                      decoration: const InputDecoration(
                        hintText: 'Recipient...',
                        hintStyle: TextStyle(color: Color(0xFF334155)),
                        border: InputBorder.none,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.all(24),
              itemCount: filteredMessages.length,
              itemBuilder: (context, index) {
                final m = filteredMessages[index];
                final isMe = m['user'] == _usernameController.text || m['user'].toString().startsWith('To: ');
                final isPrivate = m['type'] == 'private';

                return Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Column(
                    crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                    children: [
                      if (!isMe)
                        Padding(
                          padding: const EdgeInsets.only(left: 12, bottom: 4),
                          child: Text(m['user'], style: const TextStyle(fontSize: 10, color: Color(0xFF64748B), fontWeight: FontWeight.bold)),
                        ),
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: isMe 
                              ? (isPrivate ? const Color(0xFF9333EA) : const Color(0xFF2563EB)) 
                              : const Color(0xFF1E293B),
                          borderRadius: BorderRadius.circular(24).copyWith(
                            bottomRight: isMe ? Radius.zero : null,
                            bottomLeft: !isMe ? Radius.zero : null,
                          ),
                        ),
                        child: Text(m['text'] ?? '', style: const TextStyle(color: Colors.white)),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(24.0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: 'Message...',
                      hintStyle: const TextStyle(color: Color(0xFF475569)),
                      filled: true,
                      fillColor: const Color(0xFF1E293B),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                    ),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
                const SizedBox(width: 12),
                FloatingActionButton(
                  onPressed: _sendMessage,
                  backgroundColor: const Color(0xFF2563EB),
                  child: const Icon(Icons.send_rounded, color: Colors.white),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
