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
                'Search the web for current information. Returns the titles, URLs and snippets of the top results. Use fetch_url afterwards to read a result in full when the snippets do not contain the answer.',
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
    `The current date is ${new Date().toDateString()}. Your training data is out of date, so you do not know recent events. ` +
    `You have two tools: ${WEB_SEARCH_TOOL} finds current information and ${FETCH_URL_TOOL} reads a page. ` +
    `For anything time-sensitive (who currently holds an office, latest versions or releases, news, prices, scores, dates) you must call ${WEB_SEARCH_TOOL} and base your answer only on what the tools return, never on memory. ` +
    `If the snippets do not settle the question, call ${FETCH_URL_TOOL} on the most relevant result. ` +
    `If a tool returns an error or nothing useful, say that the search failed instead of guessing. ` +
    `Cite the URLs you used. Do not call tools for questions you can answer reliably without current information.`

type SearchResult = { title: string; url: string; snippet: string }

/** Tool output plus a short outcome shown next to the citation line in the chat */
export type ToolOutcome = { output: string; summary: string }

const REQUEST_TIMEOUT_MS = 20000
const BROWSER_UA =
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'

const fetchWithTimeout = async (url: string, init: RequestInit = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
        return await fetch(url, { ...init, signal: controller.signal })
    } finally {
        clearTimeout(timer)
    }
}

const decodeEntities = (text: string) =>
    text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))

const stripTags = (html: string) =>
    decodeEntities(html.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()

const stripHtml = (html: string) => {
    return decodeEntities(
        html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
            .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h[1-6]>|<\/tr>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
    )
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim()
}

const truncate = (text: string, maxChars: number) =>
    text.length > maxChars ? text.slice(0, maxChars) + '\n\n[Content truncated]' : text

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url)

type ExcerptedResult = SearchResult & { excerpt?: string }

const formatResults = (results: ExcerptedResult[]) =>
    results
        .map((item, i) => {
            const lines = [`${i + 1}. ${item.title || item.url}`, item.url]
            if (item.snippet) lines.push(item.snippet)
            if (item.excerpt) lines.push(`Excerpt: ${item.excerpt}`)
            return lines.join('\n')
        })
        .join('\n\n')

const RESULTS_FOOTER =
    'Answer using only the information above and cite the URLs you relied on. ' +
    'If it does not contain the answer, call fetch_url on the most relevant URL before answering.'

const resultsHeader = (query: string) =>
    `Search results for "${query}", retrieved ${new Date().toDateString()}:\n\n`

/** Pulls the opening text of a page through Jina Reader. Returns undefined on any failure. */
const fetchExcerpt = async (url: string, chars: number, key: string) => {
    try {
        const response = await fetchWithTimeout(`https://r.jina.ai/${url}`, {
            headers: jinaHeaders(key, { Accept: 'text/plain', 'X-Timeout': '10' }),
        })
        if (!response.ok) return
        const text = (await response.text()).replace(/\s+/g, ' ').trim()
        return text.length > chars ? text.slice(0, chars) + '…' : text
    } catch {
        return
    }
}

/** Attaches excerpts to the first few results so the model has real content to read */
const attachExcerpts = async (
    results: SearchResult[],
    config: WebToolsConfig
): Promise<ExcerptedResult[]> => {
    if (!config.searchExcerpts) return results
    const count = Math.max(0, Math.min(config.excerptCount, results.length))
    const excerpts = await Promise.all(
        results
            .slice(0, count)
            .map((item) => fetchExcerpt(item.url, config.excerptChars, config.jinaKey))
    )
    return results.map((item, i) => (i < count ? { ...item, excerpt: excerpts[i] } : item))
}

