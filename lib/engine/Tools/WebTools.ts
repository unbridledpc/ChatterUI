import { Logger } from '@lib/state/Logger'
import { WebToolsConfig } from '@lib/state/WebTools'

/**
 * Web tools exposed to local models through the chat template's tool-calling support.
 * The model decides when to search and what to read; the app runs the calls and feeds
 * the results back as tool messages.
 */

export const WEB_SEARCH_TOOL = 'web_search'
export const FETCH_URL_TOOL = 'fetch_url'

export const webToolDefinitions = [
    {
        type: 'function',
        function: {
            name: WEB_SEARCH_TOOL,
            description:
                'Search the web for current information. Returns the titles, URLs and snippets of the top results. Use fetch_url afterwards to read a result in full.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query' },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: FETCH_URL_TOOL,
            description:
                'Fetch a web page and return its readable text. Use it to read documentation, articles or search results in detail.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'Absolute http or https URL' },
                },
                required: ['url'],
            },
        },
    },
]

export const webToolSystemPrompt = () =>
    `The current date is ${new Date().toDateString()}. ` +
    `You can call ${WEB_SEARCH_TOOL} to find current information and ${FETCH_URL_TOOL} to read a page. ` +
    `Use them whenever a question needs up-to-date, specific or verifiable facts, then answer in your own words and cite the URLs you used. ` +
    `Do not call tools for questions you can answer reliably from your own knowledge.`

type SearchResult = { title: string; url: string; snippet: string }

const REQUEST_TIMEOUT_MS = 20000

const fetchWithTimeout = async (url: string, init: RequestInit = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
        return await fetch(url, { ...init, signal: controller.signal })
    } finally {
        clearTimeout(timer)
    }
}

const stripHtml = (html: string) => {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h[1-6]>|<\/tr>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim()
}

const truncate = (text: string, maxChars: number) =>
    text.length > maxChars ? text.slice(0, maxChars) + '\n\n[Content truncated]' : text

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url)

const jinaHeaders = (key: string, extra: Record<string, string>) =>
    key ? { ...extra, Authorization: `Bearer ${key}` } : extra

const searchJina = async (query: string, max: number, key: string): Promise<SearchResult[]> => {
    const response = await fetchWithTimeout(`https://s.jina.ai/?q=${encodeURIComponent(query)}`, {
        headers: jinaHeaders(key, { Accept: 'application/json', 'X-Respond-With': 'no-content' }),
    })
    if (!response.ok) throw new Error(`Jina search returned ${response.status}`)
    const json = await response.json()
    const data: any[] = Array.isArray(json?.data) ? json.data : []
    return data.slice(0, max).map((item) => ({
        title: String(item.title ?? ''),
        url: String(item.url ?? ''),
        snippet: String(item.description ?? item.content ?? '').slice(0, 300),
    }))
}

const searchSearxng = async (
    query: string,
    max: number,
    baseUrl: string
): Promise<SearchResult[]> => {
    if (!baseUrl) throw new Error('SearXNG URL is not set in Settings > Web Tools')
    const base = baseUrl.replace(/\/+$/, '')
    const response = await fetchWithTimeout(
        `${base}/search?q=${encodeURIComponent(query)}&format=json`,
        { headers: { Accept: 'application/json' } }
    )
    if (!response.ok) throw new Error(`SearXNG returned ${response.status}`)
    const json = await response.json()
    const results: any[] = Array.isArray(json?.results) ? json.results : []
    return results.slice(0, max).map((item) => ({
        title: String(item.title ?? ''),
        url: String(item.url ?? ''),
        snippet: String(item.content ?? '').slice(0, 300),
    }))
}

const searchBrave = async (query: string, max: number, key: string): Promise<SearchResult[]> => {
    if (!key) throw new Error('Brave Search API key is not set in Settings > Web Tools')
    const response = await fetchWithTimeout(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`,
        { headers: { Accept: 'application/json', 'X-Subscription-Token': key } }
    )
    if (!response.ok) throw new Error(`Brave Search returned ${response.status}`)
    const json = await response.json()
    const results: any[] = Array.isArray(json?.web?.results) ? json.web.results : []
    return results.slice(0, max).map((item) => ({
        title: String(item.title ?? ''),
        url: String(item.url ?? ''),
        snippet: String(item.description ?? '').slice(0, 300),
    }))
}

export const webSearch = async (query: string, config: WebToolsConfig): Promise<string> => {
    const max = Math.max(1, config.maxResults)
    let results: SearchResult[]
    switch (config.provider) {
        case 'searxng':
            results = await searchSearxng(query, max, config.searxngUrl)
            break
        case 'brave':
            results = await searchBrave(query, max, config.braveKey)
            break
        default:
            results = await searchJina(query, max, config.jinaKey)
    }
    if (results.length === 0) return `No results found for "${query}".`
    return results
        .map((item, i) => `${i + 1}. ${item.title}\n${item.url}\n${item.snippet}`)
        .join('\n\n')
}

export const fetchUrl = async (url: string, config: WebToolsConfig): Promise<string> => {
    if (!isHttpUrl(url)) throw new Error('URL must start with http:// or https://')
    if (config.useJinaReader) {
        try {
            const response = await fetchWithTimeout(`https://r.jina.ai/${url}`, {
                headers: jinaHeaders(config.jinaKey, { Accept: 'text/plain' }),
            })
            if (response.ok) return truncate(await response.text(), config.maxPageChars)
            Logger.warn(`Jina reader returned ${response.status}, fetching page directly`)
        } catch (e) {
            Logger.warn(`Jina reader failed (${e}), fetching page directly`)
        }
    }
    const response = await fetchWithTimeout(url, {
        headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8' },
    })
    if (!response.ok) throw new Error(`Request returned ${response.status}`)
    const body = await response.text()
    const contentType = response.headers.get('content-type') ?? ''
    const text = contentType.includes('html') || /<html/i.test(body) ? stripHtml(body) : body
    return truncate(text, config.maxPageChars)
}

const parseArguments = (raw: string): Record<string, unknown> => {
    try {
        const parsed = JSON.parse(raw || '{}')
        return typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch {
        return {}
    }
}

/** Human readable one-liner shown in the chat while a tool runs, and kept as a citation */
export const describeToolCall = (name: string, rawArguments: string) => {
    const args = parseArguments(rawArguments)
    if (name === WEB_SEARCH_TOOL) return `🔎 Searched the web for "${String(args.query ?? '')}"`
    if (name === FETCH_URL_TOOL) return `📄 Read ${String(args.url ?? '')}`
    return `🔧 Called ${name}`
}

/** Runs a tool call and always returns a string the model can read, including errors */
export const executeWebTool = async (
    name: string,
    rawArguments: string,
    config: WebToolsConfig
): Promise<string> => {
    const args = parseArguments(rawArguments)
    try {
        if (name === WEB_SEARCH_TOOL) {
            const query = String(args.query ?? '').trim()
            if (!query) return 'Error: query is required.'
            return await webSearch(query, config)
        }
        if (name === FETCH_URL_TOOL) {
            const url = String(args.url ?? '').trim()
            if (!url) return 'Error: url is required.'
            return await fetchUrl(url, config)
        }
        return `Error: unknown tool "${name}".`
    } catch (e) {
        Logger.warn(`Web tool ${name} failed: ${e}`)
        return `Error: ${e instanceof Error ? e.message : String(e)}`
    }
}
