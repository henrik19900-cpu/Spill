/**
 * AudioManager.js - Procedural audio for Vinter-OL Spill (ski jumping)
 *
 * All sounds are generated programmatically using the Web Audio API —
 * oscillators, noise buffers, and envelopes. No external audio files needed.
 *
 * Handles the browser autoplay policy by creating / resuming the
 * AudioContext on the first user interaction.
 */

export default class AudioManager {
  /**
   * @param {import('./Game').Game} game
   */
  constructor(game) {
    this.game = game;

    /** @type {AudioContext|null} */
    this.ctx = null;

    /** Master gain node sitting just before ctx.destination */
    this._masterGain = null;

    this._muted = false;
    this._masterVolume = 0.5;

    /** Currently playing wind node chain – so we can update / stop it */
    this._windSource = null;
    this._windGain = null;
    this._windFilter = null;

    /** Crowd ambience node chain */
    this._crowdSource = null;
    this._crowdGain = null;
    this._crowdFilter = null;

    /** Menu ambience node chain */
    this._menuOsc = null;
    this._menuLfo = null;
    this._menuGain = null;

    /** Flag: has the context been initialised? */
    this._initialised = false;

    /** Flag: has the context been resumed at least once? */
    this._resumed = false;

    // Bind the one-time resume handler so we can remove it later.
    this._resumeHandler = this._initContext.bind(this);
    const events = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
    events.forEach(e => document.addEventListener(e, this._resumeHandler, { once: false }));
  }

  // -----------------------------------------------------------------------
  // Context bootstrap (autoplay-policy safe)
  // -----------------------------------------------------------------------

  /**
   * Create or resume the AudioContext.  Called automatically on the first
   * user gesture; can also be called manually.
   */
  _initContext() {
    if (!this._initialised) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this.ctx.createGain();
      this._masterGain.gain.value = this._masterVolume;
      this._masterGain.connect(this.ctx.destination);
      this._initialised = true;
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // Remove listeners once running
    if (this.ctx && this.ctx.state === 'running') {
      const events = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
      events.forEach(e => document.removeEventListener(e, this._resumeHandler));
    }
  }

