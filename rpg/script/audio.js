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
    this.resumePromise = null;
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

  // Call from an actual user gesture; multiple rapid clicks share a resume.
  unlock() {
    if (!this.supported || this.hidden) return Promise.resolve(false);
    if (this.resumePromise) return this.resumePromise;
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
      this.resumePromise = this.context.resume().then(() => {
        if (this.hidden) {
          this.context.suspend().catch(() => {});
          return false;
        }
        this.unlocked = this.context.state === "running";
        if (this.unlocked) this.startScheduler();
        return this.unlocked;
      }).catch(() => false).finally(() => { this.resumePromise = null; });
      return this.resumePromise;
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
    } else if (this.unlocked) {
      // A previous user gesture has already enabled audio.
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
    const effect = EFFECTS[name];
    if (!effect) return;
    const at = this.context.currentTime + .005;
    for (const [pitch, offset, length] of effect) {
      this.note(this.effectsBus, pitch, at + offset, length, .19, "triangle", .008);
      this.note(this.effectsBus, pitch + 12, at + offset, length * .65, .025, "sine", .008);
    }
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
