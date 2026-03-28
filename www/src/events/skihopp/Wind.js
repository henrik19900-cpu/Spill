/**
 * Wind.js - Natural wind simulation for the ski jumping event
 *
 * Produces smooth, natural-feeling wind variation using layered sine waves
 * (Perlin-like noise) at 5 octaves. Wind speed and direction change gradually
 * with occasional dramatic gusts. Supports round shifts for tournament mode
 * and provides visualization data for HUD wind arrows.
 *
 * Speed range: 0-4 m/s with realistic distribution (mostly 0.5-2.0 m/s).
 */

export default class Wind {
    constructor() {
        /** Current wind speed in m/s (0-4). */
        this._speed = 0;

        /** Current wind direction in degrees (0 = headwind, 180 = tailwind). */
        this._direction = 0;

        /** Internal time accumulator for noise sampling. */
        this._time = 0;

        /** Random phase offsets so each session feels different (5 octaves). */
        this._phaseSpeed = [];
        this._phaseDir = [];
        for (let i = 0; i < 5; i++) {
            this._phaseSpeed.push(Math.random() * Math.PI * 2);
            this._phaseDir.push(Math.random() * Math.PI * 2);
        }

        /** Base direction that shifts between rounds. */
        this._baseDirection = 20 + Math.random() * 30; // 20-50 degrees (headwind bias)

        /** Round shift accumulator — added to base direction each round. */
        this._roundShift = 0;

        // --- Gust system ---
        /** @type {{ active: boolean, strength: number, decay: number, directionShift: number, timer: number, interval: number }} */
        this._gust = {
            active: false,
            strength: 0,
            decay: 0,
            directionShift: 0,
            timer: 0,
            interval: 6 + Math.random() * 14, // 6-20s between gusts
        };

        /** Whether a gust is currently in progress (for mid-flight drama). */
        this._gustActive = false;

        /** Callback for gust events (optional, for HUD alerts). */
        this.onGust = null;

        // --- Visualization data ---
        /** Smoothed direction for HUD arrow (avoids jitter). */
        this._smoothDirection = 0;

        /** Smoothed speed for HUD display. */
        this._smoothSpeed = 0;

        // Set initial values
        this._sample();
        this._smoothDirection = this._direction;
        this._smoothSpeed = this._speed;
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    /**
     * Advance the wind simulation.
     * @param {number} dt - time step in seconds
     */
    update(dt) {
        this._time += dt;
        this._updateGust(dt);
        this._sample();
        this._updateSmoothed(dt);
    }

    /**
     * @returns {number} Current wind speed in m/s (0-4).
     */
    getSpeed() {
        return this._speed;
    }

    /**
     * @returns {number} Current wind direction in degrees.
     *   0 = headwind (blowing toward the jumper),
     *   180 = tailwind (blowing away from the jumper),
     *   90 = crosswind from the side.
     */
    getDirection() {
        return this._direction;
    }

    /**
     * @returns {boolean} True if the current wind is predominantly a headwind.
     */
    isHeadwind() {
        const dir = ((this._direction % 360) + 360) % 360;
        return dir <= 90 || dir >= 270;
    }

    /**
     * @returns {boolean} True if a gust is currently active.
     */
    isGustActive() {
        return this._gustActive;
    }

    /**
     * Get visualization data for HUD wind arrow and indicator.
     * @returns {object} { speed, direction, gustActive, arrowAngle, arrowScale, label }
     */
    getVisualizationData() {
        const speed = this._smoothSpeed;
        const dir = this._smoothDirection;

        // Arrow angle: 0 = pointing right (headwind from left), rotate by direction
        const arrowAngle = dir;

        // Arrow scale: proportional to wind speed (0.0 - 1.0)
        const arrowScale = Math.min(1.0, speed / 4.0);

        // Descriptive label
        let label;
        if (speed < 0.3) {
            label = 'Stille';
        } else if (speed < 1.0) {
            label = 'Svak vind';
        } else if (speed < 2.5) {
            label = 'Moderat vind';
        } else {
            label = 'Sterk vind';
        }

        // Direction label
        const normDir = ((dir % 360) + 360) % 360;
        let dirLabel;
        if (normDir <= 30 || normDir >= 330) {
            dirLabel = 'motvind';
        } else if (normDir >= 150 && normDir <= 210) {
            dirLabel = 'medvind';
        } else {
            dirLabel = 'sidevind';
        }

        return {
            speed: Math.round(speed * 100) / 100,
            direction: Math.round(dir * 10) / 10,
            gustActive: this._gustActive,
            arrowAngle,
            arrowScale,
            label,
            dirLabel,
        };
    }

    /**
     * Shift wind conditions for a new round in tournament mode.
     * Introduces a direction shift and re-randomises gust timing.
     */
    shiftForNewRound() {
        // Direction shifts by 15-60 degrees in either direction
        this._roundShift += (Math.random() - 0.5) * 90;
        // Keep round shift reasonable (within +-120 degrees of original base)
        this._roundShift = Math.max(-120, Math.min(120, this._roundShift));

        // Re-randomise some phase offsets for variety
        for (let i = 2; i < 5; i++) {
            this._phaseSpeed[i] = Math.random() * Math.PI * 2;
            this._phaseDir[i] = Math.random() * Math.PI * 2;
        }

        // Reset gust timer so a new gust pattern emerges
        this._gust.timer = 0;
        this._gust.interval = 5 + Math.random() * 10;
        this._gust.strength = 0;
        this._gustActive = false;
    }

    // ------------------------------------------------------------------
    // Internal — 5-octave Perlin-like noise
    // ------------------------------------------------------------------

    /**
     * Layered sine-wave noise producing smooth, natural variation.
     * Five octaves with different frequencies and amplitudes create
     * a rich, Perlin-like feel. Realistic distribution centres most
     * values in the 0.5-2.0 m/s range.
     */
    _sample() {
        const t = this._time;

        // --- Wind speed (5 octaves) ---
        // Octave 1: very slow drift (period ~30s)
        const s1 = Math.sin(t * 0.21 + this._phaseSpeed[0]) * 0.40;
        // Octave 2: slow oscillation (period ~14s)
        const s2 = Math.sin(t * 0.45 + this._phaseSpeed[1]) * 0.22;
        // Octave 3: medium oscillation (period ~7s)
        const s3 = Math.sin(t * 0.89 + this._phaseSpeed[2]) * 0.13;
        // Octave 4: detail (period ~3.5s)
        const s4 = Math.sin(t * 1.78 + this._phaseSpeed[3]) * 0.07;
        // Octave 5: fine turbulence (period ~1.7s)
        const s5 = Math.sin(t * 3.7  + this._phaseSpeed[4]) * 0.03;

        // Combined range: roughly -0.85 to +0.85
        const rawNoise = s1 + s2 + s3 + s4 + s5;

        // Map to 0-1 range
        const normalised = (rawNoise + 0.85) / 1.7;

        // Shape the distribution: use a power curve to bias toward 0.5-2.0 m/s
        // squared pulls values toward the middle, then we scale
        const shaped = Math.pow(normalised, 0.8);

        // Base speed: 0.2 to 2.8 m/s from noise alone
        let speed = 0.2 + shaped * 2.6;

        // Add gust contribution (can push up to 4 m/s)
        speed += this._gust.strength;

        // Clamp to valid range
        this._speed = Math.max(0, Math.min(4, speed));

        // --- Wind direction (5 octaves, slower variation) ---
        const d1 = Math.sin(t * 0.10 + this._phaseDir[0]) * 50;
        const d2 = Math.sin(t * 0.25 + this._phaseDir[1]) * 22;
        const d3 = Math.sin(t * 0.55 + this._phaseDir[2]) * 10;
        const d4 = Math.sin(t * 1.1  + this._phaseDir[3]) * 5;
        const d5 = Math.sin(t * 2.3  + this._phaseDir[4]) * 2;

        // Effective base direction including round shift
        const effectiveBase = this._baseDirection + this._roundShift;

        // Gust can also shift direction
        const gustDirShift = this._gust.directionShift * (this._gust.strength > 0.1 ? 1 : 0);

        this._direction = ((effectiveBase + d1 + d2 + d3 + d4 + d5 + gustDirShift) % 360 + 360) % 360;
    }

    // ------------------------------------------------------------------
    // Smoothed values for HUD (avoids jittery arrow)
    // ------------------------------------------------------------------

    _updateSmoothed(dt) {
        const smoothFactor = 1 - Math.exp(-2.0 * dt); // ~2 Hz smoothing
        this._smoothSpeed += (this._speed - this._smoothSpeed) * smoothFactor;

        // Smooth direction with circular interpolation
        let dirDiff = this._direction - this._smoothDirection;
        // Wrap to -180..180
        while (dirDiff > 180) dirDiff -= 360;
        while (dirDiff < -180) dirDiff += 360;
        this._smoothDirection = ((this._smoothDirection + dirDiff * smoothFactor) % 360 + 360) % 360;
    }

    // ------------------------------------------------------------------
    // Gust system — dramatic sudden wind changes
    // ------------------------------------------------------------------

    /**
     * Gust system: occasional bursts of stronger wind that decay smoothly.
     * Gusts have both speed and direction components, creating dramatic
     * mid-flight conditions.
     */
    _updateGust(dt) {
        this._gust.timer += dt;

        if (this._gust.timer >= this._gust.interval) {
            // Trigger a new gust
            this._gust.timer = 0;
            this._gust.interval = 6 + Math.random() * 14;

            // Gust strength: 0.8-2.5 m/s burst (can be dramatic)
            this._gust.strength = 0.8 + Math.random() * 1.7;

            // Gust decay rate: how quickly it fades (higher = faster fade)
            this._gust.decay = 0.4 + Math.random() * 0.8;

            // Gust can shift wind direction by up to +-40 degrees
            this._gust.directionShift = (Math.random() - 0.5) * 80;

            this._gustActive = true;

            // Fire gust callback if registered
            if (this.onGust) {
                this.onGust({
                    strength: this._gust.strength,
                    directionShift: this._gust.directionShift,
                });
            }
        }

        // Decay current gust exponentially
        if (this._gust.strength > 0.05) {
            this._gust.strength *= Math.exp(-this._gust.decay * dt);
            // Also decay the direction shift
            this._gust.directionShift *= Math.exp(-this._gust.decay * dt * 0.7);
        } else {
            this._gust.strength = 0;
            this._gust.directionShift = 0;
            this._gustActive = false;
        }
    }
}
