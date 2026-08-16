import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge groups every `text-*` class it does not recognise as a colour,
 * so our own size scale (`text-stat`, `text-body`, ...) was being silently
 * dropped whenever a tone class followed it — `cn("text-stat", "text-ink")`
 * rendered at the inherited 16px. Naming the scale here restores the real
 * conflict groups: size beats size, colour beats colour, and the two no longer
 * cancel each other.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["micro", "caption", "body", "lead", "stat", "title"] },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
