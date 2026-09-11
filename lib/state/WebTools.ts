import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { Storage } from '@lib/enums/Storage'
import { createMMKVStorage } from '@lib/storage/MMKV'

export type SearchProvider = 'jina' | 'searxng' | 'brave'

export type WebToolsConfig = {
    /** Globe button in the chat input. When on, local models may call web tools. */
    enabled: boolean
    provider: SearchProvider
    /** Optional. Raises Jina's rate limits for search and reader requests */
    jinaKey: string
    searxngUrl: string
    braveKey: string
    /** Read pages through Jina Reader (clean Markdown) instead of raw HTML */
    useJinaReader: boolean
    maxResults: number
    maxPageChars: number
    /** Upper bound on tool rounds per reply before the model must answer */
    maxRounds: number
}

type WebToolsState = {
    config: WebToolsConfig
    setConfig: (config: Partial<WebToolsConfig>) => void
    setEnabled: (enabled: boolean) => void
}

export const defaultWebToolsConfig: WebToolsConfig = {
    enabled: false,
    provider: 'jina',
    jinaKey: '',
    searxngUrl: '',
    braveKey: '',
    useJinaReader: true,
    maxResults: 4,
    maxPageChars: 6000,
    maxRounds: 5,
}

export namespace WebTools {
    export const useWebToolsStore = create<WebToolsState>()(
        persist(
            (set, get) => ({
                config: defaultWebToolsConfig,
                setConfig: (config) => set({ config: { ...get().config, ...config } }),
                setEnabled: (enabled) => set({ config: { ...get().config, enabled } }),
            }),
            {
                name: Storage.WebTools,
                storage: createMMKVStorage(),
                version: 1,
                partialize: (state) => ({ config: state.config }),
                migrate: (persistedState: any) => persistedState,
            }
        )
    )
}
