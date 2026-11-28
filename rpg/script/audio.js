// Reusable Web Audio engine. No third-party files or dependencies.
import { VILLAGE_TEMPO, VILLAGE_BARS } from "./village-music.js";

const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const STEP_SECONDS = 60 / VILLAGE_TEMPO / 2;
const SCHEDULE_AHEAD = 0.18;
const MIDI_HZ = note => 440 * 2 ** ((note - 69) / 12);

const EFFECTS = {
  open:   [[72,0,.10],[76,.065,.13]],
  close:  [[76,0,.09],[72,.06,.13]],
  select: [[79,0,.09]],
  pickup: [[76,0,.08],[84,.075,.16],[88,.15,.19]],
  interact: [[67,0,.12],[72,.08,.18]],
  play:   [[72,0,.14],[76,.09,.14],[79,.18,.16],[84,.27,.32]]
};

export class RpgAudio {
  constructor() {
    this.context = null;
    this.musicBus = null;
    this.effectsBus = null;
    this.musicVolume = .55;
    this.effectsVolume = .70;
    this.step = 0;
    this.nextStepTime = 0;
    this.timer = null;
    this.hidden = document.hidden;
    this.unlocked = false;
    this.supported = Boolean(AudioContextClass);
  }

  setVolumes(music, effects) {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.effectsVolume = Math.max(0, Math.min(1, effects));
    if (this.context) {
      const now = this.context.currentTime;
      for (const [bus, value] of [[this.musicBus,this.musicVolume],[this.effectsBus,this.effectsVolume]]) {
        bus.gain.cancelScheduledValues(now);
        bus.gain.setTargetAtTime(value, now, .015);
      }
    }
  }

  // Attempt on page load, and retry directly during a trusted user gesture.
  // A blocked autoplay resume can remain pending, so never reuse it on a click.
  unlock() {
    if (!this.supported || this.hidden) return Promise.resolve(false);
    try {
      if (!this.context) {
        this.context = new AudioContextClass();
        this.musicBus = this.context.createGain();
        this.effectsBus = this.context.createGain();
        this.musicBus.gain.value = this.musicVolume;
        this.effectsBus.gain.value = this.effectsVolume;
        const master = this.context.createGain();
        master.gain.value = .65;
        this.musicBus.connect(master);
        this.effectsBus.connect(master);
        master.connect(this.context.destination);
      }
      if (this.context.state === "running") {
        this.unlocked = true;
        this.startScheduler();
        return Promise.resolve(true);
      }
      return this.context.resume().then(() => {
        if (this.hidden) {
          this.context.suspend().catch(() => {});
          return false;
        }
        this.unlocked = this.context.state === "running";
        if (this.unlocked) this.startScheduler();
        return this.unlocked;
      }).catch(() => false);
    } catch (error) {
      console.warn("RPG audio unavailable.", error);
      return Promise.resolve(false);
    }
  }

  setHidden(hidden) {
    this.hidden = hidden;
    if (hidden) {
      this.stopScheduler();
      if (this.context?.state === "running") this.context.suspend().catch(() => {});
    } else {
      // Also retry when a menu opened in a background tab becomes visible.
      this.unlock();
    }
  }

  startScheduler() {
    if (this.timer !== null || this.hidden) return;
    this.nextStepTime = Math.max(this.nextStepTime, this.context.currentTime + .045);
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 70);
  }

  stopScheduler() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    if (this.hidden || this.context?.state !== "running") return;
    const now = this.context.currentTime;
    // Recover gracefully after throttling rather than playing a burst of missed notes.
    if (this.nextStepTime < now) {
      const missed = Math.floor((now - this.nextStepTime) / STEP_SECONDS) + 1;
      this.step = (this.step + missed) % (VILLAGE_BARS.length * 8);
      this.nextStepTime += missed * STEP_SECONDS;
    }
    while (this.nextStepTime < now + SCHEDULE_AHEAD) {
      this.playMusicStep(this.step, this.nextStepTime);
      this.step = (this.step + 1) % (VILLAGE_BARS.length * 8);
      this.nextStepTime += STEP_SECONDS;
    }
  }

  playMusicStep(step, at) {
    const bar = VILLAGE_BARS[Math.floor(step / 8)];
    const slot = step % 8;
    const melody = bar.melody[slot];
    if (melody !== null) {
      // A soft bell/flute lead with a quieter upper harmonic.
      this.note(this.musicBus, melody, at, STEP_SECONDS * 1.7, .12, "sine", .035);
      this.note(this.musicBus, melody + 12, at, STEP_SECONDS * .75, .018, "sine", .012);
    }
    if (slot === 0 || slot === 4) {
      this.note(this.musicBus, bar.chord[0], at, STEP_SECONDS * 3.6, .095, "sine", .045);
    }
    const arp = [1,2,3,2,1,2,3,2];
    this.note(this.musicBus, bar.chord[arp[slot]], at, STEP_SECONDS * 1.4, .065, "triangle", .018);
    if (slot === 0) {
      for (const pitch of bar.chord.slice(1)) {
        this.note(this.musicBus, pitch, at, STEP_SECONDS * 7.8, .018, "sine", .23);
      }
    }
  }

  // Available to future game screens as well as the home menu.
  playEffect(name) {
    if (this.hidden || this.context?.state !== "running" || this.effectsVolume === 0) return;
    if (name === "chop" || name === "tree-fall") {
      this.woodcut(name === "tree-fall");
      return;
    }
    const effect = EFFECTS[name];
    if (!effect) return;
    const at = this.context.currentTime + .005;
    for (const [pitch, offset, length] of effect) {
      this.note(this.effectsBus, pitch, at + offset, length, .19, "triangle", .008);
      this.note(this.effectsBus, pitch + 12, at + offset, length * .65, .025, "sine", .008);
    }
  }

  // Short filtered noise bursts and a damped wooden resonance, not musical notes.
  // Every swing has an axe impact; the last also has a crack and falling branches.
  woodcut(felled) {
    const at = this.context.currentTime + .005;
    const variation = .90 + Math.random() * .20;
    this.woodNoise(at, .105, 920 * variation, .85, .45, "bandpass");
    this.woodNoise(at, .035, 2700 * variation, .65, .24, "highpass");
    this.woodThump(at, 165 * variation, .16, .36);
    if (felled) {
      this.woodNoise(at + .11, .20, 1500, .8, .33, "bandpass");
      this.woodNoise(at + .24, .34, 700, .7, .26, "lowpass");
      this.woodNoise(at + .40, .22, 1900, .7, .16, "bandpass");
      this.woodThump(at + .48, 78, .25, .42);
    }
  }

  woodNoise(at, duration, frequency, q, volume, type) {
    const ctx = this.context;
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + .003);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effectsBus);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(at);
  }

  woodThump(at, frequency, duration, volume) {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, at);
    osc.frequency.exponentialRampToValueAtTime(frequency * .58, at + duration);
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    osc.connect(gain);
    gain.connect(this.effectsBus);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.start(at);
    osc.stop(at + duration + .01);
  }

  note(bus, pitch, at, duration, loudness, waveform, attack) {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = waveform;
    oscillator.frequency.value = MIDI_HZ(pitch);
    envelope.gain.setValueAtTime(.0001, at);
    envelope.gain.exponentialRampToValueAtTime(loudness, at + attack);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(envelope);
    envelope.connect(bus);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    oscillator.start(at);
    oscillator.stop(at + duration + .02);
  }
}