  /** Ensure context is ready before playing anything. */
  _ensureContext() {
    if (!this._initialised) {
      this._initContext();
    }
    if (!this._resumed && this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.ctx && this.ctx.state === 'running') {
      this._resumed = true;
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Generate a white-noise AudioBuffer of the given duration.
   * @param {number} duration – seconds
   * @returns {AudioBuffer}
   */
  _createNoise(duration) {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.ceil(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * Convenience: connect a chain of AudioNodes in order and return the first.
   */
  _chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) {
      nodes[i].connect(nodes[i + 1]);
    }
    return nodes[0];
  }

  // -----------------------------------------------------------------------
  // Sound methods
  // -----------------------------------------------------------------------

  /**
   * Continuous wind sound whose intensity varies with speed.
   * Call once to start; call again with a new speed to update.
   * Pass speed = 0 (or negative) to stop.
   *
   * @param {number} speed – 0-1 normalised wind intensity
   */
  playWind(speed) {
    try {
      this._ensureContext();
      if (!this.ctx) return;

      // Clamp
      speed = Math.max(0, Math.min(1, speed));

      // If wind is already playing, just update the parameters
      if (this._windSource) {
        if (speed <= 0) {
          this.stopWind();
          return;
        }
        // Smoothly change volume & filter
        this._windGain.gain.linearRampToValueAtTime(speed * 0.3, this.ctx.currentTime + 0.1);
        if (this._windFilter) {
          this._windFilter.frequency.linearRampToValueAtTime(
            300 + speed * 700,
            this.ctx.currentTime + 0.1,
          );
        }
        return;
      }

      if (speed <= 0) return;

      // Create noise source (long buffer, looped)
      const noiseBuf = this._createNoise(2);
      const source = this.ctx.createBufferSource();
      source.buffer = noiseBuf;
      source.loop = true;

      // Low-pass filter — higher speed -> higher cutoff -> brighter wind
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300 + speed * 700;
      filter.Q.value = 1.0;

      // Gain
      const gain = this.ctx.createGain();
      gain.gain.value = speed * 0.3;

      this._chain(source, filter, gain, this._masterGain);

      source.start();

      this._windSource = source;
      this._windGain = gain;
      this._windFilter = filter;
    } catch (e) {
      console.warn('AudioManager.playWind error:', e);
    }
  }

  /**
   * Stop the continuous wind sound with a short fade-out.
   */
  stopWind() {
    try {
      if (!this._windSource || !this.ctx) return;
      const now = this.ctx.currentTime;
      this._windGain.gain.linearRampToValueAtTime(0, now + 0.2);
      this._windSource.stop(now + 0.25);
      this._windSource = null;
      this._windGain = null;
      this._windFilter = null;
    } catch (e) {
      console.warn('AudioManager.stopWind error:', e);
      this._windSource = null;
      this._windGain = null;
      this._windFilter = null;
    }
  }

  /**
   * Short swoosh for takeoff -- quick frequency sweep with a noise burst.
   */
  playSwoosh() {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const duration = 0.25;

      // --- Noise burst through bandpass ---
      const noiseBuf = this._createNoise(duration);
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(3000, now);
      bp.frequency.exponentialRampToValueAtTime(300, now + duration);
      bp.Q.value = 0.5;

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.5, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

      this._chain(noiseSrc, bp, noiseGain, this._masterGain);

      // --- Oscillator frequency sweep ---
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + duration);

      const oscGain = this.ctx.createGain();
      oscGain.gain.setValueAtTime(0.15, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      this._chain(osc, oscGain, this._masterGain);

      noiseSrc.start(now);
      noiseSrc.stop(now + duration);
      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      console.warn('AudioManager.playSwoosh error:', e);
    }
  }

  /**
   * Crowd cheering — filtered noise with envelope.
   * @param {number} intensity – 0-1, louder/longer for better jumps
   */
  playCrowdCheer(intensity = 0.5) {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      intensity = Math.max(0, Math.min(1, intensity));
      const duration = 1.0 + intensity * 2.0; // 1-3 seconds

      // Layer 1 -- low rumble noise
      const rumbleBuf = this._createNoise(duration);
      const rumbleSrc = this.ctx.createBufferSource();
      rumbleSrc.buffer = rumbleBuf;

      const rumbleLp = this.ctx.createBiquadFilter();
      rumbleLp.type = 'lowpass';
      rumbleLp.frequency.value = 600;
      rumbleLp.Q.value = 1;

      const rumbleGain = this.ctx.createGain();
      rumbleGain.gain.setValueAtTime(0.001, now);
      rumbleGain.gain.linearRampToValueAtTime(intensity * 0.35, now + 0.15);
      rumbleGain.gain.setValueAtTime(intensity * 0.35, now + duration * 0.6);
      rumbleGain.gain.linearRampToValueAtTime(0.0, now + duration);

      this._chain(rumbleSrc, rumbleLp, rumbleGain, this._masterGain);

      // Layer 2 -- mid-range "roar"
      const roarBuf = this._createNoise(duration);
      const roarSrc = this.ctx.createBufferSource();
      roarSrc.buffer = roarBuf;

      const roarBp = this.ctx.createBiquadFilter();
      roarBp.type = 'bandpass';
      roarBp.frequency.value = 2000;
      roarBp.Q.value = 0.8;

      const roarGain = this.ctx.createGain();
      roarGain.gain.setValueAtTime(0.001, now);
      roarGain.gain.linearRampToValueAtTime(intensity * 0.2, now + 0.2);
      // Wobble the crowd -- modulate gain slightly for realism
      for (let t = 0.3; t < duration - 0.3; t += 0.15) {
        const wobble = intensity * (0.15 + Math.random() * 0.1);
        roarGain.gain.linearRampToValueAtTime(wobble, now + t);
      }
      roarGain.gain.linearRampToValueAtTime(0.0, now + duration);

      this._chain(roarSrc, roarBp, roarGain, this._masterGain);

      rumbleSrc.start(now);
      rumbleSrc.stop(now + duration);
      roarSrc.start(now);
      roarSrc.stop(now + duration);
    } catch (e) {
      console.warn('AudioManager.playCrowdCheer error:', e);
    }
  }

