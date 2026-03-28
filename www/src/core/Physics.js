/**
 * Physics.js - General physics utilities for Vinter-OL Spill
 *
 * Provides a lightweight 2D vector class, common math helpers, and
 * physical constants used across all sport events.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GRAVITY = 9.81; // m/s^2

// ---------------------------------------------------------------------------
// Vec2 - Minimal 2D vector
// ---------------------------------------------------------------------------

export class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    /** Return a new vector that is the sum of this and other. */
    add(other) {
        return new Vec2(this.x + other.x, this.y + other.y);
    }

    /** Return a new vector that is this minus other. */
    sub(other) {
        return new Vec2(this.x - other.x, this.y - other.y);
    }

    /** Return a new vector scaled by a scalar. */
    scale(s) {
        return new Vec2(this.x * s, this.y * s);
    }

    /** Euclidean length. */
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    /** Return a unit-length vector in the same direction, or (0,0) if zero-length. */
    normalize() {
        const len = this.length();
        if (len < 1e-12) return new Vec2(0, 0);
        return new Vec2(this.x / len, this.y / len);
    }

    /** Dot product with another vector. */
    dot(other) {
        return this.x * other.x + this.y * other.y;
    }

    /**
     * Rotate the vector by the given angle (in radians), counter-clockwise.
     * @param {number} angle - rotation in radians
     * @returns {Vec2}
     */
    rotate(angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        return new Vec2(
            this.x * c - this.y * s,
            this.x * s + this.y * c,
        );
    }
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a value between min and max (inclusive).
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
}

/**
 * Linear interpolation from a to b by factor t (0-1).
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Convert degrees to radians.
 * @param {number} deg
 * @returns {number}
 */
export function degToRad(deg) {
    return deg * (Math.PI / 180);
}

/**
 * Convert radians to degrees.
 * @param {number} rad
 * @returns {number}
 */
export function radToDeg(rad) {
    return rad * (180 / Math.PI);
}
