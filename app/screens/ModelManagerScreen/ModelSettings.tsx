import { useFocusEffect } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { BackHandler, Platform, Text, View } from 'react-native'
import { useMMKVBoolean, useMMKVNumber } from 'react-native-mmkv'
import Animated, { Easing, SlideInRight, SlideOutRight } from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'

import ThemedButton from '@components/buttons/ThemedButton'
import HorizontalSelector from '@components/input/HorizontalSelector'
import ThemedSlider from '@components/input/ThemedSlider'
import ThemedSwitch from '@components/input/ThemedSwitch'
import SectionTitle from '@components/text/SectionTitle'
import Alert from '@components/views/Alert'
import { AppSettings, Global } from '@lib/constants/GlobalValues'
import { kvCacheTypes, Llama } from '@lib/engine/Local/LlamaLocal'
import { KV } from '@lib/engine/Local/Model'
import useBackendDevices from '@lib/hooks/BackendDevices'
import { Logger } from '@lib/state/Logger'
import { Theme } from '@lib/theme/ThemeManager'
import { readableFileSize } from '@lib/utils/File'

type ModelSettingsProp = {
    modelImporting: boolean
    modelLoading: boolean
    exit: () => void
}

const deviceLabels = { GPUOpenCL: 'OpenCL', HTP0: 'Hexagon', CPU: 'CPU' }