/** Keyless. DuckDuckGo's HTML endpoint; may serve a bot challenge from some networks. */
const searchDuckDuckGo = async (query: string, max: number): Promise<SearchResult[]> => {
    const response = await fetchWithTimeout(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`,
        { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' } }
    )
    if (response.status === 202) throw new Error('DuckDuckGo served a bot challenge')
    if (!response.ok) throw new Error(`DuckDuckGo returned ${response.status}`)
    const html = await response.text()

    const results: SearchResult[] = []
    const linkPattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    const snippetPattern = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    const snippets: string[] = []
    let snippetMatch: RegExpExecArray | null
    while ((snippetMatch = snippetPattern.exec(html)) !== null) {
        snippets.push(stripTags(snippetMatch[1]))
    }
    let linkMatch: RegExpExecArray | null
    while ((linkMatch = linkPattern.exec(html)) !== null && results.length < max) {
        const url = unwrapDuckDuckGoUrl(decodeEntities(linkMatch[1]))
        if (!isHttpUrl(url)) continue
        results.push({
            title: stripTags(linkMatch[2]),
            url: url,
            snippet: (snippets[results.length] ?? '').slice(0, 400),
        })
    }
    if (results.length > 0) return results
    Logger.warn('DuckDuckGo HTML page had no parseable results, trying the lite endpoint')
    return searchDuckDuckGoLite(query, max)
}

/** Results are wrapped in a redirect: //duckduckgo.com/l/?uddg=<encoded url>&rut=... */
const unwrapDuckDuckGoUrl = (url: string) => {
    const redirect = url.match(/[?&]uddg=([^&]+)/)
    if (redirect) return decodeURIComponent(redirect[1])
    if (url.startsWith('//')) return 'https:' + url
    return url
}

/** DuckDuckGo's table-based lite page, with different markup from the HTML endpoint */
const searchDuckDuckGoLite = async (query: string, max: number): Promise<SearchResult[]> => {
    const response = await fetchWithTimeout(
        `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=us-en`,
        { headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' } }
    )
    if (response.status === 202) throw new Error('DuckDuckGo served a bot challenge')
    if (!response.ok) throw new Error(`DuckDuckGo lite returned ${response.status}`)
    const html = await response.text()
    const results: SearchResult[] = []
    const linkPattern = /<a[^>]*href="([^"]+)"[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/g
    const snippetPattern = /class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g
    const snippets: string[] = []
    let snippetMatch: RegExpExecArray | null
    while ((snippetMatch = snippetPattern.exec(html)) !== null) {
        snippets.push(stripTags(snippetMatch[1]))
    }
    let linkMatch: RegExpExecArray | null
    while ((linkMatch = linkPattern.exec(html)) !== null && results.length < max) {
        const url = unwrapDuckDuckGoUrl(decodeEntities(linkMatch[1]))
        if (!isHttpUrl(url)) continue
        results.push({
            title: stripTags(linkMatch[2]),
            url: url,
            snippet: (snippets[results.length] ?? '').slice(0, 400),
        })
    }
    return results
}

/** Keyless and reliable, but limited to encyclopedic topics. Used as the fallback. */
const searchWikipedia = async (query: string, max: number): Promise<SearchResult[]> => {
    const response = await fetchWithTimeout(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=${max}&srprop=snippet&srsearch=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } }
    )
    if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`)
    const json = await response.json()
    const results: any[] = Array.isArray(json?.query?.search) ? json.query.search : []
    return results.map((item) => ({
        title: String(item.title ?? ''),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(item.title ?? '').replace(/ /g, '_'))}`,
        snippet: stripTags(String(item.snippet ?? '')).slice(0, 400),
    }))
}

const jinaHeaders = (key: string, extra: Record<string, string>) =>
    key ? { ...extra, Authorization: `Bearer ${key}` } : extra

/** Needs an API key since 2025; keyless requests get a 401. */
const searchJina = async (query: string, max: number, key: string): Promise<SearchResult[]> => {
    if (!key) throw new Error('Jina search needs an API key. Add one in Settings > Web Tools.')
    const response = await fetchWithTimeout(`https://s.jina.ai/?q=${encodeURIComponent(query)}`, {
        headers: jinaHeaders(key, { Accept: 'application/json', 'X-Respond-With': 'no-content' }),
    })
    if (!response.ok) throw new Error(`Jina search returned ${response.status}`)
    const json = await response.json()
    const data: any[] = Array.isArray(json?.data) ? json.data : []
    return data.slice(0, max).map((item) => ({
        title: String(item.title ?? ''),
        url: String(item.url ?? ''),
        snippet: String(item.description ?? item.content ?? '').slice(0, 400),
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
        snippet: String(item.content ?? '').slice(0, 400),
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
        snippet: String(item.description ?? '').slice(0, 400),
    }))
}

