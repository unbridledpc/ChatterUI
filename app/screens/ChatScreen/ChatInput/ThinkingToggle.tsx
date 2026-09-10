import ThemedButton from '@components/buttons/ThemedButton'
import { SamplerID } from '@lib/constants/SamplerData'
import { Logger } from '@lib/state/Logger'
import { SamplersManager } from '@lib/state/SamplerState'
import { Theme } from '@lib/theme/ThemeManager'

/**
 * One-tap switch for the sampler's "Enable Thinking" flag.
 * Reasoning improves answer quality on models that support it, at a speed cost,
 * so it is worth toggling per message rather than digging into Sampler settings.
 */
const ThinkingToggle = () => {
    const { color } = Theme.useTheme()
    const { currentConfig, updateCurrentConfig } = SamplersManager.useSamplers()
    const enabled = !!currentConfig?.data?.[SamplerID.ENABLE_THINKING]

    const handleToggle = () => {
        if (!currentConfig) return
        updateCurrentConfig({
            ...currentConfig,
            data: { ...currentConfig.data, [SamplerID.ENABLE_THINKING]: !enabled },
        })
        Logger.infoToast(enabled ? 'Thinking disabled' : 'Thinking enabled')
    }

    return (
        <ThemedButton
            variant="tertiary"
            iconName="bulb"
            iconSize={20}
            accessibilityRole="switch"
            accessibilityState={{ checked: enabled }}
            accessibilityLabel="Toggle thinking"
            iconStyle={{ color: enabled ? color.text._100 : color.text._400 }}
            buttonStyle={{
                borderWidth: 0,
                padding: 6,
                borderRadius: 16,
                backgroundColor: enabled ? color.primary._300 : color.neutral._200,
            }}
            onPress={handleToggle}
        />
    )
}

export default ThinkingToggle
