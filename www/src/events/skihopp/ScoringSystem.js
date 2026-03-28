/**
 * ScoringSystem.js - Scoring for the ski jumping event
 *
 * Implements real FIS ski jumping scoring rules:
 *   - Distance points relative to K-point
 *   - Style points from 5 judges (drop highest and lowest)
 *   - Wind compensation (headwind bonus, tailwind deduction)
 *   - Gate compensation (higher gate = deduction, lower = bonus)
 *   - Jump rating system with Norwegian labels
 *   - Nationality bias for judges
 *   - Detailed style breakdown (arm movement, telemark, near-fall)
 */

// Judge nationalities — each has a slight bias toward their own country
const JUDGE_NATIONALITIES = ['NOR', 'AUT', 'GER', 'JPN', 'POL'];

// Deduction categories and their maximum penalty
const DEDUCTIONS = {
    armMovement: { max: 2.0, label: 'Armbevegelse' },    // arm flailing in flight
    noTelemark:  { max: 3.0, label: 'Manglende telemark' }, // no telemark landing
    nearFall:    { max: 5.0, label: 'Nesten fall' },       // near-fall on landing
    bodyLean:    { max: 1.5, label: 'Kroppslean' },        // poor body position in flight
    skiSpread:   { max: 1.0, label: 'Skisprik' },          // uneven ski spread
};

// Jump rating thresholds
const JUMP_RATINGS = [
    { min: 130, label: 'Fantastisk!', tier: 'S' },
    { min: 110, label: 'Bra hopp!',   tier: 'A' },
    { min: 90,  label: 'OK',          tier: 'B' },
    { min: -Infinity, label: 'Svakt', tier: 'C' },
];

export default class ScoringSystem {
    /**
     * @param {object} hillConfig - hill configuration
     * @param {number} hillConfig.kPoint       - K-point distance in meters
     * @param {number} [hillConfig.hillSize]   - hill size (HS) in meters
     * @param {number} [hillConfig.meterValue] - points per meter beyond K-point
     * @param {number} [hillConfig.windFactor]  - wind compensation factor
     * @param {number} [hillConfig.gateFactor]  - gate compensation per gate step
     * @param {number} [hillConfig.gateHeight]  - height difference per gate in cm
     * @param {number} [hillConfig.defaultGate] - default start gate number
     */
    constructor(hillConfig) {
        this.kPoint = hillConfig.kPoint;
        this.hillSize = hillConfig.hillSize || Math.round(hillConfig.kPoint * 1.1);

        // Meter value: K90 = 2.0, K120 = 1.8 — interpolate for other sizes
        if (hillConfig.meterValue != null) {
            this.meterValue = hillConfig.meterValue;
        } else {
            this.meterValue = this.kPoint <= 90 ? 2.0 : 1.8;
        }

        this.windFactor = hillConfig.windFactor != null ? hillConfig.windFactor : this._defaultWindFactor();
        this.gateFactor = hillConfig.gateFactor != null ? hillConfig.gateFactor : this._defaultGateFactor();
        this.gateHeight = hillConfig.gateHeight != null ? hillConfig.gateHeight : 0.10; // 10 cm per gate
        this.defaultGate = hillConfig.defaultGate != null ? hillConfig.defaultGate : 15;

        // Each judge gets a persistent bias and nationality
        this._judges = [];
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
     * @param {string} [jumpData.jumperNationality] - 3-letter country code (e.g. 'NOR')
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
            jumperNationality = null,
        } = jumpData;

        // 1. Distance points
        const distancePoints = this._calcDistancePoints(distance);

        // 2. Style points (5 judges) with detailed breakdown
        const judgeResults = this._calcJudgeScores(
            takeoffQuality, flightStability, landingQuality, jumperNationality
        );
        const judges = judgeResults.map(j => j.score);
        const stylePoints = this._sumStylePoints(judges);

        // 3. Wind compensation (more impactful)
        const windCompensation = this._calcWindCompensation(windSpeed, windDirection, distance);

        // 4. Gate compensation (proper FIS formula)
        const usedGate = gate != null ? gate : this.defaultGate;
        const gateCompensation = this._calcGateCompensation(usedGate);

        // Total (cannot go below 0)
        const totalPoints = Math.max(
            0,
            Math.round((distancePoints + stylePoints + windCompensation + gateCompensation) * 10) / 10
        );

        // Jump rating
        const rating = this._getJumpRating(totalPoints);

        // Aggregate deductions for display
        const deductionSummary = this._aggregateDeductions(judgeResults);

