/**
 * SkihoppPhysics.js - Physics simulation for the ski jumping event
 *
 * Handles the full jump lifecycle: INRUN -> TAKEOFF -> FLIGHT -> LANDING.
 * Each phase has its own update logic driven by the current GameState.
 *
 * Coordinate system matches Hill.js:
 *   Origin (0,0) at the table edge (takeoff point).
 *   Positive x = downhill (landing area).
 *   Positive y = downward.
 */

import { Vec2, GRAVITY, clamp, degToRad, radToDeg } from '../../core/Physics.js';
import { GameState } from '../../core/Game.js';

// ---------------------------------------------------------------------------
// Default jumper state factory
// ---------------------------------------------------------------------------

function createJumperState() {
    return {
        // World position (meters, relative to takeoff origin)
        x: 0,
        y: 0,

        // Velocity components (used during FLIGHT)
        vx: 0,
        vy: 0,

        // Scalar speed (used during INRUN / TAKEOFF)
        speed: 0,

        // Body angle in degrees (relative to horizontal, positive = nose down)
        bodyAngle: 0,

        // Distance along the inrun remaining to the table edge (decreases to 0)
        distance: 0,

        // Current phase string (mirrors GameState for convenience)
        phase: GameState.INRUN,

        // Takeoff quality set by controls (0-1, 1 = perfect)
        takeoffQuality: 0,

        // Landing results
        landingDistance: 0,
        landingQuality: 0,
    };
}

// ---------------------------------------------------------------------------
// SkihoppPhysics
// ---------------------------------------------------------------------------

