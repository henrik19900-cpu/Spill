/**
 * Hill.js - Ski jumping hill profile generator
 *
 * Generates a realistic ski jump hill profile from configuration data.
 * Coordinate system: origin (0,0) at the table edge (takeoff point).
 * Negative x = inrun (uphill/left), positive x = landing area (downhill/right).
 * Positive y = downward (below takeoff), negative y = upward (above takeoff).
 * Units: meters. The renderer handles pixel conversion.
 */

const DEG_TO_RAD = Math.PI / 180;

export default class Hill {
    constructor(config) {
        this.name = config.name;
        this.kPoint = config.kPoint;
        this.hillSize = config.hillSize;
        this.inrunLength = config.inrunLength;
        this.inrunAngle = config.inrunAngle;
        this.tableAngle = config.tableAngle;
        this.tableLength = config.tableLength;
        this.landingAngle = config.landingAngle;
        this.landingSteepness = config.landingSteepness;
        this.flatLength = config.flatLength;
        this.gateCount = config.gateCount || 25;
        this.defaultGate = config.defaultGate || 20;

        this._inrunPoints = [];
        this._tablePoints = [];
        this._landingPoints = [];
        this._outrunPoints = [];

        this._generate();
    }

    // ----------------------------------------------------------------
    // Profile generation
    // ----------------------------------------------------------------

    _generate() {
        this._generateInrun();
        this._generateTable();
        this._generateLanding();
        this._generateOutrun();
    }

    /**
     * Inrun: straight slope coming down at inrunAngle, ending with a smooth
     * circular-arc transition into the table. The transition radius is chosen
     * so the curvature feels natural (~60-80 m on large hills).
     */
    _generateInrun() {
        const angleRad = this.inrunAngle * DEG_TO_RAD;
        const tableRad = this.tableAngle * DEG_TO_RAD;

        // Transition curve radius (bigger hills get a larger radius)
        const transitionRadius = this.inrunLength * 0.8;

        // Angular span the transition must cover
        const angleDelta = angleRad - tableRad;

        // Arc length of the transition curve
        const transitionArcLen = transitionRadius * angleDelta;

        // Horizontal / vertical extent of the transition arc
        const transitionDx = transitionRadius * (Math.sin(angleRad) - Math.sin(tableRad));
        const transitionDy = transitionRadius * (Math.cos(tableRad) - Math.cos(angleRad));

        // The transition ends at the start of the table. The table starts at
        // x = -tableLength * cos(tableAngle), y = -tableLength * sin(tableAngle)
        // (measured back from origin along the table direction).
        const tableDx = this.tableLength * Math.cos(tableRad);
        const tableDy = this.tableLength * Math.sin(tableRad);

        // Transition end point (= table start point)
        const transEndX = -tableDx;
        const transEndY = -tableDy;

        // Transition start point
        const transStartX = transEndX - transitionDx;
        const transStartY = transEndY - transitionDy;

        // Straight section length (what remains of the inrun before transition)
        const straightHorizontal = this.inrunLength * Math.cos(angleRad) - transitionDx - tableDx;

        // Start of the straight inrun
        const straightStartX = transStartX - Math.max(straightHorizontal, 0);
        const straightStartY = transStartY - Math.max(straightHorizontal, 0) * Math.tan(angleRad);

        // --- Generate straight section points ---
        const numStraight = 40;
        const straightLen = Math.sqrt(
            (transStartX - straightStartX) ** 2 + (transStartY - straightStartY) ** 2
        );

        for (let i = 0; i <= numStraight; i++) {
            const t = i / numStraight;
            this._inrunPoints.push({
                x: straightStartX + t * (transStartX - straightStartX),
                y: straightStartY + t * (transStartY - straightStartY),
            });
        }

        // --- Generate transition curve points ---
        // Parametrise by angle from inrunAngle down to tableAngle.
        // Centre of the circular arc sits perpendicular to the slope at the
        // transition start, offset by transitionRadius toward the "inside" of
        // the curve (i.e., above the slope surface).
        const numTransition = 60;
        for (let i = 1; i <= numTransition; i++) {
            const t = i / numTransition;
            const currentAngle = angleRad - t * angleDelta; // sweeps from inrunAngle to tableAngle

            // Position along the arc relative to the transition start
            const dx = transitionRadius * (Math.sin(angleRad) - Math.sin(currentAngle));
            const dy = transitionRadius * (Math.cos(currentAngle) - Math.cos(angleRad));

            this._inrunPoints.push({
                x: transStartX + dx,
                y: transStartY + dy,
            });
        }
    }

