import { contextBridge, ipcRenderer } from 'electron'

import type { EnemyShow, PacksState, PetCommand, Settings } from './shared/types.ts'

// The only door between the windows and the main process.
const api = {
  getState: () => ipcRenderer.invoke('get-state'),
  onState: (fn: (state: unknown) => void) => ipcRenderer.on('state', (_e, s) => fn(s)),
  onCommand: (fn: (cmd: PetCommand) => void) => ipcRenderer.on('command', (_e, c) => fn(c)),
  onEnemy: (fn: (show: EnemyShow) => void) => ipcRenderer.on('enemy', (_e, s) => fn(s)),
  enemyStruck: () => ipcRenderer.send('enemy-struck'),
  enemyInteractive: (on: boolean) => ipcRenderer.send('enemy-interactive', on),
  enemyGrab: (offset: { x: number; y: number }) => ipcRenderer.send('enemy-grab', offset),
  enemyDrop: () => ipcRenderer.send('enemy-drop'),
  petBusy: (busy: boolean) => ipcRenderer.send('pet-busy', busy),
  setInteractive: (isInteractive: boolean) => ipcRenderer.send('set-interactive', isInteractive),
  dragStart: (offset: { x: number; y: number }) => ipcRenderer.send('drag-start', offset),
  dragEnd: () => ipcRenderer.send('drag-end'),
  moveBy: (dx: number): Promise<{ atEdge: boolean; moved?: number }> => ipcRenderer.invoke('move-by', dx),
  walkEnded: () => ipcRenderer.send('walk-ended'),
  openSettings: () => ipcRenderer.send('open-settings'),
  openCharactersFolder: () => ipcRenderer.send('open-characters-folder'),
  contextMenu: () => ipcRenderer.send('context-menu'),
  hidePet: () => ipcRenderer.send('hide-pet'),
  saveSettings: (s: Settings) => ipcRenderer.invoke('save-settings', s),
  reloadCharacters: () => ipcRenderer.invoke('reload-characters'),
  aiChat: (text: string) => ipcRenderer.send('ai-chat', text),
  aiStop: () => ipcRenderer.send('ai-stop'),
  rate: (id: string, rating: 'up' | 'down', better?: string) => ipcRenderer.send('rate', id, rating, better),
  focus: (on: boolean): Promise<string> => ipcRenderer.invoke('focus', on),
  aiKey: (key: string) => ipcRenderer.send('ai-key', key),
  aiDetect: (): Promise<{ url: string; models: string[]; needsKey: boolean }[]> => ipcRenderer.invoke('ai-detect'),
  aiModels: (server: { baseUrl: string; apiKey: string }): Promise<string[]> => ipcRenderer.invoke('ai-models', server),
  memoryDelete: (id: string) => ipcRenderer.send('memory-delete', id),
  memoryClear: () => ipcRenderer.send('memory-clear'),
  brainFolder: () => ipcRenderer.invoke('brain-folder'),
  brainOpen: (): Promise<'obsidian' | 'folder'> => ipcRenderer.invoke('brain-open'),
  brainChoose: () => ipcRenderer.invoke('brain-choose'),
  focusPet: () => ipcRenderer.send('focus-pet'),
  transcribe: (wav: ArrayBuffer): Promise<{ text: string } | { error: string }> => ipcRenderer.invoke('voice-transcribe', wav),
  tts: (text: string): Promise<Uint8Array<ArrayBuffer> | null> => ipcRenderer.invoke('tts', text),
  voiceChoose: (which: 'whisper' | 'model' | 'piper' | 'piperVoice') => ipcRenderer.invoke('voice-choose', which),
  modelInstall: () => ipcRenderer.send('model-install'),
  modelCancel: () => ipcRenderer.send('model-cancel'),
  modelRemove: () => ipcRenderer.send('model-remove'),
  modelDoc: () => ipcRenderer.send('model-doc'),
  packsList: (): Promise<PacksState> => ipcRenderer.invoke('packs-list'),
  packInstall: (id: string) => ipcRenderer.send('pack-install', id),
  packRemove: (id: string) => ipcRenderer.send('pack-remove', id),
  onPacks: (fn: (state: PacksState) => void) => ipcRenderer.on('packs', (_e, s) => fn(s)),
  confirmReply: (id: string, answer: 'yes' | 'always' | 'no') => ipcRenderer.send('confirm-reply', id, answer),
}

export type PatiApi = typeof api

contextBridge.exposeInMainWorld('pati', api)
