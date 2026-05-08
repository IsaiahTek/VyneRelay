# Realtime Messaging Engine (WebSocket + IoT + Offline-First) — Build Prompt

## 🎯 Objective
Build a **production-ready, developer-friendly realtime messaging system** that combines:
- WebSocket simplicity
- Pub/Sub topics
- Optional persistence + replay
- Offline-first sync
- IoT + Web compatibility
- Strong security and delivery guarantees

This system should outperform typical solutions like Socket.IO, Pusher, and partially Ably by being:
- Flexible (pluggable architecture)
- Offline-capable
- Protocol-agnostic
- Self-hostable

---

## 🧠 Core Principles

1. **Stateless Core, Optional State**
   - Default: ephemeral messaging (fast, no storage)
   - Optional: persistent mode per topic

2. **Developer Experience First**
   - Clean SDK APIs
   - Minimal boilerplate
   - Sensible defaults

3. **Offline-First Design**
   - Clients should continue working without internet
   - Sync automatically on reconnect

4. **Protocol Flexibility**
   - Support JSON + Binary (for IoT)
   - Custom protocol layer possible

---

## 🏗️ System Architecture

### 1. Server (Core Engine)
- WebSocket server (high-performance, e.g., Rust or Node)
- Connection manager (sessions, heartbeats)
- Topic registry (hierarchical topics)
- Message router
- Auth middleware
- Rate limiter

### 2. Messaging Layer
- Pub/Sub system
- Topic-based routing:
  - e.g. `tracker.location.device123`
  - e.g. `chat.room.45`

### 3. Persistence Layer (Pluggable)
- In-memory (default)
- Optional adapters:
  - Redis
  - PostgreSQL
  - File log

### 4. Delivery System
- Message IDs
- ACK/NACK support
- Retry logic
- Delivery guarantees:
  - At most once
  - At least once (default for persistence)

---

## 📡 Client SDK Features

- Auto connect/reconnect
- Exponential backoff
- Local message queue (offline)
- Message deduplication
- Subscription manager
- Replay support

### Example API

```dart
client.subscribe("orders.new", (data) {
  print(data);
});

client.publish("orders.new", {...});
```

---

## 🔄 Offline Sync Engine

- Queue outgoing messages locally
- Store last received message ID
- On reconnect:
  - Replay missed messages
  - Sync state
- Conflict handling strategy (basic versioning)

---

## 🔐 Security Model

- JWT/API key authentication
- Topic-level ACLs:
  - Who can publish
  - Who can subscribe
- Rate limiting per user/topic
- Optional end-to-end encryption
- Replay attack protection

---

## 🧩 Topic Configuration

Allow per-topic settings:

```json
{
  "topic": "tracker.location",
  "persistence": true,
  "retention": "24h",
  "ack_required": true
}
```

---

## 🔁 Replay System

Support:

```dart
client.subscribe("tracker.location", fromLast: 50);
client.subscribe("tracker.location", since: timestamp);
```

---

## ⚙️ Protocol Design

### JSON (default)
```json
{
  "id": "msg_123",
  "topic": "chat.room.1",
  "payload": {...},
  "timestamp": 1234567890
}
```

### Binary (IoT mode)
- Compact format
- Low bandwidth
- Optional compression

---

## 🌐 Multi-Transport Support (Optional)

- WebSocket (primary)
- HTTP fallback (polling)
- MQTT bridge (for IoT devices)

---

## 🚀 Advanced Features

- Presence (who is online)
- Message batching
- Compression
- Namespaces
- Multi-tenant support
- Horizontal scaling (Redis adapter)

---

## 🧪 MVP Scope (Phase 1)

Build:

- WebSocket server
- Topic-based pub/sub
- Basic SDK (1 language)
- Auto reconnect
- Optional in-memory persistence
- Simple replay

---

## 📦 Deployment

- Docker support
- Self-hostable
- Config via environment variables

---

## 💡 Stretch Goals

- CRDT-based sync
- Exactly-once delivery
- Visual dashboard
- Admin API
- Plugin system

---

## 🧠 Positioning

"A secure, offline-capable realtime messaging engine for modern apps and IoT systems."

---

## ✅ Deliverables

- Server implementation
- Client SDK
- Documentation
- Example apps
- Deployment guide
