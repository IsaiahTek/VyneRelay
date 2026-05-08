'use client';

import { useEffect, useState, useRef } from 'react';
import { VynClient } from '@vynelix/vynrelay-sdk';

export default function Chat() {
  const [client, setClient] = useState<VynClient | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('Disconnected');
  const [transport, setTransport] = useState('Unknown');
  const [username, setUsername] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [activeTab, setActiveTab] = useState('public'); // 'public' or 'private'
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isJoined) return;

    let cleanupFn: (() => void) | undefined;

    const init = async () => {
      const vClient = new VynClient({
        url: 'ws://localhost:3000/vynrelay',
        username: username,
        autoReconnect: true,
        maxReconnectAttempts: 3,
      });

      setClient(vClient);

      try {
        await vClient.authenticate(username);
        vClient.subscribe(`user.${username.toLowerCase()}`, (payload) => {
          setMessages((prev) => [...prev, { ...payload, type: 'private' }]);
        });
      } catch (err) {
        console.error('Authentication failed:', err);
      }

      vClient.subscribe('public.chat', (payload) => {
        setMessages((prev) => [...prev, { ...payload, type: 'public' }]);
      });

      const interval = setInterval(() => {
        setStatus(vClient.isConnected ? 'Connected' : 'Connecting...');
        setTransport(vClient.transport || 'WS');
      }, 1000);

      cleanupFn = () => {
        vClient.disconnect();
        clearInterval(interval);
      };
    };

    init();
    return () => {
      if (cleanupFn) cleanupFn();
    };
  }, [isJoined]);

  const sendMessage = () => {
    if (client && input) {
      const isPrivate = activeTab === 'private';
      const topic = isPrivate && recipient ? `user.${recipient.toLowerCase()}` : 'public.chat';
      
      client.publish(topic, {
        text: input,
        user: username,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

      if (isPrivate) {
        setMessages((prev) => [...prev, { 
            text: input, 
            user: `To: ${recipient}`, 
            timestamp: 'Now', 
            type: 'private' 
        }]);
      }

      setInput('');
    }
  };

  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0F172A]">
        <div className="p-8 bg-[#1E293B] rounded-3xl shadow-2xl w-full max-w-md border border-slate-700">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2 text-center">VynRelay</h2>
          <p className="text-slate-400 text-center mb-8 text-sm">Enter a handle to start chatting</p>
          <input
            type="text"
            placeholder="Username (e.g. Alice)"
            className="w-full p-4 bg-[#0F172A] border border-slate-700 rounded-2xl mb-4 focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder:text-slate-600 transition-all"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && username && setIsJoined(true)}
          />
          <button
            onClick={() => username && setIsJoined(true)}
            className="w-full bg-blue-600 text-white p-4 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]"
          >
            Start Chatting
          </button>
        </div>
      </div>
    );
  }

  const filteredMessages = messages.filter(m => 
    activeTab === 'public' ? m.type === 'public' : m.type === 'private'
  );

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-200 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-[#1E293B] flex flex-col border-r border-slate-800">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">V</div>
            <span className="font-bold text-xl tracking-tight">VynRelay</span>
          </div>
          
          <nav className="space-y-1">
            <button 
              onClick={() => setActiveTab('public')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'public' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <span className="text-lg">#</span> Global Chat
            </button>
            <button 
              onClick={() => setActiveTab('private')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === 'private' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Direct Messages
            </button>
          </nav>
        </div>

        <div className="mt-auto p-6 bg-[#161E2E] border-t border-slate-800">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{username}</span>
          </div>
          <p className="text-[10px] text-slate-500">{transport} • {status}</p>
          <button 
            onClick={() => setIsJoined(false)}
            className="mt-4 text-[10px] text-slate-500 hover:text-red-400 font-bold uppercase transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#0F172A]">
        {/* Chat Header */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-8 bg-[#0F172A]/80 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-lg">
              {activeTab === 'public' ? '# Global Chat' : 'Direct Messages'}
            </h2>
          </div>
          {activeTab === 'private' && (
            <div className="flex items-center gap-3 bg-slate-800/50 p-1 px-3 rounded-full border border-slate-700">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">To:</span>
              <input 
                type="text"
                placeholder="Recipient name..."
                className="bg-transparent border-none outline-none text-xs text-blue-400 placeholder:text-slate-600 w-32"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </div>
          )}
        </header>

        {/* Message List */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-8 space-y-6 scroll-smooth"
        >
          {filteredMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600">
              <div className="w-20 h-20 rounded-full bg-slate-800/30 flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm">No messages here yet.</p>
            </div>
          ) : (
            filteredMessages.map((m, i) => {
              const isMe = m.user === username || m.user.startsWith('To: ');
              return (
                <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                    {!isMe && <span className="text-[10px] font-bold text-slate-500 mb-1 ml-1">{m.user}</span>}
                    <div className={`p-4 rounded-3xl shadow-lg ${
                      isMe 
                        ? (activeTab === 'private' ? 'bg-purple-600 text-white rounded-br-none' : 'bg-blue-600 text-white rounded-br-none') 
                        : (activeTab === 'private' ? 'bg-[#1E293B] text-white border border-purple-500/30 rounded-bl-none' : 'bg-[#1E293B] text-white rounded-bl-none border border-slate-700')
                    }`}>
                      <p className="text-[13px] leading-relaxed">{m.text}</p>
                      <div className={`text-[9px] mt-2 font-medium opacity-60 text-right`}>
                        {m.timestamp}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input Bar */}
        <div className="p-6 bg-[#0F172A]">
          <div className="max-w-4xl mx-auto flex gap-4 items-center bg-[#1E293B] p-2 rounded-2xl border border-slate-700 focus-within:border-blue-500/50 transition-all shadow-xl">
            <input
              type="text"
              placeholder={activeTab === 'private' ? `Send private message to ${recipient || '...'}` : "Message #global-chat"}
              className="flex-1 bg-transparent p-3 px-4 outline-none text-sm text-white placeholder:text-slate-600"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button
              onClick={sendMessage}
              disabled={!input || (activeTab === 'private' && !recipient)}
              className={`p-3 rounded-xl transition-all shadow-lg disabled:opacity-30 disabled:grayscale ${
                activeTab === 'private' ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
