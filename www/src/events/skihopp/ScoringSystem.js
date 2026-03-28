/**
 * ScoringSystem.js - Scoring for the ski jumping event
 *
 * Implements real FIS ski jumping scoring rules:
 *   - Distance points relative to K-point
 *   - Style points from 5 judges (drop highest and lowest)
 *   - Wind compensation (headwind bonus, tailwind deduction)
 *   - Gate compensation (higher gate = deduction, lower = bonus)
 */

export default class ScoringSystem {
    /**
     * @param {object} hillConfig - hill configuration
     * @param {number} hillConfig.kPoint       - K-point distance in meters
     * @param {number} [hillConfig.meterValue] - points per meter beyond K-point
     * @param {number} [hillConfig.windFactor]  - wind compensation factor
     * @param {number} [hillConfig.gateFactor]  - gate compensation factor
     * @param {number} [hillConfig.defaultGate] - default start gate number
     */
    constructor(hillConfig) {
        this.kPoint = hillConfig.kPoint;

        // Meter value: K90 = 2.0, K120 = 1.8 — interpolate for other sizes
        if (hillConfig.meterValue != null) {
            this.meterValue = hillConfig.meterValue;
        } else {
            this.meterValue = this.kPoint <= 90 ? 2.0 : 1.8;
        }

        this.windFactor = hillConfig.windFactor != null ? hillConfig.windFactor : this._defaultWindFactor();
        this.gateFactor = hillConfig.gateFactor != null ? hillConfig.gateFactor : this._defaultGateFactor();
        this.defaultGate = hillConfig.defaultGate != null ? hillConfig.defaultGate : 15;

        // Each judge gets a small persistent bias to feel like distinct individuals
        this._judgeBiases = [];
        this._initJudges();
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    /**
     * Calculate the full score for a single jump.
     *
     * @param {object} jumpData
     * @param {number} jumpData.distance         - landing distance in meters
     * @param {number} jumpData.takeoffQuality   - 0-1 (1 = perfect)
     * @param {number} jumpData.flightStability  - 0-1 (1 = perfectly steady)
     * @param {number} jumpData.landingQuality   - 0-1 (1 = perfect telemark)
     * @param {number} [jumpData.windSpeed]      - wind speed in m/s
     * @param {number} [jumpData.windDirection]   - wind angle in degrees (0 = headwind)
     * @param {number} [jumpData.gate]           - start gate used
     *
     * @returns {object} scoring breakdown
     */
    calculateScore(jumpData) {
        const {
            distance,
            takeoffQuality,
            flightStability,
            landingQuality,
            windSpeed = 0,
            windDirection = 0,
            gate,
        } = jumpData;

        // 1. Distance points
        const distancePoints = this._calcDistancePoints(distance);

        // 2. Style points (5 judges)
        const judges = this._calcJudgeScores(takeoffQuality, flightStability, landingQuality);
        const stylePoints = this._sumStylePoints(judges);

        // 3. Wind compensation
        const windCompensation = this._calcWindCompensation(windSpeed, windDirection);

        // 4. Gate compensation
        const usedGate = gate != null ? gate : this.defaultGate;
        const gateCompensation = this._calcGateCompensation(usedGate);

        // Total (cannot go below 0)
        const totalPoints = Math.max(
            0,
            Math.round((distancePoints + stylePoints + windCompensation + gateCompensation) * 10) / 10
        );

        return {
            distancePoints: Math.round(distancePoints * 10) / 10,
            judges,
            stylePoints,
            windCompensation: Math.round(windCompensation * 10) / 10,
            gateCompensation: Math.round(gateCompensation * 10) / 10,
            totalPoints,
        };
    }

    /**
     * Reset the scoring system for a new competition.
     * Reassigns judge biases so each competition feels slightly different.
     */
    reset() {
        this._initJudges();
    }

    // ------------------------------------------------------------------
    // Distance points
    // ------------------------------------------------------------------

    _calcDistancePoints(distance) {
        // Landing exactly at K-point = 60 points
        return (distance - this.kPoint) * this.meterValue + 60;
    }

    // ------------------------------------------------------------------
    // Style points (5 judges)
    // ------------------------------------------------------------------

    _initJudges() {
        this._judgeBiases = [];
        for (let i = 0; i < 5; i++) {
            // Each judge has a persistent bias of +-0.5
            this._judgeBiases.push((Math.random() - 0.5) * 1.0);
        }
    }

    /**
     * Generate scores from 5 judges based on jump quality metrics.
     * Each judge evaluates takeoff, flight, landing, and overall impression.
     */
    _calcJudgeScores(takeoffQuality, flightStability, landingQuality) {
        const scores = [];

        for (let i = 0; i < 5; i++) {
            const bias = this._judgeBiases[i];

            // Takeoff quality: up to 5 points
            const takeoffPts = takeoffQuality * 5;

            // Flight stability: up to 5 points
            const flightPts = flightStability * 5;

            // Landing quality (telemark): up to 7 points
            const landingPts = landingQuality * 7;

            // Overall impression: up to 3 points, random small variation
            const impressionBase = (takeoffQuality + flightStability + landingQuality) / 3;
            const impressionPts = impressionBase * 3 + (Math.random() - 0.5) * 0.5;

            // Sum + judge bias, clamped to 0-20
            let total = takeoffPts + flightPts + landingPts + impressionPts + bias;
            total = Math.max(0, Math.min(20, total));

            // Round to half-points (as in real judging)
            scores.push(Math.round(total * 2) / 2);
        }

        return scores;
    }

    /**
     * Remove highest and lowest scores, sum the remaining three.
     */
    _sumStylePoints(judges) {
        const sorted = [...judges].sort((a, b) => a - b);
        // Drop index 0 (lowest) and index 4 (highest), sum indices 1-3
        const sum = sorted[1] + sorted[2] + sorted[3];
        return Math.round(sum * 10) / 10;
    }

    // ------------------------------------------------------------------
    // Wind compensation
    // ------------------------------------------------------------------

    _defaultWindFactor() {
        // Larger hills have a bigger wind factor
        return this.kPoint <= 90 ? 8.0 : 10.8;
    }

    /**
     * Calculate wind compensation points.
     * Headwind (direction ~0) gives bonus, tailwind (~180) gives deduction.
     * Crosswind has reduced effect.
     */
    _calcWindCompensation(windSpeed, windDirection) {
        if (windSpeed === 0) return 0;

        // Component of wind along the jump axis
        // 0 degrees = headwind (full effect, positive compensation)
        // 180 degrees = tailwind (full effect, negative compensation)
        // 90 degrees = crosswind (no along-axis component)
        const dirRad = (windDirection * Math.PI) / 180;
        const headwindComponent = Math.cos(dirRad);

        // Positive headwindComponent = headwind = bonus points
        // Negative headwindComponent = tailwind = deduction
        return windSpeed * headwindComponent * this.windFactor;
    }

    // ------------------------------------------------------------------
    // Gate compensation
    // ------------------------------------------------------------------

    _defaultGateFactor() {
        return this.kPoint <= 90 ? 5.4 : 7.24;
    }

    /**
     * Calculate gate compensation.
     * Lower gate than default = bonus (jumper had less speed).
     * Higher gate = deduction (jumper had more speed advantage).
     */
    _calcGateCompensation(usedGate) {
        return (this.defaultGate - usedGate) * this.gateFactor;
    }
}
