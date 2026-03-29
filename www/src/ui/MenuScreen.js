/**
 * MenuScreen.js - Premium main menu for Vinter-OL Skihopp
 *
 * Renders to Canvas 2D context. Designed for mobile portrait (~390x844).
 * Integrates with progression system via render(ctx, width, height, menuData).
 */

export default class MenuScreen {
    constructor() {
        this.buttons = [
            { label: 'HOPP', id: 'jump', primary: true },
            { label: 'VELG BAKKE', id: 'hills', primary: false },
            { label: 'STATISTIKK', id: 'stats', primary: false },
            { label: 'INNSTILLINGER', id: 'settings', primary: false },
        ];

        this._buttonRects = [];
        this._pressedButton = null;
        this._time = 0;

        // 40 snowflakes
        this._snowflakes = [];
        for (let i = 0; i < 40; i++) {
            this._snowflakes.push({
                x: Math.random(),
                y: Math.random(),
                size: 1 + Math.random() * 2,
                speed: 0.004 + Math.random() * 0.008,
                drift: (Math.random() - 0.5) * 0.0015,
                wobbleSpeed: 1 + Math.random() * 2,
                wobbleAmp: 0.0003 + Math.random() * 0.0008,
                opacity: 0.12 + Math.random() * 0.3,
            });
        }

        // 20 stars
        this._stars = [];
        for (let i = 0; i < 20; i++) {
            this._stars.push({
                x: Math.random(),
                y: Math.random() * 0.4,
                size: 0.4 + Math.random() * 1.2,
                twinkleSpeed: 0.5 + Math.random() * 2.5,
                twinkleOffset: Math.random() * Math.PI * 2,
                baseOpacity: 0.25 + Math.random() * 0.45,
            });
        }

        // Animated jumper silhouette
        this._jumper = {
            x: -0.15,
            y: 0.26 + Math.random() * 0.08,
            speed: 0.001 + Math.random() * 0.0008,
            scale: 0.7 + Math.random() * 0.3,
            delay: 0,
        };
    }

    // -------------------------------------------------------------------
    // Main render
    // -------------------------------------------------------------------

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     * @param {object} menuData - { record, level, xp, xpForNextLevel, hillName }
     */
    render(ctx, width, height, menuData = {}) {
        this._time += 0.016;

        this._renderBackground(ctx, width, height);
        this._renderStars(ctx, width, height);
        this._renderSkiJumpHill(ctx, width, height);
        this._renderSnowflakes(ctx, width, height);
        this._renderSkiJumper(ctx, width, height);
        this._renderOlympicRings(ctx, width, height);
        this._renderTitle(ctx, width, height);
        this._renderButtons(ctx, width, height);
        this._renderBottomInfo(ctx, width, height, menuData);
        this._renderNorwegianFlag(ctx, width, height);
    }

    // -------------------------------------------------------------------
    // Background
    // -------------------------------------------------------------------

