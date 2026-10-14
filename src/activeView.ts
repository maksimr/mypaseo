import { createContext } from 'react'

/** False in a tab view the center keeps mounted but hidden: its shortcuts, focus and "seen" effects wait until it shows again. */
export const ActiveViewContext = createContext(true)
