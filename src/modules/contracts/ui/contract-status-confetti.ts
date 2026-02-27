'use client'

import confetti from 'canvas-confetti'

const sideCannonColors = ['#a786ff', '#fd8bbc', '#eca184', '#f8deb1'] as const

let confettiInstance: ReturnType<typeof confetti.create> | null = null

const getConfettiInstance = () => {
  if (typeof window === 'undefined') {
    return null
  }

  if (confettiInstance) {
    return confettiInstance
  }

  const canvas = window.document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.position = 'fixed'
  canvas.style.inset = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '2147483647'
  window.document.body.appendChild(canvas)

  confettiInstance = confetti.create(canvas, {
    resize: true,
    useWorker: false,
  })

  return confettiInstance
}

export const triggerContractStatusConfetti = () => {
  const fire = getConfettiInstance()
  if (!fire) {
    return
  }

  const end = Date.now() + 1800

  const frame = () => {
    if (Date.now() > end) {
      return
    }

    void fire({
      particleCount: 2,
      angle: 60,
      spread: 50,
      startVelocity: 46,
      origin: { x: 0, y: 0.5 },
      zIndex: 2147483647,
      disableForReducedMotion: false,
      colors: [...sideCannonColors],
    })

    void fire({
      particleCount: 2,
      angle: 120,
      spread: 50,
      startVelocity: 46,
      origin: { x: 1, y: 0.5 },
      zIndex: 2147483647,
      disableForReducedMotion: false,
      colors: [...sideCannonColors],
    })

    window.requestAnimationFrame(frame)
  }

  frame()
}
