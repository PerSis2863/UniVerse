import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AiState {
  isChatbotEnabled: boolean;
  setChatbotEnabled: (enabled: boolean) => void;
}

export const useAiStore = create<AiState>()(
  persist(
    (set) => ({
      isChatbotEnabled: true,
      setChatbotEnabled: (enabled: boolean) => set({ isChatbotEnabled: enabled }),
    }),
    {
      name: 'universe-ai-settings',
    }
  )
);
