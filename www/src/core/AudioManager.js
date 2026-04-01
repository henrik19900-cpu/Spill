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
    this._windHighSource = null;
    this._windHighGain = null;
    this._windHighFilter = null;

    /** Crowd ambience node chain */
    this._crowdSource = null;
    this._crowdGain = null;
    this._crowdFilter = null;
    this._crowdHighSource = null;
    this._crowdHighGain = null;

    /** Inrun slide node chain */
    this._slideSource = null;
    this._slideGain = null;
    this._slideFilter = null;
    this._slideRumbleSource = null;
    this._slideRumbleGain = null;
    this._slideRumbleFilter = null;

    /** Menu ambience node chain */
    this._menuOsc = null;
    this._menuLfo = null;
    this._menuGain = null;

    /** Menu music node chains (premium layered) */
    this._menuMusicNodes = null;
    this._menuMusicGain = null;
    this._menuShimmerInterval = null;

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
      this.ctx.resume().catch(() => { /* Android may reject if not truly interactive yet */ });
    }

    // Remove listeners once running
    if (this.ctx && this.ctx.state === 'running') {
      this._resumed = true;
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
      this.ctx.resume().catch(() => { /* may reject on Android before user gesture */ });
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
        const t = this.ctx.currentTime + 0.1;
        // Volume clearly scales with speed
        this._windGain.gain.linearRampToValueAtTime(speed * 0.35, t);
        if (this._windFilter) {
          // Pitch/brightness rises with speed
          this._windFilter.frequency.linearRampToValueAtTime(
            250 + speed * 900, t,
          );
        }
        // Update high whistle layer
        if (this._windHighGain) {
          this._windHighGain.gain.linearRampToValueAtTime(
            speed * speed * 0.15, t,
          );
        }
        if (this._windHighFilter) {
          this._windHighFilter.frequency.linearRampToValueAtTime(
            1500 + speed * 2500, t,
          );
        }
        return;
      }

      if (speed <= 0) return;

      // --- Layer 1: Low/mid wind body (noise through lowpass) ---
      const noiseBuf = this._createNoise(2);
      const source = this.ctx.createBufferSource();
      source.buffer = noiseBuf;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 250 + speed * 900;
      filter.Q.value = 1.0;

      const gain = this.ctx.createGain();
      gain.gain.value = speed * 0.35;

      this._chain(source, filter, gain, this._masterGain);
      source.start();

      // --- Layer 2: High wind whistle (separate noise through bandpass) ---
      const highNoiseBuf = this._createNoise(2);
      const highSource = this.ctx.createBufferSource();
      highSource.buffer = highNoiseBuf;
      highSource.loop = true;

      const highBp = this.ctx.createBiquadFilter();
      highBp.type = 'bandpass';
      highBp.frequency.value = 1500 + speed * 2500;
      highBp.Q.value = 2.0; // narrow band for whistle character

      const highGain = this.ctx.createGain();
      highGain.gain.value = speed * speed * 0.15; // fades in at higher speeds

      this._chain(highSource, highBp, highGain, this._masterGain);
      highSource.start();

      this._windSource = source;
      this._windGain = gain;
      this._windFilter = filter;
      this._windHighSource = highSource;
      this._windHighGain = highGain;
      this._windHighFilter = highBp;
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
      if (this._windHighSource) {
        this._windHighGain.gain.linearRampToValueAtTime(0, now + 0.2);
        this._windHighSource.stop(now + 0.25);
      }
      this._windSource = null;
      this._windGain = null;
      this._windFilter = null;
      this._windHighSource = null;
      this._windHighGain = null;
      this._windHighFilter = null;
    } catch (e) {
      console.warn('AudioManager.stopWind error:', e);
      this._windSource = null;
      this._windGain = null;
      this._windFilter = null;
      this._windHighSource = null;
      this._windHighGain = null;
      this._windHighFilter = null;
    }
  }

  /**
   * Powerful swoosh for takeoff -- layered noise burst, low sine punch,
   * and a high whistle sweep for a premium, weighty feel.
   */
  playSwoosh() {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const duration = 0.35;

      // --- Layer 1: Noise burst through sweeping bandpass (200-2000Hz) ---
      const noiseBuf = this._createNoise(duration);
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(200, now);
      bp.frequency.exponentialRampToValueAtTime(2000, now + duration * 0.3);
      bp.frequency.exponentialRampToValueAtTime(300, now + duration);
      bp.Q.value = 1.0;

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.6, now);
      noiseGain.gain.linearRampToValueAtTime(0.7, now + duration * 0.15);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + duration);

      this._chain(noiseSrc, bp, noiseGain, this._masterGain);

      // --- Layer 2: Low sine punch (100Hz, 50ms) ---
      const punch = this.ctx.createOscillator();
      punch.type = 'sine';
      punch.frequency.setValueAtTime(100, now);
      punch.frequency.exponentialRampToValueAtTime(50, now + 0.05);

      const punchGain = this.ctx.createGain();
      punchGain.gain.setValueAtTime(0.5, now);
      punchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      this._chain(punch, punchGain, this._masterGain);

      // --- Layer 3: High whistle sweep (2000Hz -> 500Hz sine, 200ms) ---
      const whistle = this.ctx.createOscillator();
      whistle.type = 'sine';
      whistle.frequency.setValueAtTime(2000, now);
      whistle.frequency.exponentialRampToValueAtTime(500, now + 0.2);

      const whistleGain = this.ctx.createGain();
      whistleGain.gain.setValueAtTime(0.001, now);
      whistleGain.gain.linearRampToValueAtTime(0.18, now + 0.02);
      whistleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      this._chain(whistle, whistleGain, this._masterGain);

      noiseSrc.start(now);
      noiseSrc.stop(now + duration);
      punch.start(now);
      punch.stop(now + 0.1);
      whistle.start(now);
      whistle.stop(now + 0.25);
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
      const duration = 1.5 + intensity * 2.5; // 1.5-4 seconds (longer = bigger jump)

      // Layer 1 -- low rumble (crowd body)
      const rumbleBuf = this._createNoise(duration);
      const rumbleSrc = this.ctx.createBufferSource();
      rumbleSrc.buffer = rumbleBuf;

      const rumbleLp = this.ctx.createBiquadFilter();
      rumbleLp.type = 'lowpass';
      rumbleLp.frequency.value = 500 + intensity * 300;
      rumbleLp.Q.value = 0.8;

      const rumbleGain = this.ctx.createGain();
      rumbleGain.gain.setValueAtTime(0.001, now);
      // Explosive onset then sustained roar
      rumbleGain.gain.linearRampToValueAtTime(intensity * 0.45, now + 0.08);
      rumbleGain.gain.setValueAtTime(intensity * 0.4, now + duration * 0.5);
      rumbleGain.gain.linearRampToValueAtTime(0.0, now + duration);

      this._chain(rumbleSrc, rumbleLp, rumbleGain, this._masterGain);

      // Layer 2 -- mid-range roar (excitement)
      const roarBuf = this._createNoise(duration);
      const roarSrc = this.ctx.createBufferSource();
      roarSrc.buffer = roarBuf;

      const roarBp = this.ctx.createBiquadFilter();
      roarBp.type = 'bandpass';
      roarBp.frequency.value = 1800;
      roarBp.Q.value = 0.6;

      const roarGain = this.ctx.createGain();
      roarGain.gain.setValueAtTime(0.001, now);
      roarGain.gain.linearRampToValueAtTime(intensity * 0.25, now + 0.1);
      // Wobble the crowd -- modulate gain slightly for realism
      for (let t = 0.3; t < duration - 0.3; t += 0.12) {
        const wobble = intensity * (0.18 + Math.random() * 0.12);
        roarGain.gain.linearRampToValueAtTime(wobble, now + t);
      }
      roarGain.gain.linearRampToValueAtTime(0.0, now + duration);

      this._chain(roarSrc, roarBp, roarGain, this._masterGain);

      // Layer 3 -- high excitement shriek (only at high intensity)
      const shriekBuf = this._createNoise(duration);
      const shriekSrc = this.ctx.createBufferSource();
      shriekSrc.buffer = shriekBuf;

      const shriekBp = this.ctx.createBiquadFilter();
      shriekBp.type = 'bandpass';
      shriekBp.frequency.value = 4000;
      shriekBp.Q.value = 1.5;

      const shriekGain = this.ctx.createGain();
      const shriekVol = Math.max(0, (intensity - 0.4) * 0.2);
      shriekGain.gain.setValueAtTime(0.001, now);
      shriekGain.gain.linearRampToValueAtTime(shriekVol, now + 0.15);
      shriekGain.gain.setValueAtTime(shriekVol * 0.8, now + duration * 0.4);
      shriekGain.gain.linearRampToValueAtTime(0.0, now + duration * 0.8);

      this._chain(shriekSrc, shriekBp, shriekGain, this._masterGain);

      rumbleSrc.start(now);
      rumbleSrc.stop(now + duration);
      roarSrc.start(now);
      roarSrc.stop(now + duration);
      shriekSrc.start(now);
      shriekSrc.stop(now + duration);
    } catch (e) {
      console.warn('AudioManager.playCrowdCheer error:', e);
    }
  }

  /**
   * Deep, satisfying landing thud with 100ms delayed echo.
   * Better quality = cleaner tonal hit. Poor quality = heavy crunch.
   * @param {number} quality - 0 (crash) to 1 (perfect telemark)
   */
  playLanding(quality = 0.5) {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      quality = Math.max(0, Math.min(1, quality));

      // Play the main thud and its echo (delayed copy for weight)
      const offsets = [
        { time: 0, vol: 1.0 },      // main hit
        { time: 0.1, vol: 0.45 },   // echo at 100ms, 45% volume
      ];

      offsets.forEach(({ time: offset, vol: echoVol }) => {
        const t = now + offset;

        // --- Sub-bass punch (30Hz sine, very short) for visceral weight ---
        const sub = this.ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(30, t);
        sub.frequency.exponentialRampToValueAtTime(15, t + 0.2);

        const subGain = this.ctx.createGain();
        subGain.gain.setValueAtTime(0.55 * echoVol, t);
        subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

        this._chain(sub, subGain, this._masterGain);

        // --- Deep thud oscillator (60Hz sine, sweeps down) ---
        const thud = this.ctx.createOscillator();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(60, t);
        thud.frequency.exponentialRampToValueAtTime(22, t + 0.4);

        const thudGain = this.ctx.createGain();
        const thudVolumeBase = 0.55 + quality * 0.25;
        thudGain.gain.setValueAtTime(thudVolumeBase * echoVol, t);
        thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

        this._chain(thud, thudGain, this._masterGain);

        // --- Mid body oscillator (tonal character, cleaner at high quality) ---
        const body = this.ctx.createOscillator();
        body.type = 'sine';
        body.frequency.setValueAtTime(80 + quality * 40, t);
        body.frequency.exponentialRampToValueAtTime(28, t + 0.3);

        const bodyGain = this.ctx.createGain();
        bodyGain.gain.setValueAtTime(0.35 * quality * echoVol, t);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

        this._chain(body, bodyGain, this._masterGain);

        // --- Noise burst for impact crunch -- louder & longer on bad landings ---
        const crunchDuration = 0.08 + (1 - quality) * 0.3;
        const noiseBuf = this._createNoise(crunchDuration + 0.05);
        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = noiseBuf;

        const hp = this.ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 500 + (1 - quality) * 500;

        // Waveshaper for gritty distortion on bad landings
        const distortion = this.ctx.createWaveShaper();
        const crunchAmount = (1 - quality) * 50;
        const curveLen = 256;
        const curve = new Float32Array(curveLen);
        for (let i = 0; i < curveLen; i++) {
          const x = (i * 2) / curveLen - 1;
          curve[i] = (Math.PI + crunchAmount) * x / (Math.PI + crunchAmount * Math.abs(x));
        }
        distortion.curve = curve;

        const noiseGain = this.ctx.createGain();
        const noiseVolBase = 0.08 + (1 - quality) * 0.4;
        noiseGain.gain.setValueAtTime(noiseVolBase * echoVol, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + crunchDuration);

        this._chain(noiseSrc, hp, distortion, noiseGain, this._masterGain);

        sub.start(t);
        sub.stop(t + 0.3);
        thud.start(t);
        thud.stop(t + 0.45);
        body.start(t);
        body.stop(t + 0.35);
        noiseSrc.start(t);
        noiseSrc.stop(t + crunchDuration + 0.02);
      });
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
   * Each judge gets a slightly higher pitch (ascending scale).
   * Clean sine tones with a bell-like harmonic overtone.
   * @param {number} [index=0] - judge index (0-4), each gets ascending pitch
   */
  playJudgeReveal(index = 0) {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Ascending pitches: C6, D6, E6, F#6, G6
      const pitches = [1046.5, 1174.7, 1318.5, 1480.0, 1568.0];
      const freq = pitches[Math.min(Math.max(0, Math.floor(index)), pitches.length - 1)] || pitches[0];

      // Main clean sine tone
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.008); // crisp attack
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      this._chain(osc, gain, this._masterGain);

      // Bell-like harmonic overtone (2.5x fundamental, quieter)
      const overtone = this.ctx.createOscillator();
      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(freq * 2.5, now);

      const overtoneGain = this.ctx.createGain();
      overtoneGain.gain.setValueAtTime(0.001, now);
      overtoneGain.gain.linearRampToValueAtTime(0.08, now + 0.008);
      overtoneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      this._chain(overtone, overtoneGain, this._masterGain);

      osc.start(now);
      osc.stop(now + 0.55);
      overtone.start(now);
      overtone.stop(now + 0.35);
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

  /**
   * Continuous ski sliding sound on the inrun track.
   * Progressive: louder and lower-pitched at high speed (icy rushing feel).
   * Layers a high scrape noise and a low rumble noise for richness.
   * Call repeatedly to update; pass speed <= 0 to stop.
   *
   * @param {number} speed – 0-1 normalised slide intensity
   */
  playInrunSlide(speed) {
    try {
      this._ensureContext();
      if (!this.ctx) return;

      speed = Math.max(0, Math.min(1, speed));

      // If already playing, update parameters
      if (this._slideSource) {
        if (speed <= 0) {
          this.stopInrunSlide();
          return;
        }
        const t = this.ctx.currentTime + 0.05;
        // Volume increases with speed (louder at high speed)
        this._slideGain.gain.linearRampToValueAtTime(
          0.05 + speed * 0.2, t,
        );
        if (this._slideFilter) {
          // Higher speed = lower center freq (rushing, heavier) + brighter top
          this._slideFilter.frequency.linearRampToValueAtTime(
            400 + speed * 1200, t,
          );
        }
        // Update rumble layer
        if (this._slideRumbleGain) {
          this._slideRumbleGain.gain.linearRampToValueAtTime(
            speed * speed * 0.18, t,
          );
        }
        if (this._slideRumbleFilter) {
          // Rumble gets deeper at high speed
          this._slideRumbleFilter.frequency.linearRampToValueAtTime(
            150 + (1 - speed) * 200, t,
          );
        }
        return;
      }

      if (speed <= 0) return;

      // --- Layer 1: Icy scrape (high noise through bandpass) ---
      const noiseBuf = this._createNoise(2);
      const source = this.ctx.createBufferSource();
      source.buffer = noiseBuf;
      source.loop = true;

      // Highpass to keep icy scrape character
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 300;
      hp.Q.value = 0.5;

      // Bandpass to shape the sliding tone
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 400 + speed * 1200;
      bp.Q.value = 0.7;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.05 + speed * 0.2;

      this._chain(source, hp, bp, gain, this._masterGain);
      source.start();

      // --- Layer 2: Low rumble (noise through lowpass, grows with speed) ---
      const rumbleBuf = this._createNoise(2);
      const rumbleSource = this.ctx.createBufferSource();
      rumbleSource.buffer = rumbleBuf;
      rumbleSource.loop = true;

      const rumbleLp = this.ctx.createBiquadFilter();
      rumbleLp.type = 'lowpass';
      rumbleLp.frequency.value = 150 + (1 - speed) * 200;
      rumbleLp.Q.value = 1.0;

      const rumbleGain = this.ctx.createGain();
      rumbleGain.gain.value = speed * speed * 0.18;

      this._chain(rumbleSource, rumbleLp, rumbleGain, this._masterGain);
      rumbleSource.start();

      this._slideSource = source;
      this._slideGain = gain;
      this._slideFilter = bp;
      this._slideRumbleSource = rumbleSource;
      this._slideRumbleGain = rumbleGain;
      this._slideRumbleFilter = rumbleLp;
    } catch (e) {
      console.warn('AudioManager.playInrunSlide error:', e);
    }
  }

  /**
   * Stop the continuous inrun slide sound with a short fade-out.
   */
  stopInrunSlide() {
    try {
      if (!this._slideSource || !this.ctx) return;
      const now = this.ctx.currentTime;
      this._slideGain.gain.linearRampToValueAtTime(0, now + 0.1);
      this._slideSource.stop(now + 0.15);
      if (this._slideRumbleSource) {
        this._slideRumbleGain.gain.linearRampToValueAtTime(0, now + 0.1);
        this._slideRumbleSource.stop(now + 0.15);
      }
      this._slideSource = null;
      this._slideGain = null;
      this._slideFilter = null;
      this._slideRumbleSource = null;
      this._slideRumbleGain = null;
      this._slideRumbleFilter = null;
    } catch (e) {
      console.warn('AudioManager.stopInrunSlide error:', e);
      this._slideSource = null;
      this._slideGain = null;
      this._slideFilter = null;
      this._slideRumbleSource = null;
      this._slideRumbleGain = null;
      this._slideRumbleFilter = null;
    }
  }

  /**
   * Short, crisp UI click for button / menu interactions.
   * Designed to not be annoying on repeated taps.
   */
  playButtonClick() {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Very short sine pop -- high to low for a crisp "tick" feel
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.025);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      // Gentle highpass to remove any low-end muddiness
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 600;

      this._chain(osc, hp, gain, this._masterGain);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {
      console.warn('AudioManager.playButtonClick error:', e);
    }
  }

  /**
   * Triumphant ascending arpeggio for new personal records.
   * C5 → E5 → G5 → B5 → C6 with bright harmonics.
   */
  playNewRecord() {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const notes = [
        { freq: 523.25, start: 0.0,  dur: 0.12 },  // C5
        { freq: 659.25, start: 0.10, dur: 0.12 },  // E5
        { freq: 783.99, start: 0.20, dur: 0.12 },  // G5
        { freq: 987.77, start: 0.30, dur: 0.12 },  // B5
        { freq: 1046.5, start: 0.40, dur: 0.40 },  // C6 (held)
      ];

      notes.forEach(note => {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = note.freq;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now + note.start);
        gain.gain.linearRampToValueAtTime(0.3, now + note.start + 0.015);
        gain.gain.setValueAtTime(0.3, now + note.start + note.dur * 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);

        this._chain(osc, gain, this._masterGain);
        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur + 0.01);

        // Bright shimmer layer (octave + fifth above)
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = note.freq * 3; // 3rd harmonic

        const gain2 = this.ctx.createGain();
        gain2.gain.setValueAtTime(0.001, now + note.start);
        gain2.gain.linearRampToValueAtTime(0.08, now + note.start + 0.015);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);

        this._chain(osc2, gain2, this._masterGain);
        osc2.start(now + note.start);
        osc2.stop(now + note.start + note.dur + 0.01);
      });
    } catch (e) {
      console.warn('AudioManager.playNewRecord error:', e);
    }
  }

  /**
   * Two-note chime for achievement unlocks (G5 → C6).
   */
  playAchievement() {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const chimeNotes = [
        { freq: 783.99, start: 0.0,  dur: 0.20 },  // G5
        { freq: 1046.5, start: 0.15, dur: 0.35 },  // C6
      ];

      chimeNotes.forEach(note => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = note.freq;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now + note.start);
        gain.gain.linearRampToValueAtTime(0.35, now + note.start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur);

        this._chain(osc, gain, this._masterGain);
        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur + 0.01);

        // Harmonic overtone for bell-like quality
        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = note.freq * 2.5;

        const gain2 = this.ctx.createGain();
        gain2.gain.setValueAtTime(0.001, now + note.start);
        gain2.gain.linearRampToValueAtTime(0.1, now + note.start + 0.01);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.dur * 0.7);

        this._chain(osc2, gain2, this._masterGain);
        osc2.start(now + note.start);
        osc2.stop(now + note.start + note.dur + 0.01);
      });
    } catch (e) {
      console.warn('AudioManager.playAchievement error:', e);
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

      // If already playing, just update volume (clear correlation: louder = further jump)
      if (this._crowdSource) {
        const t = this.ctx.currentTime + 0.15;
        // Low murmur layer grows with distance
        this._crowdGain.gain.linearRampToValueAtTime(
          intensity * 0.3, t,
        );
        // High excitement layer kicks in at higher intensity
        if (this._crowdHighGain) {
          this._crowdHighGain.gain.linearRampToValueAtTime(
            Math.max(0, (intensity - 0.3) * 0.35), t,
          );
        }
        // Filter opens up with excitement
        if (this._crowdFilter) {
          this._crowdFilter.frequency.linearRampToValueAtTime(
            400 + intensity * 800, t,
          );
        }
        return;
      }

      // --- Layer 1: Low crowd murmur (bandpass noise, always present) ---
      const noiseBuf = this._createNoise(2);
      const source = this.ctx.createBufferSource();
      source.buffer = noiseBuf;
      source.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 400 + intensity * 800;
      filter.Q.value = 0.5;

      const gain = this.ctx.createGain();
      gain.gain.value = intensity * 0.3;

      this._chain(source, filter, gain, this._masterGain);
      source.start();

      // --- Layer 2: Higher excitement roar (separate noise, higher band) ---
      const highBuf = this._createNoise(2);
      const highSource = this.ctx.createBufferSource();
      highSource.buffer = highBuf;
      highSource.loop = true;

      const highBp = this.ctx.createBiquadFilter();
      highBp.type = 'bandpass';
      highBp.frequency.value = 2000;
      highBp.Q.value = 0.7;

      const highGain = this.ctx.createGain();
      highGain.gain.value = Math.max(0, (intensity - 0.3) * 0.35);

      this._chain(highSource, highBp, highGain, this._masterGain);
      highSource.start();

      this._crowdSource = source;
      this._crowdGain = gain;
      this._crowdFilter = filter;
      this._crowdHighSource = highSource;
      this._crowdHighGain = highGain;
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
      if (this._crowdHighSource) {
        this._crowdHighGain.gain.linearRampToValueAtTime(0, now + 0.2);
        this._crowdHighSource.stop(now + 0.25);
      }
      this._crowdSource = null;
      this._crowdGain = null;
      this._crowdFilter = null;
      this._crowdHighSource = null;
      this._crowdHighGain = null;
    } catch (e) {
      console.warn('AudioManager.stopCrowdAmbience error:', e);
      this._crowdSource = null;
      this._crowdGain = null;
      this._crowdFilter = null;
      this._crowdHighSource = null;
      this._crowdHighGain = null;
    }
  }

  /**
   * Gentle low drone for the menu screen -- 100Hz sine with slow LFO.
   * (Legacy method -- calls playMenuMusic for backward compatibility.)
   */
  playMenuAmbience() {
    try {
      this.playMenuMusic();
    } catch (e) {
      console.warn('AudioManager.playMenuAmbience error:', e);
    }
  }

  /**
   * Stop the menu ambience.
   * (Legacy method -- calls stopMenuMusic for backward compatibility.)
   */
  stopMenuAmbience() {
    try {
      this.stopMenuMusic();
    } catch (e) {
      console.warn('AudioManager.stopMenuAmbience error:', e);
    }
  }

  /**
   * Premium ambient Nordic music loop for the menu screen.
   * Layers 3 oscillators for a rich, atmospheric soundscape:
   *   1) Deep 80Hz sine drone with slow 0.1Hz LFO on volume
   *   2) Mid pad: 220Hz + 330Hz (perfect fifth) triangle waves, very quiet
   *   3) High shimmer: 880Hz sine with random volume gates (twinkling)
   * Overall very quiet and atmospheric.
   */
  playMenuMusic() {
    try {
      this._ensureContext();
      if (!this.ctx) return;

      // Already playing -- do nothing
      if (this._menuMusicNodes) return;

      const now = this.ctx.currentTime;
      const nodes = [];

      // Master gain for all menu music layers (very quiet overall)
      const musicGain = this.ctx.createGain();
      musicGain.gain.setValueAtTime(0, now);
      musicGain.gain.linearRampToValueAtTime(1.0, now + 2.0); // 2s fade in
      musicGain.connect(this._masterGain);

      // --- Layer 1: Deep drone (80Hz sine with slow 0.1Hz LFO on volume) ---
      const drone = this.ctx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 80;

      const droneLfo = this.ctx.createOscillator();
      droneLfo.type = 'sine';
      droneLfo.frequency.value = 0.1; // very slow breathing

      const droneLfoGain = this.ctx.createGain();
      droneLfoGain.gain.value = 0.035; // modulation depth

      const droneGain = this.ctx.createGain();
      droneGain.gain.value = 0.07; // base volume, quiet

      // LFO modulates drone volume
      droneLfo.connect(droneLfoGain);
      droneLfoGain.connect(droneGain.gain);

      // Warm low-pass on the drone to soften harmonics
      const droneLp = this.ctx.createBiquadFilter();
      droneLp.type = 'lowpass';
      droneLp.frequency.value = 150;
      droneLp.Q.value = 0.7;

      this._chain(drone, droneLp, droneGain, musicGain);

      drone.start(now);
      droneLfo.start(now);
      nodes.push(drone, droneLfo);

      // --- Layer 1b: Sub-bass warmth (40Hz sine, very quiet) ---
      const subDrone = this.ctx.createOscillator();
      subDrone.type = 'sine';
      subDrone.frequency.value = 40;

      const subDroneGain = this.ctx.createGain();
      subDroneGain.gain.value = 0.04;

      this._chain(subDrone, subDroneGain, musicGain);
      subDrone.start(now);
      nodes.push(subDrone);

      // --- Layer 2: Mid pad (220Hz + 330Hz perfect fifth, triangle) ---
      // Slightly detuned pairs for warm chorusing
      const pad1 = this.ctx.createOscillator();
      pad1.type = 'triangle';
      pad1.frequency.value = 220;

      const pad1b = this.ctx.createOscillator();
      pad1b.type = 'triangle';
      pad1b.frequency.value = 221.5; // slight detune for chorus

      const pad1Gain = this.ctx.createGain();
      pad1Gain.gain.value = 0.025; // very quiet

      // Slow LFO on pad volume for breathing feel
      const padLfo = this.ctx.createOscillator();
      padLfo.type = 'sine';
      padLfo.frequency.value = 0.07; // very slow
      const padLfoGain = this.ctx.createGain();
      padLfoGain.gain.value = 0.012;
      padLfo.connect(padLfoGain);
      padLfoGain.connect(pad1Gain.gain);

      this._chain(pad1, pad1Gain, musicGain);
      pad1b.connect(pad1Gain); // both pads through same gain
      pad1.start(now);
      pad1b.start(now);
      padLfo.start(now);
      nodes.push(pad1, pad1b, padLfo);

      const pad2 = this.ctx.createOscillator();
      pad2.type = 'triangle';
      pad2.frequency.value = 330;

      const pad2b = this.ctx.createOscillator();
      pad2b.type = 'triangle';
      pad2b.frequency.value = 331.2; // slight detune

      const pad2Gain = this.ctx.createGain();
      pad2Gain.gain.value = 0.02; // even quieter

      this._chain(pad2, pad2Gain, musicGain);
      pad2b.connect(pad2Gain);
      pad2.start(now);
      pad2b.start(now);
      nodes.push(pad2, pad2b);

      // --- Layer 3: High shimmer (880Hz + 1320Hz sines with random twinkling) ---
      const shimmer = this.ctx.createOscillator();
      shimmer.type = 'sine';
      shimmer.frequency.value = 880;

      const shimmer2 = this.ctx.createOscillator();
      shimmer2.type = 'sine';
      shimmer2.frequency.value = 1320; // fifth above for harmonic richness

      const shimmerGain = this.ctx.createGain();
      shimmerGain.gain.value = 0; // starts silent, will be gated randomly

      const shimmer2Gain = this.ctx.createGain();
      shimmer2Gain.gain.value = 0;

      this._chain(shimmer, shimmerGain, musicGain);
      this._chain(shimmer2, shimmer2Gain, musicGain);
      shimmer.start(now);
      shimmer2.start(now);
      nodes.push(shimmer, shimmer2);

      // --- Layer 4: Gentle filtered noise bed for icy atmosphere ---
      const noiseBuf = this._createNoise(3);
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuf;
      noiseSource.loop = true;

      const noiseBp = this.ctx.createBiquadFilter();
      noiseBp.type = 'bandpass';
      noiseBp.frequency.value = 3000;
      noiseBp.Q.value = 2.0;

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.value = 0.008; // barely audible texture

      this._chain(noiseSource, noiseBp, noiseGain, musicGain);
      noiseSource.start(now);
      nodes.push(noiseSource);

      // Random volume gates for twinkling effect (alternates between shimmer freqs)
      const shimmerInterval = setInterval(() => {
        try {
          if (!this.ctx || this.ctx.state !== 'running') return;
          const t = this.ctx.currentTime;
          if (Math.random() < 0.4) {
            // Twinkle on primary shimmer
            const vol = 0.01 + Math.random() * 0.025;
            shimmerGain.gain.setValueAtTime(vol, t);
            shimmerGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15 + Math.random() * 0.25);
          }
          if (Math.random() < 0.25) {
            // Twinkle on secondary shimmer (less frequent, quieter)
            const vol2 = 0.005 + Math.random() * 0.015;
            shimmer2Gain.gain.setValueAtTime(vol2, t + 0.05);
            shimmer2Gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2 + Math.random() * 0.3);
          }
        } catch (_) { /* context may be closed */ }
      }, 200);

      this._menuMusicNodes = nodes;
      this._menuMusicGain = musicGain;
      this._menuShimmerInterval = shimmerInterval;

      // Also keep legacy refs for backward compat with destroy()
      this._menuOsc = drone;
      this._menuLfo = droneLfo;
      this._menuGain = droneGain;
    } catch (e) {
      console.warn('AudioManager.playMenuMusic error:', e);
    }
  }

  /**
   * Fade out and stop menu music over 1 second.
   */
  stopMenuMusic() {
    try {
      if (!this._menuMusicNodes || !this.ctx) return;
      const now = this.ctx.currentTime;

      // Clear shimmer interval
      if (this._menuShimmerInterval) {
        clearInterval(this._menuShimmerInterval);
        this._menuShimmerInterval = null;
      }

      // Fade out over 1 second
      if (this._menuMusicGain) {
        this._menuMusicGain.gain.linearRampToValueAtTime(0, now + 1.0);
      }

      // Stop all oscillators after fade
      const stopTime = now + 1.05;
      this._menuMusicNodes.forEach(node => {
        try { node.stop(stopTime); } catch (_) { /* already stopped */ }
      });

      this._menuMusicNodes = null;
      this._menuMusicGain = null;
      this._menuOsc = null;
      this._menuLfo = null;
      this._menuGain = null;
    } catch (e) {
      console.warn('AudioManager.stopMenuMusic error:', e);
      if (this._menuShimmerInterval) {
        clearInterval(this._menuShimmerInterval);
        this._menuShimmerInterval = null;
      }
      this._menuMusicNodes = null;
      this._menuMusicGain = null;
      this._menuOsc = null;
      this._menuLfo = null;
      this._menuGain = null;
    }
  }

  /**
   * Low rumbling crowd murmur before takeoff.
   * Filtered noise with 300Hz bandpass and modulated volume for tension.
   */
  playCrowdAnticipation() {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const duration = 4.0;

      // Noise source
      const noiseBuf = this._createNoise(duration);
      const noiseSrc = this.ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;

      // 300Hz bandpass for low crowd murmur character
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 300;
      bp.Q.value = 0.8;

      // Volume modulation via LFO for organic "murmur" feel
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 1.5; // subtle pulsing

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.06;

      const mainGain = this.ctx.createGain();
      mainGain.gain.setValueAtTime(0.001, now);
      mainGain.gain.linearRampToValueAtTime(0.15, now + 0.8);
      mainGain.gain.setValueAtTime(0.15, now + duration * 0.7);
      mainGain.gain.linearRampToValueAtTime(0.0, now + duration);

      // LFO modulates volume
      lfo.connect(lfoGain);
      lfoGain.connect(mainGain.gain);

      this._chain(noiseSrc, bp, mainGain, this._masterGain);

      noiseSrc.start(now);
      noiseSrc.stop(now + duration);
      lfo.start(now);
      lfo.stop(now + duration);
    } catch (e) {
      console.warn('AudioManager.playCrowdAnticipation error:', e);
    }
  }

  /**
   * Slow-motion activation effect -- a deep "whooom" sound.
   * 100Hz sine with slow attack and 0.5s decay for cinematic feel.
   */
  playSlowmoEffect() {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Deep "whooom" oscillator
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.6);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.15); // slow attack
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65); // 0.5s decay

      // Low-pass filter for warmth
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 200;
      lp.Q.value = 1.0;

      this._chain(osc, lp, gain, this._masterGain);

      // Sub-bass layer for extra weight
      const sub = this.ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(50, now);
      sub.frequency.exponentialRampToValueAtTime(30, now + 0.6);

      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.linearRampToValueAtTime(0.25, now + 0.1);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      this._chain(sub, subGain, this._masterGain);

      osc.start(now);
      osc.stop(now + 0.7);
      sub.start(now);
      sub.stop(now + 0.55);
    } catch (e) {
      console.warn('AudioManager.playSlowmoEffect error:', e);
    }
  }

  /**
   * Countdown beep for 3-2-1-HOP sequence.
   * @param {number} number - 3, 2, or 1 for countdown tones; 0 for "HOP"
   */
  playCountdownBeep(number) {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      if (number > 0) {
        // 3, 2, 1: 600Hz sine, 100ms, low volume
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 600;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.setValueAtTime(0.2, now + 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        this._chain(osc, gain, this._masterGain);

        osc.start(now);
        osc.stop(now + 0.12);
      } else {
        // "HOP" (0): 800Hz + 1200Hz sine chord, 200ms, louder
        const osc1 = this.ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 800;

        const gain1 = this.ctx.createGain();
        gain1.gain.setValueAtTime(0.35, now);
        gain1.gain.setValueAtTime(0.35, now + 0.12);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        this._chain(osc1, gain1, this._masterGain);

        const osc2 = this.ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 1200;

        const gain2 = this.ctx.createGain();
        gain2.gain.setValueAtTime(0.25, now);
        gain2.gain.setValueAtTime(0.25, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        this._chain(osc2, gain2, this._masterGain);

        osc1.start(now);
        osc1.stop(now + 0.22);
        osc2.start(now);
        osc2.stop(now + 0.22);
      }
    } catch (e) {
      console.warn('AudioManager.playCountdownBeep error:', e);
    }
  }

  /**
   * Rising tone warning as the jumper approaches the takeoff edge.
   * A sine sweep from 400Hz to 900Hz over 0.4s for urgency.
   */
  playRisingTone() {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.4);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gain.gain.setValueAtTime(0.25, now + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      this._chain(osc, gain, this._masterGain);

      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {
      console.warn('AudioManager.playRisingTone error:', e);
    }
  }

  /**
   * Bright chime for perfect takeoff timing (quality > 0.9).
   * High sine at 1200Hz with a quick shimmer harmonic.
   */
  playPerfectTakeoff() {
    try {
      this._ensureContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;

      // Main bright tone
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.setValueAtTime(1250, now + 0.05);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      this._chain(osc, gain, this._masterGain);

      // Shimmer harmonic (octave above)
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = 2400;

      const gain2 = this.ctx.createGain();
      gain2.gain.setValueAtTime(0.001, now);
      gain2.gain.linearRampToValueAtTime(0.12, now + 0.01);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      this._chain(osc2, gain2, this._masterGain);

      osc.start(now);
      osc.stop(now + 0.35);
      osc2.start(now);
      osc2.stop(now + 0.25);
    } catch (e) {
      console.warn('AudioManager.playPerfectTakeoff error:', e);
    }
  }

  // -----------------------------------------------------------------------
  // Volume controls
  // -----------------------------------------------------------------------

  /**
   * Alias used by settings UI. Delegates to setMasterVolume.
   * @param {number} vol – 0 to 1
   */
  setVolume(vol) {
    this.setMasterVolume(vol);
  }

  /**
   * Return current master volume (0 to 1).
   * @returns {number}
   */
  getVolume() {
    return this._masterVolume;
  }

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
    if (this._windHighSource) {
      try { this._windHighSource.stop(); } catch (_) { /* already stopped */ }
      this._windHighSource = null;
      this._windHighGain = null;
      this._windHighFilter = null;
    }

    // Stop inrun slide if playing
    if (this._slideSource) {
      try { this._slideSource.stop(); } catch (_) { /* already stopped */ }
      this._slideSource = null;
      this._slideGain = null;
      this._slideFilter = null;
    }
    if (this._slideRumbleSource) {
      try { this._slideRumbleSource.stop(); } catch (_) { /* already stopped */ }
      this._slideRumbleSource = null;
      this._slideRumbleGain = null;
      this._slideRumbleFilter = null;
    }

    // Stop crowd ambience if playing
    if (this._crowdSource) {
      try { this._crowdSource.stop(); } catch (_) { /* already stopped */ }
      this._crowdSource = null;
      this._crowdGain = null;
      this._crowdFilter = null;
    }
    if (this._crowdHighSource) {
      try { this._crowdHighSource.stop(); } catch (_) { /* already stopped */ }
      this._crowdHighSource = null;
      this._crowdHighGain = null;
    }

    // Stop menu music if playing
    if (this._menuShimmerInterval) {
      clearInterval(this._menuShimmerInterval);
      this._menuShimmerInterval = null;
    }
    if (this._menuMusicNodes) {
      this._menuMusicNodes.forEach(node => {
        try { node.stop(); } catch (_) { /* already stopped */ }
      });
      this._menuMusicNodes = null;
      this._menuMusicGain = null;
    } else if (this._menuOsc) {
      // Legacy fallback
      try {
        this._menuOsc.stop();
        this._menuLfo.stop();
      } catch (_) { /* already stopped */ }
    }
    this._menuOsc = null;
    this._menuLfo = null;
    this._menuGain = null;

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