const ModelSettings: React.FC<ModelSettingsProp> = ({ modelImporting, modelLoading, exit }) => {
    const { config, setConfig } = Llama.useLlamaPreferencesStore(
        useShallow((state) => ({
            config: state.config,
            setConfig: state.setConfiguration,
        }))
    )

    const devices = useBackendDevices()
    const { color, spacing, fontSize } = Theme.useTheme()

    const [saveKV, setSaveKV] = useMMKVBoolean(AppSettings.SaveLocalKV)
    const [autoloadLocal, setAutoloadLocal] = useMMKVBoolean(AppSettings.AutoLoadLocal)
    const [showModelInChat, setShowModelInChat] = useMMKVBoolean(AppSettings.ShowModelInChat)
    const [threadCount] = useMMKVNumber(Global.CPUThreads)

    const [kvSize, setKVSize] = useState(0)

    const getKVSize = async () => {
        const size = await KV.getKVSize()
        setKVSize(size)
    }

    useEffect(() => {
        getKVSize()
    }, [])

    const backAction = () => {
        exit()
        return true
    }

    useFocusEffect(() => {
        const handler = BackHandler.addEventListener('hardwareBackPress', backAction)
        return () => handler.remove()
    })

    const handleDeleteKV = () => {
        Alert.alert({
            title: 'Delete KV Cache',
            description: `Are you sure you want to delete the KV Cache? This cannot be undone. \n\n This will clear up ${readableFileSize(kvSize)} of space.`,
            buttons: [
                { label: 'Cancel' },
                {
                    label: 'Delete KV Cache',
                    onPress: async () => {
                        await KV.deleteKV()
                        Logger.info('KV Cache deleted!')
                        getKVSize()
                    },
                    type: 'warning',
                },
            ],
        })
    }

    return (
        <Animated.ScrollView
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            entering={SlideInRight.easing(Easing.inOut(Easing.cubic))}
            exiting={SlideOutRight.easing(Easing.inOut(Easing.cubic))}>
            <SectionTitle>CPU Settings</SectionTitle>
            <View style={{ marginTop: 16 }} />
            {config && (
                <>
                    <ThemedSlider
                        label="Max Context"
                        value={config.context_length}
                        onValueChange={(value) => setConfig({ ...config, context_length: value })}
                        min={1024}
                        max={65536}
                        step={1024}
                        disabled={modelImporting || modelLoading}
                    />
                    <ThemedSlider
                        label="Threads"
                        value={config.threads}
                        onValueChange={(value) => setConfig({ ...config, threads: value })}
                        min={1}
                        max={threadCount ?? 8}
                        step={1}
                        disabled={modelImporting || modelLoading}
                    />

                    <ThemedSlider
                        label="Batch"
                        value={config.batch}
                        onValueChange={(value) => setConfig({ ...config, batch: value })}
                        min={16}
                        max={1024}
                        step={16}
                        disabled={modelImporting || modelLoading}
                    />

                    {/* Note: llama.rn does not have any Android gpu acceleration */}
                    {(Platform.OS === 'ios' || devices.length > 1) && (
                        <ThemedSlider
                            label="GPU Layers"
                            value={config.gpu_layers}
                            onValueChange={(value) => setConfig({ ...config, gpu_layers: value })}
                            min={0}
                            max={100}
                            step={1}
                            disabled={modelImporting || modelLoading}
                        />
                    )}

                    <ThemedSwitch
                        label="Context Shift"
                        value={config.ctx_shift}
                        onChangeValue={(value) => {
                            setConfig({ ...config, ctx_shift: value })
                        }}
                    />

                    {devices.length > 1 && (
                        <HorizontalSelector
                            style={{ paddingBottom: 12 }}
                            label="Backend Device"
                            values={devices.map((item) => ({
                                label: deviceLabels[item as keyof typeof deviceLabels] ?? item,
                                value: item,
                            }))}
                            selected={config.devices?.[0]}
                            onPress={(value) => {
                                const devices = value === 'CPU' ? [value] : [value, 'CPU']
                                setConfig({ ...config, devices })
                            }}
                        />
                    )}

                    <SectionTitle>Memory Settings</SectionTitle>
                    <View style={{ marginTop: spacing.xl, rowGap: spacing.l }}>
                        <HorizontalSelector
                            style={{ flex: 0 }}
                            label="Flash Attention"
                            description="Reduces memory use at long context. Required for a quantized V cache."
                            values={[
                                { label: 'Auto', value: 'auto' as const },
                                { label: 'On', value: 'on' as const },
                                { label: 'Off', value: 'off' as const },
                            ]}
                            selected={config.flash_attn ?? 'auto'}
                            onPress={(value) => setConfig({ ...config, flash_attn: value })}
                        />
                        <HorizontalSelector
                            style={{ flex: 0 }}
                            label="K Cache Type"
                            description="q8_0 roughly halves KV cache memory with negligible quality loss, leaving room for larger models or longer context."
                            values={kvCacheTypes}
                            selected={config.cache_type_k ?? 'f16'}
                            onPress={(value) => setConfig({ ...config, cache_type_k: value })}
                        />
                        <HorizontalSelector
                            style={{ flex: 0 }}
                            label="V Cache Type"
                            description={
                                (config.cache_type_v ?? 'f16') !== 'f16' &&
                                (config.flash_attn ?? 'auto') === 'off'
                                    ? 'A quantized V cache needs flash attention. It will be turned on when the model loads.'
                                    : 'q4_0 saves the most memory but can hurt quality. q8_0 is the safe choice.'
                            }
                            values={kvCacheTypes}
                            selected={config.cache_type_v ?? 'f16'}
                            onPress={(value) => setConfig({ ...config, cache_type_v: value })}
                        />
                        <ThemedSwitch
                            label="Lock Model In Memory"
                            description="Pins the model in RAM for steadier speed. Turn off for models close to your device's memory limit, otherwise Android may kill the app."
                            value={config.use_mlock ?? true}
                            onChangeValue={(value) => setConfig({ ...config, use_mlock: value })}
                        />
                        <Text style={{ color: color.text._500, fontSize: fontSize.s }}>
                            Memory settings take effect the next time a model is loaded.
                        </Text>
                    </View>
                </>
            )}
            <SectionTitle>Advanced Settings</SectionTitle>
            <ThemedSwitch
                label="Show Model Name In Chat"
                value={showModelInChat}
                onChangeValue={setShowModelInChat}
            />
            <ThemedSwitch
                label="Automatically Load Model on Chat"
                value={autoloadLocal}
                onChangeValue={setAutoloadLocal}
            />
            <ThemedSwitch
                label="Save Local KV"
                value={saveKV}
                onChangeValue={setSaveKV}
                description={
                    saveKV
                        ? ''
                        : 'Saves the KV cache on generations, allowing you to continue sessions after closing the app. Must use the same model for this to function properly. Saving the KV cache file may be very big and negatively impact battery life!'
                }
            />
            {saveKV && (
                <ThemedButton
                    buttonStyle={{ marginTop: 8 }}
                    label={'Purge KV Cache (' + readableFileSize(kvSize) + ')'}
                    onPress={handleDeleteKV}
                    variant={kvSize === 0 ? 'disabled' : 'critical'}
                />
            )}
        </Animated.ScrollView>
    )
}

export default ModelSettings
