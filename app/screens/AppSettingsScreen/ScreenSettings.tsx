import * as KeepAwake from 'expo-keep-awake'
import React from 'react'
import { View } from 'react-native'
import { useMMKVBoolean } from 'react-native-mmkv'

import ThemedSwitch from '@components/input/ThemedSwitch'
import SectionTitle from '@components/text/SectionTitle'
import { AppSettings } from '@lib/constants/GlobalValues'
import { lockScreenOrientation } from '@lib/utils/Screen'

const ScreenSettings = () => {
    const [unlockOrientation, setUnlockOrientation] = useMMKVBoolean(AppSettings.UnlockOrientation)
    const [keepAwake, setKeepAwake] = useMMKVBoolean(AppSettings.KeepAwake)
    return (
        <View style={{ rowGap: 8 }}>
            <SectionTitle>Screen</SectionTitle>
            <ThemedSwitch
                label="Unlock Orientation"
                description="Allows landscape on phones"
                value={unlockOrientation}
                onChangeValue={(value) => {
                    setUnlockOrientation(value)
                    lockScreenOrientation()
                }}
            />

            <ThemedSwitch
                label="Keep Awake"
                description="Keeps app awake in foreground"
                value={keepAwake}
                onChangeValue={(value) => {
                    setKeepAwake(value)
                    if (value) KeepAwake.activateKeepAwakeAsync()
                    else KeepAwake.deactivateKeepAwake()
                }}
            />
        </View>
    )
}

export default ScreenSettings