  /**
   * Landing thud.  Better quality → cleaner, less distorted sound.
   * @param {number} quality – 0 (crash) to 1 (perfect telemark)
   */
  playLanding(quality = 0.5) {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      quality = Math.max(0, Math.min(1, quality));

      // --- Deep thud oscillator (60Hz sine) ---
      const thud = this.ctx.createOscillator();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(60, now);
      thud.frequency.exponentialRampToValueAtTime(25, now + 0.35);

      const thudGain = this.ctx.createGain();
      const thudVol = 0.5 + quality * 0.3; // good landing = fuller thud
      thudGain.gain.setValueAtTime(thudVol, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      this._chain(thud, thudGain, this._masterGain);

      // --- Mid body oscillator (80-120Hz) for tonal character ---
      const body = this.ctx.createOscillator();
      body.type = 'sine';
      body.frequency.setValueAtTime(80 + quality * 40, now);
      body.frequency.exponentialRampToValueAtTime(30, now + 0.25);

      const bodyGain = this.ctx.createGain();
      bodyGain.gain.setValueAtTime(0.3 * quality, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      this._chain(body, bodyGain, this._masterGain);

      // --- Noise burst for impact -- louder on bad landings ---
      const crunchDuration = 0.1 + (1 - quality) * 0.25;
      const noiseBuf = this._createNoise(crunchDuration);
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;

      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 600 + (1 - quality) * 400;

      const noiseGain = this.ctx.createGain();
      const noiseVol = 0.1 + (1 - quality) * 0.35; // worse landing = more crunch
      noiseGain.gain.setValueAtTime(noiseVol, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + crunchDuration);

      this._chain(noiseSrc, hp, noiseGain, this._masterGain);

      thud.start(now);
      thud.stop(now + 0.4);
      body.start(now);
      body.stop(now + 0.3);
      noiseSrc.start(now);
      noiseSrc.stop(now + crunchDuration);
    } catch (e) {
      console.warn('AudioManager.playLanding error:', e);
    }
  }

  /**
   * Short tick / click for tap feedback during inrun.
   */
  playTick() {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      this._chain(osc, gain, this._masterGain);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch (e) {
      console.warn('AudioManager.playTick error:', e);
    }
  }

  /**
   * Short "ding" for each judge score reveal.
   * Sine wave at ~800 Hz with a quick attack/decay envelope.
   */
  playJudgeReveal() {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.setValueAtTime(820, now + 0.05); // tiny shimmer

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.01); // fast attack
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      this._chain(osc, gain, this._masterGain);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch (e) {
      console.warn('AudioManager.playJudgeReveal error:', e);
    }
  }

