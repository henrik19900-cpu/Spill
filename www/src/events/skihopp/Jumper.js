/**
 * Jumper.js - Jumper state and entity for the ski jumping event
 *
 * Encapsulates all mutable state for a single jumper. Shared between
 * SkihoppPhysics, SkihoppControls, and SkihoppRenderer so they all
 * read/write the same object.
 *
 * Properties:
 *   x, y          - world position in meters (origin at table edge)
 *   vx, vy        - velocity components (m/s, used during flight)
 *   speed         - scalar speed (m/s, used during inrun / outrun)
 *   bodyAngle     - current body angle in degrees
 *   targetAngle   - player-requested body angle in degrees
 *   distance      - distance from takeoff (negative = still on inrun)
 *   phase         - mirrors GameState string for convenience
 *   takeoffQuality  - 0-1, determined during TAKEOFF
 *   landingDistance  - meters from takeoff at touchdown
 *   landingQuality  - style bonus/penalty set by controls
 *   flightStability - 0-1, accumulated during FLIGHT (1 = rock steady)
 *   inrunTaps       - total taps registered during INRUN
 */

// Default values for a fresh jumper state
const DEFAULTS = Object.freeze({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    bodyAngle: 35,
    targetAngle: 35,
    distance: 0,
    phase: 'MENU',
    takeoffQuality: 0,
    landingDistance: 0,
    landingQuality: 0,
    flightStability: 1.0,
    inrunTaps: 0,
});

export default class Jumper {
    constructor() {
        // Initialise all properties from defaults
        this.x = DEFAULTS.x;
        this.y = DEFAULTS.y;
        this.vx = DEFAULTS.vx;
        this.vy = DEFAULTS.vy;
        this.speed = DEFAULTS.speed;
        this.bodyAngle = DEFAULTS.bodyAngle;
        this.targetAngle = DEFAULTS.targetAngle;
        this.distance = DEFAULTS.distance;
        this.phase = DEFAULTS.phase;
        this.takeoffQuality = DEFAULTS.takeoffQuality;
        this.landingDistance = DEFAULTS.landingDistance;
        this.landingQuality = DEFAULTS.landingQuality;
        this.flightStability = DEFAULTS.flightStability;
        this.inrunTaps = DEFAULTS.inrunTaps;
    }

    /**
     * Reset all state properties back to their initial values.
     * Called between jumps so the jumper starts clean.
     */
    reset() {
        this.x = DEFAULTS.x;
        this.y = DEFAULTS.y;
        this.vx = DEFAULTS.vx;
        this.vy = DEFAULTS.vy;
        this.speed = DEFAULTS.speed;
        this.bodyAngle = DEFAULTS.bodyAngle;
        this.targetAngle = DEFAULTS.targetAngle;
        this.distance = DEFAULTS.distance;
        this.phase = DEFAULTS.phase;
        this.takeoffQuality = DEFAULTS.takeoffQuality;
        this.landingDistance = DEFAULTS.landingDistance;
        this.landingQuality = DEFAULTS.landingQuality;
        this.flightStability = DEFAULTS.flightStability;
        this.inrunTaps = DEFAULTS.inrunTaps;
    }

    /**
     * Returns this instance directly. The Jumper *is* the state object --
     * physics, controls, and renderer all read/write properties on it.
     * This method exists so the API matches the spec (jumper.getState()).
     * @returns {Jumper}
     */
    getState() {
        return this;
    }
}
