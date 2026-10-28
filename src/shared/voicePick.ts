/** speech.voiceName value meaning "Pati's Piper voice"; no real Windows voice is called this. */
export const PIPER_VOICE = 'piper'

/**
 * Whether Piper should speak. 'piper' = always (the user's explicit choice), a Windows voice
 * name = never, null (auto) = Piper, except that the bundled Turkish voice stays out of English.
 */
export function piperWanted(voiceName: string | null, language: string, bundledTurkishOnly: boolean): boolean {
  if (voiceName === PIPER_VOICE) return true
  if (voiceName) return false
  return !(language === 'en' && bundledTurkishOnly)
}
