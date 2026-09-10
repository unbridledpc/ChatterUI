import { DeviceType, getDeviceTypeAsync } from 'expo-device'
import { lockAsync, OrientationLock, unlockAsync } from 'expo-screen-orientation'

import { AppSettings } from '@lib/constants/GlobalValues'
import { mmkv } from '@lib/storage/MMKV'

/**
 * Applies the user's orientation preference immediately.
 *
 * Tablets (and foldables that report as tablets) default to free rotation,
 * phones default to portrait unless "Unlock Orientation" is enabled.
 * Safe to call again whenever the setting changes - no app restart needed.
 */
export const lockScreenOrientation = async () => {
    const result = await getDeviceTypeAsync()
    const unlock = mmkv.getBoolean(AppSettings.UnlockOrientation)
    if (unlock ?? result === DeviceType.TABLET) {
        await unlockAsync()
        return
    }
    await lockAsync(OrientationLock.PORTRAIT)
}

export const unlockScreenOrientation = async () => {
    await unlockAsync()
}
