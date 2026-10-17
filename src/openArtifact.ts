import { createContext } from 'react'

/** Lets an artifact in chat open in its own tab. */
export const OpenArtifactContext = createContext<(doc: string) => void>(() => {})
