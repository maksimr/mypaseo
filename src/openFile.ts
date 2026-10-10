import { createContext } from 'react'

/** Lets markdown links like `src/app.ts:12` open in the file viewer. */
export const OpenFileContext = createContext<(path: string) => void>(() => {})
