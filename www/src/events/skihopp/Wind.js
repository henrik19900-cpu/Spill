/**
 * Wind.js - Natural wind simulation for the ski jumping event
 *
 * Produces smooth, natural-feeling wind variation using layered sine waves
 * (Perlin-like noise). Wind speed and direction change gradually with
 * occasional gusts. The wind state is updated each frame and can be
 * queried by the physics and scoring systems.
 */

export default class Wind {
    constructor() {
        /** Current wind speed in m/s (0-3). */
        this._speed = 0;

        /** Current wind direction in degrees (0 = headwind, 180 = tailwind). */
        this._direction = 0;

        /** Internal time accumulator for noise sampling. */
        this._time = 0;

        /** Random phase offsets so each session feels different. */
        this._phaseSpeed1 = Math.random() * Math.PI * 2;
        this._phaseSpeed2 = Math.random() * Math.PI * 2;
        this._phaseSpeed3 = Math.random() * Math.PI * 2;
        this._phaseDir1   = Math.random() * Math.PI * 2;
        this._phaseDir2   = Math.random() * Math.PI * 2;
        this._phaseDir3   = Math.random() * Math.PI * 2;

        /** Gust state. */
        this._gustTimer = 0;
        this._gustInterval = 8 + Math.random() * 12; // seconds between gusts
        this._gustStrength = 0;
        this._gustDecay = 0;

        // Set initial values
        this._sample();
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
    }

    /**
     * @returns {number} Current wind speed in m/s (0-3).
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
        // Headwind = direction within +-90 degrees of 0 (i.e., 0-90 or 270-360)
        const dir = ((this._direction % 360) + 360) % 360;
        return dir <= 90 || dir >= 270;
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    /**
     * Layered sine-wave noise producing smooth, natural variation.
     * Three octaves with different frequencies and amplitudes create
     * the Perlin-like feel.
     */
    _sample() {
        const t = this._time;

        // --- Wind speed ---
        // Base: slow oscillation (period ~20s)
        const s1 = Math.sin(t * 0.3 + this._phaseSpeed1) * 0.5;
        // Detail: medium oscillation (period ~7s)
        const s2 = Math.sin(t * 0.9 + this._phaseSpeed2) * 0.25;
        // Fine: fast oscillation (period ~3s)
        const s3 = Math.sin(t * 2.1 + this._phaseSpeed3) * 0.1;

        // Combine: range roughly -0.85 to +0.85, shift to 0-1 range
        const speedNoise = (s1 + s2 + s3 + 0.85) / 1.7;

        // Base speed: 0.3 to 2.2 m/s from noise alone
        let speed = 0.3 + speedNoise * 1.9;

        // Add gust contribution (can push up to 3 m/s)
        speed += this._gustStrength;

        // Clamp to valid range
        this._speed = Math.max(0, Math.min(3, speed));

        // --- Wind direction ---
        // Slower variation — direction shouldn't whip around
        const d1 = Math.sin(t * 0.15 + this._phaseDir1) * 60;
        const d2 = Math.sin(t * 0.4  + this._phaseDir2) * 20;
        const d3 = Math.sin(t * 1.0  + this._phaseDir3) * 8;

        // Centre around a base direction (slightly headwind-biased for realism)
        const baseDirection = 30; // slight headwind bias
        this._direction = ((baseDirection + d1 + d2 + d3) % 360 + 360) % 360;
    }

    /**
     * Gust system: occasional bursts of stronger wind that decay smoothly.
     */
    _updateGust(dt) {
        this._gustTimer += dt;

        if (this._gustTimer >= this._gustInterval) {
            // Trigger a new gust
            this._gustTimer = 0;
            this._gustInterval = 8 + Math.random() * 12;
            this._gustStrength = 0.5 + Math.random() * 1.0; // 0.5-1.5 m/s burst
            this._gustDecay = 0.6 + Math.random() * 0.8;    // decay rate
        }

        // Decay current gust exponentially
        if (this._gustStrength > 0.01) {
            this._gustStrength *= Math.exp(-this._gustDecay * dt);
        } else {
            this._gustStrength = 0;
        }
    }
}