export default class SkihoppPhysics {
    /**
     * @param {import('../../core/Game.js').Game} game  - game engine reference
     * @param {import('./Hill.js').default}        hill  - Hill instance
     * @param {object} [jumperState]                     - optional external state
     */
    constructor(game, hill, jumperState) {
        this.game = game;
        this.hill = hill;
        this.jumper = jumperState || createJumperState();

        // Cache config sections (fall back to sensible defaults)
        const cfg = (game.config && game.config.skihopp) || {};
        this.cfgInrun    = cfg.inrun    || {};
        this.cfgTakeoff  = cfg.takeoff  || {};
        this.cfgFlight   = cfg.flight   || {};
        this.cfgLanding  = cfg.landing  || {};

        // Internal bookkeeping
        this._takeoffTimer = 0;       // seconds elapsed in TAKEOFF phase
        this._takeoffDuration = 0.3;  // seconds the TAKEOFF phase lasts
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    /**
     * Convenience factory — matches the pattern used by Game.setScene().
     * Returns a fully wired SkihoppPhysics instance.
     */
    static init(game, hill) {
        const state = createJumperState();
        return new SkihoppPhysics(game, hill, state);
    }

    /** Alternative instance-level init matching the spec. */
    init(game, hill) {
        this.game = game;
        this.hill = hill;
        this.jumper = createJumperState();

        const cfg = (game.config && game.config.skihopp) || {};
        this.cfgInrun   = cfg.inrun   || {};
        this.cfgTakeoff = cfg.takeoff || {};
        this.cfgFlight  = cfg.flight  || {};
        this.cfgLanding = cfg.landing || {};

        this._takeoffTimer = 0;
        this._resetInrun();
    }

    /**
     * Main update tick — delegates to the correct phase handler.
     * @param {number} dt - fixed timestep in seconds
     */
    update(dt) {
        const state = this.game.getState();

        switch (state) {
            case GameState.INRUN:
                this._updateInrun(dt);
                break;
            case GameState.TAKEOFF:
                this._updateTakeoff(dt);
                break;
            case GameState.FLIGHT:
                this._updateFlight(dt);
                break;
            case GameState.LANDING:
                this._updateLanding(dt);
                break;
            default:
                // Other states (MENU, SCORE, etc.) — nothing to simulate
                break;
        }

        // Keep phase string in sync for external consumers
        this.jumper.phase = state;
    }

    /**
     * Reset the jumper to the top of the inrun, ready for a new jump.
     */
    reset() {
        Object.assign(this.jumper, createJumperState());
        this._takeoffTimer = 0;
        this._resetInrun();
    }

    // ------------------------------------------------------------------
    // INRUN
    // ------------------------------------------------------------------

    /** Place the jumper at the start of the inrun. */
    _resetInrun() {
        // Distance is the full inrun length (positive = meters remaining to table)
        const inrunLength = this.hill.inrunLength || 100;
        this.jumper.distance = inrunLength;
        this.jumper.speed = 0;

        // Position the jumper on the hill surface at the start
        this._syncPositionToInrun();
    }

    _updateInrun(dt) {
        const j = this.jumper;
        const friction = this.cfgInrun.friction || 0.02;
        const maxSpeed = this.cfgInrun.maxSpeed || 92;

        // Slope angle at current position (distance remaining, mapped to
        // a negative x relative to takeoff)
        const xOnHill = -j.distance;
        const slopeAngle = degToRad(Math.abs(this.hill.getAngleAtDistance(xOnHill)));

        // Acceleration = gravity component along slope minus friction drag
        const a = GRAVITY * Math.sin(slopeAngle) - friction * j.speed;
        j.speed += a * dt;
        j.speed = clamp(j.speed, 0, maxSpeed);

        // Reduce remaining distance
        j.distance -= j.speed * dt;

        if (j.distance <= 0) {
            j.distance = 0;
            // Place jumper at the table edge origin
            j.x = 0;
            j.y = 0;
            // Transition to TAKEOFF
            this.game.setState(GameState.TAKEOFF);
            this._takeoffTimer = 0;
            return;
        }

        this._syncPositionToInrun();
    }

    /** Update jumper x/y to match their inrun distance position. */
    _syncPositionToInrun() {
        const xOnHill = -this.jumper.distance;
        this.jumper.x = xOnHill;
        this.jumper.y = this.hill.getHeightAtDistance(xOnHill);

        // Align body angle to slope
        this.jumper.bodyAngle = this.hill.getAngleAtDistance(xOnHill);
    }

    // ------------------------------------------------------------------
    // TAKEOFF
    // ------------------------------------------------------------------

    _updateTakeoff(dt) {
        const j = this.jumper;
        this._takeoffTimer += dt;

        if (this._takeoffTimer >= this._takeoffDuration) {
            // Compute launch parameters based on takeoff quality (set by controls)
            const quality = clamp(j.takeoffQuality, 0, 1);
            const tableAngle = degToRad(this.hill.tableAngle || 11);

            // Speed modification — better timing preserves more speed
            const launchSpeed = j.speed * (0.8 + 0.2 * quality);

            // Flight angle — table angle plus an upward boost for good timing
            // Upward = more negative y component, so we subtract the boost from
            // the table angle (table angle is positive = nose down toward landing)
            const boostDeg = quality * 5;
            const launchAngle = tableAngle - degToRad(boostDeg);

            // Convert to velocity components
            j.vx = launchSpeed * Math.cos(launchAngle);
            j.vy = launchSpeed * Math.sin(launchAngle);

            // Position at the table edge
            j.x = 0;
            j.y = 0;

            // Set body angle to launch angle
            j.bodyAngle = radToDeg(launchAngle);

            // Transition to FLIGHT
            this.game.setState(GameState.FLIGHT);
        }
    }

    // ------------------------------------------------------------------
    // FLIGHT
    // ------------------------------------------------------------------

    _updateFlight(dt) {
        const j = this.jumper;
        const cfg = this.cfgFlight;

        const liftCoeff   = cfg.liftCoefficient  || 0.4;
        const dragCoeff   = cfg.dragCoefficient   || 0.15;
        const optimalAngle = degToRad(cfg.optimalAngle || 35);
        const windEffect  = cfg.windEffect        || 0.3;

        // Current velocity vector
        const vel = new Vec2(j.vx, j.vy);
        const speed = vel.length();
        if (speed < 0.01) {
            // Basically stalled — just drop
            j.vy += GRAVITY * dt;
            j.y += j.vy * dt;
            this._checkLanding();
            return;
        }

        const velDir = vel.normalize();

        // Velocity direction angle (radians, relative to horizontal)
        const velAngle = Math.atan2(j.vy, j.vx);

        // Body angle in radians
        const bodyRad = degToRad(j.bodyAngle);

        // Angle of attack: difference between body orientation and velocity direction
        // Positive AoA = body pitched up relative to movement
        const aoa = bodyRad - velAngle;

        // ---- Forces ----

        // 1. Gravity (acts straight down, +y)
        let ax = 0;
        let ay = GRAVITY;

        // 2. Drag — opposes velocity, proportional to v^2
        //    Drag increases when body angle deviates from the velocity direction
        const dragAngleFactor = 1.0 + 0.5 * Math.abs(aoa);
        const dragMagnitude = dragCoeff * speed * speed * dragAngleFactor;
        ax -= velDir.x * dragMagnitude;
        ay -= velDir.y * dragMagnitude;

        // 3. Lift — perpendicular to velocity (upward component)
        //    Depends on how close the angle of attack is to the optimal angle.
        //    Lift direction: rotate velocity direction 90 degrees "upward"
        //    (i.e., perpendicular, pointing away from the ground).
        const liftDir = new Vec2(-velDir.y, velDir.x); // 90° CCW of velocity

        // Lift effectiveness: peaks at optimal AoA, drops off on either side
        const aoaDiff = Math.abs(aoa - optimalAngle);
        const liftEfficiency = Math.max(0, 1.0 - (aoaDiff / optimalAngle));
        const liftMagnitude = liftCoeff * speed * speed * liftEfficiency;

        // Lift should push the jumper "up" (negative y). If liftDir.y > 0
        // we need to flip it so it acts upward.
        const liftSign = liftDir.y <= 0 ? 1 : -1;
        ax += liftDir.x * liftMagnitude * liftSign;
        ay += liftDir.y * liftMagnitude * liftSign;

        // 4. Wind — simple horizontal force
        // Wind value can be set externally on the jumper (j.wind), defaulting to 0.
        const wind = j.wind || 0;
        ax += wind * windEffect;

        // ---- Integration (semi-implicit Euler) ----
        j.vx += ax * dt;
        j.vy += ay * dt;
        j.x  += j.vx * dt;
        j.y  += j.vy * dt;

        // Update scalar speed for UI / telemetry
        j.speed = new Vec2(j.vx, j.vy).length();

        // ---- Landing detection ----
        this._checkLanding();
    }

    _checkLanding() {
        const j = this.jumper;

        // Only check on the landing slope (positive x)
        if (j.x <= 0) return;

        const hillY = this.hill.getHeightAtDistance(j.x);
        if (j.y >= hillY) {
            // Jumper has reached or crossed the hill surface

            // Snap to the surface
            j.y = hillY;

            // Record landing distance (horizontal from takeoff)
            j.landingDistance = j.x;

            // Calculate landing quality based on angle matching
            // Compare trajectory angle with hill slope angle
            const trajectoryAngle = radToDeg(Math.atan2(j.vy, j.vx));
            const hillAngle = this.hill.getAngleAtDistance(j.x);
            const angleDiff = Math.abs(trajectoryAngle - hillAngle);

            // Perfect match (0 diff) = quality 1.0, 30+ degrees off = 0
            j.landingQuality = clamp(1.0 - angleDiff / 30, 0, 1);

            // Transition to LANDING state
            this.game.setState(GameState.LANDING);
        }
    }

    // ------------------------------------------------------------------
    // LANDING (outrun deceleration)
    // ------------------------------------------------------------------

    _updateLanding(dt) {
        const j = this.jumper;

        // Deceleration on the outrun
        const deceleration = 8; // m/s^2 — aggressive braking on the flat
        const slopeAngle = degToRad(this.hill.getAngleAtDistance(j.x));

        // Speed along the slope, decreasing
        if (j.speed > 0) {
            // Gravity component along slope aids or resists depending on direction
            const gravComponent = GRAVITY * Math.sin(slopeAngle);
            j.speed += (gravComponent - deceleration) * dt;
            j.speed = Math.max(j.speed, 0);
        }

        // Move along the hill surface
        if (j.speed > 0) {
            j.x  += j.speed * Math.cos(slopeAngle) * dt;
            j.y   = this.hill.getHeightAtDistance(j.x);
            j.vx  = j.speed * Math.cos(slopeAngle);
            j.vy  = j.speed * Math.sin(slopeAngle);
        } else {
            j.vx = 0;
            j.vy = 0;
        }

        // Align body angle to slope during outrun
        j.bodyAngle = this.hill.getAngleAtDistance(j.x);
    }
}
