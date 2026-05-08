# VynRelay Test Samples

This directory contains three sample applications to test the VynRelay library and its SSE fallback mechanism.

## Prerequisites
- Node.js v18+ (for Backend and Next.js)
- Flutter SDK (for Mobile)
- Local VynRelay server and SDKs must be built (`npm run build` in root)

## 1. NestJS Backend (`samples/backend-nestjs`)
A production-ready backend demonstrating integration with `@vynelix/vynrelay-nestjs`.
It uses a mock of `@vynelix/nestjs-multi-auth` for demonstration.

**To run:**
```bash
cd samples/backend-nestjs
npm install
npm run start:dev
```
- Main API: `http://localhost:3000`
- VynRelay Port: `3001` (WS & SSE)

## 2. Next.js Frontend (`samples/frontend-nextjs`)
A web-based chat application that monitors connection status and transport type.

**To run:**
```bash
cd samples/frontend-nextjs
npm install
npm run dev
```
- Open: `http://localhost:3002` (if 3000 is taken by backend)

## 3. Flutter App (`samples/mobile-flutter`)
A mobile dashboard showing real-time updates. Now supports SSE fallback!

**To run:**
```bash
cd samples/mobile-flutter
flutter pub get
flutter run -d chrome # Or android/ios
```

## Testing SSE Fallback
1. Start the NestJS Backend.
2. Open the Next.js app. It should show `Transport: WS`.
3. In Chrome DevTools -> Network -> WS, block the websocket connection or use Request Blocking.
4. Refresh or wait for reconnection. The app will switch to `Transport: SSE`.
5. Send messages via SSE and verify they reach other clients!