    /**
     * Table (hoppkant): short section at tableAngle going from the end of the
     * inrun transition to the origin (0, 0).
     */
    _generateTable() {
        const tableRad = this.tableAngle * DEG_TO_RAD;
        const tableDx = this.tableLength * Math.cos(tableRad);
        const tableDy = this.tableLength * Math.sin(tableRad);

        const numTable = 10;
        for (let i = 0; i <= numTable; i++) {
            const t = i / numTable;
            this._tablePoints.push({
                x: -tableDx + t * tableDx,
                y: -tableDy + t * tableDy,
            });
        }
    }

    /**
     * Landing slope (unnarenn): a smooth curve from the table edge downward,
     * modelled as a quadratic/cubic bezier that:
     *   - starts at (0, 0) heading at landingAngle below horizontal
     *   - reaches the K-point at the configured distance
     *   - continues to the HS point
     *   - gradually flattens toward the outrun
     *
     * The profile is generated with a parametric approach: the slope angle
     * increases quickly after the lip, reaches a maximum (landingAngle) near
     * the steepest part, then decreases toward zero at the outrun.
     */
    _generateLanding() {
        const landRad = this.landingAngle * DEG_TO_RAD;
        const steep = this.landingSteepness; // controls how aggressively the curve steepens

        // We'll map horizontal distance d to a slope angle theta(d) using a
        // smooth function. The K-point lies at a specific horizontal distance;
        // we need to figure out where that is.
        //
        // On a real hill the "K-point distance" is measured along the hill
        // surface from the table edge. We approximate the horizontal component.
        //
        // The landing profile follows: y(x) = a*x^2 + b*x
        // At x=0: y=0, slope = b (= tan(tableAngle) provides continuity, but
        // the lip creates a break so the landing slope starts fresh).
        //
        // We use a piecewise model:
        //   Phase 1 (0 to K-point): parabolic drop
        //   Phase 2 (K-point to HS): continuing curve
        //   Phase 3 (HS to flat): transition to flat

        // K-point horizontal distance: the "kPoint" value is roughly the
        // distance along the slope. We convert to horizontal.
        const kSlope = this.kPoint;
        const hsSlope = this.hillSize;

        // Average angle for K-point distance -> horizontal projection
        const avgAngleK = landRad * 0.55;
        const kHoriz = kSlope * Math.cos(avgAngleK);
        const avgAngleHS = landRad * 0.50;
        const hsHoriz = hsSlope * Math.cos(avgAngleHS);

        // Build the landing profile using a smooth angle function.
        // theta(d) = landingAngle * f(d), where f rises from 0 to 1 near the
        // steepest part then falls back to 0.
        //
        // We use: theta(d) = A * d * exp(-B * d) -- a Rayleigh-like shape that
        // peaks at d = 1/B, then decays.

        // The peak angle should be near landingAngle and occur around 40-60% of kHoriz.
        const peakDist = kHoriz * 0.5;
        const B = 1 / peakDist;
        // At peak: theta_max = A * peakDist * exp(-1) => A = theta_max * e / peakDist
        const peakAngle = landRad * (1 + steep * 0.3);
        const A = (peakAngle * Math.E) / peakDist;

        // Total horizontal extent of the landing slope: from 0 to a distance
        // well past HS where the slope is essentially flat.
        const totalDist = hsHoriz * 1.3;

        const numLanding = 200;
        let prevX = 0;
        let prevY = 0;

        this._landingPoints.push({ x: 0, y: 0 });

        // Store K and HS positions
        this._kPointPos = null;
        this._hsPointPos = null;

        let cumulativeDist = 0;

        for (let i = 1; i <= numLanding; i++) {
            const d = (i / numLanding) * totalDist;
            const stepSize = totalDist / numLanding;

            // Angle at this horizontal distance
            const theta = A * d * Math.exp(-B * d);

            const dx = stepSize;
            const dy = Math.tan(theta) * dx;

            const x = prevX + dx;
            const y = prevY + dy;

            // Track cumulative surface distance for K-point / HS detection
            cumulativeDist += Math.sqrt(dx * dx + dy * dy);

            this._landingPoints.push({ x, y });

            if (this._kPointPos === null && cumulativeDist >= kSlope) {
                this._kPointPos = { x, y };
            }
            if (this._hsPointPos === null && cumulativeDist >= hsSlope) {
                this._hsPointPos = { x, y };
            }

            prevX = x;
            prevY = y;
        }

        // Fallback in case cumulative distance never reached targets
        if (!this._kPointPos) {
            this._kPointPos = this._landingPoints[Math.floor(numLanding * 0.7)];
        }
        if (!this._hsPointPos) {
            this._hsPointPos = this._landingPoints[Math.floor(numLanding * 0.85)];
        }

        this._landingEnd = { x: prevX, y: prevY };
    }

