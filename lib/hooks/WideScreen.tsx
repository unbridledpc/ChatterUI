import { useWindowDimensions } from 'react-native'

import { Layout } from '@lib/constants/Layout'

/**
 * True when the current window is wide enough for multi-column layouts.
 * Re-evaluates on rotation and when a foldable is opened or closed.
 */
export const useIsWideScreen = () => {
    const { width } = useWindowDimensions()
    return width >= Layout.wideScreenBreakpoint
}