    _renderBackground(ctx, width, height) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#0a0a20');
        grad.addColorStop(1, '#1a1a3e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }

    // -------------------------------------------------------------------
    // Stars
    // -------------------------------------------------------------------

    _renderStars(ctx, width, height) {
        for (const star of this._stars) {
            const twinkle = star.baseOpacity +
                Math.sin(this._time * star.twinkleSpeed + star.twinkleOffset) * 0.2;
            const alpha = Math.max(0.05, Math.min(0.85, twinkle));

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // -------------------------------------------------------------------
    // Ski jump hill silhouette (right side)
    // -------------------------------------------------------------------

    _renderSkiJumpHill(ctx, width, height) {
        ctx.save();
        ctx.fillStyle = '#08081a';

        ctx.beginPath();
        ctx.moveTo(width, height);
        ctx.lineTo(width, height * 0.22);
        ctx.lineTo(width * 0.84, height * 0.20);
        ctx.lineTo(width * 0.74, height * 0.26);
        ctx.lineTo(width * 0.64, height * 0.36);
        ctx.quadraticCurveTo(width * 0.58, height * 0.42, width * 0.56, height * 0.40);
        ctx.quadraticCurveTo(width * 0.54, height * 0.44, width * 0.52, height * 0.54);
        ctx.quadraticCurveTo(width * 0.50, height * 0.67, width * 0.52, height * 0.78);
        ctx.quadraticCurveTo(width * 0.54, height * 0.88, width * 0.58, height * 0.94);
        ctx.lineTo(width * 0.62, height);
        ctx.closePath();
        ctx.fill();

        // Tower support lines
        ctx.strokeStyle = 'rgba(25,25,60,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(width * 0.90, height * 0.22);
        ctx.lineTo(width * 0.90, height * 0.94);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(25,25,60,0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const bY = height * (0.28 + i * 0.13);
            ctx.beginPath();
            ctx.moveTo(width * 0.84, bY);
            ctx.lineTo(width * 0.96, bY);
            ctx.stroke();
        }

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Snowflakes
    // -------------------------------------------------------------------

    _renderSnowflakes(ctx, width, height) {
        for (const f of this._snowflakes) {
            f.y += f.speed * 0.016 * 3;
            f.x += f.drift + Math.sin(this._time * f.wobbleSpeed) * f.wobbleAmp;
            if (f.y > 1.05) { f.y = -0.05; f.x = Math.random(); }
            if (f.x > 1.05) f.x = -0.05;
            if (f.x < -0.05) f.x = 1.05;

            ctx.save();
            ctx.globalAlpha = f.opacity;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(f.x * width, f.y * height, f.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // -------------------------------------------------------------------
    // Ski jumper silhouette (animated, flies across)
    // -------------------------------------------------------------------

    _renderSkiJumper(ctx, width, height) {
        const j = this._jumper;

        if (j.delay > 0) {
            j.delay -= 0.016;
            return;
        }

        j.x += j.speed;
        const arcY = j.y + Math.sin(j.x * Math.PI) * 0.05;

        if (j.x > 1.2) {
            j.x = -0.2;
            j.y = 0.20 + Math.random() * 0.10;
            j.speed = 0.001 + Math.random() * 0.001;
            j.scale = 0.6 + Math.random() * 0.4;
            j.delay = 5 + Math.random() * 6;
            return;
        }

        const px = j.x * width;
        const py = arcY * height;
        const s = j.scale * Math.min(width * 0.045, 20);

        ctx.save();
        ctx.globalAlpha = 0.15 + j.scale * 0.08;
        ctx.translate(px, py);
        ctx.rotate(-0.15 + j.x * 0.1);

        ctx.fillStyle = 'rgba(160,195,240,0.85)';

        // Body
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.0, s * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(s * 0.8, -s * 0.1, s * 0.18, 0, Math.PI * 2);
        ctx.fill();

        // Skis (V-style)
        ctx.strokeStyle = 'rgba(160,195,240,0.85)';
        ctx.lineWidth = Math.max(1.5, s * 0.07);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, s * 0.16);
        ctx.lineTo(-s * 1.5, s * 0.45);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, -s * 0.04);
        ctx.lineTo(-s * 1.5, -s * 0.35);
        ctx.stroke();

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Olympic rings (properly interlocking)
    // -------------------------------------------------------------------

    _renderOlympicRings(ctx, width, height) {
        const cx = width / 2;
        const topY = height * 0.09;
        const r = Math.min(width * 0.042, 20);
        const gap = r * 2.3;
        const lw = Math.max(2.5, r * 0.28);

        const colors = ['#0081C8', '#FCB131', '#000000', '#00A651', '#EE334E'];
        // Ring order: blue, yellow, black, green, red
        // Top row: blue(0), black(2), red(4) | Bottom row: yellow(1), green(3)
        const pos = [
            { x: cx - gap * 2, y: topY },           // blue (top)
            { x: cx - gap,     y: topY + r * 1.05 }, // yellow (bottom)
            { x: cx,           y: topY },             // black (top)
            { x: cx + gap,     y: topY + r * 1.05 }, // green (bottom)
            { x: cx + gap * 2, y: topY },             // red (top)
        ];

        // Draw rings back to front for proper interlocking
        // Order: yellow, green, blue, black, red with overlap segments

        // Layer 1: Draw all full rings
        for (let i = 0; i < 5; i++) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(pos[i].x, pos[i].y, r, 0, Math.PI * 2);
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = lw;
            ctx.stroke();
            ctx.restore();
        }

        // Layer 2: Interlocking overlap segments
        // Yellow over blue (bottom-right of yellow passes over blue)
        this._drawArc(ctx, pos[1], r, lw, colors[1], -Math.PI * 0.55, -Math.PI * 0.3);
        // Yellow under black (top-right of yellow passes under black) - draw black over
        this._drawArc(ctx, pos[2], r, lw, colors[2], Math.PI * 0.35, Math.PI * 0.65);
        // Green over black
        this._drawArc(ctx, pos[3], r, lw, colors[3], -Math.PI * 0.7, -Math.PI * 0.45);
        // Green under red - draw red over
        this._drawArc(ctx, pos[4], r, lw, colors[4], Math.PI * 0.35, Math.PI * 0.65);
    }

    _drawArc(ctx, pos, r, lw, color, start, end) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, start, end);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw + 1;
        ctx.lineCap = 'butt';
        ctx.stroke();
        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Title
    // -------------------------------------------------------------------

    _renderTitle(ctx, width, height) {
        const titleY = height * 0.19;
        const fontSize = Math.min(width * 0.16, 64);

        ctx.save();

        // VINTER-OL
        ctx.font = `800 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,30,0.8)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillText('VINTER-OL', width / 2, titleY);

        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.restore();

        // Gold separator line
        const lineY = titleY + fontSize * 0.52;
        const lineW = Math.min(width * 0.42, 190);

        ctx.save();
        const lineGrad = ctx.createLinearGradient(
            width / 2 - lineW / 2, lineY,
            width / 2 + lineW / 2, lineY
        );
        lineGrad.addColorStop(0, 'rgba(212,168,67,0)');
        lineGrad.addColorStop(0.2, 'rgba(212,168,67,0.6)');
        lineGrad.addColorStop(0.5, 'rgba(212,168,67,0.9)');
        lineGrad.addColorStop(0.8, 'rgba(212,168,67,0.6)');
        lineGrad.addColorStop(1, 'rgba(212,168,67,0)');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(width / 2 - lineW / 2, lineY);
        ctx.lineTo(width / 2 + lineW / 2, lineY);
        ctx.stroke();
        ctx.restore();

        // SKIHOPP subtitle
        const subY = lineY + Math.min(width * 0.065, 26);
        const subSize = Math.min(width * 0.08, 32);

        ctx.save();
        ctx.font = `600 ${subSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(180,140,40,0.35)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#D4A843';
        ctx.fillText('SKIHOPP', width / 2, subY);
        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Buttons
    // -------------------------------------------------------------------

    _renderButtons(ctx, width, height) {
        this._buttonRects = [];

        const btnW = Math.min(280, width * 0.72);
        const btnH = 56;
        const gap = 16;
        const startY = height * 0.42;

        for (let i = 0; i < this.buttons.length; i++) {
            const btn = this.buttons[i];
            const x = (width - btnW) / 2;
            const y = startY + i * (btnH + gap);
            const isPressed = this._pressedButton === btn.id;
            const r = 28;

            this._buttonRects.push({ x, y, w: btnW, h: btnH, id: btn.id });

            ctx.save();

            // Press animation
            if (isPressed) {
                ctx.translate(x + btnW / 2, y + btnH / 2);
                ctx.scale(0.96, 0.96);
                ctx.translate(-(x + btnW / 2), -(y + btnH / 2));
            }

            // Button fill
            const grad = ctx.createLinearGradient(x, y, x, y + btnH);
            if (btn.primary) {
                if (isPressed) {
                    grad.addColorStop(0, '#1a44aa');
                    grad.addColorStop(1, '#183d8e');
                } else {
                    grad.addColorStop(0, '#2860cc');
                    grad.addColorStop(0.5, '#2255cc');
                    grad.addColorStop(1, '#1e4ab8');
                }
            } else {
                if (isPressed) {
                    grad.addColorStop(0, '#14143e');
                    grad.addColorStop(1, '#101038');
                } else {
                    grad.addColorStop(0, '#181848');
                    grad.addColorStop(0.5, '#151542');
                    grad.addColorStop(1, '#12123c');
                }
            }

            // Shadow
            ctx.save();
            ctx.shadowColor = btn.primary
                ? 'rgba(34,85,204,0.35)'
                : 'rgba(15,15,50,0.3)';
            ctx.shadowBlur = isPressed ? 4 : 8;
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
            hlGrad.addColorStop(0, 'rgba(255,255,255,0.08)');
            hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = hlGrad;
            ctx.fillRect(x, y, btnW, btnH * 0.5);
            ctx.restore();

            // Border
            if (btn.primary) {
                ctx.strokeStyle = 'rgba(100,160,255,0.25)';
            } else {
                ctx.strokeStyle = 'rgba(26,26,78,0.8)';
            }
            ctx.lineWidth = 1;
            this._roundRect(ctx, x, y, btnW, btnH, r);
            ctx.stroke();

            // Label
            const labelSize = btn.primary
                ? Math.min(width * 0.055, 22)
                : Math.min(width * 0.042, 17);
            ctx.fillStyle = '#ffffff';
            ctx.font = `${btn.primary ? 700 : 600} ${labelSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(btn.label, width / 2, y + btnH / 2);

            ctx.restore();
        }
    }

    // -------------------------------------------------------------------
    // Bottom info (record, level bar)
    // -------------------------------------------------------------------

    _renderBottomInfo(ctx, width, height, data) {
        const record = data.record;
        const level = data.level;
        const xp = data.xp;
        const xpNext = data.xpForNextLevel;
        const hillName = data.hillName;

        // Record text
        const recY = height * 0.82;
        ctx.save();
        ctx.font = `400 ${Math.min(width * 0.034, 14)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(220,225,240,0.7)';

        if (record != null && hillName) {
            ctx.fillText(`Rekord: ${record}m (${hillName})`, width / 2, recY);
        } else if (record != null) {
            ctx.fillText(`Rekord: ${record}m`, width / 2, recY);
        }
        ctx.restore();

        // Level + XP bar
        if (level != null) {
            const barY = recY + 24;
            const barW = Math.min(200, width * 0.52);
            const barH = 6;
            const barX = (width - barW) / 2;

            // "Level X" label
            ctx.save();
            ctx.font = `600 ${Math.min(width * 0.032, 13)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(212,168,67,0.85)';
            ctx.fillText(`Level ${level}`, width / 2, barY - 2);
            ctx.restore();

            // Bar background
            const barTrackY = barY + 10;
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            this._roundRect(ctx, barX, barTrackY, barW, barH, barH / 2);
            ctx.fill();

            // Bar fill
            if (xp != null && xpNext != null && xpNext > 0) {
                const pct = Math.max(0, Math.min(1, xp / xpNext));
                const fillW = Math.max(barH, barW * pct); // min width = pill radius
                const barGrad = ctx.createLinearGradient(barX, barTrackY, barX + fillW, barTrackY);
                barGrad.addColorStop(0, '#D4A843');
                barGrad.addColorStop(1, '#e6c060');
                ctx.fillStyle = barGrad;
                this._roundRect(ctx, barX, barTrackY, fillW, barH, barH / 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    // -------------------------------------------------------------------
    // Norwegian flag stripe
    // -------------------------------------------------------------------

    _renderNorwegianFlag(ctx, width, height) {
        const barH = Math.max(2.5, height * 0.005);
        const bottomY = height - barH * 3;

        ctx.fillStyle = '#BA0C2F';
        ctx.fillRect(0, bottomY, width, barH);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, bottomY + barH, width, barH);
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

    // -------------------------------------------------------------------
    // Input handling
    // -------------------------------------------------------------------

    /**
     * @param {number} x - tap X in CSS pixels
     * @param {number} y - tap Y in CSS pixels
     * @returns {'jump'|'hills'|'stats'|'settings'|null}
     */
    handleTap(x, y) {
        for (const rect of this._buttonRects) {
            if (x >= rect.x && x <= rect.x + rect.w &&
                y >= rect.y && y <= rect.y + rect.h) {
                this._pressedButton = rect.id;
                setTimeout(() => { this._pressedButton = null; }, 150);
                return rect.id;
            }
        }
        return null;
    }
}
