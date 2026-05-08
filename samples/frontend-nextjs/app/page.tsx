import Chat from '../components/Chat';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 py-12 px-4 flex flex-col items-center">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-extrabold text-slate-900 mb-2">VynRelay Demo</h1>
        <p className="text-slate-600">Real-time messaging with WebSocket & SSE Fallback</p>
      </div>
      
      <Chat />
      
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-2">WebSocket First</h3>
          <p className="text-sm text-slate-500">Fast, bi-directional communication using the VynRelay engine.</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-2">SSE Fallback</h3>
          <p className="text-sm text-slate-500">Automatically switches to Server-Sent Events if WebSockets are blocked.</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="font-bold text-slate-800 mb-2">NestJS Integration</h3>
          <p className="text-sm text-slate-500">Powered by @vynelix/vynrelay-nestjs on the backend.</p>
        </div>
      </div>
    </main>
  );
}
