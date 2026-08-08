import { describe, expect, it } from 'vitest'
import { classifyOllamaModels, formatModelSize } from './ollama-registry.js'

// A trimmed copy of a real `https://ollama.com/api/tags` response.
const REGISTRY = [
  { name: 'gpt-oss:20b', size: 13_780_000_000 },
  { name: 'kimi-k2.6', size: 595_148_192_736 },
  { name: 'gemma4:31b', size: 62_500_000_000 },
  { name: 'glm-5.2', size: 0 },
  { name: 'deepseek-v4-pro', size: 1_600_000_000_000 },
]

describe('classifyOllamaModels', () => {
  it('keeps a laptop-sized model local, with a pull command', () => {
    const { local } = classifyOllamaModels(REGISTRY)
    expect(local.map((m) => m.id)).toEqual(['gpt-oss:20b'])
    expect(local[0].pull).toBe('ollama pull gpt-oss:20b')
  })

  it('tags cloud models so they route instead of downloading', () => {
    // Suggesting a bare `ollama pull kimi-k2.6` would start a 595 GB download;
    // the `:cloud` tag is what makes a local Ollama proxy to the hosted copy.
    const { cloud } = classifyOllamaModels(REGISTRY)
    const kimi = cloud.find((m) => m.id.startsWith('kimi'))
    expect(kimi?.id).toBe('kimi-k2.6:cloud')
    expect(kimi?.pull).toBe('ollama run kimi-k2.6:cloud')
  })

  it('treats an unreported size as cloud, not as small', () => {
    const { local, cloud } = classifyOllamaModels(REGISTRY)
    expect(local.some((m) => m.id.startsWith('glm-5.2'))).toBe(false)
    expect(cloud.some((m) => m.id === 'glm-5.2:cloud')).toBe(true)
  })

  it('orders by size, so the cheapest option is first', () => {
    const { cloud } = classifyOllamaModels(REGISTRY.filter((m) => m.size > 20e9))
    expect(cloud.map((m) => m.id)).toEqual([
      'gemma4:31b:cloud',
      'kimi-k2.6:cloud',
      'deepseek-v4-pro:cloud',
    ])
  })

  it('survives a malformed registry', () => {
    expect(classifyOllamaModels([])).toEqual({ local: [], cloud: [] })
    // @ts-expect-error deliberately wrong shape
    expect(classifyOllamaModels(null)).toEqual({ local: [], cloud: [] })
    expect(classifyOllamaModels([{ size: 5 }, { name: '  ' }])).toEqual({ local: [], cloud: [] })
  })
})

describe('formatModelSize', () => {
  it('reads at the scale of the number', () => {
    expect(formatModelSize(13_780_000_000)).toBe('14 GB')
    expect(formatModelSize(1_600_000_000_000)).toBe('1.6 TB')
    expect(formatModelSize(0)).toBe('')
  })
})
