'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Search, Send, Phone, Video, MoreVertical, Paperclip, Smile, Check, CheckCheck, Mic, X, FileText, Image as ImageIcon, Contact, BarChart } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { format, isSameDay } from 'date-fns';
import { useAuthStore } from '@/store/auth';
import { io, Socket } from 'socket.io-client';
import { api } from '@/lib/api';

type UserInfo = {
  id: string;
  name: string;
  avatar: string;
  role: string;
};

type Message = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  read: boolean;
  conversationId: string;
};

type Conversation = {
  id: string;
  updatedAt: string;
  participants: { user: UserInfo }[];
  messages: Message[];
  unreadCount?: number;
};

export default function InboxPage() {
  const { user, accessToken } = useAuthStore();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [currentMessage, setCurrentMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isTyping, setIsTyping] = useState<Record<string, boolean>>({});
  
  // UI States
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});

  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Initialize Socket and Fetch Conversations
  useEffect(() => {
    if (!accessToken || !user) return;

    // Fetch initial conversations
    const fetchConversations = async () => {
      try {
        const res = await api.get('/messages/conversations');
        setConversations(res.data);
        if (res.data.length > 0 && !activeConvId) {
          setActiveConvId(res.data[0].id);
        }
      } catch (err) {
        console.error('Failed to fetch conversations', err);
      }
    };
    fetchConversations();

    // Setup Socket
    const newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001', {
      auth: { token: `Bearer ${accessToken}` },
    });

    newSocket.on('connect', () => {
      console.log('Connected to chat server');
    });

    newSocket.on('receive_message', (msg: Message) => {
      setMessages(prev => ({
        ...prev,
        [msg.conversationId]: [...(prev[msg.conversationId] || []), msg]
      }));
      // Also update latest message in conversation list
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === msg.conversationId);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx].messages = [msg];
          updated[idx].updatedAt = msg.createdAt;
          // Move to top
          const [item] = updated.splice(idx, 1);
          updated.unshift(item);
          return updated;
        } else {
          // If completely new conversation, refetch list
          fetchConversations();
          return prev;
        }
      });
    });

    newSocket.on('user_typing', ({ senderId }) => {
      setIsTyping(prev => ({ ...prev, [senderId]: true }));
      setTimeout(() => {
        setIsTyping(prev => ({ ...prev, [senderId]: false }));
      }, 3000);
    });

    newSocket.on('user_status', ({ userId, status }) => {
      setOnlineUsers(prev => ({ ...prev, [userId]: status === 'online' }));
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [accessToken, user]);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!activeConvId) return;

    const fetchMessages = async () => {
      try {
        const res = await api.get(`/messages/conversations/${activeConvId}`);
        setMessages(prev => ({ ...prev, [activeConvId]: res.data }));
        // Mark as read
        await api.post(`/messages/conversations/${activeConvId}/read`);
      } catch (err) {
        console.error('Failed to fetch messages', err);
      }
    };
    fetchMessages();
  }, [activeConvId]);

  // Scroll to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, activeConvId]);

  const activeConv = conversations.find(c => c.id === activeConvId);
  const activeMessages = activeConvId ? (messages[activeConvId] || []) : [];
  
  const getOtherParticipant = (conv: Conversation) => {
    return conv.participants.find(p => p.user.id !== user?.id)?.user;
  };
  const otherUser = activeConv ? getOtherParticipant(activeConv) : null;

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || !otherUser) return;
    const text = currentMessage;
    setCurrentMessage('');
    setShowEmojiPicker(false);
    setShowAttachMenu(false);

    // Optimistic UI update
    const tempId = Date.now().toString();
    const tempMsg: Message = {
      id: tempId,
      senderId: user!.id,
      body: text,
      createdAt: new Date().toISOString(),
      read: false,
      conversationId: activeConvId!
    } as any; // Cast for temp usage

    setMessages(prev => ({
      ...prev,
      [activeConvId!]: [...(prev[activeConvId!] || []), tempMsg]
    }));

    try {
      if (socket) {
        socket.emit('send_message', { receiverId: otherUser.id, body: text }, (response: any) => {
          if (response?.data) {
            // Replace temp message with real one from DB
            setMessages(prev => {
              const list = prev[activeConvId!] || [];
              const updatedList = list.map(m => m.id === tempId ? response.data : m);
              return { ...prev, [activeConvId!]: updatedList };
            });
          }
        });
      }
    } catch (e) {
      console.error('Send message failed', e);
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentMessage(e.target.value);
    if (socket && otherUser) {
      socket.emit('typing', { receiverId: otherUser.id });
    }
  };

  const filteredConversations = conversations.filter(c => {
    const other = getOtherParticipant(c);
    return other?.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex h-screen bg-[#09090b] flex-col font-sans">
      <Topbar title="Messages" subtitle="Connect with peers and faculty" />
      
      <div className="flex-1 flex overflow-hidden p-6 gap-6 max-w-7xl mx-auto w-full">
        {/* Left Sidebar - Contacts List */}
        <div className="w-1/3 min-w-[320px] max-w-[400px] bg-[#18181b] border border-zinc-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-zinc-800/50 bg-[#18181b] z-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-white tracking-tight">Chats</h2>
              <button className="text-zinc-400 hover:text-white transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
              <input 
                type="text" 
                placeholder="Search messages or contacts"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#27272a]/50 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:bg-[#27272a] transition-all placeholder:text-zinc-500"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
            {filteredConversations.map(conv => {
              const other = getOtherParticipant(conv);
              if (!other) return null;
              const lastMsg = conv.messages[0];
              const isTypingUser = isTyping[other.id];
              const isOnline = onlineUsers[other.id];

              return (
                <div 
                  key={conv.id} 
                  onClick={() => setActiveConvId(conv.id)}
                  className={`p-4 flex items-center gap-4 cursor-pointer transition-all border-l-4 ${activeConvId === conv.id ? 'bg-[#27272a] border-indigo-500' : 'hover:bg-[#27272a]/50 border-transparent'}`}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-indigo-400 font-bold text-lg border border-indigo-500/20 flex-shrink-0 shadow-inner">
                      {other.avatar || other.name.charAt(0).toUpperCase()}
                    </div>
                    {isOnline && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#18181b] rounded-full"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 border-b border-zinc-800/30 pb-4 mt-4">
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 className="font-semibold text-zinc-100 truncate pr-2">{other.name}</h3>
                      {lastMsg && (
                        <span className={`text-xs flex-shrink-0 ${activeConvId === conv.id ? 'text-indigo-400' : 'text-zinc-500'}`}>
                          {format(new Date(lastMsg.createdAt), 'HH:mm')}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-zinc-400 truncate flex items-center gap-1.5">
                      {isTypingUser ? (
                        <span className="text-indigo-400 italic font-medium">typing...</span>
                      ) : lastMsg ? (
                        <>
                          {lastMsg.senderId === user?.id && (
                            <span className="inline-flex">
                              {lastMsg.read ? <CheckCheck className="w-4 h-4 text-indigo-400" /> : <Check className="w-4 h-4 text-zinc-500" />}
                            </span>
                          )}
                          <span className="truncate">{lastMsg.body}</span>
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
        {activeConv && otherUser ? (
          <div className="flex-1 bg-[#18181b] border border-zinc-800 rounded-2xl flex flex-col overflow-hidden relative shadow-2xl">
            {/* WhatsApp-style subtle background pattern */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
            
            {/* Chat Header */}
            <div className="px-6 py-4 bg-[#18181b]/95 backdrop-blur-md border-b border-zinc-800 flex justify-between items-center z-20">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center text-indigo-400 font-bold text-lg border border-indigo-500/20">
                    {otherUser.avatar || otherUser.name.charAt(0).toUpperCase()}
                  </div>
                  {onlineUsers[otherUser.id] && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#18181b] rounded-full"></div>
                  )}
                </div>
                <div>
                  <h2 className="font-bold text-zinc-100 text-lg">{otherUser.name}</h2>
                  <div className="text-xs text-zinc-400 font-medium">
                    {isTyping[otherUser.id] ? (
                      <span className="text-indigo-400">typing...</span>
                    ) : onlineUsers[otherUser.id] ? (
                      <span className="text-emerald-400">online</span>
                    ) : (
                      <span>offline</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-5 text-zinc-400">
                <button className="hover:text-indigo-400 transition-colors p-2 rounded-full hover:bg-zinc-800"><Video className="w-5 h-5" /></button>
                <button className="hover:text-indigo-400 transition-colors p-2 rounded-full hover:bg-zinc-800"><Phone className="w-5 h-5" /></button>
                <div className="w-px h-6 bg-zinc-800"></div>
                <button className="hover:text-zinc-200 transition-colors p-2 rounded-full hover:bg-zinc-800"><Search className="w-5 h-5" /></button>
                <button className="hover:text-zinc-200 transition-colors p-2 rounded-full hover:bg-zinc-800"><MoreVertical className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Chat Messages */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 z-10 scroll-smooth relative">
              <div className="flex justify-center mb-8 sticky top-2 z-10">
                <div className="bg-zinc-800/90 backdrop-blur-md text-zinc-300 text-xs px-4 py-1.5 rounded-full shadow-lg border border-zinc-700/50 flex items-center gap-2">
                  <CheckCheck className="w-3.5 h-3.5 text-zinc-400" />
                  Messages are end-to-end encrypted
                </div>
              </div>
              
              <div className="space-y-3">
                {activeMessages.map((msg, idx) => {
                  const isMe = msg.senderId === user?.id;
                  const prevMsg = activeMessages[idx - 1];
                  const showDate = !prevMsg || !isSameDay(new Date(prevMsg.createdAt), new Date(msg.createdAt));
                  const isFirstInGroup = !prevMsg || prevMsg.senderId !== msg.senderId || showDate;
                  
                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="flex justify-center my-6 sticky top-14 z-10">
                          <div className="bg-zinc-800/90 backdrop-blur-md text-zinc-300 text-xs px-4 py-1.5 rounded-full shadow-lg border border-zinc-700/50">
                            {format(new Date(msg.createdAt), 'MMMM d, yyyy')}
                          </div>
                        </div>
                      )}
                      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? 'mt-2' : 'mt-0.5'}`}>
                        <div className={`max-w-[65%] px-4 py-2 relative shadow-sm ${
                          isMe 
                            ? `bg-indigo-600 text-white ${isFirstInGroup ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl'}` 
                            : `bg-zinc-800 text-zinc-200 ${isFirstInGroup ? 'rounded-2xl rounded-tl-sm' : 'rounded-2xl'}`
                        }`}>
                          {/* WhatsApp Tail */}
                          {isFirstInGroup && (
                            <svg viewBox="0 0 8 13" width="8" height="13" className={`absolute top-0 ${isMe ? '-right-2 text-indigo-600' : '-left-2 text-zinc-800'}`}>
                              <path fill="currentColor" d={isMe ? "M0,0 H8 V13 Q8,0 0,0 Z" : "M8,0 H0 V13 Q0,0 8,0 Z"} />
                            </svg>
                          )}
                          
                          <div className="text-[15px] leading-relaxed break-words">{msg.body}</div>
                          <div className={`flex items-center gap-1 mt-1 text-[11px] ${isMe ? 'text-indigo-200 justify-end' : 'text-zinc-500 justify-end'}`}>
                            {format(new Date(msg.createdAt), 'HH:mm')}
                            {isMe && (
                              <span className="inline-flex ml-0.5">
                                {msg.read ? <CheckCheck className="w-[14px] h-[14px] text-blue-300" /> : <Check className="w-[14px] h-[14px] text-indigo-300" />}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Attachments Menu Popover */}
            {showAttachMenu && (
              <div className="absolute bottom-24 left-6 z-30 bg-[#27272a] rounded-2xl p-4 shadow-2xl border border-zinc-700/50 flex flex-col gap-4 animate-in slide-in-from-bottom-2 fade-in">
                <button className="flex items-center gap-3 text-zinc-300 hover:text-white transition-colors group">
                  <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                    <FileText className="w-5 h-5" />
                  </div>
                  <span className="font-medium">Document</span>
                </button>
                <button className="flex items-center gap-3 text-zinc-300 hover:text-white transition-colors group">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <span className="font-medium">Photos & Videos</span>
                </button>
                <button className="flex items-center gap-3 text-zinc-300 hover:text-white transition-colors group">
                  <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <Contact className="w-5 h-5" />
                  </div>
                  <span className="font-medium">Contact</span>
                </button>
                <button className="flex items-center gap-3 text-zinc-300 hover:text-white transition-colors group">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                    <BarChart className="w-5 h-5" />
                  </div>
                  <span className="font-medium">Poll</span>
                </button>
              </div>
            )}

            {/* Chat Input */}
            <div className="px-6 py-4 bg-[#18181b] z-20 border-t border-zinc-800/50">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`p-2.5 rounded-full transition-colors ${showEmojiPicker ? 'bg-zinc-800 text-indigo-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}
                >
                  <Smile className="w-6 h-6" />
                </button>
                <button 
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className={`p-2.5 rounded-full transition-colors ${showAttachMenu ? 'bg-zinc-800 text-indigo-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}
                >
                  {showAttachMenu ? <X className="w-6 h-6" /> : <Paperclip className="w-6 h-6" />}
                </button>
                
                <div className="flex-1 bg-[#27272a] rounded-2xl flex items-center px-4 py-3 shadow-inner border border-zinc-800/50 focus-within:border-indigo-500/50 transition-colors">
                  <input 
                    type="text"
                    value={currentMessage}
                    onChange={handleTyping}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type a message"
                    className="flex-1 bg-transparent text-white focus:outline-none placeholder:text-zinc-500 text-[15px]"
                  />
                </div>
                
                <button 
                  onClick={currentMessage.trim() ? handleSendMessage : undefined}
                  className={`p-3.5 rounded-full transition-all flex items-center justify-center shadow-lg transform active:scale-95 ${
                    currentMessage.trim() 
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white translate-x-0' 
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {currentMessage.trim() ? (
                    <Send className="w-5 h-5 ml-0.5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-[#18181b] border border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-500 shadow-2xl relative overflow-hidden">
             {/* Subtle background pattern */}
             <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
            
            <div className="w-24 h-24 rounded-full bg-zinc-900 flex items-center justify-center mb-6 border border-zinc-800 shadow-xl relative z-10">
              <Phone className="w-10 h-10 text-indigo-500/50" />
            </div>
            <h2 className="text-3xl font-bold text-zinc-100 mb-3 relative z-10 tracking-tight">UniVerse Web</h2>
            <p className="text-zinc-400 max-w-sm text-center relative z-10 text-[15px] leading-relaxed">
              Send and receive messages seamlessly. Select a chat to start messaging.
            </p>
            <div className="mt-8 px-4 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-500 flex items-center gap-2 relative z-10">
              <CheckCheck className="w-3.5 h-3.5" /> End-to-end encrypted
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
