import { create } from 'zustand'
import type { SilenceRegion, SilenceThresholdPreset } from '@/utils/silenceDetector'

interface AudioSegment {
  id: string
  name: string
  startTime: number
  endTime: number
  duration: number
}

interface AudioState {
  audioFile: File | null
  selectedSegment: AudioSegment | null
  isPlaying: boolean

  // Silence detection state
  silenceRegions: SilenceRegion[]
  isDetectingSilence: boolean
  silenceThreshold: SilenceThresholdPreset

  // Actions
  setAudioFile: (file: File) => void
  setSelectedSegment: (segment: AudioSegment | null) => void
  setIsPlaying: (isPlaying: boolean) => void
  clearAudioFile: () => void

  // Silence detection actions
  setSilenceRegions: (regions: SilenceRegion[]) => void
  setIsDetectingSilence: (detecting: boolean) => void
  setSilenceThreshold: (threshold: SilenceThresholdPreset) => void
  clearSilenceRegions: () => void
}

export const useAudioStore = create<AudioState>((set) => ({
  audioFile: null,
  selectedSegment: null,
  isPlaying: false,

  // Silence detection state
  silenceRegions: [],
  isDetectingSilence: false,
  silenceThreshold: 'default',

  setAudioFile: (file) => {
    console.log('AudioStore: 设置音频文件', file.name)

    // 详细打印文件对象内容
    console.log('AudioStore: 文件详情', {
      name: file.name,
      type: file.type,
      size: file.size + ' 字节 (' + (file.size / 1024).toFixed(2) + ' KB)',
      lastModified: new Date(file.lastModified).toLocaleString(),
      webkitRelativePath: file.webkitRelativePath || '无',
      objectURL: URL.createObjectURL(file) // 创建一个临时URL以供显示
    });

    // Clear silence regions when loading new file
    set({ audioFile: file, selectedSegment: null, silenceRegions: [], isDetectingSilence: false })
  },
  setSelectedSegment: (segment) => {
    console.log('AudioStore: 设置选中片段', segment)
    set({ selectedSegment: segment })
  },
  setIsPlaying: (isPlaying) => {
    console.log('AudioStore: 设置播放状态', isPlaying)
    set({ isPlaying })
  },
  clearAudioFile: () => {
    console.log('AudioStore: 清除音频文件')
    set({ audioFile: null, selectedSegment: null, isPlaying: false, silenceRegions: [], isDetectingSilence: false })
  },

  // Silence detection actions
  setSilenceRegions: (regions) => {
    console.log('AudioStore: 设置静音区域', regions.length)
    set({ silenceRegions: regions })
  },
  setIsDetectingSilence: (detecting) => {
    set({ isDetectingSilence: detecting })
  },
  setSilenceThreshold: (threshold) => {
    console.log('AudioStore: 设置静音阈值', threshold)
    set({ silenceThreshold: threshold })
  },
  clearSilenceRegions: () => {
    console.log('AudioStore: 清除静音区域')
    set({ silenceRegions: [] })
  }
})) 