const searchWithProvider = (query: string, max: number, config: WebToolsConfig) => {
    switch (config.provider) {
        case 'jina':
            return searchJina(query, max, config.jinaKey)
        case 'searxng':
            return searchSearxng(query, max, config.searxngUrl)
        case 'brave':
            return searchBrave(query, max, config.braveKey)
        default:
            return searchDuckDuckGo(query, max)
    }
}

/**
 * Searches with the configured provider, falling back to Wikipedia when the provider
 * fails or returns nothing, so the model always gets something real to read.
 */
export const webSearch = async (query: string, config: WebToolsConfig): Promise<ToolOutcome> => {
    const max = Math.max(1, config.maxResults)
    let primaryError: string | undefined
    try {
        const results = await searchWithProvider(query, max, config)
        if (results.length > 0) {
            const excerpted = await attachExcerpts(results, config)
            const withExcerpts = excerpted.filter((item) => item.excerpt).length
            return {
                output: resultsHeader(query) + formatResults(excerpted) + '\n\n' + RESULTS_FOOTER,
                summary: `${results.length} results${withExcerpts ? `, ${withExcerpts} excerpts` : ''}`,
            }
        }
        primaryError = 'no results'
    } catch (e) {
        primaryError = e instanceof Error ? e.message : String(e)
        Logger.warn(`Web search via ${config.provider} failed: ${primaryError}`)
    }

    const fallback = await searchWikipedia(query, max)
    if (fallback.length === 0) {
        return {
            output: `Search failed (${primaryError}) and Wikipedia has no results for "${query}".`,
            summary: `failed: ${primaryError}`,
        }
    }
    const excerpted = await attachExcerpts(fallback, config)
    return {
        output:
            resultsHeader(query) +
            `Web search was unavailable (${primaryError}). Wikipedia results instead:\n\n` +
            formatResults(excerpted) +
            '\n\n' +
            RESULTS_FOOTER,
        summary: `Wikipedia fallback, ${fallback.length} results`,
    }
}

export const fetchUrl = async (url: string, config: WebToolsConfig): Promise<ToolOutcome> => {
    if (!isHttpUrl(url)) throw new Error('URL must start with http:// or https://')
    if (config.useJinaReader) {
        try {
            const response = await fetchWithTimeout(`https://r.jina.ai/${url}`, {
                headers: jinaHeaders(config.jinaKey, { Accept: 'text/plain' }),
            })
            if (response.ok) {
                const text = truncate(await response.text(), config.maxPageChars)
                return { output: text, summary: `${(text.length / 1000).toFixed(1)}k chars` }
            }
            Logger.warn(`Jina reader returned ${response.status}, fetching page directly`)
        } catch (e) {
            Logger.warn(`Jina reader failed (${e}), fetching page directly`)
        }
    }
    const response = await fetchWithTimeout(url, {
        headers: {
            'User-Agent': BROWSER_UA,
            Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        },
    })
    if (!response.ok) throw new Error(`Request returned ${response.status}`)
    const body = await response.text()
    const contentType = response.headers.get('content-type') ?? ''
    const text = truncate(
        contentType.includes('html') || /<html/i.test(body) ? stripHtml(body) : body,
        config.maxPageChars
    )
    return { output: text, summary: `${(text.length / 1000).toFixed(1)}k chars` }
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

/** Runs a tool call and always returns text the model can read, including errors */
export const executeWebTool = async (
    name: string,
    rawArguments: string,
    config: WebToolsConfig
): Promise<ToolOutcome> => {
    const args = parseArguments(rawArguments)
    try {
        if (name === WEB_SEARCH_TOOL) {
            const query = String(args.query ?? '').trim()
            if (!query) return { output: 'Error: query is required.', summary: 'failed: no query' }
            return await webSearch(query, config)
        }
        if (name === FETCH_URL_TOOL) {
            const url = String(args.url ?? '').trim()
            if (!url) return { output: 'Error: url is required.', summary: 'failed: no url' }
            return await fetchUrl(url, config)
        }
        return { output: `Error: unknown tool "${name}".`, summary: 'failed: unknown tool' }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        Logger.warn(`Web tool ${name} failed: ${message}`)
        return { output: `Error: ${message}`, summary: `failed: ${message}` }
    }
}