  /**
   * Victory fanfare — a short celebratory melody played with oscillators.
   */
  playFanfare() {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

    // Simple ascending melody: C5 E5 G5 C6 (held)
    const notes = [
      { freq: 523.25, start: 0.0,  dur: 0.15 },  // C5
      { freq: 659.25, start: 0.15, dur: 0.15 },  // E5
      { freq: 783.99, start: 0.30, dur: 0.15 },  // G5
      { freq: 1046.5, start: 0.45, dur: 0.5  },  // C6 (held)
    ];

    notes.forEach(note => {
      // Main tone
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = note.freq;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now + note.start);
      gain.gain.linearRampToValueAtTime(0.3, now + note.start + 0.02);
      gain.gain.setValueAtTime(0.3, now + note.start + note.dur * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);

      this._chain(osc, gain, this._masterGain);

      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur + 0.01);

      // Bright harmonic layer (octave above, quieter)
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = note.freq * 2;

      const gain2 = this.ctx.createGain();
      gain2.gain.setValueAtTime(0.001, now + note.start);
      gain2.gain.linearRampToValueAtTime(0.1, now + note.start + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);

      this._chain(osc2, gain2, this._masterGain);

      osc2.start(now + note.start);
      osc2.stop(now + note.start + note.dur + 0.01);
    });
    } catch (e) {
      console.warn('AudioManager.playFanfare error:', e);
    }
  }

  // -----------------------------------------------------------------------
  // Continuous ambience methods
  // -----------------------------------------------------------------------

  /**
   * Continuous crowd ambience -- filtered noise loop.
   * Reuses existing nodes if already playing; just updates volume.
   * @param {number} intensity -- 0-1 controls volume
   */
  playCrowdAmbience(intensity = 0.5) {
    try {
      this._ensureContext();
      if (!this.ctx) return;

      intensity = Math.max(0, Math.min(1, intensity));

      // If already playing, just update volume
      if (this._crowdSource) {
        this._crowdGain.gain.linearRampToValueAtTime(
          intensity * 0.25,
          this.ctx.currentTime + 0.1,
        );
        return;
      }

      // Create looped noise source
      const noiseBuf = this._createNoise(2);
      const source = this.ctx.createBufferSource();
      source.buffer = noiseBuf;
      source.loop = true;

      // Bandpass filter to shape crowd-like murmur
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 800;
      filter.Q.value = 0.6;

      const gain = this.ctx.createGain();
      gain.gain.value = intensity * 0.25;

      this._chain(source, filter, gain, this._masterGain);

      source.start();

      this._crowdSource = source;
      this._crowdGain = gain;
      this._crowdFilter = filter;
    } catch (e) {
      console.warn('AudioManager.playCrowdAmbience error:', e);
    }
  }

  /**
   * Stop the continuous crowd ambience with a short fade-out.
   */
  stopCrowdAmbience() {
    try {
      if (!this._crowdSource || !this.ctx) return;
      const now = this.ctx.currentTime;
      this._crowdGain.gain.linearRampToValueAtTime(0, now + 0.2);
      this._crowdSource.stop(now + 0.25);
      this._crowdSource = null;
      this._crowdGain = null;
      this._crowdFilter = null;
    } catch (e) {
      console.warn('AudioManager.stopCrowdAmbience error:', e);
      this._crowdSource = null;
      this._crowdGain = null;
      this._crowdFilter = null;
    }
  }

  /**
   * Gentle low drone for the menu screen -- 100Hz sine with slow LFO.
   */
  playMenuAmbience() {
    try {
      this._ensureContext();
      if (!this.ctx) return;

      // Already playing -- do nothing
      if (this._menuOsc) return;

      const now = this.ctx.currentTime;

      // Main drone oscillator
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 100;

      // Slow LFO to modulate the drone gain
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.3; // slow wobble

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.04; // subtle modulation depth

      // Main gain
      const gain = this.ctx.createGain();
      gain.gain.value = 0.08;

      // LFO -> gain modulation
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      this._chain(osc, gain, this._masterGain);

      osc.start(now);
      lfo.start(now);

      this._menuOsc = osc;
      this._menuLfo = lfo;
      this._menuGain = gain;
    } catch (e) {
      console.warn('AudioManager.playMenuAmbience error:', e);
    }
  }

  /**
   * Stop the menu ambience with a short fade-out.
   */
  stopMenuAmbience() {
    try {
      if (!this._menuOsc || !this.ctx) return;
      const now = this.ctx.currentTime;
      this._menuGain.gain.linearRampToValueAtTime(0, now + 0.3);
      this._menuOsc.stop(now + 0.35);
      this._menuLfo.stop(now + 0.35);
      this._menuOsc = null;
      this._menuLfo = null;
      this._menuGain = null;
    } catch (e) {
      console.warn('AudioManager.stopMenuAmbience error:', e);
      this._menuOsc = null;
      this._menuLfo = null;
      this._menuGain = null;
    }
  }

  // -----------------------------------------------------------------------
  // Volume controls
  // -----------------------------------------------------------------------

  /**
   * Set master volume.
   * @param {number} vol – 0 to 1
   */
  setMasterVolume(vol) {
    this._masterVolume = Math.max(0, Math.min(1, vol));
    if (this._masterGain) {
      this._masterGain.gain.setValueAtTime(
        this._muted ? 0 : this._masterVolume,
        this.ctx.currentTime
      );
    }
  }

  /** Mute all audio. */
  mute() {
    this._muted = true;
    if (this._masterGain) {
      this._masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  /** Unmute audio (restores previous master volume). */
  unmute() {
    this._muted = false;
    if (this._masterGain) {
      this._masterGain.gain.setValueAtTime(this._masterVolume, this.ctx.currentTime);
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Tear down the audio graph and free resources. */
  destroy() {
    // Stop wind if playing
    if (this._windSource) {
      try { this._windSource.stop(); } catch (_) { /* already stopped */ }
      this._windSource = null;
      this._windGain = null;
      this._windFilter = null;
    }

    // Stop crowd ambience if playing
    if (this._crowdSource) {
      try { this._crowdSource.stop(); } catch (_) { /* already stopped */ }
      this._crowdSource = null;
      this._crowdGain = null;
      this._crowdFilter = null;
    }

    // Stop menu ambience if playing
    if (this._menuOsc) {
      try {
        this._menuOsc.stop();
        this._menuLfo.stop();
      } catch (_) { /* already stopped */ }
      this._menuOsc = null;
      this._menuLfo = null;
      this._menuGain = null;
    }

    // Close context
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }

    this._masterGain = null;
    this._initialised = false;
    this._resumed = false;

    // Remove any lingering listeners
    const events = ['touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
    events.forEach(e => document.removeEventListener(e, this._resumeHandler));
  }
}
