/** Small UI sounds (chime on a new order). Falls back silently if blocked. */

let ctx = null

export function chime(frequencies = [880, 1319], noteLength = 0.18) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    if (!ctx) ctx = new AudioCtx()
    if (ctx.state === 'suspended') ctx.resume()

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.13
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + noteLength)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + noteLength + 0.06)
    })
  } catch {
    /* audio unavailable */
  }
}
