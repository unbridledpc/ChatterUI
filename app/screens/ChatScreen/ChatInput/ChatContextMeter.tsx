import { Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { Chats } from '@lib/state/Chat'
import { useContextUsageStore } from '@lib/state/ContextUsage'
import { Theme } from '@lib/theme/ThemeManager'

const formatTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

/**
 * Shows how full the context window was on the last generation, and whether
 * older messages were left out. Lets the user see when the model has "forgotten"
 * earlier parts of a long coding session instead of guessing.
 */
const ChatContextMeter = () => {
    const { color, fontSize, spacing } = Theme.useTheme()
    const usage = useContextUsageStore(useShallow((state) => state.usage))
    const chatId = Chats.useChatState(useShallow((state) => state.data?.id))

    if (!usage || usage.limit <= 0 || usage.chatId !== chatId) return null

    const ratio = Math.min(1, usage.used / usage.limit)
    const warn = usage.dropped > 0 || ratio > 0.85
    const barColor = warn ? color.error._300 : color.primary._400
    const textColor = warn ? color.error._300 : color.text._400

    return (
        <View style={{ paddingHorizontal: spacing.s, rowGap: spacing.s }}>
            <View
                style={{
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: color.neutral._300,
                    overflow: 'hidden',
                }}>
                <View
                    style={{
                        height: '100%',
                        width: `${Math.round(ratio * 100)}%`,
                        backgroundColor: barColor,
                    }}
                />
            </View>
            <Text style={{ color: textColor, fontSize: fontSize.s }} numberOfLines={1}>
                {`Context ${formatTokens(usage.used)} / ${formatTokens(usage.limit)}`}
                {usage.dropped > 0 &&
                    `  ·  ${usage.dropped} older message${usage.dropped === 1 ? '' : 's'} not sent`}
            </Text>
        </View>
    )
}

export default ChatContextMeter
