'use client';

import { Topbar } from '@/components/layout/Topbar';
import { Search, Send, Phone, Video, MoreVertical, Paperclip, Smile, Check, CheckCheck, Mic, X, FileText, Image as ImageIcon, Contact, BarChart, ChevronLeft } from 'lucide-react';
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
    const socketUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace('/api', '');
    const newSocket = io(socketUrl, {
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
    <div className="flex h-screen bg-zinc-50 dark:bg-black flex-col font-sans">
      <Topbar title="Messages" subtitle="Connect with peers and faculty" />
      
      <div className="flex-1 flex overflow-hidden md:p-6 md:gap-6 max-w-7xl mx-auto w-full">
        {/* Left Sidebar - Contacts List */}
        <div className={`w-full md:w-1/3 md:min-w-[320px] md:max-w-[400px] bg-white dark:bg-[#09090b] md:rounded-2xl md:border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden ${activeConvId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-5 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Chats</h2>
              <button className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input 
                type="text" 
                placeholder="Search messages or contacts"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-100 dark:bg-zinc-900 border-none rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none text-zinc-900 dark:text-white placeholder:text-zinc-500"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
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
                  className={`flex items-center gap-3 p-4 cursor-pointer transition-colors border-b border-zinc-100 dark:border-zinc-800/50 ${activeConvId === conv.id ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'}`}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 font-bold text-lg flex-shrink-0">
                      {other.avatar || other.name.charAt(0).toUpperCase()}
                    </div>
                    {isOnline && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-[#09090b] rounded-full"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{other.name}</h3>
                      {lastMsg && (
                        <span className="text-xs text-zinc-500 flex-shrink-0 ml-2">
                          {format(new Date(lastMsg.createdAt), 'HH:mm')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500 truncate">
                      {isTypingUser ? (
                        <span className="text-indigo-500 italic">typing...</span>
                      ) : lastMsg ? (
                        <span className="flex items-center">
                          {lastMsg.senderId === user?.id && (
                            <span className="mr-1">
                              {lastMsg.read ? <CheckCheck className="w-3.5 h-3.5 text-indigo-500" /> : <Check className="w-3.5 h-3.5" />}
                            </span>
                          )}
                          <span className="truncate">{lastMsg.body}</span>
                        </span>
                      ) : (
                        <span className="italic">No messages yet</span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel - Active Chat */}
        {activeConv && otherUser ? (
          <div className={`flex-1 bg-white dark:bg-[#09090b] md:rounded-2xl md:border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden relative ${!activeConvId ? 'hidden md:flex' : 'flex w-full'}`}>
            {/* Chat Header */}
            <div className="px-4 md:px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-[#09090b] z-20">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setActiveConvId(null)}
                  className="md:hidden p-2 -ml-2 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 font-bold text-lg">
                    {otherUser.avatar || otherUser.name.charAt(0).toUpperCase()}
                  </div>
                  {onlineUsers[otherUser.id] && (
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-[#09090b] rounded-full"></div>
                  )}
                </div>
                <div>
                  <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">{otherUser.name}</h2>
                  <div className="text-xs font-medium">
                    {isTyping[otherUser.id] ? (
                      <span className="text-indigo-500">typing...</span>
                    ) : onlineUsers[otherUser.id] ? (
                      <span className="text-emerald-500">online</span>
                    ) : (
                      <span className="text-zinc-500">offline</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 text-zinc-500">
                <button className="hover:text-indigo-500 transition-colors p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"><Video className="w-5 h-5" /></button>
                <button className="hover:text-indigo-500 transition-colors p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"><Phone className="w-5 h-5" /></button>
                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1"></div>
                <button className="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 hidden sm:flex"><Search className="w-5 h-5" /></button>
                <button className="hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"><MoreVertical className="w-5 h-5" /></button>
              </div>
            </div>

            {/* Chat Messages */}
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 z-10 scroll-smooth bg-zinc-50 dark:bg-[#09090b]">
              <div className="flex justify-center mb-6">
                <div className="bg-white dark:bg-zinc-900 text-zinc-500 text-xs px-3 py-1 rounded-full shadow-sm border border-zinc-200 dark:border-zinc-800 flex items-center gap-1.5">
                  <CheckCheck className="w-3.5 h-3.5" />
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
                        <div className="flex justify-center my-6">
                          <div className="bg-white dark:bg-zinc-900 text-zinc-500 text-xs px-3 py-1 rounded-full shadow-sm border border-zinc-200 dark:border-zinc-800">
                            {format(new Date(msg.createdAt), 'MMMM d, yyyy')}
                          </div>
                        </div>
                      )}
                      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? 'mt-2' : 'mt-0.5'}`}>
                        <div className={`max-w-[85%] sm:max-w-[70%] px-4 py-2 text-[15px] leading-relaxed shadow-sm ${
                          isMe 
                            ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm' 
                            : 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-2xl rounded-tl-sm border border-zinc-100 dark:border-zinc-800'
                        }`}>
                          <div>{msg.body}</div>
                          <div className={`flex items-center justify-end gap-1 mt-1 text-[11px] ${isMe ? 'text-indigo-200' : 'text-zinc-400'}`}>
                            {format(new Date(msg.createdAt), 'HH:mm')}
                            {isMe && (
                              <span className="inline-flex">
                                {msg.read ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
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
              <div className="absolute bottom-20 left-4 z-30 bg-white dark:bg-zinc-900 rounded-2xl p-4 shadow-xl border border-zinc-200 dark:border-zinc-800 flex flex-col gap-4 animate-in slide-in-from-bottom-2 fade-in">
                <button className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-white transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                    <FileText className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-sm">Document</span>
                </button>
                <button className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-white transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-sm">Photos & Videos</span>
                </button>
                <button className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-white transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <Contact className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-sm">Contact</span>
                </button>
                <button className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-white transition-colors group">
                  <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                    <BarChart className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-sm">Poll</span>
                </button>
              </div>
            )}

            {/* Chat Input */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-white dark:bg-[#09090b] border-t border-zinc-200 dark:border-zinc-800 z-20">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`p-2 rounded-full transition-colors ${showEmojiPicker ? 'bg-zinc-100 dark:bg-zinc-800 text-indigo-500' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                >
                  <Smile className="w-6 h-6" />
                </button>
                <button 
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  className={`p-2 rounded-full transition-colors ${showAttachMenu ? 'bg-zinc-100 dark:bg-zinc-800 text-indigo-500' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                >
                  {showAttachMenu ? <X className="w-6 h-6" /> : <Paperclip className="w-6 h-6" />}
                </button>
                
                <div className="flex-1 bg-zinc-100 dark:bg-zinc-900 rounded-full border border-transparent focus-within:border-indigo-500 px-4 py-2 flex items-center transition-colors">
                  <input 
                    type="text"
                    value={currentMessage}
                    onChange={handleTyping}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type a message..."
                    className="w-full bg-transparent border-none outline-none text-zinc-900 dark:text-white placeholder:text-zinc-500 text-[15px]"
                  />
                </div>
                
                <button 
                  onClick={currentMessage.trim() ? handleSendMessage : undefined}
                  className={`p-3 rounded-full transition-all flex items-center justify-center flex-shrink-0 shadow-sm ${
                    currentMessage.trim() 
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white transform active:scale-95' 
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
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
          <div className="hidden md:flex flex-1 bg-white dark:bg-[#09090b] border border-zinc-200 dark:border-zinc-800 rounded-2xl flex-col items-center justify-center text-zinc-500">
            <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-6">
              <MessageSquare className="w-8 h-8 text-zinc-400" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Your Messages</h2>
            <p className="text-zinc-500 max-w-sm text-center text-sm">
              Select a chat to start messaging or search for someone new.
            </p>
            <div className="mt-8 px-4 py-1.5 rounded-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500 flex items-center gap-2">
              <CheckCheck className="w-3.5 h-3.5" /> End-to-end encrypted
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
