import { contextBridge, ipcRenderer } from 'electron'

import type { PetCommand, Settings } from './shared/types.ts'

// The only door between the windows and the main process.
const api = {
  getState: () => ipcRenderer.invoke('get-state'),
  onState: (fn: (state: unknown) => void) => ipcRenderer.on('state', (_e, s) => fn(s)),
  onCommand: (fn: (cmd: PetCommand) => void) => ipcRenderer.on('command', (_e, c) => fn(c)),
  setInteractive: (isInteractive: boolean) => ipcRenderer.send('set-interactive', isInteractive),
  dragStart: (offset: { x: number; y: number }) => ipcRenderer.send('drag-start', offset),
  dragEnd: () => ipcRenderer.send('drag-end'),
  moveBy: (dx: number): Promise<{ atEdge: boolean }> => ipcRenderer.invoke('move-by', dx),
  walkEnded: () => ipcRenderer.send('walk-ended'),
  openSettings: () => ipcRenderer.send('open-settings'),
  openCharactersFolder: () => ipcRenderer.send('open-characters-folder'),
  contextMenu: () => ipcRenderer.send('context-menu'),
  hidePet: () => ipcRenderer.send('hide-pet'),
  saveSettings: (s: Settings) => ipcRenderer.invoke('save-settings', s),
  reloadCharacters: () => ipcRenderer.invoke('reload-characters'),
  aiChat: (text: string) => ipcRenderer.send('ai-chat', text),
  aiStop: () => ipcRenderer.send('ai-stop'),
  aiKey: (key: string) => ipcRenderer.send('ai-key', key),
  aiDetect: (): Promise<{ url: string; models: string[]; needsKey: boolean }[]> => ipcRenderer.invoke('ai-detect'),
  aiModels: (server: { baseUrl: string; apiKey: string }): Promise<string[]> => ipcRenderer.invoke('ai-models', server),
  memoryDelete: (id: string) => ipcRenderer.send('memory-delete', id),
  memoryClear: () => ipcRenderer.send('memory-clear'),
  brainOpen: (): Promise<'obsidian' | 'folder'> => ipcRenderer.invoke('brain-open'),
  brainChoose: () => ipcRenderer.invoke('brain-choose'),
  focusPet: () => ipcRenderer.send('focus-pet'),
  confirmReply: (id: string, answer: 'yes' | 'always' | 'no') => ipcRenderer.send('confirm-reply', id, answer),
}

export type PatiApi = typeof api

contextBridge.exposeInMainWorld('pati', api)
