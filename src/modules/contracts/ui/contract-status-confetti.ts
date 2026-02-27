'use client'

import confetti from 'canvas-confetti'

const sideCannonColors = ['#a786ff', '#fd8bbc', '#eca184', '#f8deb1'] as const

export const triggerContractStatusConfetti = () => {
  if (typeof window === 'undefined') {
    return
  }

  const end = Date.now() + 3 * 1000

  const frame = () => {
    if (Date.now() > end) {
      return
    }

    void confetti({
      particleCount: 2,
      angle: 60,
      spread: 55,
      startVelocity: 60,
      origin: { x: 0, y: 0.5 },
      zIndex: 9999,
      disableForReducedMotion: false,
      colors: [...sideCannonColors],
    })

    void confetti({
      particleCount: 2,
      angle: 120,
      spread: 55,
      startVelocity: 60,
      origin: { x: 1, y: 0.5 },
      zIndex: 9999,
      disableForReducedMotion: false,
      colors: [...sideCannonColors],
    })

    window.requestAnimationFrame(frame)
  }

  frame()
}