    /**
     * Outrun (sletta): flat section for deceleration, transitioning smoothly
     * from the landing slope angle to horizontal.
     */
    _generateOutrun() {
        const startX = this._landingEnd.x;
        const startY = this._landingEnd.y;

        // Current slope angle at the end of landing
        const lastLanding = this._landingPoints;
        const n = lastLanding.length;
        const dx0 = lastLanding[n - 1].x - lastLanding[n - 2].x;
        const dy0 = lastLanding[n - 1].y - lastLanding[n - 2].y;
        const endAngle = Math.atan2(dy0, dx0);

        // Transition from endAngle to 0 over a curve, then flat
        const transitionLength = this.flatLength * 0.3;
        const flatLength = this.flatLength * 0.7;

        const numTransition = 30;
        let x = startX;
        let y = startY;

        for (let i = 1; i <= numTransition; i++) {
            const t = i / numTransition;
            // Smoothly reduce angle to zero using cosine interpolation
            const angle = endAngle * (1 - t) * (1 - t); // quadratic ease-out
            const step = transitionLength / numTransition;
            const sdx = step * Math.cos(angle);
            const sdy = step * Math.sin(angle);
            x += sdx;
            y += sdy;
            this._outrunPoints.push({ x, y });
        }

        // Flat section at constant y
        const flatY = y;
        const numFlat = 20;
        for (let i = 1; i <= numFlat; i++) {
            const t = i / numFlat;
            this._outrunPoints.push({
                x: x + t * flatLength,
                y: flatY,
            });
        }
    }

    // ----------------------------------------------------------------
    // Public accessors
    // ----------------------------------------------------------------

    /**
     * Returns the full hill profile as an array of {x, y} points, from the
     * top of the inrun all the way to the end of the outrun.
     */
    getProfile() {
        return [
            ...this._inrunPoints,
            ...this._tablePoints,
            ...this._landingPoints,
            ...this._outrunPoints,
        ];
    }

    /** Points for the inrun section (includes transition curve). */
    getInrunPoints() {
        return [...this._inrunPoints, ...this._tablePoints];
    }

    /** Points for the landing slope (unnarenn) and outrun. */
    getLandingPoints() {
        return [...this._landingPoints, ...this._outrunPoints];
    }

    /**
     * Returns the y-coordinate of the hill surface at a given horizontal
     * distance from takeoff. Used for landing detection.
     * @param {number} distance - horizontal distance from takeoff (positive = downhill)
     * @returns {number} y-coordinate of the hill surface
     */
    getHeightAtDistance(distance) {
        const points = distance < 0
            ? [...this._inrunPoints, ...this._tablePoints]
            : [...this._landingPoints, ...this._outrunPoints];

        // Find the two bracketing points
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];

            if ((p0.x <= distance && p1.x >= distance) ||
                (p0.x >= distance && p1.x <= distance)) {
                // Linear interpolation
                const segDx = p1.x - p0.x;
                if (Math.abs(segDx) < 1e-9) return p0.y;
                const t = (distance - p0.x) / segDx;
                return p0.y + t * (p1.y - p0.y);
            }
        }

        // Extrapolate from the last point if beyond the profile
        const last = points[points.length - 1];
        return last ? last.y : 0;
    }

    /**
     * Returns the slope angle (in degrees) at a given horizontal distance
     * from takeoff. Positive angle = slope going downward.
     * @param {number} distance - horizontal distance from takeoff
     * @returns {number} slope angle in degrees
     */
    getAngleAtDistance(distance) {
        const points = distance < 0
            ? [...this._inrunPoints, ...this._tablePoints]
            : [...this._landingPoints, ...this._outrunPoints];

        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];

            if ((p0.x <= distance && p1.x >= distance) ||
                (p0.x >= distance && p1.x <= distance)) {
                const dx = p1.x - p0.x;
                const dy = p1.y - p0.y;
                return Math.atan2(dy, dx) / DEG_TO_RAD;
            }
        }

        return 0;
    }

    /**
     * Returns the {x, y} position of the K-point on the landing slope.
     */
    getKPointPosition() {
        return { ...this._kPointPos };
    }

    /**
     * Returns the {x, y} position of the HS (hill size) point.
     */
    getHSPointPosition() {
        return { ...this._hsPointPos };
    }
}
