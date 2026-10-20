/** Short attention chime via WebAudio (no asset download). Browsers require a prior user gesture. */
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  void ctx.resume();
}

export function playChime(): void {
  if (!ctx) return;
  const now = ctx.currentTime;
  [880, 1175, 1568].forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.0001, now + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.35);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(now + i * 0.18);
    osc.stop(now + i * 0.18 + 0.4);
  });
  if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
}
