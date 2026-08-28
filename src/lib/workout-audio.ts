/**
 * Workout signal engine.
 *
 * iOS constraints this module works around:
 * - navigator.vibrate() is permanently unsupported in WebKit, so haptics are
 *   replaced by a very short white-noise burst that reads as a "click".
 * - An AudioContext may only be created/resumed from a user gesture, so the
 *   context is a lazy singleton that is unlocked once when a session starts.
 * - Cues are scheduled ahead on the audio thread clock instead of via
 *   setTimeout, so React re-renders cannot delay them.
 */

export type SignalProfile = "intense" | "calm";

type ScheduledNode = { stop: (when?: number) => void };

let audioContext: AudioContext | null = null;
let keepAliveNode: OscillatorNode | null = null;
let scheduledNodes: ScheduledNode[] = [];
let signalsEnabled = true;

function resolveAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (audioContext) {
    return audioContext;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  audioContext = new Ctor();
  return audioContext;
}

/**
 * Near-silent oscillator that keeps the audio session from being suspended
 * while a workout is running.
 */
function startKeepAlive(context: AudioContext) {
  if (keepAliveNode) {
    return;
  }
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 30;
  gain.gain.value = 0.0001;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  keepAliveNode = oscillator;
}

export function setSignalsEnabled(enabled: boolean) {
  signalsEnabled = enabled;
  if (!enabled) {
    cancelScheduledCues();
  }
}

export function areSignalsEnabled() {
  return signalsEnabled;
}

/**
 * Must be called from inside a click/touchend handler before any cue can play.
 */
export async function unlockAudio(): Promise<boolean> {
  const context = resolveAudioContext();
  if (!context) {
    return false;
  }
  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return false;
    }
  }
  startKeepAlive(context);
  return context.state === "running";
}

export function isAudioUnlocked(): boolean {
  return audioContext?.state === "running";
}

function track(node: ScheduledNode) {
  scheduledNodes.push(node);
  if (scheduledNodes.length > 64) {
    scheduledNodes = scheduledNodes.slice(-64);
  }
}

function scheduleTone(
  context: AudioContext,
  at: number,
  frequency: number,
  duration: number,
  peakGain: number,
  attack = 0.005,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(peakGain, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
  track(oscillator);
}

/**
 * Psychoacoustic stand-in for a haptic tap on iOS: a 3ms decaying noise burst.
 */
export function playHapticClick() {
  const context = resolveAudioContext();
  if (!context || !signalsEnabled || context.state !== "running") {
    return;
  }
  const frameCount = Math.max(1, Math.floor(context.sampleRate * 0.003));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
  }
  const source = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.value = 0.35;
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(context.destination);
  source.start();
  track(source);
}

export function playWorkStart(profile: SignalProfile = "intense") {
  const context = resolveAudioContext();
  if (!context || !signalsEnabled || context.state !== "running") {
    return;
  }
  playHapticClick();
  const now = context.currentTime;
  if (profile === "calm") {
    scheduleTone(context, now, 528, 1.5, 0.32, 0.05);
    return;
  }
  scheduleTone(context, now, 660, 0.09, 0.4);
  scheduleTone(context, now + 0.1, 990, 0.14, 0.45);
}

export function playRestStart(profile: SignalProfile = "intense") {
  const context = resolveAudioContext();
  if (!context || !signalsEnabled || context.state !== "running") {
    return;
  }
  playHapticClick();
  const now = context.currentTime;
  if (profile === "calm") {
    scheduleTone(context, now, 396, 1.4, 0.26, 0.06);
    return;
  }
  scheduleTone(context, now, 520, 0.12, 0.32);
  scheduleTone(context, now + 0.13, 392, 0.2, 0.3);
}

export function playSessionComplete(profile: SignalProfile = "intense") {
  const context = resolveAudioContext();
  if (!context || !signalsEnabled || context.state !== "running") {
    return;
  }
  const now = context.currentTime;
  const notes = profile === "calm" ? [396, 528, 660] : [523, 659, 784, 1047];
  const spacing = profile === "calm" ? 0.4 : 0.11;
  const duration = profile === "calm" ? 1.6 : 0.22;
  notes.forEach((frequency, index) => {
    scheduleTone(context, now + index * spacing, frequency, duration, 0.32, profile === "calm" ? 0.05 : 0.01);
  });
}

export function playHalfway(profile: SignalProfile = "intense") {
  const context = resolveAudioContext();
  if (!context || !signalsEnabled || context.state !== "running") {
    return;
  }
  playHapticClick();
  scheduleTone(context, context.currentTime, profile === "calm" ? 440 : 740, profile === "calm" ? 0.9 : 0.1, 0.26, profile === "calm" ? 0.05 : 0.005);
}

/**
 * Schedules every cue for one phase up front on the audio clock.
 * Returns a cancel function for pause/skip.
 */
export function schedulePhaseCues(options: {
  durationSeconds: number;
  profile: SignalProfile;
  halfway: boolean;
  startOffsetSeconds?: number;
}): () => void {
  const context = resolveAudioContext();
  if (!context || !signalsEnabled || context.state !== "running") {
    return () => {};
  }

  const { durationSeconds, profile, halfway } = options;
  const alreadyElapsed = Math.max(0, options.startOffsetSeconds ?? 0);
  const remaining = durationSeconds - alreadyElapsed;
  if (remaining <= 0) {
    return () => {};
  }

  const base = context.currentTime;
  const localNodes: ScheduledNode[] = [];

  const at = (secondsFromPhaseStart: number) => base + (secondsFromPhaseStart - alreadyElapsed);
  const isPending = (secondsFromPhaseStart: number) => secondsFromPhaseStart > alreadyElapsed;

  const push = (
    time: number,
    frequency: number,
    duration: number,
    gainValue: number,
    attack = 0.005,
  ) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(gainValue, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
    localNodes.push(oscillator);
    track(oscillator);
  };

  if (halfway && durationSeconds >= 20) {
    const halfwayPoint = durationSeconds / 2;
    if (isPending(halfwayPoint)) {
      push(at(halfwayPoint), profile === "calm" ? 440 : 740, profile === "calm" ? 0.9 : 0.1, 0.24, profile === "calm" ? 0.05 : 0.005);
    }
  }

  if (profile === "intense" && durationSeconds >= 25) {
    const warningPoint = durationSeconds - 10;
    if (isPending(warningPoint)) {
      push(at(warningPoint), 620, 0.08, 0.22);
      push(at(warningPoint) + 0.14, 620, 0.08, 0.22);
    }
  }

  // 3-2-1 countdown, rising in pitch. Calm profile stays quieter and lower.
  if (durationSeconds >= 6) {
    [3, 2, 1].forEach((secondsLeft, index) => {
      const point = durationSeconds - secondsLeft;
      if (!isPending(point)) {
        return;
      }
      const frequency = profile === "calm" ? 396 + index * 40 : 700 + index * 90;
      push(at(point), frequency, profile === "calm" ? 0.25 : 0.07, profile === "calm" ? 0.16 : 0.3, profile === "calm" ? 0.03 : 0.005);
    });
  }

  return () => {
    localNodes.forEach((node) => {
      try {
        node.stop();
      } catch {
        // already stopped
      }
    });
  };
}

export function cancelScheduledCues() {
  scheduledNodes.forEach((node) => {
    try {
      node.stop();
    } catch {
      // already stopped
    }
  });
  scheduledNodes = [];
}

export function releaseAudio() {
  cancelScheduledCues();
  if (keepAliveNode) {
    try {
      keepAliveNode.stop();
    } catch {
      // already stopped
    }
    keepAliveNode = null;
  }
}
