/**
 * ReplaySystem.js - Records jump data and plays it back in slow motion
 *
 * Captures jumper state every 2nd physics tick (~30 fps) during active phases
 * (INRUN, TAKEOFF, FLIGHT, LANDING) and replays with per-phase slow-motion
 * speeds and camera hints for cinematic effect.
 *
 * Playback uses linear interpolation between stored frames for smooth
 * variable-speed replay.
 */

import { GameState } from '../../core/Game.js';

// ---------------------------------------------------------------------------
// Slow-motion multipliers per phase (lower = slower)
// ---------------------------------------------------------------------------

const PHASE_SPEED = {
    [GameState.INRUN]:    1.0,   // normal speed
    [GameState.TAKEOFF]:  0.25,  // dramatic slow-mo
    [GameState.FLIGHT]:   0.5,
    [GameState.LANDING]:  0.25,  // dramatic
};

// Camera zoom per phase
const PHASE_ZOOM = {
    [GameState.INRUN]:    2.5,
    [GameState.TAKEOFF]:  3.0,
    [GameState.FLIGHT]:   1.0,   // pull back to show full arc
    [GameState.LANDING]:  2.5,
};

// How long to hold on the final frame after landing before ending replay
const POST_LANDING_HOLD = 1.0; // seconds

// Record every Nth physics tick (2 = every other tick ≈ 30 fps at 60 Hz)
const RECORD_INTERVAL = 2;

// ---------------------------------------------------------------------------
// ReplaySystem
// ---------------------------------------------------------------------------

export default class ReplaySystem {
    constructor() {
        // Recording state
        this._frames = [];
        this._recording = false;
        this._tickCounter = 0;
        this._cumulativeTime = 0;

        // Playback state
        this._playing = false;
        this._playbackTime = 0;       // current time within the replay (real seconds)
        this._replayDuration = 0;     // total replay duration (accounts for slow-mo)
        this._replayTimeline = null;   // precomputed timeline for playback
        this._postHoldTimer = 0;
        this._postHoldActive = false;
    }

    // -----------------------------------------------------------------------
    // Recording
    // -----------------------------------------------------------------------

    /**
     * Begin capturing frames. Resets any previous recording.
     */
    startRecording() {
        this._frames = [];
        this._recording = true;
        this._tickCounter = 0;
        this._cumulativeTime = 0;
        this._replayTimeline = null;
        this._replayDuration = 0;
    }

    /**
     * Call every physics tick during INRUN / TAKEOFF / FLIGHT / LANDING.
     * Only stores a frame every RECORD_INTERVAL ticks to save memory.
     *
     * @param {object} jumperState - current jumper state from physics
     * @param {number} dt - physics time step
     */
    recordFrame(jumperState, dt) {
        if (!this._recording) return;

        this._cumulativeTime += dt;
        this._tickCounter++;

        if (this._tickCounter % RECORD_INTERVAL !== 0) return;

        this._frames.push({
            x:         jumperState.x,
            y:         jumperState.y,
            vx:        jumperState.vx || 0,
            vy:        jumperState.vy || 0,
            bodyAngle: jumperState.bodyAngle || 0,
            speed:     jumperState.speed || 0,
            distance:  jumperState.distance || jumperState.landingDistance || 0,
            phase:     jumperState.phase || null,
            t:         this._cumulativeTime,
        });
    }

    /**
     * Finalize recording and precompute the replay timeline.
     */
    stopRecording() {
        this._recording = false;
        this._buildTimeline();
    }

    /**
     * @returns {boolean} true if at least one frame has been recorded
     */
    hasRecording() {
        return this._frames.length > 0;
    }

    // -----------------------------------------------------------------------
    // Playback
    // -----------------------------------------------------------------------

    /**
     * Begin replaying from the start.
     */
    startPlayback() {
        if (!this.hasRecording()) return;

        if (!this._replayTimeline) {
            this._buildTimeline();
        }

        this._playing = true;
        this._playbackTime = 0;
        this._postHoldTimer = 0;
        this._postHoldActive = false;
    }

    /**
     * @returns {boolean} true if replay is currently playing
     */
    isPlaying() {
        return this._playing;
    }

    /**
     * Advance playback by dt seconds (real time).
     * @param {number} dt - real-time delta in seconds
     */
    update(dt) {
        if (!this._playing) return;

        if (this._postHoldActive) {
            this._postHoldTimer += dt;
            if (this._postHoldTimer >= POST_LANDING_HOLD) {
                this.stopPlayback();
            }
            return;
        }

        this._playbackTime += dt;

        if (this._playbackTime >= this._replayDuration) {
            this._playbackTime = this._replayDuration;
            this._postHoldActive = true;
            this._postHoldTimer = 0;
        }
    }

