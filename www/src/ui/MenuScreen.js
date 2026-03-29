/**
 * MenuScreen.js - Main menu UI for Vinter-OL Skihopp
 *
 * Renders directly to Canvas 2D context. Designed for mobile portrait (~390x844).
 * Provides touch-friendly menu buttons and decorative elements.
 */

export default class MenuScreen {
    constructor() {
        // Button definitions
        this.buttons = [
            { label: 'ENKELTHOPP', subtitle: null, id: 'single', enabled: true, primary: true },
            { label: 'KONKURRANSE', subtitle: null, id: 'competition', enabled: true, primary: false },
            { label: 'INNSTILLINGER', subtitle: 'Kommer snart', id: 'settings', enabled: false, primary: false },
        ];

        // Cached button hit areas (recalculated each render)
        this._buttonRects = [];

        // Track pressed button for press animation
        this._pressedButton = null;

        // Snowflake positions (generated once, rendered each frame)
        this._snowflakes = [];
        for (let i = 0; i < 60; i++) {
            this._snowflakes.push({
                x: Math.random(),
                y: Math.random(),
                size: 1 + Math.random() * 2.5,
                speed: 0.006 + Math.random() * 0.012,
                drift: (Math.random() - 0.5) * 0.002,
                wobbleSpeed: 1 + Math.random() * 2,
                wobbleAmp: 0.0004 + Math.random() * 0.001,
                opacity: 0.15 + Math.random() * 0.4,
            });
        }

        // Stars (static positions, twinkle animation)
        this._stars = [];
        for (let i = 0; i < 40; i++) {
            this._stars.push({
                x: Math.random(),
                y: Math.random() * 0.45,
                size: 0.5 + Math.random() * 1.5,
                twinkleSpeed: 0.5 + Math.random() * 3,
                twinkleOffset: Math.random() * Math.PI * 2,
                baseOpacity: 0.3 + Math.random() * 0.5,
            });
        }

        // Ski jumper silhouette state
        this._jumper = {
            x: -0.15,
            y: 0.28 + Math.random() * 0.1,
            speed: 0.0012 + Math.random() * 0.0008,
            scale: 0.7 + Math.random() * 0.3,
            active: true,
            delay: 0,
        };

        // Animation time tracker
        this._time = 0;
    }

    // -------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width   - logical CSS pixels
     * @param {number} height  - logical CSS pixels
     * @param {object} data    - optional state data (e.g. { time })
     */
    render(ctx, width, height, data = {}) {
        this._time += 0.016; // ~60fps increment

        this._renderBackground(ctx, width, height);
        this._renderStars(ctx, width, height);
        this._renderSkiJumpHill(ctx, width, height);
        this._renderSnowflakes(ctx, width, height);
        this._renderSkiJumper(ctx, width, height);
        this._renderOlympicRings(ctx, width, height);
        this._renderTitle(ctx, width, height);
        this._renderButtons(ctx, width, height);
        this._renderPulsingTapText(ctx, width, height);
        this._renderNorwegianFlag(ctx, width, height);
    }

