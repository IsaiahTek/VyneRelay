export type PacketOp = 
  | 'CONNECT'
  | 'CONNACK'
  | 'PUB'
  | 'SUB'
  | 'UNSUB'
  | 'ACK'
  | 'PING'
  | 'PONG'
  | 'REPLAY'
  | 'ERROR'
  | 'AUTH';

export interface Packet {
  id: string;
  op: PacketOp;
  topic?: string;
  payload?: any;
  timestamp: number;
  ack?: boolean;
}

export interface SubscriptionCallback {
  (payload: any, topic: string): void;
}
