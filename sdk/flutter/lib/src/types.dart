import 'package:collection/collection.dart';

/// VynRelay SDK for Flutter
enum VynOp {
  /// Connection for VynRelay packets.
  connect('CONNECT'),

  /// Connection Acknowledgement for VynRelay packets.
  connack('CONNACK'),

  /// Publication for VynRelay packets.
  pub('PUB'),

  /// Subscription for VynRelay packets.
  sub('SUB'),

  /// Unsubscription for VynRelay packets.
  unsub('UNSUB'),

  /// Authentication for VynRelay packets.
  auth('AUTH'),

  /// Acknowledgement for VynRelay packets.
  ack('ACK'),

  /// Error for VynRelay packets.
  error('ERROR'),

  /// Replay for VynRelay packets.
  replay('REPLAY'),

  /// PING for VynRelay packets.
  ping('PING'),

  /// PONG for VynRelay packets.
  pong('PONG');

  /// The value of the VynOp.
  final String value;

  /// Creates a new VynOp.
  const VynOp(this.value);

  /// Creates a VynOp from a string value.
  static VynOp? fromString(String val) {
    return VynOp.values.firstWhereOrNull((e) => e.value == val);
  }
}

/// VynRelay packet.
class VynPacket {
  /// Unique identifier for the packet.
  final String id;

  /// The operation of the packet.
  final VynOp op;

  /// The topic of the packet (if applicable).
  final String? topic;

  /// The payload of the packet (if applicable).
  final dynamic payload;

  /// The timestamp of the packet.
  final int timestamp;

  /// Whether the packet requires an acknowledgment.
  final bool? ack;

  /// Creates a new VynPacket.
  VynPacket({
    required this.id,
    required this.op,
    this.topic,
    this.payload,
    required this.timestamp,
    this.ack,
  });

  /// Creates a new VynPacket from a JSON map.
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

  /// Converts the VynPacket to a JSON map.
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

/// A function that handles a message.
typedef VynMessageHandler = void Function(dynamic payload);
