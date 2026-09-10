import { create } from 'zustand'

import { Chats } from '@lib/state/Chat'

export type ContextUsageData = {
    /** Chat the measurement belongs to, so stale numbers are not shown for another chat */
    chatId?: number
    /** Tokens sent to the model on the last generation */
    used: number
    /** Token budget available for chat history (context length minus generated length) */
    limit: number
    /** Older messages that did not fit and were left out of the prompt */
    dropped: number
    /** Messages in the chat when the prompt was built */
    total: number
}

type ContextUsageState = {
    usage?: ContextUsageData
    record: (data: Omit<ContextUsageData, 'chatId'>) => void
}

/**
 * Tracks how much of the context window the last prompt used.
 * Filled in by the context builders, read by the chat screen's context meter.
 */
export const useContextUsageStore = create<ContextUsageState>()((set) => ({
    usage: undefined,
    record: (data) =>
        set({
            usage: { ...data, chatId: Chats.useChatState.getState().data?.id },
        }),
}))
