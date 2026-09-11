import React from 'react'
import { Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import HorizontalSelector from '@components/input/HorizontalSelector'
import ThemedSlider from '@components/input/ThemedSlider'
import ThemedSwitch from '@components/input/ThemedSwitch'
import ThemedTextInput from '@components/input/ThemedTextInput'
import SectionTitle from '@components/text/SectionTitle'
import { SearchProvider, WebTools } from '@lib/state/WebTools'
import { Theme } from '@lib/theme/ThemeManager'

const providers: { label: string; value: SearchProvider }[] = [
    { label: 'DuckDuckGo', value: 'duckduckgo' },
    { label: 'Jina', value: 'jina' },
    { label: 'SearXNG', value: 'searxng' },
    { label: 'Brave', value: 'brave' },
]

const WebToolsSettings = () => {
    const { color, fontSize } = Theme.useTheme()
    const { config, setConfig } = WebTools.useWebToolsStore(
        useShallow((state) => ({ config: state.config, setConfig: state.setConfig }))
    )

    return (
        <View style={{ rowGap: 8 }}>
            <SectionTitle>Web Tools</SectionTitle>
            <Text style={{ color: color.text._400, fontSize: fontSize.s }}>
                Turn on the globe button in a chat to let a local model search the web and read
                pages. Needs a model whose chat template supports tool calling, such as Qwen3.
            </Text>

            <HorizontalSelector
                style={{ flex: 0 }}
                label="Search Provider"
                description="DuckDuckGo needs no key. If a search fails, Wikipedia results are used instead so the model still has something real to read."
                values={providers}
                selected={config.provider}
                onPress={(value) => setConfig({ provider: value })}
            />

            {config.provider === 'jina' && (
                <ThemedTextInput
                    label="Jina API Key"
                    description="Required for Jina search. Also raises the reader's rate limit."
                    containerStyle={{ flex: 0 }}
                    value={config.jinaKey}
                    onChangeText={(value) => setConfig({ jinaKey: value })}
                    placeholder="jina_..."
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                />
            )}

            {config.provider === 'searxng' && (
                <ThemedTextInput
                    label="SearXNG URL"
                    containerStyle={{ flex: 0 }}
                    value={config.searxngUrl}
                    onChangeText={(value) => setConfig({ searxngUrl: value })}
                    placeholder="https://searx.example.com"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                />
            )}

            {config.provider === 'brave' && (
                <ThemedTextInput
                    label="Brave Search API Key"
                    containerStyle={{ flex: 0 }}
                    value={config.braveKey}
                    onChangeText={(value) => setConfig({ braveKey: value })}
                    placeholder="BSA..."
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                />
            )}

            <ThemedSwitch
                label="Read Pages With Jina Reader"
                description="Converts pages to clean text before the model reads them. Falls back to fetching the page directly."
                value={config.useJinaReader}
                onChangeValue={(value) => setConfig({ useJinaReader: value })}
            />

            <ThemedSwitch
                label="Attach Page Excerpts To Search Results"
                description="Reads the opening text of the top results and includes it with the search output. Slower, but small models answer from real content instead of memory."
                value={config.searchExcerpts}
                onChangeValue={(value) => setConfig({ searchExcerpts: value })}
            />

            {config.searchExcerpts && (
                <ThemedSlider
                    label="Excerpt Characters"
                    value={config.excerptChars}
                    onValueChange={(value) => setConfig({ excerptChars: value })}
                    min={500}
                    max={4000}
                    step={250}
                />
            )}

            <ThemedSlider
                label="Search Results"
                value={config.maxResults}
                onValueChange={(value) => setConfig({ maxResults: value })}
                min={1}
                max={8}
                step={1}
            />

            <ThemedSlider
                label="Max Page Characters"
                value={config.maxPageChars}
                onValueChange={(value) => setConfig({ maxPageChars: value })}
                min={2000}
                max={20000}
                step={1000}
            />

            <ThemedSlider
                label="Max Tool Rounds"
                value={config.maxRounds}
                onValueChange={(value) => setConfig({ maxRounds: value })}
                min={1}
                max={8}
                step={1}
            />
        </View>
    )
}

export default WebToolsSettings
