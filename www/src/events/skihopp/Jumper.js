/**
 * Jumper.js - Jumper state and entity for the ski jumping event
 *
 * Encapsulates all mutable state for a single jumper. Shared between
 * SkihoppPhysics, SkihoppControls, and SkihoppRenderer so they all
 * read/write the same object.
 *
 * Properties:
 *   x, y              - world position in meters (origin at table edge)
 *   vx, vy            - velocity components (m/s, used during flight)
 *   speed             - scalar speed (m/s, used during inrun / outrun)
 *   bodyAngle         - current body angle in degrees
 *   targetAngle       - player-requested body angle in degrees
 *   rotation          - visual rotation in degrees (for rendering the jumper sprite)
 *   skiSpread         - V-style ski spread (0 = parallel, 1 = full V)
 *   armPosition       - arm pose (0 = at sides, 1 = extended for telemark)
 *   crouchAmount      - crouch level (0 = standing, 1 = fully crouched)
 *   distance          - distance from takeoff (negative = still on inrun)
 *   phase             - mirrors GameState string for convenience
 *   takeoffQuality    - 0-1, determined during TAKEOFF
 *   landingDistance    - meters from takeoff at touchdown
 *   landingQuality    - style bonus/penalty set by controls
 *   flightStability   - 0-1, accumulated during FLIGHT (1 = rock steady)
 *   inrunTaps         - total taps registered during INRUN
 *   isAirborne        - true when jumper is in the air
 *   heightAboveGround - meters above the hill surface (updated each frame)
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
    rotation: 0,
    skiSpread: 0,
    armPosition: 0,
    crouchAmount: 1.0,
    distance: 0,
    phase: 'MENU',
    takeoffQuality: 0,
    landingDistance: 0,
    landingQuality: 0,
    flightStability: 1.0,
    inrunTaps: 0,
    isAirborne: false,
    heightAboveGround: 0,
});

export default class Jumper {
    constructor() {
        this._hill = null;

        // Initialise all properties from defaults
        this.x = DEFAULTS.x;
        this.y = DEFAULTS.y;
        this.vx = DEFAULTS.vx;
        this.vy = DEFAULTS.vy;
        this.speed = DEFAULTS.speed;
        this.bodyAngle = DEFAULTS.bodyAngle;
        this.targetAngle = DEFAULTS.targetAngle;
        this.rotation = DEFAULTS.rotation;
        this.skiSpread = DEFAULTS.skiSpread;
        this.armPosition = DEFAULTS.armPosition;
        this.crouchAmount = DEFAULTS.crouchAmount;
        this.distance = DEFAULTS.distance;
        this.phase = DEFAULTS.phase;
        this.takeoffQuality = DEFAULTS.takeoffQuality;
        this.landingDistance = DEFAULTS.landingDistance;
        this.landingQuality = DEFAULTS.landingQuality;
        this.flightStability = DEFAULTS.flightStability;
        this.inrunTaps = DEFAULTS.inrunTaps;
        this.isAirborne = DEFAULTS.isAirborne;
        this.heightAboveGround = DEFAULTS.heightAboveGround;
    }

    /**
     * Current speed in km/h (computed from scalar speed in m/s).
     * @returns {number}
     */
    get speedKmh() {
        return this.speed * 3.6;
    }

    /**
     * Reset all state properties back to their initial values and
     * position the jumper at the top of the inrun if a hill reference
     * is available.
     * @param {Hill} [hill] - optional Hill instance to position on
     */
    reset(hill) {
        if (hill) {
            this._hill = hill;
        }

        this.vx = DEFAULTS.vx;
        this.vy = DEFAULTS.vy;
        this.speed = DEFAULTS.speed;
        this.bodyAngle = DEFAULTS.bodyAngle;
        this.targetAngle = DEFAULTS.targetAngle;
        this.rotation = DEFAULTS.rotation;
        this.skiSpread = DEFAULTS.skiSpread;
        this.armPosition = DEFAULTS.armPosition;
        this.crouchAmount = 1.0;  // start crouched on the inrun
        this.distance = DEFAULTS.distance;
        this.phase = DEFAULTS.phase;
        this.takeoffQuality = DEFAULTS.takeoffQuality;
        this.landingDistance = DEFAULTS.landingDistance;
        this.landingQuality = DEFAULTS.landingQuality;
        this.flightStability = DEFAULTS.flightStability;
        this.inrunTaps = DEFAULTS.inrunTaps;
        this.isAirborne = DEFAULTS.isAirborne;
        this.heightAboveGround = DEFAULTS.heightAboveGround;

        // Position at the top of the inrun
        if (this._hill) {
            const start = this._hill.getInrunStartPosition();
            this.x = start.x;
            this.y = start.y;
            this.rotation = this._hill.inrunAngle;
        } else {
            this.x = DEFAULTS.x;
            this.y = DEFAULTS.y;
        }
    }

    /**
     * Position the jumper at a given surface distance along the inrun,
     * measured from the top. The hill computes the exact (x, y) position
     * along the curved inrun surface.
     * @param {Hill} hill - the Hill instance
     * @param {number} distance - surface distance from the top of the inrun (meters)
     */
    setInrunPosition(hill, distance) {
        this._hill = hill;
        const pos = hill.getPositionAlongInrun(distance);
        this.x = pos.x;
        this.y = pos.y;
        this.isAirborne = false;
        this.heightAboveGround = 0;

        // Update visual rotation to match the inrun slope at this position
        this.rotation = hill.getAngleAtDistance(pos.x);
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
