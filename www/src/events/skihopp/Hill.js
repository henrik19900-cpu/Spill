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
        this._normals = [];  // surface normal vectors parallel to landing/outrun points

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
        this._computeNormals();
    }

    /**
     * Inrun: straight slope coming down at inrunAngle, ending with a smooth
     * circular-arc transition into the table. The transition radius is chosen
     * so the curvature feels natural (~80-120 m on large hills).
     */
    _generateInrun() {
        const angleRad = this.inrunAngle * DEG_TO_RAD;
        const tableRad = this.tableAngle * DEG_TO_RAD;

        // Transition curve radius - sized for a natural feel.
        // Real hills use ~80-120m radius; we use 0.7 * inrunLength to keep
        // the transition compact so the jumper spends more distance on the
        // steep straight section and reaches higher speed.
        const transitionRadius = this.inrunLength * 0.7;

        // Angular span the transition must cover
        const angleDelta = angleRad - tableRad;

        // Horizontal / vertical extent of the transition arc
        const transitionDx = transitionRadius * (Math.sin(angleRad) - Math.sin(tableRad));
        const transitionDy = transitionRadius * (Math.cos(tableRad) - Math.cos(angleRad));

        // The transition ends at the start of the table. The table starts at
        // x = -tableLength * cos(tableAngle), y = -tableLength * sin(tableAngle)
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

        // Store inrun start for public accessor
        this._inrunStartPos = { x: straightStartX, y: straightStartY };

        // --- Generate straight section points (more detail) ---
        const numStraight = 80;
        for (let i = 0; i <= numStraight; i++) {
            const t = i / numStraight;
            this._inrunPoints.push({
                x: straightStartX + t * (transStartX - straightStartX),
                y: straightStartY + t * (transStartY - straightStartY),
            });
        }

        // --- Generate transition curve points (high detail for smoothness) ---
        const numTransition = 120;
        for (let i = 1; i <= numTransition; i++) {
            const t = i / numTransition;
            const currentAngle = angleRad - t * angleDelta;

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

        const numTable = 20;
        for (let i = 0; i <= numTable; i++) {
            const t = i / numTable;
            this._tablePoints.push({
                x: -tableDx + t * tableDx,
                y: -tableDy + t * tableDy,
            });
        }
    }

    /**
     * Landing slope (unnarenn): realistic ski jump landing profile.
     *
     * Real ski jump geometry: the landing slope starts steep (matching
     * the trajectory of the jumper leaving the table), reaches maximum
     * steepness around 40-60% of K-point distance, then gradually
     * flattens toward the outrun. The profile uses a piecewise model:
     *
     *   Phase 1 (0 to K-point): steep and getting steeper - modeled
     *     with an angle that rises via smooth cubic interpolation.
     *   Phase 2 (K-point to HS): still steep but beginning to flatten.
     *   Phase 3 (HS to outrun): transition to flat via circular arc.
     *
     * K-point and HS-point are placed by measuring cumulative surface
     * distance from the table edge.
     */
    _generateLanding() {
        const landRad = this.landingAngle * DEG_TO_RAD;
        const steep = this.landingSteepness;

        const kSlope = this.kPoint;
        const hsSlope = this.hillSize;

        // We model the slope angle theta as a function of cumulative
        // surface distance s. The angle profile:
        //   - Starts at a small angle (table lip break)
        //   - Rises steeply to a maximum near 50-65% of K distance
        //   - Stays near maximum through K-point
        //   - Gradually decreases past HS toward zero at the outrun

        const initialAngle = this.tableAngle * DEG_TO_RAD * 0.5; // small lip angle
        const maxAngle = landRad * (1.0 + steep * 0.2);          // peak steepness

        // Distance markers for the angle profile
        const peakStart = kSlope * 0.35;   // angle ramps up to here
        const peakEnd = kSlope * 0.75;     // angle starts declining here
        const flatStart = hsSlope * 1.25;  // angle reaches ~0 here

        // Total surface distance to generate
        const totalSurfaceDist = hsSlope * 1.35;

        // Number of landing points (high detail)
        const numLanding = 400;
        const stepSize = totalSurfaceDist / numLanding;

        let x = 0;
        let y = 0;
        this._landingPoints.push({ x: 0, y: 0 });

        this._kPointPos = null;
        this._hsPointPos = null;

        let cumulativeDist = 0;

        for (let i = 1; i <= numLanding; i++) {
            cumulativeDist = i * stepSize;

            // Compute slope angle at this surface distance
            let theta;
            if (cumulativeDist <= peakStart) {
                // Phase 1a: ramp up from initial angle to max angle
                const t = cumulativeDist / peakStart;
                // Smooth cubic ease-in
                const s = t * t * (3 - 2 * t);
                theta = initialAngle + (maxAngle - initialAngle) * s;
            } else if (cumulativeDist <= peakEnd) {
                // Phase 1b: hold near max angle (slight plateau)
                const t = (cumulativeDist - peakStart) / (peakEnd - peakStart);
                // Very gentle decline: stay within 95-100% of max
                theta = maxAngle * (1.0 - 0.05 * t);
            } else if (cumulativeDist <= flatStart) {
                // Phase 2: decline from near-max to near-zero
                const t = (cumulativeDist - peakEnd) / (flatStart - peakEnd);
                // Smooth cosine-based ease-out
                const s = 0.5 * (1 - Math.cos(Math.PI * t));
                const endAngle = maxAngle * 0.02; // nearly flat
                theta = maxAngle * 0.95 * (1 - s) + endAngle * s;
            } else {
                // Phase 3: essentially flat (tiny residual slope)
                const overshoot = (cumulativeDist - flatStart) / (totalSurfaceDist - flatStart);
                theta = maxAngle * 0.02 * Math.max(0, 1 - overshoot);
            }

            // Step along the surface at angle theta
            const dx = stepSize * Math.cos(theta);
            const dy = stepSize * Math.sin(theta);
            x += dx;
            y += dy;

            this._landingPoints.push({ x, y });

            // Detect K-point and HS-point by cumulative surface distance
            if (this._kPointPos === null && cumulativeDist >= kSlope) {
                this._kPointPos = { x, y };
            }
            if (this._hsPointPos === null && cumulativeDist >= hsSlope) {
                this._hsPointPos = { x, y };
            }
        }

        // Fallback in case cumulative distance never reached targets
        if (!this._kPointPos) {
            const idx = Math.min(
                Math.floor((kSlope / totalSurfaceDist) * numLanding),
                numLanding
            );
            this._kPointPos = { ...this._landingPoints[idx] };
        }
        if (!this._hsPointPos) {
            const idx = Math.min(
                Math.floor((hsSlope / totalSurfaceDist) * numLanding),
                numLanding
            );
            this._hsPointPos = { ...this._landingPoints[idx] };
        }

        this._landingEnd = { x, y };
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
        const transitionLength = this.flatLength * 0.35;
        const flatLength = this.flatLength * 0.65;

        const numTransition = 60;
        let x = startX;
        let y = startY;

        for (let i = 1; i <= numTransition; i++) {
            const t = i / numTransition;
            // Smooth cosine ease-out for angle reduction
            const ease = 0.5 * (1 - Math.cos(Math.PI * t));
            const angle = endAngle * (1 - ease);
            const step = transitionLength / numTransition;
            const sdx = step * Math.cos(angle);
            const sdy = step * Math.sin(angle);
            x += sdx;
            y += sdy;
            this._outrunPoints.push({ x, y });
        }

        // Flat section at constant y
        const flatY = y;
        const numFlat = 40;
        for (let i = 1; i <= numFlat; i++) {
            const t = i / numFlat;
            this._outrunPoints.push({
                x: x + t * flatLength,
                y: flatY,
            });
        }

        this._outrunEndPos = { x: x + flatLength, y: flatY };
    }

    /**
     * Compute surface normal vectors for the landing slope and outrun.
     * Each normal points "upward" (away from the hill surface), which is
     * used for proper landing angle calculation. Normals are stored as
     * unit vectors {nx, ny} in a parallel array to landing+outrun points.
     */
    _computeNormals() {
        const points = [...this._landingPoints, ...this._outrunPoints];
        this._normals = [];

        for (let i = 0; i < points.length; i++) {
            let dx, dy;
            if (i === 0) {
                dx = points[1].x - points[0].x;
                dy = points[1].y - points[0].y;
            } else if (i === points.length - 1) {
                dx = points[i].x - points[i - 1].x;
                dy = points[i].y - points[i - 1].y;
            } else {
                // Central difference for smoother normals
                dx = points[i + 1].x - points[i - 1].x;
                dy = points[i + 1].y - points[i - 1].y;
            }

            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1e-12) {
                this._normals.push({ nx: 0, ny: -1 });
            } else {
                // Normal is perpendicular to tangent, pointing "up" (negative y)
                // Tangent = (dx, dy), normal = (-dy, dx) then normalize
                // Since y-positive is down, "up" normal should have negative ny
                let nx = -dy / len;
                let ny = dx / len;
                // Ensure normal points upward (ny < 0 in our coord system)
                if (ny > 0) { nx = -nx; ny = -ny; }
                this._normals.push({ nx, ny });
            }
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

    /**
     * Returns the total profile with inrun points having negative x values,
     * suitable for rendering the complete hill from start to finish.
     */
    getTotalProfile() {
        return this.getProfile();
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
     * Returns the {x, y} position of the top of the inrun (start gate area).
     */
    getInrunStartPosition() {
        return { ...this._inrunStartPos };
    }

    /**
     * Returns the {x, y} position at the very end of the outrun.
     */
    getOutrunEndPosition() {
        return { ...this._outrunEndPos };
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
     * Returns the surface normal vector {nx, ny} at a given horizontal
     * distance from takeoff. The normal points away from the hill surface
     * (upward). Used for computing proper landing angles.
     * @param {number} distance - horizontal distance from takeoff (positive = downhill)
     * @returns {{nx: number, ny: number}} unit normal vector
     */
    getNormalAtDistance(distance) {
        const points = [...this._landingPoints, ...this._outrunPoints];

        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];

            if (p0.x <= distance && p1.x >= distance) {
                const segDx = p1.x - p0.x;
                if (Math.abs(segDx) < 1e-9) return this._normals[i];
                const t = (distance - p0.x) / segDx;
                // Interpolate between adjacent normals
                const n0 = this._normals[i];
                const n1 = this._normals[i + 1];
                if (!n0 || !n1) return { nx: 0, ny: -1 };
                const nx = n0.nx + t * (n1.nx - n0.nx);
                const ny = n0.ny + t * (n1.ny - n0.ny);
                const len = Math.sqrt(nx * nx + ny * ny);
                return len > 1e-12 ? { nx: nx / len, ny: ny / len } : { nx: 0, ny: -1 };
            }
        }

        return { nx: 0, ny: -1 };
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

    /**
     * Compute {x, y} position along the inrun at a given distance from
     * the top. Distance is measured along the surface from the inrun start.
     * @param {number} distance - surface distance from the top of the inrun
     * @returns {{x: number, y: number}} position on the inrun
     */
    getPositionAlongInrun(distance) {
        const points = [...this._inrunPoints, ...this._tablePoints];
        let cumDist = 0;

        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x;
            const dy = points[i].y - points[i - 1].y;
            const segLen = Math.sqrt(dx * dx + dy * dy);

            if (cumDist + segLen >= distance) {
                const remain = distance - cumDist;
                const t = segLen > 1e-12 ? remain / segLen : 0;
                return {
                    x: points[i - 1].x + t * dx,
                    y: points[i - 1].y + t * dy,
                };
            }

            cumDist += segLen;
        }

        // Past the end - return last point (table edge)
        const last = points[points.length - 1];
        return { x: last.x, y: last.y };
    }

    /**
     * Returns the cumulative surface distance along the landing slope at a
     * given horizontal x-coordinate. Used to convert horizontal landing
     * position to the official "distance" measurement (surface distance
     * from takeoff).
     * @param {number} xPos - horizontal distance from takeoff
     * @returns {number} surface distance in meters
     */
    getSurfaceDistanceAtX(xPos) {
        const points = [...this._landingPoints, ...this._outrunPoints];
        let cumDist = 0;

        for (let i = 1; i < points.length; i++) {
            const p0 = points[i - 1];
            const p1 = points[i];

            if ((p0.x <= xPos && p1.x >= xPos) ||
                (p0.x >= xPos && p1.x <= xPos)) {
                const segDx = p1.x - p0.x;
                const segDy = p1.y - p0.y;
                const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
                const t = Math.abs(segDx) > 1e-9 ? (xPos - p0.x) / segDx : 0;
                return cumDist + t * segLen;
            }

            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            cumDist += Math.sqrt(dx * dx + dy * dy);
        }

        return cumDist;
    }

    /**
     * Returns the total surface length of the inrun (from start to table edge).
     */
    getInrunSurfaceLength() {
        const points = [...this._inrunPoints, ...this._tablePoints];
        let total = 0;
        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x;
            const dy = points[i].y - points[i - 1].y;
            total += Math.sqrt(dx * dx + dy * dy);
        }
        return total;
    }
}