    /**
     * Returns an interpolated jumper state at the current playback time.
     * @returns {object|null} interpolated state or null if not playing
     */
    getPlaybackState() {
        if (!this._playing || !this._replayTimeline || this._replayTimeline.length === 0) {
            return null;
        }

        const timeline = this._replayTimeline;

        // Find the two surrounding timeline entries
        let idx = 0;
        for (let i = 0; i < timeline.length - 1; i++) {
            if (timeline[i + 1].replayTime > this._playbackTime) {
                idx = i;
                break;
            }
            idx = i;
        }

        const a = timeline[idx];
        const b = timeline[Math.min(idx + 1, timeline.length - 1)];

        // If same entry or past the end, return exact frame
        if (a === b || a.replayTime === b.replayTime) {
            return this._frameToState(a.frame);
        }

        // Linear interpolation factor
        const range = b.replayTime - a.replayTime;
        const alpha = Math.max(0, Math.min(1, (this._playbackTime - a.replayTime) / range));

        return this._lerpFrames(a.frame, b.frame, alpha);
    }

    /**
     * @returns {number} playback progress from 0 to 1
     */
    getPlaybackProgress() {
        if (!this._playing || this._replayDuration === 0) return 0;
        return Math.min(1, this._playbackTime / this._replayDuration);
    }

    /**
     * Stop replay playback.
     */
    stopPlayback() {
        this._playing = false;
        this._playbackTime = 0;
        this._postHoldActive = false;
        this._postHoldTimer = 0;
    }

    // -----------------------------------------------------------------------
    // Camera hints
    // -----------------------------------------------------------------------

    /**
     * Returns camera target for optimal replay viewing at the current
     * playback time.
     * @returns {object} {x, y, zoom}
     */
    getReplayCameraTarget() {
        const state = this.getPlaybackState();
        if (!state) {
            return { x: 0, y: 0, zoom: 1.0 };
        }

        const phase = state.phase;
        const zoom = PHASE_ZOOM[phase] || 1.5;

        return {
            x: state.x,
            y: state.y,
            zoom,
        };
    }

    // -----------------------------------------------------------------------
    // Overlay data
    // -----------------------------------------------------------------------

    /**
     * Returns data for the replay HUD overlay.
     * @returns {object} {distance, speed, phase, timeInReplay, totalReplayTime}
     */
    getOverlayData() {
        const state = this.getPlaybackState();
        const totalReplayTime = this._replayDuration + POST_LANDING_HOLD;
        const timeInReplay = this._postHoldActive
            ? this._replayDuration + this._postHoldTimer
            : this._playbackTime;

        return {
            distance:        state ? state.distance : 0,
            speed:           state ? state.speed : 0,
            phase:           state ? state.phase : null,
            timeInReplay,
            totalReplayTime,
        };
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * Build a replay timeline that maps each recorded frame to a replay time,
     * accounting for per-phase slow-motion speeds.
     */
    _buildTimeline() {
        if (this._frames.length === 0) {
            this._replayTimeline = [];
            this._replayDuration = 0;
            return;
        }

        const timeline = [];
        let replayTime = 0;

        // First frame starts at replay time 0
        timeline.push({ frame: this._frames[0], replayTime: 0 });

        for (let i = 1; i < this._frames.length; i++) {
            const prev = this._frames[i - 1];
            const curr = this._frames[i];

            // Original time delta between these two frames
            const originalDt = curr.t - prev.t;

            // Slow-motion multiplier based on the current frame's phase
            const speed = PHASE_SPEED[curr.phase] || 1.0;

            // Replay time delta = original delta / speed (slower speed = longer replay time)
            replayTime += originalDt / speed;

            timeline.push({ frame: curr, replayTime });
        }

        this._replayTimeline = timeline;
        this._replayDuration = replayTime;
    }

    /**
     * Convert a raw stored frame to a state object.
     * @param {object} frame
     * @returns {object}
     */
    _frameToState(frame) {
        return {
            x:         frame.x,
            y:         frame.y,
            vx:        frame.vx,
            vy:        frame.vy,
            bodyAngle: frame.bodyAngle,
            speed:     frame.speed,
            distance:  frame.distance,
            phase:     frame.phase,
        };
    }

    /**
     * Linearly interpolate between two frames.
     * @param {object} a - frame A
     * @param {object} b - frame B
     * @param {number} alpha - interpolation factor 0..1
     * @returns {object} interpolated state
     */
    _lerpFrames(a, b, alpha) {
        return {
            x:         a.x         + (b.x         - a.x)         * alpha,
            y:         a.y         + (b.y         - a.y)         * alpha,
            vx:        a.vx        + (b.vx        - a.vx)        * alpha,
            vy:        a.vy        + (b.vy        - a.vy)        * alpha,
            bodyAngle: a.bodyAngle + (b.bodyAngle - a.bodyAngle) * alpha,
            speed:     a.speed     + (b.speed     - a.speed)     * alpha,
            distance:  a.distance  + (b.distance  - a.distance)  * alpha,
            // Use the phase from whichever frame we're closer to
            phase:     alpha < 0.5 ? a.phase : b.phase,
        };
    }
}
