/**
 * SkihoppRenderer.js - Ski jumping scene renderer
 *
 * Renders the complete ski jumping scene on a Canvas 2D context.
 * Designed for mobile portrait layout (~390x844).
 *
 * Drawing order (back to front):
 *   1. Sky gradient + stars
 *   2. Parallax mountain layers
 *   3. Snow ground fill
 *   4. Hill surface with markings
 *   5. Ski jumper
 *   6. Spectators
 *   7. Snow particles
 */

import { GameState } from '../../core/Game.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seeded pseudo-random for deterministic star/mountain positions. */
function seededRandom(seed) {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

/** Linear interpolation. */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// SkihoppRenderer
// ---------------------------------------------------------------------------

export default class SkihoppRenderer {
    constructor() {
        this.game = null;
        this.hill = null;
        this.renderer = null;

        // Pre-generated visual data
        this._stars = [];
        this._mountains = [[], [], []]; // 3 parallax layers
        this._spectators = [];
        this._snowParticles = [];

        this._initialized = false;
        this._time = 0;
    }

    // ------------------------------------------------------------------
    // Initialization
    // ------------------------------------------------------------------

    /**
     * @param {import('../../core/Game.js').Game} game
     * @param {import('./Hill.js').default} hill
     * @param {import('../../core/Renderer.js').default} renderer
     */
    init(game, hill, renderer) {
        this.game = game;
        this.hill = hill;
        this.renderer = renderer;

        this._generateStars();
        this._generateMountains();
        this._generateSpectators();
        this._generateSnowParticles();

        this._initialized = true;
    }

    // ------------------------------------------------------------------
    // Data generation (called once in init)
    // ------------------------------------------------------------------

    _generateStars() {
        const rng = seededRandom(42);
        this._stars = [];
        for (let i = 0; i < 60; i++) {
            this._stars.push({
                x: rng(),
                y: rng() * 0.55,
                r: 0.5 + rng() * 1.8,
                a: 0.3 + rng() * 0.7,
                twinkleSpeed: 0.5 + rng() * 2.0,
                twinkleOffset: rng() * Math.PI * 2,
            });
        }
    }

    _generateMountains() {
        const rng = seededRandom(1337);
        const layerConfigs = [
            { baseY: 0.40, variance: 0.12, color: '#0d1530', peaks: 12 },
            { baseY: 0.48, variance: 0.10, color: '#162040', peaks: 14 },
            { baseY: 0.55, variance: 0.08, color: '#1d2d50', peaks: 16 },
        ];

        this._mountains = layerConfigs.map(cfg => {
            const pts = [];
            // Extend well beyond screen width for parallax scrolling
            const count = cfg.peaks;
            for (let i = 0; i <= count; i++) {
                const t = i / count;
                // Use a wide range so parallax never runs out of mountains
                pts.push({
                    x: -0.3 + t * 1.6,
                    y: cfg.baseY - rng() * cfg.variance,
                });
            }
            return { points: pts, color: cfg.color };
        });
    }

    _generateSpectators() {
        const rng = seededRandom(777);
        this._spectators = [];

        // Place spectators along the outrun / flat area (fence line)
        const landingPts = this.hill.getLandingPoints();
        const last = landingPts[landingPts.length - 1];
        const flatStartX = last.x - 20;
        const flatY = last.y;

        const bodyColors = [
            '#e63946', '#457b9d', '#2a9d8f', '#264653',
            '#d62828', '#023e8a', '#1d3557', '#6a0572',
        ];
        const hatColors = [
            '#ffbe0b', '#fb5607', '#ff006e', '#8338ec',
            '#e9c46a', '#f4a261', '#00b4d8', '#ef233c',
        ];
        const flagColors = ['#ef233c', '#0077b6', '#ffd60a', '#2d6a4f', '#ffffff'];

        for (let i = 0; i < 35; i++) {
            this._spectators.push({
                x: flatStartX + rng() * 28,
                y: flatY - 0.3 - rng() * 2.0,
                bodyColor: bodyColors[Math.floor(rng() * bodyColors.length)],
                hatColor: hatColors[Math.floor(rng() * hatColors.length)],
                h: 0.8 + rng() * 0.6,
                // Some spectators wave, some hold flags, some are still
                action: rng() < 0.25 ? 'wave' : (rng() < 0.4 ? 'flag' : 'still'),
                flagColor: flagColors[Math.floor(rng() * flagColors.length)],
                // Random phase offset for wave animation
                wavePhase: rng() * Math.PI * 2,
                waveSpeed: 2 + rng() * 3,
            });
        }
    }

    _generateSnowParticles() {
        const rng = seededRandom(999);
        this._snowParticles = [];
        for (let i = 0; i < 80; i++) {
            this._snowParticles.push({
                x: rng(),
                y: rng(),
                r: 1 + rng() * 2,
                speedX: (rng() - 0.5) * 0.15,
                speedY: 0.05 + rng() * 0.1,
                alpha: 0.2 + rng() * 0.5,
            });
        }
    }

    // ------------------------------------------------------------------
    // Main render entry point
    // ------------------------------------------------------------------

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width   - canvas width (CSS px)
     * @param {number} height  - canvas height (CSS px)
     * @param {object} jumperState - from SkihoppPhysics
     * @param {string} gameState   - current GameState.*
     * @param {object} wind        - { speed, direction }
     */
    render(ctx, width, height, jumperState, gameState, wind) {
        if (!this._initialized || !this.renderer) return;

        this._time += 1 / 60;

        // --- Camera management ---
        this._updateCamera(jumperState, gameState, 1 / 60);

        // Camera shake from vibration/landing
        const vib = jumperState.vibration || 0;
        if (vib > 0.01) {
            const shakeX = (Math.random() - 0.5) * vib * 4;
            const shakeY = (Math.random() - 0.5) * vib * 4;
            ctx.save();
            ctx.translate(shakeX, shakeY);
        }

        // --- Draw layers back-to-front ---
        this._drawSky(ctx, width, height);
        this._drawMountains(ctx, width, height);
        this._drawSnowGround(ctx, width, height);
        this._drawHillSurface(ctx, width, height);
        this._drawSpectators(ctx);
        this._drawJumper(ctx, jumperState);
        this._drawSnowParticles(ctx, width, height);

        // Restore camera shake transform
        if ((jumperState.vibration || 0) > 0.01) {
            ctx.restore();
        }
    }

    // ------------------------------------------------------------------
    // Camera
    // ------------------------------------------------------------------

    _updateCamera(jumperState, gameState, dt) {
        const r = this.renderer;
        if (!r) return;
        let targetZoom, targetX, targetY;
        // Use a low lerp speed for silky-smooth broadcast-style transitions
        let followSpeed = 2;
        let zoomSpeed = 2;

        switch (gameState) {
            case GameState.MENU:
            case GameState.READY: {
                // Wide establishing shot: centre on middle of hill
                const profile = this.hill.getProfile();
                const mid = profile[Math.floor(profile.length * 0.4)];
                targetX = mid.x;
                targetY = mid.y;
                targetZoom = 0.8;
                followSpeed = 2;
                zoomSpeed = 2;
                break;
            }
            case GameState.INRUN: {
                // Side camera, slightly ahead of the jumper (positive x = downhill)
                const speed = Math.sqrt(
                    (jumperState.vx || 0) ** 2 + (jumperState.vy || 0) ** 2
                );
                // Lead the jumper by a few meters so the track ahead is visible
                targetX = jumperState.x + 6;
                // Slightly above to show surrounding area
                targetY = jumperState.y - 3;
                // Start at a medium zoom; tighten as speed builds for intensity
                const speedFactor = Math.min(speed / 30, 1); // 0-1 as speed reaches ~30 m/s
                targetZoom = lerp(2.0, 2.8, speedFactor);
                followSpeed = 2.5;
                zoomSpeed = 2;
                break;
            }
            case GameState.TAKEOFF: {
                // Dramatic launch moment: slight zoom in, centred on jumper
                targetX = jumperState.x + 3;
                targetY = jumperState.y - 2;
                targetZoom = 3.0;
                followSpeed = 3;
                zoomSpeed = 2.5;
                break;
            }
            case GameState.FLIGHT: {
                // TV broadcast wide angle: pull back to show the full arc
                // Keep camera ahead and above so landing area stays visible
                targetX = jumperState.x + 12;
                targetY = jumperState.y - 8;
                targetZoom = 1.2;
                followSpeed = 2;
                zoomSpeed = 1.8;
                break;
            }
            case GameState.LANDING: {
                // Quick zoom in to show the telemark clearly
                targetX = jumperState.x + 2;
                targetY = jumperState.y - 1.5;
                targetZoom = 2.8;
                followSpeed = 3;
                zoomSpeed = 3;
                break;
            }
            default:
                targetX = jumperState.x;
                targetY = jumperState.y;
                targetZoom = 1.5;
                followSpeed = 2;
                zoomSpeed = 2;
        }

        r.smoothFollow(targetX, targetY, dt, followSpeed);
        r.smoothZoom(targetZoom, dt, zoomSpeed);
    }

    // ------------------------------------------------------------------
    // 1. Sky
    // ------------------------------------------------------------------

    _drawSky(ctx, w, h) {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#050520');
        grad.addColorStop(0.4, '#0a0a2e');
        grad.addColorStop(0.7, '#1a3a6e');
        grad.addColorStop(1, '#243b6e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Aurora borealis
        const t = (this._time || 0);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 3; i++) {
            const baseY = h * (0.12 + i * 0.06);
            ctx.beginPath();
            ctx.moveTo(0, baseY);
            for (let x = 0; x <= w; x += 4) {
                const wave = Math.sin(x * 0.008 + t * 0.4 + i * 2.1) * 20
                           + Math.sin(x * 0.015 + t * 0.7 + i) * 10;
                ctx.lineTo(x, baseY + wave);
            }
            ctx.lineTo(w, h * 0.4);
            ctx.lineTo(0, h * 0.4);
            ctx.closePath();
            const colors = ['rgba(0,255,128,0.06)', 'rgba(80,200,255,0.04)', 'rgba(180,100,255,0.03)'];
            ctx.fillStyle = colors[i];
            ctx.fill();
        }
        ctx.restore();

        // Twinkling stars
        for (const s of this._stars) {
            const twinkle = 0.5 + 0.5 * Math.sin(t * s.twinkleSpeed + s.twinkleOffset);
            const alpha = s.a * (0.4 + 0.6 * twinkle);
            ctx.beginPath();
            ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
            ctx.fill();
        }
    }

    // ------------------------------------------------------------------
    // 2. Mountains
    // ------------------------------------------------------------------

    _drawMountains(ctx, w, h) {
        const parallaxFactors = [0.1, 0.2, 0.3];
        const cameraX = this.renderer.cameraX;

        // --- Warm amber horizon glow at the base of the mountains ---
        const glowTop = h * 0.38;
        const glowBottom = h * 0.62;
        const glowGrad = ctx.createLinearGradient(0, glowTop, 0, glowBottom);
        glowGrad.addColorStop(0, 'rgba(255,180,80,0)');
        glowGrad.addColorStop(0.4, 'rgba(255,160,60,0.08)');
        glowGrad.addColorStop(0.7, 'rgba(255,140,40,0.05)');
        glowGrad.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, glowTop, w, glowBottom - glowTop);

        for (let layer = 0; layer < 3; layer++) {
            const { points, color } = this._mountains[layer];
            const offsetX = -cameraX * parallaxFactors[layer] * 0.01;

            // Draw the mountain silhouette
            ctx.beginPath();
            const firstPt = points[0];
            ctx.moveTo((firstPt.x + offsetX) * w, firstPt.y * h);

            for (let i = 1; i < points.length; i++) {
                const pt = points[i];
                ctx.lineTo((pt.x + offsetX) * w, pt.y * h);
            }

            // Close along the bottom
            ctx.lineTo((points[points.length - 1].x + offsetX) * w, h);
            ctx.lineTo((points[0].x + offsetX) * w, h);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();

            // --- Snow caps on mountain peaks ---
            // Find local peaks (lower y = higher on screen) and draw white triangles
            for (let i = 1; i < points.length - 1; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                const next = points[i + 1];

                // A peak is where the point is higher (smaller y) than both neighbours
                if (curr.y < prev.y && curr.y < next.y) {
                    const peakX = (curr.x + offsetX) * w;
                    const peakY = curr.y * h;
                    // Snow cap size varies by layer (back layers have smaller caps)
                    const capH = (6 + layer * 3);
                    const capW = capH * 1.4;
                    // White snow cap with slight transparency for back layers
                    const alpha = 0.4 + layer * 0.15;

                    ctx.beginPath();
                    ctx.moveTo(peakX, peakY);
                    ctx.lineTo(peakX - capW / 2, peakY + capH);
                    ctx.lineTo(peakX + capW / 2, peakY + capH);
                    ctx.closePath();
                    ctx.fillStyle = `rgba(220,235,255,${alpha.toFixed(2)})`;
                    ctx.fill();
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // 3. Snow ground (fill below hill surface)
    // ------------------------------------------------------------------

    _drawSnowGround(ctx, w, h) {
        const profile = this.hill.getProfile();
        const r = this.renderer;
        const ppm = r.ppm;

        // --- Main snow ground fill with gradient ---
        ctx.beginPath();
        let first = true;
        for (const pt of profile) {
            const sp = r.worldToScreen(pt.x, pt.y);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        const lastScreen = r.worldToScreen(profile[profile.length - 1].x, profile[profile.length - 1].y);
        const firstScreen = r.worldToScreen(profile[0].x, profile[0].y);
        ctx.lineTo(lastScreen.x, h + 50);
        ctx.lineTo(firstScreen.x, h + 50);
        ctx.closePath();

        // Gradient from bluish-white at surface to deeper blue below
        const surfaceY = Math.min(firstScreen.y, lastScreen.y);
        const groundGrad = ctx.createLinearGradient(0, surfaceY, 0, h + 50);
        groundGrad.addColorStop(0, '#dce8f8');
        groundGrad.addColorStop(0.15, '#c8d8ee');
        groundGrad.addColorStop(0.5, '#a0b8d8');
        groundGrad.addColorStop(1, '#7090b8');
        ctx.fillStyle = groundGrad;
        ctx.fill();

        // --- Subtle blue shadow texture stripes on the snow ---
        const rng = seededRandom(2024);
        ctx.save();
        ctx.globalAlpha = 0.08;
        for (let i = 0; i < 30; i++) {
            const wx = profile[0].x + rng() * (profile[profile.length - 1].x - profile[0].x);
            const wy = this.hill.getHeightAtDistance(wx);
            const sp1 = r.worldToScreen(wx, wy + 1 + rng() * 8);
            const sp2 = r.worldToScreen(wx + 3 + rng() * 12, wy + 2 + rng() * 10);
            ctx.beginPath();
            ctx.ellipse(sp1.x, sp1.y, Math.abs(sp2.x - sp1.x) * 0.6, Math.abs(sp2.y - sp1.y) * 0.3 + 4, rng() * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = '#6080b0';
            ctx.fill();
        }
        ctx.restore();

        // --- Pine trees along the sides of the hill ---
        this._drawPineTrees(ctx, w, h);

        // --- Crowd areas near the outrun ---
        this._drawCrowdArea(ctx, w, h);
    }

    /** Draw simple pine trees (triangular) along the sides of the hill. */
    _drawPineTrees(ctx, w, h) {
        const r = this.renderer;
        const rng = seededRandom(3141);
        const profile = this.hill.getProfile();
        const startX = profile[0].x;
        const endX = profile[profile.length - 1].x;

        // Trees on both sides of the hill (offset laterally by drawing them
        // above the hill surface at different x positions)
        const treePositions = [];
        for (let i = 0; i < 40; i++) {
            const wx = startX + rng() * (endX - startX);
            const wy = this.hill.getHeightAtDistance(wx);
            // Offset trees below/behind the slope (positive y = further down)
            const offsetY = 4 + rng() * 18;
            const treeH = 3 + rng() * 5; // tree height in meters
            treePositions.push({ wx, wy: wy + offsetY, h: treeH, shade: rng() });
        }

        // Sort by y so farther trees draw first
        treePositions.sort((a, b) => a.wy - b.wy);

        for (const tree of treePositions) {
            const base = r.worldToScreen(tree.wx, tree.wy);
            const top = r.worldToScreen(tree.wx, tree.wy - tree.h);
            const treeHPx = base.y - top.y;
            if (treeHPx < 3 || base.y < -50 || base.y > h + 100) continue;
            if (base.x < -100 || base.x > w + 100) continue;

            const treeW = treeHPx * 0.55;

            // Trunk
            ctx.fillStyle = '#3a2510';
            ctx.fillRect(base.x - treeW * 0.08, base.y - treeHPx * 0.15, treeW * 0.16, treeHPx * 0.15);

            // Three triangle layers for foliage
            const darkGreen = tree.shade < 0.5 ? '#0a3a12' : '#0d4218';
            const midGreen = tree.shade < 0.5 ? '#0e4a1a' : '#125520';
            const lightGreen = tree.shade < 0.5 ? '#1a6030' : '#1e6e35';
            const layers = [
                { yOff: 0.0, wScale: 1.0, color: darkGreen },
                { yOff: 0.25, wScale: 0.78, color: midGreen },
                { yOff: 0.5, wScale: 0.55, color: lightGreen },
            ];
            for (const layer of layers) {
                const ly = base.y - treeHPx * (0.15 + layer.yOff * 0.85);
                const lh = treeHPx * 0.45;
                const lw = treeW * layer.wScale;
                ctx.fillStyle = layer.color;
                ctx.beginPath();
                ctx.moveTo(base.x, ly - lh);
                ctx.lineTo(base.x - lw / 2, ly);
                ctx.lineTo(base.x + lw / 2, ly);
                ctx.closePath();
                ctx.fill();
            }

            // Snow caps on tree tops
            ctx.fillStyle = 'rgba(220,235,255,0.6)';
            ctx.beginPath();
            const snowY = base.y - treeHPx * 0.92;
            ctx.moveTo(base.x, top.y - 1);
            ctx.lineTo(base.x - treeW * 0.18, snowY + treeHPx * 0.06);
            ctx.lineTo(base.x + treeW * 0.18, snowY + treeHPx * 0.06);
            ctx.closePath();
            ctx.fill();
        }
    }

    /** Draw crowd area with small colored dots near the outrun. */
    _drawCrowdArea(ctx, w, h) {
        const r = this.renderer;
        const rng = seededRandom(5555);
        const outrunEnd = this.hill.getOutrunEndPosition();
        const kp = this.hill.getKPointPosition();

        if (!outrunEnd || !kp) return;

        // Crowd fence line (barrier along the side of the outrun)
        const fenceStartX = kp.x + 15;
        const fenceEndX = outrunEnd.x - 5;
        const fenceY = this.hill.getHeightAtDistance(fenceEndX) || outrunEnd.y;

        // Draw a simple fence line
        ctx.strokeStyle = '#556677';
        ctx.lineWidth = 1;
        for (let fx = fenceStartX; fx < fenceEndX; fx += 3) {
            const fy = this.hill.getHeightAtDistance(fx);
            const sp = r.worldToScreen(fx, fy + 4);
            const spTop = r.worldToScreen(fx, fy + 2.5);
            ctx.beginPath();
            ctx.moveTo(sp.x, sp.y);
            ctx.lineTo(spTop.x, spTop.y);
            ctx.stroke();
        }
        // Horizontal fence rail
        ctx.beginPath();
        ctx.strokeStyle = '#667788';
        ctx.lineWidth = 1.5;
        let fFirst = true;
        for (let fx = fenceStartX; fx < fenceEndX; fx += 2) {
            const fy = this.hill.getHeightAtDistance(fx);
            const sp = r.worldToScreen(fx, fy + 2.8);
            if (fFirst) { ctx.moveTo(sp.x, sp.y); fFirst = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        ctx.stroke();
    }

    // ------------------------------------------------------------------
    // 4. Hill surface with markings
    // ------------------------------------------------------------------

    _drawHillSurface(ctx, w, h) {
        const r = this.renderer;
        const profile = this.hill.getProfile();

        // --- Snow surface fill (slightly brighter than ground) ---
        ctx.beginPath();
        let first = true;
        for (const pt of profile) {
            const sp = r.worldToScreen(pt.x, pt.y);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }

        // Close polygon with a thin strip below the surface (a few pixels)
        const thickness = 4 * r.ppm; // surface layer thickness in pixels
        const lastPt = profile[profile.length - 1];
        const firstPt = profile[0];
        const lastS = r.worldToScreen(lastPt.x, lastPt.y);
        const firstS = r.worldToScreen(firstPt.x, firstPt.y);
        ctx.lineTo(lastS.x, lastS.y + thickness);
        ctx.lineTo(firstS.x, firstS.y + thickness);
        ctx.closePath();

        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Shadow strip just below surface edge
        ctx.beginPath();
        first = true;
        for (const pt of profile) {
            const sp = r.worldToScreen(pt.x, pt.y + 0.3);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        for (let i = profile.length - 1; i >= 0; i--) {
            const sp = r.worldToScreen(profile[i].x, profile[i].y + 1.2);
            ctx.lineTo(sp.x, sp.y);
        }
        ctx.closePath();
        ctx.fillStyle = '#d0e0f0';
        ctx.fill();

        // --- Surface outline ---
        ctx.beginPath();
        first = true;
        for (const pt of profile) {
            const sp = r.worldToScreen(pt.x, pt.y);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        ctx.strokeStyle = '#667788';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // --- Distance markers on landing slope (every 10m) ---
        this._drawDistanceMarkers(ctx);

        // --- K-point and HS-point lines ---
        this._drawPointMarker(ctx, this.hill.getKPointPosition(), '#ff2222', 'K');
        this._drawPointMarker(ctx, this.hill.getHSPointPosition(), '#2255ff', 'HS');

        // --- Judges tower ---
        this._drawJudgesTower(ctx);
    }

    _drawDistanceMarkers(ctx) {
        const r = this.renderer;
        const landingPts = this.hill.getLandingPoints();

        // Mark every 10m of horizontal distance
        for (let dist = 10; dist <= 200; dist += 10) {
            // Find the surface point closest to this distance
            let closest = null;
            let minDiff = Infinity;
            for (const pt of landingPts) {
                const diff = Math.abs(pt.x - dist);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = pt;
                }
            }
            if (!closest || minDiff > 2) continue;

            const sp = r.worldToScreen(closest.x, closest.y);

            // Short perpendicular green line
            ctx.beginPath();
            ctx.moveTo(sp.x - 2, sp.y - 4);
            ctx.lineTo(sp.x + 2, sp.y + 4);
            ctx.strokeStyle = '#44aa44';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }

    _drawPointMarker(ctx, pos, color, label) {
        const r = this.renderer;
        if (!pos) return;

        const sp = r.worldToScreen(pos.x, pos.y);

        // Perpendicular line across the slope
        const lineLen = 8;
        ctx.beginPath();
        ctx.moveTo(sp.x - lineLen * 0.4, sp.y - lineLen);
        ctx.lineTo(sp.x + lineLen * 0.4, sp.y + lineLen);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Label
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(label, sp.x, sp.y - lineLen - 4);
    }

    _drawJudgesTower(ctx) {
        const r = this.renderer;

        // Position the tower near the K-point, offset to the side
        const kp = this.hill.getKPointPosition();
        if (!kp) return;

        const towerX = kp.x + 5;
        const towerY = kp.y - 8; // above the slope

        const base = r.worldToScreen(towerX, kp.y);
        const top = r.worldToScreen(towerX, towerY);

        const towerWidth = 10;
        const floorHeight = (base.y - top.y) / 5;

        // Tower body
        ctx.fillStyle = '#334455';
        ctx.fillRect(top.x - towerWidth / 2, top.y, towerWidth, base.y - top.y);

        // Window floors
        const floorColors = ['#445566', '#556677', '#4a5a6a', '#556677', '#445566'];
        for (let i = 0; i < 5; i++) {
            ctx.fillStyle = floorColors[i];
            ctx.fillRect(
                top.x - towerWidth / 2 + 1,
                top.y + i * floorHeight + 1,
                towerWidth - 2,
                floorHeight - 2
            );
            // Small yellow window
            ctx.fillStyle = '#ffdd66';
            ctx.fillRect(
                top.x - 2,
                top.y + i * floorHeight + floorHeight * 0.25,
                4,
                floorHeight * 0.4
            );
        }

        // Roof
        ctx.fillStyle = '#223344';
        ctx.fillRect(top.x - towerWidth / 2 - 2, top.y - 3, towerWidth + 4, 4);
    }

    // ------------------------------------------------------------------
    // 5. Ski jumper
    // ------------------------------------------------------------------

    _drawJumper(ctx, js) {
        if (!js) return;

        const r = this.renderer;
        const sp = r.worldToScreen(js.x, js.y);
        const ppm = r.ppm; // pixels per meter at current zoom

        ctx.save();
        ctx.translate(sp.x, sp.y);

        const scale = ppm; // 1 meter = this many pixels
        const phase = js.phase;
        const bodyAngle = (js.bodyAngle || 0) * Math.PI / 180;

        if (phase === GameState.INRUN || phase === 'INRUN') {
            this._drawJumperInrun(ctx, scale, bodyAngle);
        } else if (phase === GameState.FLIGHT || phase === 'FLIGHT') {
            this._drawJumperFlight(ctx, scale, bodyAngle);
        } else if (phase === GameState.LANDING || phase === 'LANDING') {
            this._drawJumperLanding(ctx, scale, bodyAngle);
        } else {
            // Default: standing pose
            this._drawJumperInrun(ctx, scale, 0);
        }

        ctx.restore();
    }

    /** Crouched inrun pose: low body, skis flat. */
    _drawJumperInrun(ctx, s, angle) {
        ctx.rotate(angle);

        // Skis (flat under the jumper)
        ctx.fillStyle = '#444444';
        ctx.fillRect(-1.2 * s, -0.05 * s, 2.4 * s, 0.08 * s);

        // Legs (crouched)
        ctx.fillStyle = '#2244aa';
        ctx.fillRect(-0.15 * s, -0.5 * s, 0.3 * s, 0.5 * s);

        // Torso (leaning forward, crouched)
        ctx.save();
        ctx.translate(0, -0.5 * s);
        ctx.rotate(-0.6); // lean forward
        ctx.fillStyle = '#2244aa';
        ctx.fillRect(-0.15 * s, -0.6 * s, 0.3 * s, 0.6 * s);

        // Head
        ctx.fillStyle = '#cc2222'; // helmet
        ctx.beginPath();
        ctx.arc(0, -0.7 * s, 0.15 * s, 0, Math.PI * 2);
        ctx.fill();
        // Face
        ctx.fillStyle = '#ffccaa';
        ctx.beginPath();
        ctx.arc(0.05 * s, -0.65 * s, 0.07 * s, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    /** V-style flight: skis angled, body leaning forward. */
    _drawJumperFlight(ctx, s, angle) {
        ctx.rotate(angle);

        // Body leaning forward
        ctx.save();

        // Torso
        ctx.fillStyle = '#2244aa';
        ctx.fillRect(-0.12 * s, -0.15 * s, 0.24 * s, 0.9 * s);

        // Legs trailing behind (downward in rotated frame)
        ctx.fillStyle = '#2244aa';
        ctx.fillRect(-0.10 * s, 0.75 * s, 0.20 * s, 0.6 * s);

        // Head (at the front/top)
        ctx.fillStyle = '#cc2222';
        ctx.beginPath();
        ctx.arc(0, -0.25 * s, 0.15 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffccaa';
        ctx.beginPath();
        ctx.arc(0.06 * s, -0.20 * s, 0.07 * s, 0, Math.PI * 2);
        ctx.fill();

        // V-style skis
        ctx.strokeStyle = '#444444';
        ctx.lineWidth = Math.max(2, 0.06 * s);
        ctx.lineCap = 'round';

        // Left ski (angled out-left)
        ctx.beginPath();
        ctx.moveTo(-0.1 * s, 1.3 * s);
        ctx.lineTo(-0.6 * s, 1.3 * s + 1.2 * s);
        ctx.stroke();

        // Right ski (angled out-right)
        ctx.beginPath();
        ctx.moveTo(0.1 * s, 1.3 * s);
        ctx.lineTo(0.6 * s, 1.3 * s + 1.2 * s);
        ctx.stroke();

        // Arms stretched along body
        ctx.strokeStyle = '#2244aa';
        ctx.lineWidth = Math.max(1.5, 0.05 * s);
        ctx.beginPath();
        ctx.moveTo(-0.12 * s, 0.2 * s);
        ctx.lineTo(-0.25 * s, 0.8 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0.12 * s, 0.2 * s);
        ctx.lineTo(0.25 * s, 0.8 * s);
        ctx.stroke();

        ctx.restore();
    }

    /** Telemark landing: one foot forward, one back, arms out. */
    _drawJumperLanding(ctx, s, angle) {
        ctx.rotate(angle);

        // Front ski (forward)
        ctx.fillStyle = '#444444';
        ctx.fillRect(-1.0 * s, -0.05 * s, 2.0 * s, 0.07 * s);

        // Back ski (behind, slightly offset)
        ctx.fillRect(-0.5 * s, 0.3 * s, 2.0 * s, 0.07 * s);

        // Front leg
        ctx.fillStyle = '#2244aa';
        ctx.save();
        ctx.translate(0.3 * s, 0);
        ctx.rotate(-0.15);
        ctx.fillRect(-0.08 * s, -0.7 * s, 0.16 * s, 0.7 * s);
        ctx.restore();

        // Back leg
        ctx.fillStyle = '#2244aa';
        ctx.save();
        ctx.translate(-0.2 * s, 0.3 * s);
        ctx.rotate(0.15);
        ctx.fillRect(-0.08 * s, -0.7 * s, 0.16 * s, 0.7 * s);
        ctx.restore();

        // Torso (upright)
        ctx.fillStyle = '#2244aa';
        ctx.fillRect(-0.12 * s, -1.3 * s, 0.24 * s, 0.7 * s);

        // Arms outstretched
        ctx.strokeStyle = '#2244aa';
        ctx.lineWidth = Math.max(2, 0.06 * s);
        ctx.lineCap = 'round';
        // Left arm
        ctx.beginPath();
        ctx.moveTo(-0.12 * s, -1.0 * s);
        ctx.lineTo(-0.7 * s, -0.8 * s);
        ctx.stroke();
        // Right arm
        ctx.beginPath();
        ctx.moveTo(0.12 * s, -1.0 * s);
        ctx.lineTo(0.7 * s, -0.8 * s);
        ctx.stroke();

        // Head
        ctx.fillStyle = '#cc2222';
        ctx.beginPath();
        ctx.arc(0, -1.45 * s, 0.15 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffccaa';
        ctx.beginPath();
        ctx.arc(0.06 * s, -1.40 * s, 0.07 * s, 0, Math.PI * 2);
        ctx.fill();
    }

    // ------------------------------------------------------------------
    // 6. Spectators
    // ------------------------------------------------------------------

    _drawSpectators(ctx) {
        const r = this.renderer;

        for (const spec of this._spectators) {
            const sp = r.worldToScreen(spec.x, spec.y);

            // Body (small rectangle)
            ctx.fillStyle = spec.color;
            const h = spec.h * r.ppm;
            const w = h * 0.4;
            ctx.fillRect(sp.x - w / 2, sp.y - h, w, h);

            // Head (small circle)
            ctx.fillStyle = '#ffccaa';
            ctx.beginPath();
            ctx.arc(sp.x, sp.y - h - w * 0.4, w * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ------------------------------------------------------------------
    // 7. Snow particles
    // ------------------------------------------------------------------

    _drawSnowParticles(ctx, w, h) {
        const now = Date.now() * 0.001;

        for (const p of this._snowParticles) {
            // Animate position (wrapping)
            const px = ((p.x + p.speedX * now) % 1 + 1) % 1;
            const py = ((p.y + p.speedY * now) % 1 + 1) % 1;

            ctx.beginPath();
            ctx.arc(px * w, py * h, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
            ctx.fill();
        }
    }
}
