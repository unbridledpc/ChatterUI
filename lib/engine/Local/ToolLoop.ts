import { RNLlamaOAICompatibleMessage, ToolCall } from 'cui-llama.rn'

import { Message } from '@lib/engine/API/ContextBuilder'
import { Llama } from '@lib/engine/Local/LlamaLocal'
import {
    describeToolCall,
    executeWebTool,
    webToolDefinitions,
    webToolSystemPrompt,
} from '@lib/engine/Tools/WebTools'
import { Chats, useInference } from '@lib/state/Chat'
import { Logger } from '@lib/state/Logger'
import { useTTSStore } from '@lib/state/TTS'
import { WebTools } from '@lib/state/WebTools'
import { CompletionTimings } from 'db/schema'

type ToolMessage = RNLlamaOAICompatibleMessage & {
    tool_calls?: ToolCall[]
    name?: string
    tool_call_id?: string
}

const TOOL_CALL_OPEN = '<tool_call>'

/** True when the loaded model's chat template can render tool definitions and tool calls */
export const modelSupportsTools = () => {
    const jinja = Llama.useLlamaModelStore.getState().context?.model?.chatTemplates?.jinja
    return !!(jinja?.defaultCaps?.tools || jinja?.toolUse)
}

/** Hides raw tool-call JSON while it streams. The log line replaces it once the call runs. */
const displayText = (raw: string) => {
    const index = raw.indexOf(TOOL_CALL_OPEN)
    if (index === -1) return raw
    return raw.slice(0, index) + '⏳ Calling tool…'
}

type ToolLoopParams = {
    /** Sampler and completion fields, minus the prebuilt prompt (the binding formats the chat) */
    payload: Record<string, any>
    /** Chat-completion messages built by the context builder */
    messages: Message[]
    /** Stop strings to strip from the final text */
    replace: RegExp
}

/**
 * Agentic generation for local models: the model may call web tools, the app runs them,
 * feeds results back as tool messages and generates again, until the model answers or
 * the round limit is hit. Tool activity is kept at the top of the reply as citations.
 */
export const runLocalToolLoop = async ({ payload, messages, replace }: ToolLoopParams) => {
    const context = Llama.useLlamaModelStore.getState().context
    if (!context) {
        Logger.errorToast('No Model Loaded')
        Chats.useChatState.getState().stopGenerating()
        return
    }
    const config = WebTools.useWebToolsStore.getState().config
    const regenCache = Chats.useChatState.getState().getRegenCache()

    let aborted = false
    useInference.getState().setAbort(async () => {
        aborted = true
        await Llama.useLlamaModelStore.getState().stopCompletion()
    })

    // Copy so tool messages never leak back into the caller's array
    const history = messages.map((item) => ({ ...item })) as unknown as ToolMessage[]
    const system = history[0]
    if (system?.role === 'system' && typeof system.content === 'string') {
        system.content = system.content.trimEnd() + '\n\n' + webToolSystemPrompt()
    } else {
        history.unshift({ role: 'system', content: webToolSystemPrompt() })
    }

    // The binding builds the prompt from messages, so the prebuilt prompt must not be sent
    const { prompt: _prompt, media_paths: _mediaPaths, ...completionParams } = payload

    let toolLog = ''
    let finalText = ''
    let timings: CompletionTimings | undefined

    for (let round = 0; round <= config.maxRounds; round++) {
        const allowTools = round < config.maxRounds
        let rawTurn = ''
        let speakTokens = true
        Chats.useChatState.getState().setBuffer({ data: toolLog })

        const result = await context.completion(
            {
                ...completionParams,
                messages: history as RNLlamaOAICompatibleMessage[],
                jinja: true,
                tools: allowTools ? webToolDefinitions : undefined,
            },
            (data) => {
                rawTurn += data.token
                if (speakTokens && rawTurn.includes(TOOL_CALL_OPEN)) speakTokens = false
                if (speakTokens) useTTSStore.getState().insertBuffer(data.token)
                Chats.useChatState.getState().setBuffer({ data: toolLog + displayText(rawTurn) })
            }
        )
        timings = result.timings as unknown as CompletionTimings

        const calls = result.tool_calls ?? []
        if (aborted || result.interrupted || calls.length === 0 || !allowTools) {
            finalText = result.text
            if (calls.length > 0 && !allowTools) {
                Logger.warn(
                    `Web tools: round limit (${config.maxRounds}) reached, answering without more calls`
                )
            }
            break
        }

        history.push({
            role: 'assistant',
            content: result.content ?? '',
            reasoning_content: result.reasoning_content || undefined,
            tool_calls: calls,
        })

        for (const call of calls) {
            const line = describeToolCall(call.function.name, call.function.arguments)
            toolLog += `> ${line}\n`
            Chats.useChatState.getState().setBuffer({ data: toolLog })
            Logger.info(`[Web Tools] ${line}`)
            const output = await executeWebTool(call.function.name, call.function.arguments, config)
            history.push({
                role: 'tool',
                name: call.function.name,
                tool_call_id: call.id,
                content: output,
            })
            if (aborted) break
        }
        if (aborted) break
    }

    const cleaned = finalText.replaceAll(replace, '').trim()
    const text = regenCache + (toolLog ? toolLog + '\n' : '') + cleaned
    Chats.useChatState.getState().setBuffer({ data: text, timings: timings })
    Chats.useChatState.getState().stopGenerating()
}