    _renderBackground(ctx, width, height) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#020510');
        grad.addColorStop(0.25, '#081028');
        grad.addColorStop(0.55, '#0f1a3a');
        grad.addColorStop(0.85, '#132248');
        grad.addColorStop(1, '#0a1530');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }

    _renderStars(ctx, width, height) {
        for (const star of this._stars) {
            const twinkle = star.baseOpacity +
                Math.sin(this._time * star.twinkleSpeed + star.twinkleOffset) * 0.25;
            const alpha = Math.max(0.05, Math.min(0.9, twinkle));

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    _renderSkiJumpHill(ctx, width, height) {
        // Ski jump hill silhouette on the right side
        ctx.save();
        ctx.fillStyle = '#060d1e';

        ctx.beginPath();
        // Start from bottom-right
        ctx.moveTo(width, height);
        // Go up the right edge
        ctx.lineTo(width, height * 0.25);
        // Top of the tower/in-run
        ctx.lineTo(width * 0.82, height * 0.22);
        // In-run slope going down-left
        ctx.lineTo(width * 0.72, height * 0.28);
        ctx.lineTo(width * 0.62, height * 0.38);
        // Takeoff ramp (lip curves up slightly)
        ctx.quadraticCurveTo(width * 0.56, height * 0.44, width * 0.54, height * 0.42);
        // Below the lip - the hill drops away
        ctx.quadraticCurveTo(width * 0.52, height * 0.46, width * 0.50, height * 0.55);
        // Landing hill slope
        ctx.quadraticCurveTo(width * 0.48, height * 0.68, width * 0.50, height * 0.80);
        // Outrun flattens
        ctx.quadraticCurveTo(width * 0.52, height * 0.90, width * 0.55, height * 0.95);
        ctx.lineTo(width * 0.60, height);
        ctx.closePath();
        ctx.fill();

        // Tower structure lines (subtle)
        ctx.strokeStyle = 'rgba(30,50,80,0.5)';
        ctx.lineWidth = 1.5;
        // Vertical tower support
        ctx.beginPath();
        ctx.moveTo(width * 0.88, height * 0.24);
        ctx.lineTo(width * 0.88, height * 0.95);
        ctx.stroke();
        // Cross braces
        ctx.strokeStyle = 'rgba(30,50,80,0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const bY = height * (0.30 + i * 0.13);
            ctx.beginPath();
            ctx.moveTo(width * 0.82, bY);
            ctx.lineTo(width * 0.94, bY);
            ctx.stroke();
        }

        ctx.restore();
    }

    _renderSnowflakes(ctx, width, height) {
        for (const flake of this._snowflakes) {
            // Animate
            flake.y += flake.speed * 0.016 * 3;
            flake.x += flake.drift + Math.sin(this._time * flake.wobbleSpeed) * flake.wobbleAmp;
            if (flake.y > 1.05) { flake.y = -0.05; flake.x = Math.random(); }
            if (flake.x > 1.05) flake.x = -0.05;
            if (flake.x < -0.05) flake.x = 1.05;

            const sx = flake.x * width;
            const sy = flake.y * height;

            ctx.save();
            ctx.globalAlpha = flake.opacity;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(sx, sy, flake.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    _renderSkiJumper(ctx, width, height) {
        const j = this._jumper;

        // Handle delay between runs
        if (j.delay > 0) {
            j.delay -= 0.016;
            return;
        }

        // Move jumper across screen
        j.x += j.speed;

        // Gentle arc trajectory
        const arcY = j.y + Math.sin(j.x * Math.PI) * 0.06;

        if (j.x > 1.2) {
            // Reset for next pass
            j.x = -0.2;
            j.y = 0.22 + Math.random() * 0.12;
            j.speed = 0.001 + Math.random() * 0.001;
            j.scale = 0.6 + Math.random() * 0.4;
            j.delay = 4 + Math.random() * 6;
            return;
        }

        const px = j.x * width;
        const py = arcY * height;
        const s = j.scale * Math.min(width * 0.05, 22);

        ctx.save();
        ctx.globalAlpha = 0.18 + j.scale * 0.1;
        ctx.translate(px, py);

        // Tilt based on trajectory
        const tilt = -0.15 + j.x * 0.12;
        ctx.rotate(tilt);

        // Draw ski jumper silhouette
        ctx.fillStyle = 'rgba(180,210,255,0.9)';

        // Body (leaning forward)
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.0, s * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(s * 0.8, -s * 0.12, s * 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Skis (V-style)
        ctx.strokeStyle = 'rgba(180,210,255,0.9)';
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, s * 0.18);
        ctx.lineTo(-s * 1.6, s * 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, -s * 0.04);
        ctx.lineTo(-s * 1.6, -s * 0.4);
        ctx.stroke();

        ctx.restore();
    }

    _renderOlympicRings(ctx, width, height) {
        const centerX = width / 2;
        const topY = height * 0.10;
        const r = Math.min(width * 0.045, 22);
        const gap = r * 2.3;
        const lineWidth = Math.max(2.5, r * 0.28);

        // Official Olympic ring colors
        const colors = ['#0081C8', '#FCB131', '#000000', '#00A651', '#EE334E'];
        // Top row: blue, black, red    Bottom row: yellow, green
        const positions = [
            { x: centerX - gap * 2, y: topY },
            { x: centerX - gap,     y: topY + r * 1.05 },
            { x: centerX,           y: topY },
            { x: centerX + gap,     y: topY + r * 1.05 },
            { x: centerX + gap * 2, y: topY },
        ];

        // Draw all rings as complete circles
        for (let i = 0; i < 5; i++) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(positions[i].x, positions[i].y, r, 0, Math.PI * 2);
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            ctx.restore();
        }

        // Interlocking segments
        this._drawRingSegment(ctx, positions[1], r, lineWidth, colors[1],
            -Math.PI * 0.6, -Math.PI * 0.35);
        this._drawRingSegment(ctx, positions[1], r, lineWidth, colors[1],
            -Math.PI * 0.15, Math.PI * 0.05);
        this._drawRingSegment(ctx, positions[3], r, lineWidth, colors[3],
            -Math.PI * 0.85, -Math.PI * 0.6);
        this._drawRingSegment(ctx, positions[3], r, lineWidth, colors[3],
            Math.PI * 0.05, Math.PI * 0.2);
        this._drawRingSegment(ctx, positions[2], r, lineWidth, colors[2],
            Math.PI * 0.35, Math.PI * 0.65);
        this._drawRingSegment(ctx, positions[2], r, lineWidth, colors[2],
            Math.PI * 0.55, Math.PI * 0.75);
    }

    _drawRingSegment(ctx, pos, r, lineWidth, color, startAngle, endAngle) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, startAngle, endAngle);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth + 1;
        ctx.lineCap = 'butt';
        ctx.stroke();
        ctx.restore();
    }

    _renderTitle(ctx, width, height) {
        const titleY = height * 0.21;
        const fontSize = Math.min(width * 0.17, 68);

        ctx.save();

        // Main title: VINTER-OL
        ctx.font = `800 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Subtle shadow
        ctx.shadowColor = 'rgba(0,10,40,0.9)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 3;

        // White text with slight blue tint
        ctx.fillStyle = '#e8f0ff';
        ctx.fillText('VINTER-OL', width / 2, titleY);

        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        ctx.restore();

        // Gold separator line
        const lineY = titleY + fontSize * 0.55;
        const lineW = Math.min(width * 0.45, 200);
        ctx.save();
        const lineGrad = ctx.createLinearGradient(
            width / 2 - lineW / 2, lineY,
            width / 2 + lineW / 2, lineY
        );
        lineGrad.addColorStop(0, 'rgba(200,170,80,0)');
        lineGrad.addColorStop(0.2, 'rgba(210,180,90,0.7)');
        lineGrad.addColorStop(0.5, 'rgba(230,200,110,0.9)');
        lineGrad.addColorStop(0.8, 'rgba(210,180,90,0.7)');
        lineGrad.addColorStop(1, 'rgba(200,170,80,0)');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(width / 2 - lineW / 2, lineY);
        ctx.lineTo(width / 2 + lineW / 2, lineY);
        ctx.stroke();
        ctx.restore();

        // SKIHOPP in gold/amber
        const subY = lineY + Math.min(width * 0.07, 28);
        const subFontSize = Math.min(width * 0.085, 34);

        ctx.save();
        ctx.font = `600 ${subFontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(180,140,40,0.4)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#d4a843';
        ctx.fillText('SKIHOPP', width / 2, subY);
        ctx.restore();
    }

    _renderButtons(ctx, width, height) {
        this._buttonRects = [];

        const btnW = Math.min(280, width * 0.72);
        const btnH = 56;
        const gap = 18;
        const startY = height * 0.44;

        for (let i = 0; i < this.buttons.length; i++) {
            const btn = this.buttons[i];
            const x = (width - btnW) / 2;
            const y = startY + i * (btnH + gap);
            const isPressed = this._pressedButton === btn.id;
            const r = btnH / 2; // Pill shape

            // Store hit rect
            this._buttonRects.push({ x, y, w: btnW, h: btnH, id: btn.id, enabled: btn.enabled });

            ctx.save();

            // Press animation
            if (isPressed && btn.enabled) {
                ctx.translate(x + btnW / 2, y + btnH / 2);
                ctx.scale(0.96, 0.96);
                ctx.translate(-(x + btnW / 2), -(y + btnH / 2));
            }

            if (btn.enabled) {
                // Button gradient fill
                const grad = ctx.createLinearGradient(x, y, x, y + btnH);
                if (btn.primary) {
                    // Primary blue
                    if (isPressed) {
                        grad.addColorStop(0, '#1a4a8a');
                        grad.addColorStop(1, '#163d72');
                    } else {
                        grad.addColorStop(0, '#2563b0');
                        grad.addColorStop(0.5, '#1e56a0');
                        grad.addColorStop(1, '#1a4a8a');
                    }
                } else {
                    // Secondary darker
                    if (isPressed) {
                        grad.addColorStop(0, '#1a2a4a');
                        grad.addColorStop(1, '#141f38');
                    } else {
                        grad.addColorStop(0, '#1e3355');
                        grad.addColorStop(0.5, '#1a2d4c');
                        grad.addColorStop(1, '#162644');
                    }
                }

                // Shadow
                ctx.save();
                ctx.shadowColor = btn.primary
                    ? 'rgba(37,99,176,0.4)'
                    : 'rgba(20,40,80,0.3)';
                ctx.shadowBlur = isPressed ? 6 : 10;
                ctx.shadowOffsetY = isPressed ? 1 : 3;

                ctx.fillStyle = grad;
                this._roundRect(ctx, x, y, btnW, btnH, r);
                ctx.fill();
                ctx.restore();

                // Subtle top highlight
                ctx.save();
                this._roundRect(ctx, x, y, btnW, btnH * 0.5, { tl: r, tr: r, br: 0, bl: 0 });
                ctx.clip();
                const hlGrad = ctx.createLinearGradient(x, y, x, y + btnH * 0.5);
                hlGrad.addColorStop(0, 'rgba(255,255,255,0.1)');
                hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = hlGrad;
                ctx.fillRect(x, y, btnW, btnH * 0.5);
                ctx.restore();

                // Border
                ctx.strokeStyle = btn.primary
                    ? 'rgba(100,170,255,0.3)'
                    : 'rgba(80,120,180,0.2)';
                ctx.lineWidth = 1;
                this._roundRect(ctx, x, y, btnW, btnH, r);
                ctx.stroke();
            } else {
                // Disabled button
                ctx.fillStyle = 'rgba(255,255,255,0.04)';
                this._roundRect(ctx, x, y, btnW, btnH, r);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.lineWidth = 1;
                this._roundRect(ctx, x, y, btnW, btnH, r);
                ctx.stroke();
            }

            // Button label
            const labelSize = Math.min(width * 0.048, 19);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (btn.enabled) {
                ctx.fillStyle = '#ffffff';
                ctx.font = `700 ${labelSize}px sans-serif`;
                ctx.fillText(btn.label, width / 2, y + btnH / 2);
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.font = `500 ${labelSize}px sans-serif`;
                ctx.fillText(btn.label, width / 2, y + btnH / 2 - 7);
                // Subtitle
                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ctx.font = `400 ${Math.min(width * 0.028, 11)}px sans-serif`;
                ctx.fillText(btn.subtitle, width / 2, y + btnH / 2 + 11);
            }

            ctx.restore();
        }
    }

    _renderPulsingTapText(ctx, width, height) {
        const y = height * 0.78;

        // Gentle pulsing opacity
        const pulse = 0.3 + Math.sin(this._time * 2.5) * 0.25;

        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = 'rgba(200,220,255,0.9)';
        ctx.font = `300 ${Math.min(width * 0.035, 14)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Tap for \u00e5 starte', width / 2, y);
        ctx.restore();
    }

    _renderNorwegianFlag(ctx, width, height) {
        // Thin Norwegian flag bar across the very bottom
        const barH = Math.max(3, height * 0.006);
        const bottomY = height - barH * 3;

        // Red
        ctx.fillStyle = '#BA0C2F';
        ctx.fillRect(0, bottomY, width, barH);
        // White
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, bottomY + barH, width, barH);
        // Blue
        ctx.fillStyle = '#00205B';
        ctx.fillRect(0, bottomY + barH * 2, width, barH);
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    _roundRect(ctx, x, y, w, h, r) {
        let tl, tr, br, bl;
        if (typeof r === 'number') {
            tl = tr = br = bl = r;
        } else {
            tl = r.tl || 0;
            tr = r.tr || 0;
            br = r.br || 0;
            bl = r.bl || 0;
        }
        ctx.beginPath();
        ctx.moveTo(x + tl, y);
        ctx.lineTo(x + w - tr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
        ctx.lineTo(x + w, y + h - br);
        ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
        ctx.lineTo(x + bl, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
        ctx.lineTo(x, y + tl);
        ctx.quadraticCurveTo(x, y, x + tl, y);
        ctx.closePath();
    }

    _measureSpacedText(ctx, text, spacing) {
        let total = 0;
        for (let i = 0; i < text.length; i++) {
            total += ctx.measureText(text[i]).width;
            if (i < text.length - 1) total += spacing;
        }
        return total;
    }

    // -------------------------------------------------------------------
    // Input handling
    // -------------------------------------------------------------------

    /**
     * Check if a tap hits a menu button.
     * @param {number} x - tap X in CSS pixels
     * @param {number} y - tap Y in CSS pixels
     * @returns {string|null} button id or null
     */
    handleTap(x, y) {
        for (const rect of this._buttonRects) {
            if (!rect.enabled) continue;
            if (x >= rect.x && x <= rect.x + rect.w &&
                y >= rect.y && y <= rect.y + rect.h) {
                // Trigger brief press animation
                this._pressedButton = rect.id;
                setTimeout(() => { this._pressedButton = null; }, 150);
                return rect.id;
            }
        }
        return null;
    }
}