        return {
            distancePoints: Math.round(distancePoints * 10) / 10,
            distance: Math.round(distance * 2) / 2,
            judges,
            judgeDetails: judgeResults,
            stylePoints,
            deductionSummary,
            windCompensation: Math.round(windCompensation * 10) / 10,
            windSpeed: Math.round(windSpeed * 100) / 100,
            windDirection: Math.round(windDirection * 10) / 10,
            gateCompensation: Math.round(gateCompensation * 10) / 10,
            gate: usedGate,
            totalPoints,
            rating: rating.label,
            ratingTier: rating.tier,
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
    // Jump rating
    // ------------------------------------------------------------------

    _getJumpRating(totalPoints) {
        for (const rating of JUMP_RATINGS) {
            if (totalPoints >= rating.min) return rating;
        }
        return JUMP_RATINGS[JUMP_RATINGS.length - 1];
    }

    // ------------------------------------------------------------------
    // Distance points
    // ------------------------------------------------------------------

    _calcDistancePoints(distance) {
        // Landing exactly at K-point = 60 points
        return (distance - this.kPoint) * this.meterValue + 60;
    }

    // ------------------------------------------------------------------
    // Style points (5 judges) — detailed and realistic
    // ------------------------------------------------------------------

    _initJudges() {
        this._judges = [];
        for (let i = 0; i < 5; i++) {
            this._judges.push({
                nationality: JUDGE_NATIONALITIES[i],
                // Persistent bias +-0.5 — each judge is slightly strict or lenient
                bias: (Math.random() - 0.5) * 1.0,
                // Strictness on specific categories varies per judge
                strictness: {
                    takeoff:  0.8 + Math.random() * 0.4,  // 0.8-1.2
                    flight:   0.8 + Math.random() * 0.4,
                    landing:  0.8 + Math.random() * 0.4,
                },
            });
        }
    }

    /**
     * Generate scores from 5 judges based on jump quality metrics.
     * Each judge evaluates takeoff, flight, landing with individual variation
     * and potential nationality bias.
     */
    _calcJudgeScores(takeoffQuality, flightStability, landingQuality, jumperNationality) {
        // Determine specific deductions based on quality values
        const deductions = this._determineDeductions(takeoffQuality, flightStability, landingQuality);

        const results = [];

        for (let i = 0; i < 5; i++) {
            const judge = this._judges[i];

            // --- Individual variation: each judge sees things slightly differently ---
            // +-1.0 random per-jump variation (judges roughly agree but aren't identical)
            const perJumpVariation = (Math.random() - 0.5) * 2.0;

            // --- Nationality bias: +0.3 to +0.8 if judge shares nationality ---
            let nationalityBonus = 0;
            if (jumperNationality && judge.nationality === jumperNationality) {
                nationalityBonus = 0.3 + Math.random() * 0.5;
            }

            // --- Detailed component scoring ---
            // Takeoff: up to 5 points
            const takeoffPts = takeoffQuality * 5 * judge.strictness.takeoff;

            // Flight stability: up to 5 points
            const flightPts = flightStability * 5 * judge.strictness.flight;

            // Landing quality (telemark): up to 7 points
            const landingPts = landingQuality * 7 * judge.strictness.landing;

            // Overall impression: up to 3 points
            const impressionBase = (takeoffQuality + flightStability + landingQuality) / 3;
            const impressionPts = impressionBase * 3;

            // --- Apply specific deductions per judge (with some individual variance) ---
            let totalDeductions = 0;
            const judgeDeductions = {};
            for (const [key, ded] of Object.entries(deductions)) {
                // Each judge applies deductions slightly differently (+-20%)
                const judgeVariance = 0.8 + Math.random() * 0.4;
                const applied = ded.amount * judgeVariance;
                totalDeductions += applied;
                judgeDeductions[key] = Math.round(applied * 10) / 10;
            }

            // Sum + judge persistent bias + per-jump variation + nationality bonus - deductions
            let total = takeoffPts + flightPts + landingPts + impressionPts
                + judge.bias + perJumpVariation + nationalityBonus - totalDeductions;

            // Clamp to 0-20
            total = Math.max(0, Math.min(20, total));

            // Round to half-points (as in real judging)
            const score = Math.round(total * 2) / 2;

            results.push({
                score,
                nationality: judge.nationality,
                breakdown: {
                    takeoff:    Math.round(takeoffPts * 10) / 10,
                    flight:     Math.round(flightPts * 10) / 10,
                    landing:    Math.round(landingPts * 10) / 10,
                    impression: Math.round(impressionPts * 10) / 10,
                },
                deductions: judgeDeductions,
                nationalityBonus: Math.round(nationalityBonus * 10) / 10,
            });
        }

        return results;
    }

    /**
     * Determine specific deductions based on quality metrics.
     * Low quality triggers recognizable faults.
     */
    _determineDeductions(takeoffQuality, flightStability, landingQuality) {
        const deductions = {};

        // Arm movement deduction — triggered by poor flight stability
        if (flightStability < 0.7) {
            const severity = 1 - flightStability / 0.7; // 0 at 0.7, 1 at 0
            deductions.armMovement = {
                amount: severity * DEDUCTIONS.armMovement.max,
                label: DEDUCTIONS.armMovement.label,
            };
        }

        // No telemark deduction — triggered by poor landing
        if (landingQuality < 0.5) {
            const severity = 1 - landingQuality / 0.5; // 0 at 0.5, 1 at 0
            deductions.noTelemark = {
                amount: severity * DEDUCTIONS.noTelemark.max,
                label: DEDUCTIONS.noTelemark.label,
            };
        }

        // Near-fall deduction — triggered by very poor landing
        if (landingQuality < 0.2) {
            const severity = 1 - landingQuality / 0.2; // 0 at 0.2, 1 at 0
            deductions.nearFall = {
                amount: severity * DEDUCTIONS.nearFall.max,
                label: DEDUCTIONS.nearFall.label,
            };
        }

        // Body lean — poor takeoff causes forward/backward lean in flight
        if (takeoffQuality < 0.6) {
            const severity = 1 - takeoffQuality / 0.6;
            deductions.bodyLean = {
                amount: severity * DEDUCTIONS.bodyLean.max,
                label: DEDUCTIONS.bodyLean.label,
            };
        }

        // Ski spread — poor flight stability causes uneven V-shape
        if (flightStability < 0.5) {
            const severity = 1 - flightStability / 0.5;
            deductions.skiSpread = {
                amount: severity * DEDUCTIONS.skiSpread.max,
                label: DEDUCTIONS.skiSpread.label,
            };
        }

        return deductions;
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

    /**
     * Aggregate deductions across all judges for the score display.
     * Returns a list of {label, avgDeduction} for deductions that were applied.
     */
    _aggregateDeductions(judgeResults) {
        const deductionTotals = {};
        const deductionCounts = {};

        for (const judge of judgeResults) {
            for (const [key, amount] of Object.entries(judge.deductions)) {
                if (!deductionTotals[key]) {
                    deductionTotals[key] = 0;
                    deductionCounts[key] = 0;
                }
                deductionTotals[key] += amount;
                deductionCounts[key]++;
            }
        }

        const summary = [];
        for (const [key, total] of Object.entries(deductionTotals)) {
            const dedInfo = DEDUCTIONS[key];
            if (dedInfo) {
                summary.push({
                    key,
                    label: dedInfo.label,
                    avgDeduction: Math.round((total / deductionCounts[key]) * 10) / 10,
                });
            }
        }

        return summary;
    }

    // ------------------------------------------------------------------
    // Wind compensation — more impactful, distance-dependent
    // ------------------------------------------------------------------

    _defaultWindFactor() {
        // FIS-like factors: larger hills are more wind-sensitive
        if (this.kPoint <= 90) return 8.0;
        if (this.kPoint <= 120) return 10.8;
        return 14.4; // ski flying hills
    }

    /**
     * Calculate wind compensation points.
     * Headwind (direction ~0) gives bonus, tailwind (~180) gives deduction.
     * Crosswind has reduced effect.
     *
     * More impactful formula: compensation scales with both wind speed and
     * the distance jumped (longer flights = more time exposed to wind).
     */
    _calcWindCompensation(windSpeed, windDirection, distance) {
        if (windSpeed === 0) return 0;

        // Component of wind along the jump axis
        const dirRad = (windDirection * Math.PI) / 180;
        const headwindComponent = Math.cos(dirRad);

        // Base compensation: wind factor * speed * headwind component
        let compensation = windSpeed * headwindComponent * this.windFactor;

        // Distance scaling: longer flights are more affected by wind.
        // Normalise around K-point — at K-point the factor is 1.0,
        // beyond K-point the effect increases, below it decreases.
        const distanceFactor = 0.5 + 0.5 * (distance / this.kPoint);
        compensation *= distanceFactor;

        // Crosswind penalty: crosswind doesn't help distance but destabilises
        const crosswindComponent = Math.abs(Math.sin(dirRad));
        const crosswindPenalty = crosswindComponent * windSpeed * 0.5;
        compensation -= crosswindPenalty;

        return compensation;
    }

    // ------------------------------------------------------------------
    // Gate compensation — proper FIS formula
    // ------------------------------------------------------------------

    _defaultGateFactor() {
        // FIS gate factor: points per gate step
        // Based on real values: K90 ~ 5.4, K120 ~ 7.24, K200+ ~ 9.36
        if (this.kPoint <= 90) return 5.4;
        if (this.kPoint <= 120) return 7.24;
        return 9.36;
    }

    /**
     * Calculate gate compensation using the FIS formula.
     * Points = gateHeightDiff * gateFactor / meterValue
     *
     * Lower gate than default = bonus (jumper had less speed).
     * Higher gate = deduction (jumper had more speed advantage).
     *
     * The compensation considers the actual height difference between gates,
     * not just the gate number difference.
     */
    _calcGateCompensation(usedGate) {
        const gateDiff = this.defaultGate - usedGate;
        // Height difference in meters (gateHeight is per gate step)
        const heightDiffM = gateDiff * this.gateHeight;
        // FIS formula: compensation = heightDiff * gateFactor
        // gateFactor already encodes points-per-height-unit for the hill
        return heightDiffM * this.gateFactor / this.gateHeight;
    }
}
