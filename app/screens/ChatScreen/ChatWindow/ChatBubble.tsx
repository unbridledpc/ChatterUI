import { setStringAsync } from 'expo-clipboard'
import { Pressable, Text, View } from 'react-native'
import { useMMKVBoolean } from 'react-native-mmkv'
import { useShallow } from 'zustand/react/shallow'

import { AppSettings } from '@lib/constants/GlobalValues'
import { useAppMode } from '@lib/state/AppMode'
import { Chats } from '@lib/state/Chat'
import { Logger } from '@lib/state/Logger'
import { SamplersManager } from '@lib/state/SamplerState'
import { Theme } from '@lib/theme/ThemeManager'

import ChatAttachments from './ChatAttachments'
import { useChatEditorStore } from './ChatEditor'
import ChatQuickActions, { useChatActionsState } from './ChatQuickActions'
import ChatSwipes from './ChatSwipes'
import ChatText from './ChatText'
import ChatTextLast from './ChatTextLast'

type ChatTextProps = {
    index: number
    nowGenerating: boolean
    isLastMessage: boolean
    isGreeting: boolean
}

const ChatBubble: React.FC<ChatTextProps> = ({
    index,
    nowGenerating,
    isLastMessage,
    isGreeting,
}) => {
    const message = Chats.useEntryData(index)
    const { appMode } = useAppMode()
    const [showTPS] = useMMKVBoolean(AppSettings.ShowTokenPerSecond)
    const { color, spacing, borderRadius, fontSize } = Theme.useTheme()

    const { setShowOptions } = useChatActionsState(
        useShallow((state) => ({
            setShowOptions: state.setActiveIndex,
        }))
    )

    const showEditor = useChatEditorStore((state) => state.show)
    const handleEnableEdit = () => {
        if (!nowGenerating) showEditor(index)
    }

    const handleLongPress = () => {
        if (nowGenerating) return

        // Keep the existing long-press edit behavior for the user's own prompts.
        if (message.is_user) {
            handleEnableEdit()
            return
        }

        // For assistant responses, copy the entire stored swipe, not just visible text.
        const fullResponse = message.swipes?.[message.swipe_id]?.swipe
        if (!fullResponse) {
            Logger.errorToast('Nothing to copy')
            return
        }

        setStringAsync(fullResponse)
            .then(() => {
                Logger.infoToast('Full response copied')
            })
            .catch(() => {
                Logger.errorToast('Failed to copy to clipboard')
            })
    }

    const hasSwipes = message?.swipes?.length > 1
    const showSwipe = !message.is_user && isLastMessage && (hasSwipes || !isGreeting)
    const timings = message.swipes[message.swipe_id].timings
    const sampler = SamplersManager.getCurrentSampler()
    const requestedTokens = Number(sampler.genamt ?? 0)
    const contextLength = Number(sampler.max_length ?? 0)
    const generatedTokens = Number(timings?.predicted_n ?? 0)
    const promptTokens = Number((timings as any)?.prompt_n ?? 0)
    const hitTokenLimit =
        !nowGenerating && requestedTokens > 0 && generatedTokens >= Math.max(requestedTokens - 1, 1)
    const stopLabel = hitTokenLimit ? 'TOKEN LIMIT' : 'EOS/STOP'

    return (
        <View>
            <Pressable
                onPress={() => {
                    setShowOptions(nowGenerating ? undefined : index)
                }}
                style={{
                    backgroundColor: color.neutral._200,
                    borderColor: color.neutral._200,
                    borderWidth: 1,
                    marginBottom: showSwipe ? 0 : 4,
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.m,
                    minHeight: 40,
                    borderRadius: borderRadius.m,
                    shadowColor: color.shadow,
                    boxShadow: [
                        {
                            offsetX: 1,
                            offsetY: 1,
                            spreadDistance: 2,
                            color: color.shadow,
                            blurRadius: 4,
                        },
                    ],
                }}
                onLongPress={handleLongPress}>
                {isLastMessage ? (
                    <ChatTextLast nowGenerating={nowGenerating} index={index} />
                ) : (
                    <ChatText nowGenerating={nowGenerating} index={index} />
                )}
                <ChatAttachments index={index} />
                <View
                    style={{
                        flexDirection: 'row',
                    }}>
                    {showTPS && appMode === 'local' && timings && (
                        <View style={{ flex: 1 }}>
                            <Text
                                style={{
                                    color: color.text._500,
                                    fontWeight: '300',
                                    fontSize: fontSize.s,
                                }}>
                                {`Prompt: ${getFiniteValue(timings.prompt_per_second)} t/s`}
                                {`   Text Gen: ${getFiniteValue(timings.predicted_per_second)} t/s`}
                            </Text>
                            {!message.is_user && !nowGenerating && (
                                <Text
                                    style={{
                                        color: hitTokenLimit ? color.error._400 : color.text._500,
                                        fontWeight: hitTokenLimit ? '600' : '300',
                                        fontSize: fontSize.s,
                                    }}>
                                    {`Generated: ${generatedTokens} / ${requestedTokens}`}
                                    {`   Stop: ${stopLabel}`}
                                    {contextLength > 0
                                        ? `   Context: ${promptTokens > 0 ? `${promptTokens} / ` : ''}${contextLength}`
                                        : ''}
                                </Text>
                            )}
                        </View>
                    )}

                    <ChatQuickActions
                        nowGenerating={nowGenerating}
                        isLastMessage={isLastMessage}
                        index={index}
                    />
                </View>
            </Pressable>
            {showSwipe && (
                <ChatSwipes index={index} nowGenerating={nowGenerating} isGreeting={isGreeting} />
            )}
        </View>
    )
}

const getFiniteValue = (value: number | null) => {
    if (!value || !isFinite(value)) return (0).toFixed(2)
    return value.toFixed(2)
}

export default ChatBubble
