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
            { label: 'Enkelthopp', id: 'single', enabled: true },
            { label: 'Konkurranse', id: 'competition', enabled: true },
            { label: 'Innstillinger', id: 'settings', enabled: false },
        ];

        // Cached button hit areas (recalculated each render)
        this._buttonRects = [];

        // Snowflake positions (generated once, rendered each frame)
        this._snowflakes = [];
        for (let i = 0; i < 40; i++) {
            this._snowflakes.push({
                x: Math.random(),
                y: Math.random(),
                size: 8 + Math.random() * 14,
                speed: 0.01 + Math.random() * 0.02,
                drift: (Math.random() - 0.5) * 0.005,
                opacity: 0.15 + Math.random() * 0.25,
            });
        }

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
        this._renderSnowflakes(ctx, width, height);
        this._renderOlympicRings(ctx, width, height);
        this._renderTitle(ctx, width, height);
        this._renderButtons(ctx, width, height);
        this._renderFooter(ctx, width, height);
    }

    _renderBackground(ctx, width, height) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#1a1a2e');
        grad.addColorStop(0.5, '#16213e');
        grad.addColorStop(1, '#0f3460');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // Subtle mountain silhouette at bottom
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(0, height * 0.78);
        ctx.lineTo(width * 0.15, height * 0.70);
        ctx.lineTo(width * 0.30, height * 0.76);
        ctx.lineTo(width * 0.45, height * 0.65);
        ctx.lineTo(width * 0.60, height * 0.72);
        ctx.lineTo(width * 0.75, height * 0.62);
        ctx.lineTo(width * 0.90, height * 0.71);
        ctx.lineTo(width, height * 0.74);
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();
    }

    _renderSnowflakes(ctx, width, height) {
        for (const flake of this._snowflakes) {
            // Animate
            flake.y += flake.speed * 0.016 * 3;
            flake.x += flake.drift;
            if (flake.y > 1.05) { flake.y = -0.05; flake.x = Math.random(); }
            if (flake.x > 1.05) flake.x = -0.05;
            if (flake.x < -0.05) flake.x = 1.05;

            const sx = flake.x * width;
            const sy = flake.y * height;

            ctx.save();
            ctx.globalAlpha = flake.opacity;
            ctx.fillStyle = '#ffffff';
            ctx.font = `${flake.size}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('*', sx, sy);
            ctx.restore();
        }
    }

    _renderOlympicRings(ctx, width, height) {
        const centerX = width / 2;
        const topY = height * 0.08;
        const r = Math.min(width * 0.045, 20);
        const gap = r * 2.4;
        const lineWidth = Math.max(2.5, r * 0.3);

        const colors = ['#0081C8', '#000000', '#EE334E', '#FCB131', '#00A651'];
        // Top row: blue, black, red    Bottom row: yellow, green
        const positions = [
            { x: centerX - gap * 2, y: topY },
            { x: centerX,           y: topY },
            { x: centerX + gap * 2, y: topY },
            { x: centerX - gap,     y: topY + r * 1.1 },
            { x: centerX + gap,     y: topY + r * 1.1 },
        ];

        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(positions[i].x, positions[i].y, r, 0, Math.PI * 2);
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }
    }

    _renderTitle(ctx, width, height) {
        const titleY = height * 0.20;

        // Glow effect
        ctx.save();
        ctx.shadowColor = 'rgba(200,220,255,0.6)';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.min(width * 0.14, 56)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('VINTER-OL', width / 2, titleY);
        ctx.restore();

        // Subtitle with Norwegian flag accent line
        const subY = titleY + Math.min(width * 0.12, 48);
        const accentW = Math.min(width * 0.5, 200);

        // Red-white-blue accent bar
        const barH = 4;
        const barY = subY - 24;
        const barX = (width - accentW) / 2;
        // Red
        ctx.fillStyle = '#BA0C2F';
        ctx.fillRect(barX, barY, accentW / 3, barH);
        // White
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(barX + accentW / 3, barY, accentW / 3, barH);
        // Blue
        ctx.fillStyle = '#00205B';
        ctx.fillRect(barX + (accentW / 3) * 2, barY, accentW / 3, barH);

        ctx.fillStyle = 'rgba(200,220,255,0.85)';
        ctx.font = `${Math.min(width * 0.08, 32)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SKIHOPP', width / 2, subY);

        // Ski emoji / decorative skis
        const skiSize = Math.min(width * 0.05, 20);
        ctx.font = `${skiSize}px sans-serif`;
        ctx.fillText('⛷', width / 2 - accentW / 2 - skiSize, subY);
        ctx.fillText('⛷', width / 2 + accentW / 2 + skiSize, subY);
    }

    _renderButtons(ctx, width, height) {
        this._buttonRects = [];

        const btnW = Math.min(width * 0.75, 300);
        const btnH = 60;
        const gap = 18;
        const startY = height * 0.42;

        for (let i = 0; i < this.buttons.length; i++) {
            const btn = this.buttons[i];
            const x = (width - btnW) / 2;
            const y = startY + i * (btnH + gap);

            // Store hit rect
            this._buttonRects.push({ x, y, w: btnW, h: btnH, id: btn.id, enabled: btn.enabled });

            // Button background
            const r = 12;
            ctx.save();

            if (btn.enabled) {
                // Gradient fill
                const grad = ctx.createLinearGradient(x, y, x, y + btnH);
                grad.addColorStop(0, 'rgba(255,255,255,0.15)');
                grad.addColorStop(1, 'rgba(255,255,255,0.05)');
                ctx.fillStyle = grad;

                // Border glow
                ctx.shadowColor = 'rgba(100,180,255,0.3)';
                ctx.shadowBlur = 8;
                ctx.strokeStyle = 'rgba(150,200,255,0.5)';
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.04)';
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            }

            // Rounded rect
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + btnW - r, y);
            ctx.quadraticCurveTo(x + btnW, y, x + btnW, y + r);
            ctx.lineTo(x + btnW, y + btnH - r);
            ctx.quadraticCurveTo(x + btnW, y + btnH, x + btnW - r, y + btnH);
            ctx.lineTo(x + r, y + btnH);
            ctx.quadraticCurveTo(x, y + btnH, x, y + btnH - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();

            // Button label
            ctx.fillStyle = btn.enabled ? '#ffffff' : 'rgba(255,255,255,0.35)';
            ctx.font = `${btn.enabled ? 'bold ' : ''}${Math.min(width * 0.055, 22)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(btn.label, width / 2, y + btnH / 2);

            // Disabled tag
            if (!btn.enabled) {
                ctx.fillStyle = 'rgba(255,255,255,0.25)';
                ctx.font = `${Math.min(width * 0.03, 12)}px sans-serif`;
                ctx.fillText('(kommer snart)', width / 2, y + btnH / 2 + 18);
            }
        }
    }

    _renderFooter(ctx, width, height) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = `${Math.min(width * 0.03, 13)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Trykk for å starte', width / 2, height - 40);
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
                return rect.id;
            }
        }
        return null;
    }
}
