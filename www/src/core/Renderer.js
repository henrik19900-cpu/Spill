/**
 * Renderer.js - Core rendering wrapper for Vinter-OL Spill
 *
 * Provides camera management (position, zoom), coordinate conversion between
 * world space (meters) and screen space (pixels), and smooth camera following.
 */

export default class Renderer {
    constructor(game) {
        this.game = game;

        // Camera state (world coordinates in meters)
        this.cameraX = 0;
        this.cameraY = 0;
        this.zoom = 1;

        // Pixels-per-meter base scale (recalculated on resize)
        this._ppm = 5;
        this._recalcScale();
    }

    // -------------------------------------------------------------------
    // Scale calculation
    // -------------------------------------------------------------------

    /**
     * Calculate a sensible pixels-per-meter value so that roughly 80 m of
     * horizontal hill fits on the screen width. This keeps the hill nicely
     * visible in portrait mode on a phone (~390 px wide).
     */
    _recalcScale() {
        const w = this.game.width || 390;
        // Show about 80 m across the screen at zoom 1
        this._ppm = w / 80;
    }

    /** Effective pixels-per-meter taking zoom into account. */
    get ppm() {
        return this._ppm * this.zoom;
    }

    // -------------------------------------------------------------------
    // Camera control
    // -------------------------------------------------------------------

    /**
     * Set camera position and zoom directly.
     * @param {number} x - world X to centre on (meters)
     * @param {number} y - world Y to centre on (meters)
     * @param {number} zoom - zoom multiplier (1 = default)
     */
    setCamera(x, y, zoom) {
        this.cameraX = x;
        this.cameraY = y;
        if (zoom !== undefined) this.zoom = zoom;
        this._recalcScale();
    }

    /**
     * Smoothly move the camera toward a target position.
     * Uses exponential easing so it never overshoots.
     * @param {number} targetX - desired world X
     * @param {number} targetY - desired world Y
     * @param {number} dt      - time step in seconds
     * @param {number} speed   - easing speed (higher = faster, 3-8 typical)
     */
    smoothFollow(targetX, targetY, dt, speed = 5) {
        const factor = 1 - Math.exp(-speed * dt);
        this.cameraX += (targetX - this.cameraX) * factor;
        this.cameraY += (targetY - this.cameraY) * factor;
    }

    /**
     * Smoothly interpolate zoom toward a target value.
     * @param {number} targetZoom
     * @param {number} dt
     * @param {number} speed
     */
    smoothZoom(targetZoom, dt, speed = 3) {
        const factor = 1 - Math.exp(-speed * dt);
        this.zoom += (targetZoom - this.zoom) * factor;
        this._recalcScale();
    }

    // -------------------------------------------------------------------
    // Coordinate conversion
    // -------------------------------------------------------------------

    /**
     * Convert a world position (meters) to screen pixels.
     * The camera position maps to the centre of the screen.
     *
     * World coordinate system (from Hill.js):
     *   +x = right (downhill), +y = downward.
     * Screen coordinate system:
     *   +x = right, +y = down (standard canvas).
     *
     * @param {number} x - world X in meters
     * @param {number} y - world Y in meters
     * @returns {{x: number, y: number}} screen position in CSS pixels
     */
    worldToScreen(x, y) {
        const ppm = this.ppm;
        const hw = (this.game.width || 390) / 2;
        const hh = (this.game.height || 844) / 2;

        return {
            x: hw + (x - this.cameraX) * ppm,
            y: hh + (y - this.cameraY) * ppm,
        };
    }

    /**
     * Convert screen pixels to world position (meters).
     * @param {number} sx - screen X
     * @param {number} sy - screen Y
     * @returns {{x: number, y: number}} world position in meters
     */
    screenToWorld(sx, sy) {
        const ppm = this.ppm;
        const hw = (this.game.width || 390) / 2;
        const hh = (this.game.height || 844) / 2;

        return {
            x: this.cameraX + (sx - hw) / ppm,
            y: this.cameraY + (sy - hh) / ppm,
        };
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    /**
     * Return the visible world bounds (in meters) for the current camera.
     * @returns {{left: number, right: number, top: number, bottom: number}}
     */
    getVisibleBounds() {
        const tl = this.screenToWorld(0, 0);
        const br = this.screenToWorld(this.game.width || 390, this.game.height || 844);
        return {
            left: tl.x,
            right: br.x,
            top: tl.y,
            bottom: br.y,
        };
    }

    /**
     * Apply camera transform to the canvas context so subsequent draw calls
     * use world coordinates directly. Call ctx.restore() when done.
     * @param {CanvasRenderingContext2D} ctx
     */
    applyTransform(ctx) {
        const ppm = this.ppm;
        const hw = (this.game.width || 390) / 2;
        const hh = (this.game.height || 844) / 2;

        ctx.save();
        ctx.translate(hw, hh);
        ctx.scale(ppm, ppm);
        ctx.translate(-this.cameraX, -this.cameraY);
    }
}
