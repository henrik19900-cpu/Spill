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

import { Vec2, GRAVITY, clamp, lerp, degToRad, radToDeg, smoothstep, turbulenceNoise } from '../../core/Physics.js';
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

        // --- New fields for improved physics ---

        // Camera shake / vibration intensity (0-1, driven by inrun speed)
        vibration: 0,

        // Impact force at landing (m/s perpendicular to slope — used for style scoring)
        impactForce: 0,

        // Current turbulence offset applied (so renderer can visualize it)
        turbulenceX: 0,
        turbulenceY: 0,

        // Wind value (m/s, positive = headwind, negative = tailwind)
        wind: 0,

        // Accumulated flight time (seconds, used for turbulence seed)
        flightTime: 0,
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
        this._takeoffDuration = 0.25; // seconds the TAKEOFF phase lasts
        this._inrunTime = 0;          // accumulated inrun time for vibration
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
        this._inrunTime = 0;
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
        this._inrunTime = 0;
        this._resetInrun();
    }

    // ------------------------------------------------------------------
    // INRUN — Improved with natural acceleration curve and vibration
    // ------------------------------------------------------------------

    /** Place the jumper at the start of the inrun. */
    _resetInrun() {
        const inrunLength = this.hill.inrunLength || 100;
        this.jumper.distance = inrunLength;
        this.jumper.speed = 0;
        this._inrunTime = 0;
        this._syncPositionToInrun();
    }

    _updateInrun(dt) {
        const j = this.jumper;
        this._inrunTime += dt;

        const friction     = this.cfgInrun.friction   || 0.02;
        const maxSpeed     = this.cfgInrun.maxSpeed    || 26;   // m/s (~93.6 km/h)

        // Slope angle at current position
        const xOnHill = -j.distance;
        const slopeAngle = degToRad(Math.abs(this.hill.getAngleAtDistance(xOnHill)));

        // --- Natural acceleration with quadratic air resistance ---
        // Gravity component along slope
        const gravityPull = GRAVITY * Math.sin(slopeAngle);

        // Friction: linear (ski friction) + quadratic (air drag) for natural speed curve
        const airDragCoeff = 0.005;  // small air drag on inrun
        const totalDrag = friction * GRAVITY * Math.cos(slopeAngle) + airDragCoeff * j.speed * j.speed;

        const a = gravityPull - totalDrag;
        j.speed += a * dt;
        j.speed = clamp(j.speed, 0, maxSpeed);

        // --- Vibration / camera shake at high speed ---
        // Starts becoming noticeable above 60% max speed, peaks at max speed
        const speedRatio = j.speed / maxSpeed;
        const vibrationOnset = 0.6;
        if (speedRatio > vibrationOnset) {
            const vibrationT = (speedRatio - vibrationOnset) / (1.0 - vibrationOnset);
            j.vibration = smoothstep(vibrationT) * 0.8; // 0-0.8 range
        } else {
            j.vibration = 0;
        }

        // Reduce remaining distance
        j.distance -= j.speed * dt;

        if (j.distance <= 0) {
            j.distance = 0;
            j.x = 0;
            j.y = 0;
            j.vibration = 0; // kill vibration at transition
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
        this.jumper.bodyAngle = this.hill.getAngleAtDistance(xOnHill);
    }

    // ------------------------------------------------------------------
    // TAKEOFF — Powerful launch with quality-based upward boost
    // ------------------------------------------------------------------

    _updateTakeoff(dt) {
        const j = this.jumper;
        this._takeoffTimer += dt;

        // Smooth progress through the takeoff phase (0 -> 1)
        const progress = clamp(this._takeoffTimer / this._takeoffDuration, 0, 1);

        // During takeoff, the jumper rises slightly off the table via an upward
        // impulse. Use smoothstep so the transition is smooth, not jarring.
        const eased = smoothstep(progress);

        // Blend table position toward launch position
        const tableAngleRad = degToRad(this.hill.tableAngle || 11);
        j.x = lerp(-0.5, 0, eased);  // slide forward along the table
        j.y = lerp(this.hill.getHeightAtDistance(-0.5), 0, eased);

        // Body angle: smoothly pitch from inrun angle toward launch angle
        const quality = clamp(j.takeoffQuality, 0, 1);
        const boostDeg = quality * 6;  // perfect timing -> 6 degrees upward boost
        const targetBodyAngle = radToDeg(tableAngleRad) - boostDeg;
        const inrunAngle = this.hill.getAngleAtDistance(-1) || radToDeg(tableAngleRad);
        j.bodyAngle = lerp(inrunAngle, targetBodyAngle, eased);

        if (progress >= 1.0) {
            // --- Compute launch parameters ---

            // Speed modification: perfect timing preserves ~97% of speed; poor ~82%
            const speedRetention = 0.82 + 0.15 * quality;
            const launchSpeed = j.speed * speedRetention;

            // Launch angle: table angle minus an upward boost for good timing
            const launchAngle = tableAngleRad - degToRad(boostDeg);

            // Upward velocity kick for a "powerful" feel at good timing
            // This adds a small vertical impulse independent of the angle change
            const upwardKick = quality * 1.8; // m/s upward at perfect timing

            // Convert to velocity components
            j.vx = launchSpeed * Math.cos(launchAngle);
            j.vy = launchSpeed * Math.sin(launchAngle) - upwardKick;

            // Position at the table edge
            j.x = 0;
            j.y = 0;

            // Set body angle to launch angle
            j.bodyAngle = radToDeg(launchAngle);

            // Reset flight time
            j.flightTime = 0;

            // Transition to FLIGHT
            this.game.setState(GameState.FLIGHT);
        }
    }

    // ------------------------------------------------------------------
    // FLIGHT — Realistic but fun aerodynamics with turbulence
    // ------------------------------------------------------------------

    _updateFlight(dt) {
        const j = this.jumper;
        const cfg = this.cfgFlight;

        // --- Configurable parameters ---
        const liftCoeff    = cfg.liftCoefficient  || 0.52;
        const dragCoeff    = cfg.dragCoefficient   || 0.11;
        const optimalAngle = degToRad(cfg.optimalAngle || 35);
        const windEffect   = cfg.windEffect        || 0.5;
        const turbStrength = cfg.turbulenceStrength || 0.35;

        // Advance flight clock
        j.flightTime += dt;

        // Current velocity vector
        const vel = new Vec2(j.vx, j.vy);
        const speed = vel.length();
        if (speed < 0.01) {
            j.vy += GRAVITY * dt;
            j.y += j.vy * dt;
            this._checkLanding();
            return;
        }

        const velDir = vel.normalize();

        // Velocity direction angle (radians)
        const velAngle = Math.atan2(j.vy, j.vx);

        // Body angle in radians
        const bodyRad = degToRad(j.bodyAngle);

        // Angle of attack: body orientation minus velocity direction
        const aoa = bodyRad - velAngle;

        // ---- Forces ----

        // 1. Gravity
        let ax = 0;
        let ay = GRAVITY;

        // 2. Drag — opposes velocity, v^2 scaling
        //    Drag penalty grows with AoA deviation from optimal (stall at extremes)
        const aoaAbs = Math.abs(aoa);
        const dragAngleFactor = 1.0 + 0.8 * aoaAbs + 0.3 * aoaAbs * aoaAbs;
        const dragMagnitude = dragCoeff * speed * speed * dragAngleFactor;
        ax -= velDir.x * dragMagnitude;
        ay -= velDir.y * dragMagnitude;

        // 3. Lift — perpendicular to velocity, depends on AoA proximity to optimal
        //    Lift direction: 90 degrees CCW of velocity (points "up" relative to flight path)
        const liftDir = new Vec2(-velDir.y, velDir.x);

        // Lift effectiveness curve: Gaussian-like around optimal AoA
        // Small angle changes near optimal have visible but not catastrophic effects
        const aoaDiff = aoa - optimalAngle;
        const sigma = optimalAngle * 0.7; // width of the lift "sweet spot"
        const liftEfficiency = Math.exp(-(aoaDiff * aoaDiff) / (2 * sigma * sigma));

        // V-style bonus: when near optimal angle, lift is significantly higher
        // This makes the optimal ~35 degree angle give noticeably more distance
        const vStyleBonus = liftEfficiency > 0.8 ? 1.0 + 0.25 * (liftEfficiency - 0.8) / 0.2 : 1.0;

        const liftMagnitude = liftCoeff * speed * speed * liftEfficiency * vStyleBonus;

        // Ensure lift pushes upward (negative y in our coordinate system)
        const liftSign = liftDir.y <= 0 ? 1 : -1;
        ax += liftDir.x * liftMagnitude * liftSign;
        ay += liftDir.y * liftMagnitude * liftSign;

        // 4. Wind — headwind (positive) gives extra lift and slower horizontal,
        //           tailwind (negative) reduces lift and pushes along
        const wind = j.wind || 0;
        // Headwind: increases effective airspeed -> more lift, more drag
        // We model this as a direct horizontal force plus a lift modifier
        const windForce = wind * windEffect;
        ax -= windForce;  // headwind slows horizontal movement
        // Headwind also boosts lift (positive wind = higher, longer jumps)
        const windLiftBoost = wind * 0.15 * speed;
        ay -= windLiftBoost; // upward force from headwind

        // 5. Turbulence — small random perturbations the player must counteract
        //    Intensity builds over flight time (more turbulence further from hill)
        const turbRamp = clamp(j.flightTime / 1.5, 0, 1); // ramps up over 1.5 seconds
        const turbX = turbulenceNoise(j.flightTime, 0) * turbStrength * turbRamp;
        const turbY = turbulenceNoise(j.flightTime, 42.0) * turbStrength * turbRamp * 0.6;
        ax += turbX;
        ay += turbY;
        // Expose turbulence for the renderer
        j.turbulenceX = turbX;
        j.turbulenceY = turbY;

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

    // ------------------------------------------------------------------
    // Landing detection — smooth with interpolated contact and impact force
    // ------------------------------------------------------------------

    _checkLanding() {
        const j = this.jumper;

        // Only check on the landing slope (positive x)
        if (j.x <= 0) return;

        const hillY = this.hill.getHeightAtDistance(j.x);
        if (j.y >= hillY) {
            // --- Interpolate the exact landing point ---
            // Step back to find where the jumper crossed the surface
            // Use previous position (before this frame's integration) for precision
            const prevX = j.x - j.vx * (1 / 60); // approximate previous x
            const prevY = j.y - j.vy * (1 / 60); // approximate previous y
            const prevHillY = this.hill.getHeightAtDistance(prevX);

            // Linear interpolation factor for when jumper crossed the surface
            const above = prevHillY - prevY;   // how far above the surface before
            const below = j.y - hillY;         // how far below the surface after
            const total = above + below;
            const t = total > 0.001 ? above / total : 1.0;

            // Interpolated landing position
            j.x = lerp(prevX, j.x, t);
            j.y = this.hill.getHeightAtDistance(j.x);

            // Interpolated velocity at landing
            // (since we used semi-implicit Euler, velocity is already updated;
            //  we approximate the landing-moment velocity via the same lerp)

            // --- Landing distance ---
            j.landingDistance = j.x;

            // --- Landing quality: angle matching ---
            const trajectoryAngle = radToDeg(Math.atan2(j.vy, j.vx));
            const hillAngle = this.hill.getAngleAtDistance(j.x);
            const angleDiff = Math.abs(trajectoryAngle - hillAngle);

            // Perfect match (0 diff) = 1.0, 25+ degrees off = 0
            j.landingQuality = clamp(1.0 - angleDiff / 25, 0, 1);

            // --- Impact force (perpendicular component of velocity relative to slope) ---
            // Used for style scoring: lower impact = cleaner landing
            const hillAngleRad = degToRad(hillAngle);
            const hillNormal = new Vec2(-Math.sin(hillAngleRad), Math.cos(hillAngleRad));
            const impactVel = new Vec2(j.vx, j.vy);
            // Dot product with hill normal gives the perpendicular impact speed
            j.impactForce = Math.abs(impactVel.dot(hillNormal));

            // Transition to LANDING state
            this.game.setState(GameState.LANDING);
        }
    }

    // ------------------------------------------------------------------
    // LANDING (outrun deceleration) — smoother with slope-aware braking
    // ------------------------------------------------------------------

    _updateLanding(dt) {
        const j = this.jumper;

        const slopeAngle = degToRad(this.hill.getAngleAtDistance(j.x));

        // Deceleration: base braking + extra from a rough landing
        const baseDecel = 6;    // m/s^2
        const impactDecel = j.impactForce > 5 ? 2.0 : 0; // extra braking if hard landing
        const deceleration = baseDecel + impactDecel;

        if (j.speed > 0) {
            // Gravity along slope (helps on downhill, hinders on flat/uphill)
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

        // Smoothly align body angle to slope during outrun
        const targetAngle = this.hill.getAngleAtDistance(j.x);
        j.bodyAngle = lerp(j.bodyAngle, targetAngle, clamp(dt * 8, 0, 1));
    }
}
