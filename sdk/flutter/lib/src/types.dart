import 'package:collection/collection.dart';

enum VynOp {
  connect('CONNECT'),
  connack('CONNACK'),
  pub('PUB'),
  sub('SUB'),
  unsub('UNSUB'),
  auth('AUTH'),
  ack('ACK'),
  error('ERROR'),
  ping('PING'),
  pong('PONG');

  final String value;
  const VynOp(this.value);

  static VynOp? fromString(String val) {
    return VynOp.values.firstWhereOrNull((e) => e.value == val);
  }
}

class VynPacket {
  final String id;
  final VynOp op;
  final String? topic;
  final dynamic payload;
  final int timestamp;
  final bool? ack;

  VynPacket({
    required this.id,
    required this.op,
    this.topic,
    this.payload,
    required this.timestamp,
    this.ack,
  });

  factory VynPacket.fromJson(Map<String, dynamic> json) {
    return VynPacket(
      id: json['id'] as String,
      op: VynOp.fromString(json['op'] as String) ?? VynOp.error,
      topic: json['topic'] as String?,
      payload: json['payload'],
      timestamp: json['timestamp'] as int,
      ack: json['ack'] as bool?,
    );
  }

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{
      'id': id,
      'op': op.value,
      'timestamp': timestamp,
    };
    if (topic != null) map['topic'] = topic;
    if (payload != null) map['payload'] = payload;
    if (ack != null) map['ack'] = ack;
    return map;
  }
}

typedef VynMessageHandler = void Function(dynamic payload);
