import { useShallow } from 'zustand/react/shallow'

import ThemedButton from '@components/buttons/ThemedButton'
import { useAppMode } from '@lib/state/AppMode'
import { Logger } from '@lib/state/Logger'
import { WebTools } from '@lib/state/WebTools'
import { Theme } from '@lib/theme/ThemeManager'

/**
 * Globe button: lets the local model search the web and read pages through tool calling.
 * Only shown in Local mode, where the tool loop is implemented.
 */
const WebToolsToggle = () => {
    const { color } = Theme.useTheme()
    const { appMode } = useAppMode()
    const { enabled, setEnabled } = WebTools.useWebToolsStore(
        useShallow((state) => ({
            enabled: state.config.enabled,
            setEnabled: state.setEnabled,
        }))
    )

    if (appMode !== 'local') return null

    return (
        <ThemedButton
            variant="tertiary"
            iconName="global"
            iconSize={20}
            accessibilityRole="switch"
            accessibilityState={{ checked: enabled }}
            accessibilityLabel="Toggle web tools"
            iconStyle={{ color: enabled ? color.text._100 : color.text._400 }}
            buttonStyle={{
                borderWidth: 0,
                padding: 6,
                borderRadius: 16,
                backgroundColor: enabled ? color.primary._300 : color.neutral._200,
            }}
            onPress={() => {
                setEnabled(!enabled)
                Logger.infoToast(enabled ? 'Web tools disabled' : 'Web tools enabled')
            }}
        />
    )
}

export default WebToolsToggle
