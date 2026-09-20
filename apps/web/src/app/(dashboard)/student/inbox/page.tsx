'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Search, Send, Phone, Video, MoreVertical, Paperclip, Smile, Check, CheckCheck } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';

type Message = {
  id: string;
  senderId: string;
  text: string;
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read';
};

type Contact = {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'offline' | 'away';
  lastSeen?: string;
  role?: string;
};

const MOCK_CONTACTS: Contact[] = [
  { id: 'it-support', name: 'IT Support', avatar: 'IT', status: 'online', role: 'Support Team' },
  { id: 'alice-johnson', name: 'Alice Johnson', avatar: 'A', status: 'online', role: 'Peer' },
  { id: 'bob-smith', name: 'Bob Smith', avatar: 'B', status: 'away', lastSeen: '2 hours ago', role: 'Peer' },
  { id: 'charlie-davis', name: 'Charlie Davis', avatar: 'C', status: 'offline', lastSeen: 'Yesterday', role: 'Peer' },
  { id: 'diana-prince', name: 'Diana Prince', avatar: 'D', status: 'online', role: 'Peer' },
  { id: 'evan-wright', name: 'Evan Wright', avatar: 'E', status: 'offline', lastSeen: '3 hours ago', role: 'Peer' },
];

export default function InboxPage() {
  const searchParams = useSearchParams();
  const initialChatWith = searchParams.get('chatWith');

  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({
    'it-support': [
      { id: '1', senderId: 'it-support', text: 'Hello! How can we help you today?', timestamp: new Date(Date.now() - 3600000), status: 'read' }
    ]
  });
  const [currentMessage, setCurrentMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [typingContactId, setTypingContactId] = useState<string | null>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialChatWith) {
      // Find exact or loose match
      const formattedParam = initialChatWith.toLowerCase().replace(/\s+/g, '-');
      const contact = MOCK_CONTACTS.find(c => c.id === formattedParam || c.name.toLowerCase() === initialChatWith.toLowerCase());
      
      if (contact) {
        setActiveContactId(contact.id);
      } else {
        // If contact doesn't exist in mock, create a temporary one
        const tempId = formattedParam;
        MOCK_CONTACTS.push({
          id: tempId,
          name: initialChatWith,
          avatar: initialChatWith.charAt(0).toUpperCase(),
          status: 'online',
          role: 'Contact'
        });
        setActiveContactId(tempId);
      }
    } else {
      setActiveContactId(MOCK_CONTACTS[0].id);
    }
  }, [initialChatWith]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, activeContactId, typingContactId]);

  const activeContact = MOCK_CONTACTS.find(c => c.id === activeContactId);
  const activeMessages = activeContactId ? (messages[activeContactId] || []) : [];

  const handleSendMessage = () => {
    if (!currentMessage.trim() || !activeContactId) return;

    const newMsg: Message = {
      id: Date.now().toString(),
      senderId: 'me',
      text: currentMessage,
      timestamp: new Date(),
      status: 'sent'
    };

    setMessages(prev => ({
      ...prev,
      [activeContactId]: [...(prev[activeContactId] || []), newMsg]
    }));
    
    setCurrentMessage('');
    setTypingContactId(activeContactId);

    // Simulate status change from sent -> delivered -> read
    setTimeout(() => {
      setMessages(prev => {
        const msgs = [...(prev[activeContactId] || [])];
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.id === newMsg.id) {
          lastMsg.status = 'delivered';
        }
        return { ...prev, [activeContactId]: msgs };
      });
    }, 500);

    setTimeout(() => {
      setMessages(prev => {
        const msgs = [...(prev[activeContactId] || [])];
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.id === newMsg.id) {
          lastMsg.status = 'read';
        }
        return { ...prev, [activeContactId]: msgs };
      });
    }, 1200);

    // Simulate reply
    setTimeout(() => {
      setTypingContactId(null);
      const responses = [
        "Hey! Thanks for reaching out.",
        "I'll look into that and get back to you.",
        "Sounds good to me!",
        "Can you provide a bit more detail?",
        "Awesome, talk to you soon."
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      
      const replyMsg: Message = {
        id: (Date.now() + 1).toString(),
        senderId: activeContactId,
        text: randomResponse,
        timestamp: new Date(),
        status: 'read'
      };

      setMessages(prev => ({
        ...prev,
        [activeContactId]: [...(prev[activeContactId] || []), replyMsg]
      }));
    }, 2500);
  };

  const filteredContacts = MOCK_CONTACTS.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="flex h-screen bg-[#0d1117] flex-col">
      <Topbar title="Messages" subtitle="Connect with peers and faculty" />
      
      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        {/* Left Sidebar - Contacts List */}
        <div className="w-1/3 min-w-[320px] max-w-[400px] bg-white/[0.02] border border-zinc-800 rounded-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="text-xl font-bold text-white mb-4">Chats</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input 
                type="text" 
                placeholder="Search messages or contacts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/[0.05] border border-white/[0.05] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-zinc-500"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {filteredContacts.map(contact => {
              const contactMsgs = messages[contact.id] || [];
              const lastMsg = contactMsgs[contactMsgs.length - 1];
              const isTyping = typingContactId === contact.id;

              return (
                <div 
                  key={contact.id} 
                  onClick={() => setActiveContactId(contact.id)}
                  className={`p-4 flex items-center gap-3 cursor-pointer transition-colors border-l-4 ${activeContactId === contact.id ? 'bg-white/[0.05] border-indigo-500' : 'hover:bg-white/[0.02] border-transparent'}`}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-indigo-400 font-bold text-lg border border-indigo-500/20 flex-shrink-0">
                      {contact.avatar}
                    </div>
                    {contact.status === 'online' && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#0d1117] rounded-full"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className="font-semibold text-white truncate pr-2">{contact.name}</h3>
                      {lastMsg && (
                        <span className="text-xs text-zinc-500 flex-shrink-0">
                          {format(lastMsg.timestamp, 'HH:mm')}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-zinc-400 truncate flex items-center gap-1">
                      {isTyping ? (
                        <span className="text-indigo-400 italic">typing...</span>
                      ) : lastMsg ? (
                        <>
                          {lastMsg.senderId === 'me' && (
                            <span className="inline-flex">
                              {lastMsg.status === 'sent' && <Check className="w-3.5 h-3.5 text-zinc-500" />}
                              {lastMsg.status === 'delivered' && <CheckCheck className="w-3.5 h-3.5 text-zinc-500" />}
                              {lastMsg.status === 'read' && <CheckCheck className="w-3.5 h-3.5 text-blue-400" />}
                            </span>
                          )}
                          <span className="truncate">{lastMsg.text}</span>
                        </>
                      ) : (
                        <span className="italic text-zinc-600">No messages yet</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel - Active Chat */}
        {activeContact ? (
          <div className="flex-1 bg-[url('/chat-pattern-dark.png')] bg-repeat bg-center bg-white/[0.01] border border-zinc-800 rounded-2xl flex flex-col overflow-hidden relative">
            <div className="absolute inset-0 bg-[#0d1117]/90 z-0"></div>
            
            {/* Chat Header */}
            <div className="p-4 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 flex justify-between items-center z-10">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/20">
                    {activeContact.avatar}
                  </div>
                </div>
                <div>
                  <h2 className="font-bold text-white">{activeContact.name}</h2>
                  <div className="text-xs text-zinc-400">
                    {activeContact.status === 'online' ? (
                      <span className="text-emerald-400">online</span>
                    ) : (
                      <span>last seen {activeContact.lastSeen || 'recently'}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-zinc-400">
                <button className="hover:text-white transition-colors"><Video className="w-5 h-5" /></button>
                <button className="hover:text-white transition-colors"><Phone className="w-5 h-5" /></button>
                <div className="w-px h-6 bg-zinc-700"></div>
                <button className="hover:text-white transition-colors"><Search className="w-5 h-5" /></button>
                <button className="hover:text-white transition-colors"><MoreVertical className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Chat Messages */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 z-10 scroll-smooth">
              <div className="flex justify-center mb-8">
                <div className="bg-zinc-800/80 backdrop-blur-sm text-zinc-400 text-xs px-3 py-1 rounded-lg">
                  Messages are end-to-end encrypted. No one outside of this chat, not even UniVerse, can read or listen to them.
                </div>
              </div>
              
              {activeMessages.map((msg, idx) => {
                const isMe = msg.senderId === 'me';
                const showDate = idx === 0 || format(activeMessages[idx-1].timestamp, 'yyyy-MM-dd') !== format(msg.timestamp, 'yyyy-MM-dd');
                
                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="flex justify-center my-6">
                        <div className="bg-zinc-800/80 backdrop-blur-sm text-zinc-400 text-xs px-3 py-1 rounded-lg">
                          {format(msg.timestamp, 'MMMM d, yyyy')}
                        </div>
                      </div>
                    )}
                    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 relative group ${isMe ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-zinc-800 text-zinc-200 rounded-tl-sm'}`}>
                        <div className="text-sm leading-relaxed">{msg.text}</div>
                        <div className={`flex items-center gap-1 mt-1 text-[10px] ${isMe ? 'text-indigo-200 justify-end' : 'text-zinc-500 justify-start'}`}>
                          {format(msg.timestamp, 'HH:mm')}
                          {isMe && (
                            <span className="inline-flex">
                              {msg.status === 'sent' && <Check className="w-3 h-3 text-indigo-300" />}
                              {msg.status === 'delivered' && <CheckCheck className="w-3 h-3 text-indigo-300" />}
                              {msg.status === 'read' && <CheckCheck className="w-3 h-3 text-blue-300" />}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {typingContactId === activeContactId && (
                <div className="flex justify-start">
                  <div className="bg-zinc-800 text-zinc-400 rounded-2xl rounded-tl-sm px-5 py-3.5 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="p-4 bg-zinc-900/80 backdrop-blur-md border-t border-zinc-800 z-10">
              <div className="flex items-center gap-3 bg-zinc-800/50 rounded-2xl p-2 pr-3">
                <button className="p-2 text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-zinc-700">
                  <Smile className="w-6 h-6" />
                </button>
                <button className="p-2 text-zinc-400 hover:text-white transition-colors rounded-full hover:bg-zinc-700">
                  <Paperclip className="w-5 h-5" />
                </button>
                <input 
                  type="text"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message"
                  className="flex-1 bg-transparent text-white focus:outline-none placeholder:text-zinc-500 px-2"
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={!currentMessage.trim()}
                  className={`p-3 rounded-full transition-colors flex items-center justify-center ${currentMessage.trim() ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-zinc-800 text-zinc-500'}`}
                >
                  <Send className="w-5 h-5 ml-1" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-white/[0.01] border border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-500">
            <div className="w-24 h-24 rounded-full bg-white/[0.02] flex items-center justify-center mb-6 border border-zinc-800">
              <Phone className="w-10 h-10 text-zinc-600" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">UniVerse Web Chat</h2>
            <p className="text-zinc-400 max-w-sm text-center">Send and receive messages with your peers, professors, and support staff in real-time.</p>
          </div>
        )}
      </div>
    </div>
  );
}
