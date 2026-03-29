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
        // Very smooth transitions across all states (lerp speed 2)
        let followSpeed = 2;
        let zoomSpeed = 2;

        switch (gameState) {
            case GameState.MENU:
            case GameState.READY: {
                // Wide overview shot: centre on middle of hill
                const profile = this.hill.getProfile();
                const mid = profile[Math.floor(profile.length * 0.4)];
                targetX = mid.x;
                targetY = mid.y;
                targetZoom = 0.7;
                followSpeed = 2;
                zoomSpeed = 2;
                break;
            }
            case GameState.INRUN: {
                // Follow jumper closely, slightly ahead so track is visible
                // Lead the jumper by a few meters downhill
                targetX = jumperState.x + 5;
                // Slightly above to show surrounding area
                targetY = jumperState.y - 2;
                // Tight zoom on the jumper during inrun
                targetZoom = 2.5;
                // Fast follow so camera catches up quickly at inrun start
                followSpeed = 5;
                zoomSpeed = 3;
                break;
            }
            case GameState.TAKEOFF: {
                // Dramatic launch moment: slight zoom in, centred on jumper
                targetX = jumperState.x + 3;
                targetY = jumperState.y - 2;
                targetZoom = 3.0;
                followSpeed = 2;
                zoomSpeed = 2;
                break;
            }
            case GameState.FLIGHT: {
                // Smoothly pull back to show the full flight arc
                // Keep camera ahead and above so landing area stays visible
                targetX = jumperState.x + 12;
                targetY = jumperState.y - 8;
                targetZoom = 1.2;
                followSpeed = 2;
                zoomSpeed = 2;
                break;
            }
            case GameState.LANDING: {
                // Quick zoom to show the telemark landing clearly
                targetX = jumperState.x + 2;
                targetY = jumperState.y - 1.5;
                targetZoom = 2.0;
                followSpeed = 2;
                zoomSpeed = 2;
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

        // --- Warm amber glow at horizon line ---
        const glowTop = h * 0.35;
        const glowBottom = h * 0.65;
        const glowGrad = ctx.createLinearGradient(0, glowTop, 0, glowBottom);
        glowGrad.addColorStop(0, 'rgba(255,190,90,0)');
        glowGrad.addColorStop(0.3, 'rgba(255,170,70,0.10)');
        glowGrad.addColorStop(0.5, 'rgba(255,155,55,0.12)');
        glowGrad.addColorStop(0.7, 'rgba(255,140,40,0.07)');
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

            // --- White snow caps on peaks ---
            // Find local peaks (lower y = higher on screen) and draw small white triangles
            for (let i = 1; i < points.length - 1; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                const next = points[i + 1];

                // A peak is where the point is higher (smaller y) than both neighbours
                if (curr.y < prev.y && curr.y < next.y) {
                    const peakX = (curr.x + offsetX) * w;
                    const peakY = curr.y * h;
                    // Snow cap size: small triangles, slightly larger for foreground layers
                    const capH = 5 + layer * 2;
                    const capW = capH * 1.5;
                    // Front layers are more opaque
                    const alpha = 0.5 + layer * 0.15;

                    ctx.beginPath();
                    ctx.moveTo(peakX, peakY);
                    ctx.lineTo(peakX - capW / 2, peakY + capH);
                    ctx.lineTo(peakX + capW / 2, peakY + capH);
                    ctx.closePath();
                    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
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
        groundGrad.addColorStop(0.1, '#d0e0f2');
        groundGrad.addColorStop(0.3, '#c0d4ea');
        groundGrad.addColorStop(0.6, '#a0b8d8');
        groundGrad.addColorStop(1, '#7090b8');
        ctx.fillStyle = groundGrad;
        ctx.fill();

        // --- Snow texture: subtle blue shadow ellipses ---
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

        // --- Snow texture: small sparkle dots (crystalline glints) ---
        const rng2 = seededRandom(4040);
        const t = this._time || 0;
        ctx.save();
        for (let i = 0; i < 50; i++) {
            const wx = profile[0].x + rng2() * (profile[profile.length - 1].x - profile[0].x);
            const wy = this.hill.getHeightAtDistance(wx) + 1 + rng2() * 12;
            const sp = r.worldToScreen(wx, wy);
            if (sp.x < -20 || sp.x > w + 20 || sp.y < -20 || sp.y > h + 20) continue;
            const sparkle = 0.3 + 0.7 * Math.abs(Math.sin(t * (1.5 + rng2() * 2) + rng2() * 6.28));
            ctx.globalAlpha = 0.15 * sparkle;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, 1 + rng2() * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }
        ctx.restore();

        // --- Snow drift ridges (subtle wavy highlight lines) ---
        const rng3 = seededRandom(6060);
        ctx.save();
        ctx.globalAlpha = 0.06;
        ctx.strokeStyle = '#e0ecff';
        ctx.lineWidth = 1;
        for (let ridge = 0; ridge < 8; ridge++) {
            const baseWx = profile[0].x + rng3() * (profile[profile.length - 1].x - profile[0].x);
            const baseWy = this.hill.getHeightAtDistance(baseWx) + 3 + rng3() * 15;
            ctx.beginPath();
            const ridgeLen = 8 + rng3() * 20;
            for (let j = 0; j <= 10; j++) {
                const rx = baseWx + (j / 10) * ridgeLen;
                const ry = baseWy + Math.sin(j * 0.8 + rng3() * 6) * 0.5;
                const sp = r.worldToScreen(rx, ry);
                if (j === 0) ctx.moveTo(sp.x, sp.y);
                else ctx.lineTo(sp.x, sp.y);
            }
            ctx.stroke();
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
        const inrunPts = this.hill.getInrunPoints();
        const landingPts = this.hill.getLandingPoints();

        // --- Inrun: dark side walls flanking the ice track ---
        const wallThickness = 1.2;
        // Lower wall
        ctx.beginPath();
        let first = true;
        for (const pt of inrunPts) {
            const sp = r.worldToScreen(pt.x, pt.y + wallThickness);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        for (let i = inrunPts.length - 1; i >= 0; i--) {
            const sp = r.worldToScreen(inrunPts[i].x, inrunPts[i].y + wallThickness + 2.5);
            ctx.lineTo(sp.x, sp.y);
        }
        ctx.closePath();
        ctx.fillStyle = '#2a3040';
        ctx.fill();
        // Upper wall
        ctx.beginPath();
        first = true;
        for (const pt of inrunPts) {
            const sp = r.worldToScreen(pt.x, pt.y - wallThickness);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        for (let i = inrunPts.length - 1; i >= 0; i--) {
            const sp = r.worldToScreen(inrunPts[i].x, inrunPts[i].y - wallThickness - 2.5);
            ctx.lineTo(sp.x, sp.y);
        }
        ctx.closePath();
        ctx.fillStyle = '#2a3040';
        ctx.fill();

        // Orange barrier nets on top of walls
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ff6600';
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        first = true;
        for (let i = 0; i < inrunPts.length; i += 4) {
            const sp = r.worldToScreen(inrunPts[i].x, inrunPts[i].y + wallThickness + 0.3);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        ctx.stroke();
        ctx.beginPath();
        first = true;
        for (let i = 0; i < inrunPts.length; i += 4) {
            const sp = r.worldToScreen(inrunPts[i].x, inrunPts[i].y - wallThickness - 0.3);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Net posts every ~8m along the inrun
        ctx.strokeStyle = '#cc5500';
        ctx.lineWidth = 1.5;
        const postStep = Math.max(1, Math.floor(inrunPts.length / 12));
        for (let i = 0; i < inrunPts.length; i += postStep) {
            const pt = inrunPts[i];
            let sp1 = r.worldToScreen(pt.x, pt.y + wallThickness + 0.3);
            let sp2 = r.worldToScreen(pt.x, pt.y + wallThickness - 0.8);
            ctx.beginPath(); ctx.moveTo(sp1.x, sp1.y); ctx.lineTo(sp2.x, sp2.y); ctx.stroke();
            sp1 = r.worldToScreen(pt.x, pt.y - wallThickness - 0.3);
            sp2 = r.worldToScreen(pt.x, pt.y - wallThickness + 0.8);
            ctx.beginPath(); ctx.moveTo(sp1.x, sp1.y); ctx.lineTo(sp2.x, sp2.y); ctx.stroke();
        }

        // Icy blue-white inrun track surface
        ctx.beginPath();
        first = true;
        for (const pt of inrunPts) {
            const sp = r.worldToScreen(pt.x, pt.y);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        const inrunLast = inrunPts[inrunPts.length - 1];
        const inrunFirst = inrunPts[0];
        const inrunLastS = r.worldToScreen(inrunLast.x, inrunLast.y);
        const inrunFirstS = r.worldToScreen(inrunFirst.x, inrunFirst.y);
        const iceThickness = 2 * r.ppm;
        ctx.lineTo(inrunLastS.x, inrunLastS.y + iceThickness);
        ctx.lineTo(inrunFirstS.x, inrunFirstS.y + iceThickness);
        ctx.closePath();
        const iceGrad = ctx.createLinearGradient(inrunFirstS.x, inrunFirstS.y, inrunLastS.x, inrunLastS.y);
        iceGrad.addColorStop(0, '#d8eeff');
        iceGrad.addColorStop(0.3, '#c0ddf8');
        iceGrad.addColorStop(0.6, '#b8d8f5');
        iceGrad.addColorStop(1, '#d0e8ff');
        ctx.fillStyle = iceGrad;
        ctx.fill();

        // Icy glare streaks
        ctx.save();
        ctx.globalAlpha = 0.25;
        const glareStep = Math.max(1, Math.floor(inrunPts.length / 8));
        for (let i = 0; i < inrunPts.length - 10; i += glareStep) {
            const p1 = r.worldToScreen(inrunPts[i].x, inrunPts[i].y);
            const p2 = r.worldToScreen(inrunPts[i + 8].x, inrunPts[i + 8].y);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        ctx.restore();

        // --- Landing slope: white snow surface ---
        ctx.beginPath();
        first = true;
        for (const pt of landingPts) {
            const sp = r.worldToScreen(pt.x, pt.y);
            if (first) { ctx.moveTo(sp.x, sp.y); first = false; }
            else ctx.lineTo(sp.x, sp.y);
        }
        const landLastS = r.worldToScreen(landingPts[landingPts.length - 1].x, landingPts[landingPts.length - 1].y);
        const landFirstS = r.worldToScreen(landingPts[0].x, landingPts[0].y);
        const thickness = 4 * r.ppm;
        ctx.lineTo(landLastS.x, landLastS.y + thickness);
        ctx.lineTo(landFirstS.x, landFirstS.y + thickness);
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

        // --- Floodlight poles along the hill ---
        this._drawFloodlights(ctx, w, h);

        // --- Distance markers on landing slope (every 10m) ---
        this._drawDistanceMarkers(ctx);

        // --- K-point and HS-point lines ---
        this._drawPointMarker(ctx, this.hill.getKPointPosition(), '#ff2222', 'K');
        this._drawPointMarker(ctx, this.hill.getHSPointPosition(), '#2255ff', 'HS');

        // --- Judges tower ---
        this._drawJudgesTower(ctx);
    }

    _drawFloodlights(ctx, w, h) {
        const r = this.renderer;
        const kp = this.hill.getKPointPosition();
        const hs = this.hill.getHSPointPosition();
        if (!kp || !hs) return;

        const polePositions = [
            { x: kp.x * 0.3, side: 1 },
            { x: kp.x * 0.65, side: -1 },
            { x: kp.x * 1.0, side: 1 },
            { x: hs.x * 0.9, side: -1 },
        ];

        for (const pole of polePositions) {
            const surfaceY = this.hill.getHeightAtDistance(pole.x);
            const poleBaseY = surfaceY + pole.side * 6;
            const poleHeight = 18;
            const poleTopY = poleBaseY - poleHeight;

            const base = r.worldToScreen(pole.x, poleBaseY);
            const top = r.worldToScreen(pole.x, poleTopY);
            if (base.x < -100 || base.x > w + 100) continue;

            // Pole
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            ctx.lineTo(top.x, top.y);
            ctx.strokeStyle = '#556677';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Light fixture bracket
            ctx.fillStyle = '#778899';
            ctx.fillRect(top.x - 5, top.y - 2, 10, 4);

            // Light cone
            const coneTarget = r.worldToScreen(pole.x, surfaceY);
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            const coneH = Math.abs(coneTarget.y - top.y);
            const coneGrad = ctx.createRadialGradient(top.x, top.y, 2, top.x, top.y, coneH * 0.9);
            coneGrad.addColorStop(0, 'rgba(255,255,240,0.35)');
            coneGrad.addColorStop(0.3, 'rgba(255,255,230,0.12)');
            coneGrad.addColorStop(0.7, 'rgba(255,255,220,0.04)');
            coneGrad.addColorStop(1, 'rgba(255,255,220,0)');
            const coneSpread = coneH * 0.4;
            ctx.beginPath();
            ctx.moveTo(top.x - 3, top.y);
            ctx.lineTo(top.x + 3, top.y);
            ctx.lineTo(coneTarget.x + coneSpread, coneTarget.y);
            ctx.lineTo(coneTarget.x - coneSpread, coneTarget.y);
            ctx.closePath();
            ctx.fillStyle = coneGrad;
            ctx.fill();
            ctx.restore();

            // Bright dot at fixture
            ctx.beginPath();
            ctx.arc(top.x, top.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffee';
            ctx.fill();
        }
    }

    _drawDistanceMarkers(ctx) {
        const r = this.renderer;
        const landingPts = this.hill.getLandingPoints();

        for (let dist = 50; dist <= 140; dist += 10) {
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
            const angle = this.hill.getAngleAtDistance(closest.x) * Math.PI / 180;
            const nx = -Math.sin(angle);
            const ny = Math.cos(angle);
            const markerLen = 6;

            // Green perpendicular line
            ctx.beginPath();
            ctx.moveTo(sp.x - nx * markerLen, sp.y + ny * markerLen);
            ctx.lineTo(sp.x + nx * markerLen, sp.y - ny * markerLen);
            ctx.strokeStyle = '#33bb33';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Distance number
            ctx.save();
            ctx.font = 'bold 10px sans-serif';
            ctx.fillStyle = '#33bb33';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(String(dist), sp.x + nx * (markerLen + 2), sp.y - ny * (markerLen + 2) - 2);
            ctx.restore();
        }
    }

    _drawPointMarker(ctx, pos, color, label) {
        const r = this.renderer;
        if (!pos) return;

        const sp = r.worldToScreen(pos.x, pos.y);
        const angle = this.hill.getAngleAtDistance(pos.x) * Math.PI / 180;
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const lineLen = 14;

        // Thick perpendicular line
        ctx.beginPath();
        ctx.moveTo(sp.x - nx * lineLen, sp.y + ny * lineLen);
        ctx.lineTo(sp.x + nx * lineLen, sp.y - ny * lineLen);
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.stroke();

        // Glow effect
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(sp.x - nx * lineLen, sp.y + ny * lineLen);
        ctx.lineTo(sp.x + nx * lineLen, sp.y - ny * lineLen);
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.restore();

        // Label with background
        ctx.save();
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const labelX = sp.x + nx * (lineLen + 4);
        const labelY = sp.y - ny * (lineLen + 4) - 3;
        const metrics = ctx.measureText(label);
        const pad = 3;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(labelX - metrics.width / 2 - pad, labelY - 12 - pad, metrics.width + pad * 2, 14 + pad);
        ctx.fillStyle = color;
        ctx.fillText(label, labelX, labelY);
        ctx.restore();
    }

    _drawJudgesTower(ctx) {
        const r = this.renderer;
        const kp = this.hill.getKPointPosition();
        if (!kp) return;

        const towerX = kp.x + 5;
        const surfaceY = this.hill.getHeightAtDistance(towerX);
        const numFloors = 6;
        const floorH = 3;
        const towerTopY = surfaceY - numFloors * floorH;

        const base = r.worldToScreen(towerX, surfaceY + 3);
        const top = r.worldToScreen(towerX, towerTopY);

        const towerWidth = 14;
        const towerHeight = base.y - top.y;
        const floorHeightPx = towerHeight / numFloors;

        // Tower shadow
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.moveTo(base.x - towerWidth / 2, base.y);
        ctx.lineTo(base.x + towerWidth / 2, base.y);
        ctx.lineTo(base.x + towerWidth / 2 + 8, base.y + 4);
        ctx.lineTo(base.x - towerWidth / 2 + 8, base.y + 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Tower body (concrete gradient)
        const bodyGrad = ctx.createLinearGradient(top.x - towerWidth / 2, top.y, top.x + towerWidth / 2, top.y);
        bodyGrad.addColorStop(0, '#3a4a5a');
        bodyGrad.addColorStop(0.5, '#4a5a6a');
        bodyGrad.addColorStop(1, '#334455');
        ctx.fillStyle = bodyGrad;
        ctx.fillRect(top.x - towerWidth / 2, top.y, towerWidth, towerHeight);

        // Floors with lit windows
        const t = this._time || 0;
        for (let i = 0; i < numFloors; i++) {
            const floorY = top.y + i * floorHeightPx;

            // Floor divider
            ctx.fillStyle = '#2a3545';
            ctx.fillRect(top.x - towerWidth / 2, floorY, towerWidth, 1.5);

            // Two windows per floor
            const winW = towerWidth * 0.28;
            const winH = floorHeightPx * 0.5;
            const winY = floorY + floorHeightPx * 0.25;

            for (let wx = 0; wx < 2; wx++) {
                const winX = top.x - towerWidth / 2 + 2 + wx * (towerWidth * 0.45);

                // Window frame
                ctx.fillStyle = '#2a3040';
                ctx.fillRect(winX - 0.5, winY - 0.5, winW + 1, winH + 1);

                // Warm yellow lit window with flicker
                const flicker = 0.85 + 0.15 * Math.sin(t * 2.3 + i * 1.7 + wx * 3.1);
                const warmR = Math.floor(255 * flicker);
                const warmG = Math.floor(210 * flicker);
                const warmB = Math.floor(80 * flicker);
                ctx.fillStyle = `rgb(${warmR},${warmG},${warmB})`;
                ctx.fillRect(winX, winY, winW, winH);

                // Window glow
                ctx.save();
                ctx.globalAlpha = 0.15 * flicker;
                const glowRad = Math.max(winW, winH) * 1.5;
                const glowGrad = ctx.createRadialGradient(winX + winW / 2, winY + winH / 2, 1, winX + winW / 2, winY + winH / 2, glowRad);
                glowGrad.addColorStop(0, `rgb(${warmR},${warmG},${warmB})`);
                glowGrad.addColorStop(1, 'rgba(255,200,50,0)');
                ctx.fillStyle = glowGrad;
                ctx.fillRect(winX - glowRad, winY - glowRad, winW + glowRad * 2, winH + glowRad * 2);
                ctx.restore();
            }
        }

        // Roof / observation deck
        ctx.fillStyle = '#223344';
        ctx.fillRect(top.x - towerWidth / 2 - 3, top.y - 4, towerWidth + 6, 5);
        // Railing
        ctx.strokeStyle = '#556677';
        ctx.lineWidth = 1;
        ctx.strokeRect(top.x - towerWidth / 2 - 3, top.y - 7, towerWidth + 6, 3);
    }

    // ------------------------------------------------------------------
    // 5. Ski jumper
    // ------------------------------------------------------------------

    _drawJumper(ctx, js) {
        if (!js) return;

        const r = this.renderer;
        const sp = r.worldToScreen(js.x, js.y);
        const ppm = r.ppm;

        const scale = ppm;
        const phase = js.phase;
        const bodyAngle = (js.bodyAngle || 0) * Math.PI / 180;

        // --- Motion blur trail during FLIGHT (3 fading afterimages) ---
        if (phase === GameState.FLIGHT || phase === 'FLIGHT') {
            if (!this._jumperTrail) this._jumperTrail = [];
            this._jumperTrail.push({ x: js.x, y: js.y, angle: bodyAngle });
            if (this._jumperTrail.length > 4) this._jumperTrail.shift();

            const trailCount = Math.min(3, this._jumperTrail.length - 1);
            for (let i = 0; i < trailCount; i++) {
                const t = this._jumperTrail[i];
                const tsp = r.worldToScreen(t.x, t.y);
                const alpha = (i + 1) / (trailCount + 2) * 0.3;
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.translate(tsp.x, tsp.y);
                this._drawJumperFlight(ctx, scale, t.angle);
                ctx.restore();
            }
        } else {
            this._jumperTrail = [];
        }

        // --- Draw the main jumper ---
        ctx.save();
        ctx.translate(sp.x, sp.y);

        if (phase === GameState.INRUN || phase === 'INRUN') {
            this._drawJumperInrun(ctx, scale, bodyAngle);
        } else if (phase === GameState.TAKEOFF || phase === 'TAKEOFF') {
            // During takeoff, draw the inrun pose with the current body angle
            // (smooth transition from crouch to launch)
            this._drawJumperInrun(ctx, scale, bodyAngle);
        } else if (phase === GameState.FLIGHT || phase === 'FLIGHT') {
            this._drawJumperFlight(ctx, scale, bodyAngle);
        } else if (phase === GameState.LANDING || phase === 'LANDING') {
            this._drawJumperLanding(ctx, scale, bodyAngle);
        } else {
            this._drawJumperInrun(ctx, scale, bodyAngle);
        }

        ctx.restore();
    }


    /**
     * Rounded red helmet with goggles strip (side view).
     * Origin = centre of head, facing right.
     */
    _drawHelmet(ctx, s) {
        const hr = 0.14 * s;

        // Helmet shell
        ctx.fillStyle = '#cc2222';
        ctx.beginPath();
        ctx.ellipse(0, 0, hr, hr * 1.05, 0, 0, Math.PI * 2);
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255,120,120,0.35)';
        ctx.beginPath();
        ctx.ellipse(-hr * 0.2, -hr * 0.3, hr * 0.4, hr * 0.3, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Goggles strip
        ctx.fillStyle = '#222222';
        ctx.beginPath();
        ctx.ellipse(hr * 0.25, hr * 0.05, hr * 0.55, hr * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();

        // Lens reflection
        ctx.fillStyle = 'rgba(100,180,255,0.4)';
        ctx.beginPath();
        ctx.ellipse(hr * 0.35, -hr * 0.02, hr * 0.22, hr * 0.10, 0.1, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Dark gray ski with curved-up tip (2.4m long).
     * Drawn from startX along positive X for the given length.
     */
    _drawSki(ctx, s, startX, length) {
        const thickness = 0.05 * s;
        const tipLen = 0.2 * s;
        const tipCurve = 0.12 * s;

        ctx.fillStyle = '#3a3a3a';
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = Math.max(1, 0.02 * s);

        ctx.beginPath();
        ctx.moveTo(startX, thickness / 2);
        ctx.lineTo(startX + length - tipLen, thickness / 2);
        ctx.quadraticCurveTo(
            startX + length, thickness / 2,
            startX + length, -tipCurve
        );
        ctx.quadraticCurveTo(
            startX + length - tipLen * 0.3, -tipCurve * 0.3,
            startX + length - tipLen, -thickness / 2
        );
        ctx.lineTo(startX, -thickness / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    /** INRUN: deep crouch, arms tucked behind back, head down. */
    _drawJumperInrun(ctx, s, angle) {
        ctx.rotate(angle);

        // --- Skis (2.4m, flat under jumper) ---
        ctx.save();
        this._drawSki(ctx, s, -1.2 * s, 2.4 * s);
        ctx.restore();

        // Articulated crouch: feet at origin
        const kneeX = -0.05 * s;
        const kneeY = -0.40 * s;
        const hipX = 0.05 * s;
        const hipY = -0.55 * s;

        // Lower leg (shin)
        ctx.strokeStyle = '#1a3a99';
        ctx.lineWidth = Math.max(2.5, 0.12 * s);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(kneeX, kneeY);
        ctx.stroke();

        // Boot
        ctx.fillStyle = '#222';
        ctx.fillRect(-0.08 * s, -0.06 * s, 0.18 * s, 0.06 * s);

        // Upper leg (thigh)
        ctx.strokeStyle = '#1a3a99';
        ctx.lineWidth = Math.max(2.5, 0.13 * s);
        ctx.beginPath();
        ctx.moveTo(kneeX, kneeY);
        ctx.lineTo(hipX, hipY);
        ctx.stroke();

        // Torso (leaning forward aggressively)
        const shoulderX = hipX + 0.50 * s;
        const shoulderY = hipY - 0.15 * s;
        ctx.strokeStyle = '#2050bb';
        ctx.lineWidth = Math.max(3, 0.18 * s);
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(shoulderX, shoulderY);
        ctx.stroke();

        // Suit detail stripe
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = Math.max(1, 0.04 * s);
        ctx.beginPath();
        ctx.moveTo(hipX + 0.05 * s, hipY - 0.02 * s);
        ctx.lineTo(shoulderX - 0.05 * s, shoulderY + 0.02 * s);
        ctx.stroke();

        // Arms tucked behind back
        ctx.strokeStyle = '#1a3a99';
        ctx.lineWidth = Math.max(1.5, 0.08 * s);
        ctx.beginPath();
        ctx.moveTo(shoulderX - 0.10 * s, shoulderY + 0.05 * s);
        ctx.lineTo(hipX + 0.10 * s, hipY + 0.10 * s);
        ctx.lineTo(hipX - 0.15 * s, hipY + 0.15 * s);
        ctx.stroke();

        // Head (tilted down)
        ctx.save();
        ctx.translate(shoulderX + 0.18 * s, shoulderY - 0.03 * s);
        ctx.rotate(0.25);
        this._drawHelmet(ctx, s);
        ctx.restore();
    }

    /** FLIGHT: body horizontal at bodyAngle, arms at sides, V-skis (25 deg each). */
    _drawJumperFlight(ctx, s, angle) {
        ctx.rotate(angle);

        // Body horizontal. Head left (negative X), feet right (positive X).
        const hipX = 0;
        const hipY = 0;

        // Torso
        const torsoLen = 0.55 * s;
        const shoulderX = hipX - torsoLen;
        const shoulderY = hipY - 0.03 * s;
        ctx.strokeStyle = '#2050bb';
        ctx.lineWidth = Math.max(3, 0.18 * s);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(shoulderX, shoulderY);
        ctx.stroke();

        // Suit stripe
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = Math.max(1, 0.04 * s);
        ctx.beginPath();
        ctx.moveTo(hipX - 0.06 * s, hipY);
        ctx.lineTo(shoulderX + 0.06 * s, shoulderY);
        ctx.stroke();

        // Legs (extending back from hip)
        const kneeX = hipX + 0.42 * s;
        const kneeY = hipY + 0.10 * s;
        const footX = kneeX + 0.38 * s;
        const footY = kneeY + 0.05 * s;

        ctx.strokeStyle = '#1a3a99';
        ctx.lineWidth = Math.max(2.5, 0.12 * s);
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(kneeX, kneeY);
        ctx.stroke();
        ctx.lineWidth = Math.max(2, 0.10 * s);
        ctx.beginPath();
        ctx.moveTo(kneeX, kneeY);
        ctx.lineTo(footX, footY);
        ctx.stroke();

        // Boot
        ctx.fillStyle = '#222';
        ctx.save();
        ctx.translate(footX, footY);
        ctx.rotate(Math.atan2(footY - kneeY, footX - kneeX));
        ctx.fillRect(-0.04 * s, -0.05 * s, 0.14 * s, 0.07 * s);
        ctx.restore();

        // V-style skis (25 deg spread each)
        const vAngle = 25 * Math.PI / 180;
        ctx.save();
        ctx.translate(footX, footY);
        ctx.save();
        ctx.rotate(-vAngle);
        this._drawSki(ctx, s, -0.1 * s, 2.4 * s);
        ctx.restore();
        ctx.save();
        ctx.rotate(vAngle);
        this._drawSki(ctx, s, -0.1 * s, 2.4 * s);
        ctx.restore();
        ctx.restore();

        // Arms at sides
        ctx.strokeStyle = '#1a3a99';
        ctx.lineWidth = Math.max(1.5, 0.08 * s);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(shoulderX + 0.05 * s, shoulderY + 0.05 * s);
        ctx.lineTo(shoulderX + 0.30 * s, shoulderY + 0.20 * s);
        ctx.lineTo(hipX - 0.05 * s, hipY + 0.18 * s);
        ctx.stroke();

        // Glove
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(hipX - 0.05 * s, hipY + 0.18 * s, 0.04 * s, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.save();
        ctx.translate(shoulderX - 0.18 * s, shoulderY + 0.01 * s);
        ctx.rotate(0.1);
        this._drawHelmet(ctx, s);
        ctx.restore();
    }

    /** LANDING: telemark -- one leg forward, one back, arms spread wide. */
    _drawJumperLanding(ctx, s, angle) {
        ctx.rotate(angle);

        // Upright. Origin at ground contact. ~1.8m tall.
        const hipX = 0;
        const hipY = -0.90 * s;

        // Front leg (forward, knee slightly bent)
        const frontFootX = 0.40 * s;
        const frontFootY = 0;
        const frontKneeX = 0.20 * s;
        const frontKneeY = -0.45 * s;

        ctx.strokeStyle = '#1a3a99';
        ctx.lineWidth = Math.max(2.5, 0.12 * s);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(frontKneeX, frontKneeY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(frontKneeX, frontKneeY);
        ctx.lineTo(frontFootX, frontFootY);
        ctx.stroke();
        ctx.fillStyle = '#222';
        ctx.fillRect(frontFootX - 0.06 * s, -0.06 * s, 0.16 * s, 0.06 * s);

        // Back leg (behind, deeper knee bend -- telemark)
        const backFootX = -0.35 * s;
        const backFootY = -0.10 * s;
        const backKneeX = -0.15 * s;
        const backKneeY = -0.50 * s;

        ctx.strokeStyle = '#1a3a99';
        ctx.lineWidth = Math.max(2.5, 0.12 * s);
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(backKneeX, backKneeY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(backKneeX, backKneeY);
        ctx.lineTo(backFootX, backFootY);
        ctx.stroke();
        ctx.fillStyle = '#222';
        ctx.fillRect(backFootX - 0.06 * s, backFootY - 0.04 * s, 0.16 * s, 0.06 * s);

        // Front ski
        ctx.save();
        ctx.translate(frontFootX, frontFootY);
        this._drawSki(ctx, s, -0.6 * s, 2.4 * s);
        ctx.restore();

        // Back ski
        ctx.save();
        ctx.translate(backFootX, backFootY);
        this._drawSki(ctx, s, -0.6 * s, 2.4 * s);
        ctx.restore();

        // Torso (mostly upright, slight forward lean)
        const shoulderX = hipX + 0.05 * s;
        const shoulderY = hipY - 0.55 * s;
        ctx.strokeStyle = '#2050bb';
        ctx.lineWidth = Math.max(3, 0.18 * s);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(shoulderX, shoulderY);
        ctx.stroke();

        // Suit stripe
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = Math.max(1, 0.04 * s);
        ctx.beginPath();
        ctx.moveTo(hipX, hipY + 0.05 * s);
        ctx.lineTo(shoulderX, shoulderY + 0.05 * s);
        ctx.stroke();

        // Arms spread wide
        ctx.strokeStyle = '#1a3a99';
        ctx.lineWidth = Math.max(2, 0.09 * s);
        ctx.lineCap = 'round';
        // Forward-up arm
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(shoulderX + 0.30 * s, shoulderY - 0.10 * s);
        ctx.lineTo(shoulderX + 0.55 * s, shoulderY - 0.25 * s);
        ctx.stroke();
        // Backward-up arm
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(shoulderX - 0.30 * s, shoulderY - 0.08 * s);
        ctx.lineTo(shoulderX - 0.55 * s, shoulderY - 0.22 * s);
        ctx.stroke();

        // Gloves
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(shoulderX + 0.55 * s, shoulderY - 0.25 * s, 0.04 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(shoulderX - 0.55 * s, shoulderY - 0.22 * s, 0.04 * s, 0, Math.PI * 2);
        ctx.fill();

        // Head (upright)
        ctx.save();
        ctx.translate(shoulderX + 0.02 * s, shoulderY - 0.20 * s);
        this._drawHelmet(ctx, s);
        ctx.restore();
    }


    // ------------------------------------------------------------------
    // 6. Spectators
    // ------------------------------------------------------------------

    _drawSpectators(ctx) {
        const r = this.renderer;
        const t = this._time || 0;

        for (const spec of this._spectators) {
            const sp = r.worldToScreen(spec.x, spec.y);
            const ppm = r.ppm;
            const h = spec.h * ppm;      // total stick figure height in px
            const headR = h * 0.12;       // head radius
            const legLen = h * 0.35;      // leg length
            const bodyLen = h * 0.35;     // body (torso) line length
            const armLen = h * 0.25;      // arm length

            const lineW = Math.max(1, h * 0.06);
            ctx.lineCap = 'round';

            // Feet position = base
            const feetY = sp.y;
            const hipY = feetY - legLen;
            const shoulderY = hipY - bodyLen;
            const headCenterY = shoulderY - headR;

            // --- Leg lines (two lines from hip spreading down to feet) ---
            ctx.strokeStyle = spec.bodyColor;
            ctx.lineWidth = lineW;
            // Left leg
            ctx.beginPath();
            ctx.moveTo(sp.x, hipY);
            ctx.lineTo(sp.x - h * 0.1, feetY);
            ctx.stroke();
            // Right leg
            ctx.beginPath();
            ctx.moveTo(sp.x, hipY);
            ctx.lineTo(sp.x + h * 0.1, feetY);
            ctx.stroke();

            // --- Body line (vertical from hip to shoulder) ---
            ctx.strokeStyle = spec.bodyColor;
            ctx.lineWidth = lineW * 1.2;
            ctx.beginPath();
            ctx.moveTo(sp.x, hipY);
            ctx.lineTo(sp.x, shoulderY);
            ctx.stroke();

            // --- Arms (from shoulder) ---
            ctx.strokeStyle = spec.bodyColor;
            ctx.lineWidth = lineW;

            if (spec.action === 'wave') {
                // Left arm waves: angle varies with time
                const waveAngle = Math.sin(t * spec.waveSpeed + spec.wavePhase) * 0.7;
                const leftArmAngle = -1.2 + waveAngle; // swings around upper-left
                const lax = sp.x + Math.cos(leftArmAngle) * armLen;
                const lay = shoulderY + Math.sin(leftArmAngle) * armLen;
                ctx.beginPath();
                ctx.moveTo(sp.x, shoulderY);
                ctx.lineTo(lax, lay);
                ctx.stroke();
                // Right arm relaxed down
                ctx.beginPath();
                ctx.moveTo(sp.x, shoulderY);
                ctx.lineTo(sp.x + armLen * 0.7, shoulderY + armLen * 0.6);
                ctx.stroke();
            } else if (spec.action === 'flag') {
                // Right arm up holding flag
                const flagArmEndX = sp.x + armLen * 0.15;
                const flagArmEndY = shoulderY - armLen * 0.9;
                ctx.beginPath();
                ctx.moveTo(sp.x, shoulderY);
                ctx.lineTo(flagArmEndX, flagArmEndY);
                ctx.stroke();
                // Flag pole
                ctx.strokeStyle = '#664422';
                ctx.lineWidth = Math.max(0.8, lineW * 0.6);
                const poleTopY = flagArmEndY - h * 0.2;
                ctx.beginPath();
                ctx.moveTo(flagArmEndX, flagArmEndY);
                ctx.lineTo(flagArmEndX, poleTopY);
                ctx.stroke();
                // Flag rectangle
                const flagW = h * 0.18;
                const flagH = h * 0.1;
                const wave = Math.sin(t * 3 + spec.wavePhase) * flagW * 0.08;
                ctx.fillStyle = spec.flagColor;
                ctx.beginPath();
                ctx.moveTo(flagArmEndX, poleTopY);
                ctx.lineTo(flagArmEndX + flagW + wave, poleTopY + flagH * 0.2);
                ctx.lineTo(flagArmEndX + flagW - wave, poleTopY + flagH);
                ctx.lineTo(flagArmEndX, poleTopY + flagH * 0.8);
                ctx.closePath();
                ctx.fill();
                // Left arm relaxed down
                ctx.strokeStyle = spec.bodyColor;
                ctx.lineWidth = lineW;
                ctx.beginPath();
                ctx.moveTo(sp.x, shoulderY);
                ctx.lineTo(sp.x - armLen * 0.7, shoulderY + armLen * 0.6);
                ctx.stroke();
            } else {
                // Still: both arms relaxed at sides
                ctx.beginPath();
                ctx.moveTo(sp.x, shoulderY);
                ctx.lineTo(sp.x - armLen * 0.7, shoulderY + armLen * 0.6);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(sp.x, shoulderY);
                ctx.lineTo(sp.x + armLen * 0.7, shoulderY + armLen * 0.6);
                ctx.stroke();
            }

            // --- Head (circle) ---
            ctx.fillStyle = '#ffccaa';
            ctx.beginPath();
            ctx.arc(sp.x, headCenterY, headR, 0, Math.PI * 2);
            ctx.fill();

            // --- Colored hat (small circle sitting on top of head) ---
            ctx.fillStyle = spec.hatColor;
            ctx.beginPath();
            ctx.arc(sp.x, headCenterY - headR * 0.9, headR * 0.55, 0, Math.PI * 2);
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
