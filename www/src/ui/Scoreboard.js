/**
 * Scoreboard.js - Competition results display for Vinter-OL Skihopp
 *
 * Renders a ranked table of jumpers with distance, points, and country flags.
 * Canvas 2D, mobile portrait (~390x844). Supports scrolling for long lists.
 */

export default class Scoreboard {
    constructor() {
        /** Scroll offset in pixels (managed externally or via handleScroll). */
        this.scrollOffset = 0;

        /** For touch-scroll tracking. */
        this._touchStartY = null;
        this._scrollVelocity = 0;

        this._time = 0;

        /** Callback for "Hopp igjen" button tap. Set externally. */
        this.onPlayAgain = null;

        /** Cached button hit area for tap detection. */
        this._buttonRect = null;
    }

    // -------------------------------------------------------------------
    // Country flag color definitions
    // -------------------------------------------------------------------

    static FLAGS = {
        NOR: [['#BA0C2F', 0.33], ['#002868', 0.33], ['#BA0C2F', 0.34]],
        GER: [['#000000', 0.33], ['#DD0000', 0.33], ['#FFCC00', 0.34]],
        AUT: [['#ED2939', 0.33], ['#FFFFFF', 0.33], ['#ED2939', 0.34]],
        POL: [['#FFFFFF', 0.5], ['#DC143C', 0.5]],
        JPN: [['#FFFFFF', 1.0]],   // white with red circle
        SLO: [['#FFFFFF', 0.33], ['#003DA5', 0.33], ['#ED1C24', 0.34]],
        FIN: [['#FFFFFF', 1.0]],   // white with blue cross
        SUI: [['#FF0000', 1.0]],   // red with white cross
        CZE: [['#FFFFFF', 0.5], ['#D7141A', 0.5]],
        ITA: [['#009246', 0.33], ['#FFFFFF', 0.33], ['#CE2B37', 0.34]],
        FRA: [['#002395', 0.33], ['#FFFFFF', 0.33], ['#ED2939', 0.34]],
        SWE: [['#006AA7', 1.0]],   // blue with yellow cross
        USA: [['#B22234', 0.33], ['#FFFFFF', 0.33], ['#3C3B6E', 0.34]],
        CAN: [['#FF0000', 0.33], ['#FFFFFF', 0.34], ['#FF0000', 0.33]],
        RUS: [['#FFFFFF', 0.33], ['#0039A6', 0.33], ['#D52B1E', 0.34]],
        KOR: [['#FFFFFF', 1.0]],
        CHN: [['#DE2910', 1.0]],
    };

    // -------------------------------------------------------------------
    // Main render
    // -------------------------------------------------------------------

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     * @param {object} scoreData
     *   { jumps: [{ name, country, distance, totalPoints, rank }],
     *     currentJumper (index or name) }
     */
    render(ctx, width, height, scoreData = {}) {
        this._time += 0.016;

        const data = {
            jumps: [],
            currentJumper: null,
            ...scoreData,
        };

        // Apply inertia scrolling
        if (Math.abs(this._scrollVelocity) > 0.2) {
            this.scrollOffset += this._scrollVelocity;
            this._scrollVelocity *= 0.92;
        } else {
            this._scrollVelocity = 0;
        }

        this._renderBackground(ctx, width, height);
        this._renderHeader(ctx, width, height);
        this._renderTable(ctx, width, height, data);
        this._renderPlayAgainButton(ctx, width, height);
    }

    // -------------------------------------------------------------------
    // Background
    // -------------------------------------------------------------------

    _renderBackground(ctx, width, height) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#1a1a2e');
        grad.addColorStop(0.5, '#16213e');
        grad.addColorStop(1, '#0f3460');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // Subtle decorative snow particles
        ctx.save();
        for (let i = 0; i < 20; i++) {
            const sx = ((i * 137.5 + this._time * 8 * (i % 3 + 1)) % width);
            const sy = ((i * 97.3 + this._time * 15 * (i % 2 + 0.5)) % height);
            const sr = 1 + (i % 3) * 0.5;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${0.05 + (i % 4) * 0.02})`;
            ctx.fill();
        }
        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Header with decorative underline
    // -------------------------------------------------------------------

    _renderHeader(ctx, width, height) {
        const padX = 14;

        // Dark header panel
        const headerGrad = ctx.createLinearGradient(0, 0, 0, 95);
        headerGrad.addColorStop(0, 'rgba(0,0,0,0.7)');
        headerGrad.addColorStop(1, 'rgba(0,0,0,0.3)');
        ctx.fillStyle = headerGrad;
        ctx.fillRect(0, 0, width, 95);

        // Bottom accent line (Norwegian tricolor)
        const accentY = 92;
        const thirdW = width / 3;
        ctx.fillStyle = '#BA0C2F';
        ctx.fillRect(0, accentY, thirdW, 3);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(thirdW, accentY, thirdW, 3);
        ctx.fillStyle = '#00205B';
        ctx.fillRect(thirdW * 2, accentY, thirdW + 1, 3);

        ctx.save();

        // Title "RESULTATER"
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(Math.min(width * 0.075, 30), 18)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '3px';
        ctx.fillText('RESULTATER', width / 2, 34);

        // Hill name subtitle
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = `${Math.max(Math.min(width * 0.035, 14), 12)}px sans-serif`;
        ctx.letterSpacing = '1px';
        ctx.fillText('Holmenkollbakken K120', width / 2, 62);

        ctx.letterSpacing = '0px';
        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Table
    // -------------------------------------------------------------------

    _renderTable(ctx, width, height, data) {
        const jumps = data.jumps;
        if (!jumps || jumps.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Ingen resultater ennå', width / 2, height / 2);
            return;
        }

        const tableTop = 110;
        const rowHeight = 60;
        const headerHeight = 36;
        const padX = 14;
        const buttonSpace = 80; // room for the button at bottom

        // Clamp scroll offset
        const maxScroll = Math.max(0, jumps.length * rowHeight + headerHeight - (height - tableTop - buttonSpace));
        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));

        // Column positions
        const cols = {
            rank: padX + 14,
            flag: padX + 42,
            name: padX + 68,
            distance: width - padX - 110,
            points: width - padX - 20,
        };

        ctx.save();

        // Clip to table area
        ctx.beginPath();
        ctx.rect(0, tableTop, width, height - tableTop - buttonSpace);
        ctx.clip();

        // Column headers
        const headY = tableTop + headerHeight / 2 - this.scrollOffset;
        if (headY > tableTop - headerHeight) {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = `bold ${Math.min(width * 0.028, 11)}px sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.letterSpacing = '1px';

            ctx.textAlign = 'center';
            ctx.fillText('#', cols.rank, headY);

            ctx.textAlign = 'left';
            ctx.fillText('UTOVER', cols.name, headY);

            ctx.textAlign = 'right';
            ctx.fillText('LENGDE', cols.distance + 50, headY);
            ctx.fillText('POENG', cols.points, headY);

            // Separator line
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(padX, headY + headerHeight / 2);
            ctx.lineTo(width - padX, headY + headerHeight / 2);
            ctx.stroke();
        }

        // Rows
        for (let i = 0; i < jumps.length; i++) {
            const jump = jumps[i];
            const rowY = tableTop + headerHeight + i * rowHeight - this.scrollOffset;

            // Skip off-screen rows
            if (rowY + rowHeight < tableTop || rowY > height) continue;

            const centerY = rowY + rowHeight / 2;
            const isCurrent = this._isCurrentJumper(jump, data.currentJumper, i);
            const rank = jump.rank != null ? jump.rank : i + 1;

            // Row background - alternating
            if (isCurrent) {
                // Player row: glowing border
                ctx.save();
                ctx.shadowColor = 'rgba(100,180,255,0.5)';
                ctx.shadowBlur = 12;
                ctx.fillStyle = 'rgba(100,180,255,0.12)';
                this._roundRect(ctx, padX - 2, rowY + 3, width - padX * 2 + 4, rowHeight - 6, 10);
                ctx.fill();
                ctx.restore();

                // Animated glowing border
                const glowAlpha = 0.35 + Math.sin(this._time * 3) * 0.15;
                ctx.strokeStyle = `rgba(100,180,255,${glowAlpha})`;
                ctx.lineWidth = 2;
                this._roundRect(ctx, padX - 2, rowY + 3, width - padX * 2 + 4, rowHeight - 6, 10);
                ctx.stroke();
            } else if (i % 2 === 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.04)';
                this._roundRect(ctx, padX, rowY + 3, width - padX * 2, rowHeight - 6, 6);
                ctx.fill();
            }

            // Rank: medal circles for top 3
            if (rank <= 3) {
                this._renderMedal(ctx, cols.rank, centerY, rank);
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = 'bold 16px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(rank, cols.rank, centerY);
            }

            // Country flag (drawn rectangle)
            this._renderFlag(ctx, cols.flag, centerY, jump.country);

            // Name
            ctx.fillStyle = isCurrent ? '#ffffff' : 'rgba(255,255,255,0.85)';
            ctx.font = `${isCurrent ? 'bold ' : ''}${Math.min(width * 0.04, 16)}px sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            const maxNameW = cols.distance - cols.name - 10;
            const displayName = this._truncateName(ctx, jump.name || 'Ukjent', maxNameW);
            ctx.fillText(displayName, cols.name, centerY - 6);

            // Country code small text below name
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font = `${Math.min(width * 0.025, 10)}px sans-serif`;
            ctx.fillText(jump.country || '', cols.name, centerY + 10);

            // Distance
            ctx.fillStyle = isCurrent ? '#ffffff' : 'rgba(255,255,255,0.8)';
            ctx.font = `${Math.min(width * 0.038, 15)}px sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            const dist = typeof jump.distance === 'number' ? `${jump.distance.toFixed(1)} m` : '-';
            ctx.fillText(dist, cols.distance + 50, centerY);

            // Points (bold, slightly highlighted)
            ctx.fillStyle = isCurrent ? '#88ddff' : 'rgba(200,220,255,0.9)';
            ctx.font = `bold ${Math.min(width * 0.042, 17)}px sans-serif`;
            ctx.textAlign = 'right';
            const pts = typeof jump.totalPoints === 'number' ? jump.totalPoints.toFixed(1) : '-';
            ctx.fillText(pts, cols.points, centerY);

            // Separator line (subtle)
            if (i < jumps.length - 1) {
                ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(padX + 30, rowY + rowHeight);
                ctx.lineTo(width - padX, rowY + rowHeight);
                ctx.stroke();
            }
        }

        ctx.restore();

        // Scroll indicators
        if (maxScroll > 0) {
            this._renderScrollIndicator(ctx, width, height, tableTop, maxScroll);
        }
    }

    // -------------------------------------------------------------------
    // Medal rendering (gold/silver/bronze circles with shine)
    // -------------------------------------------------------------------

    _renderMedal(ctx, x, y, rank) {
        const colors = {
            1: { fill: '#FFD700', shine: '#FFF8DC', shadow: '#B8860B', label: '1' },
            2: { fill: '#C0C0C0', shine: '#F0F0F0', shadow: '#808080', label: '2' },
            3: { fill: '#CD7F32', shine: '#EEBB77', shadow: '#8B4513', label: '3' },
        };
        const medal = colors[rank];
        const r = 15;

        ctx.save();

        // Outer ring shadow
        ctx.shadowColor = medal.shadow;
        ctx.shadowBlur = 6;

        // Medal circle with gradient
        const grad = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, r);
        grad.addColorStop(0, medal.shine);
        grad.addColorStop(0.7, medal.fill);
        grad.addColorStop(1, medal.shadow);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Highlight arc (top-left shine)
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(x - 2, y - 2, r - 4, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.strokeStyle = `rgba(255,255,255,0.4)`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Rank number
        ctx.fillStyle = rank === 1 ? '#5a4800' : '#ffffff';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(medal.label, x, y + 1);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Country flag (colored rectangle)
    // -------------------------------------------------------------------

    _renderFlag(ctx, x, y, countryCode) {
        const flagW = 22;
        const flagH = 14;
        const fx = x - flagW / 2;
        const fy = y - flagH / 2;

        const stripes = Scoreboard.FLAGS[countryCode];

        ctx.save();

        // Flag border
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(fx, fy, flagW, flagH);

        if (stripes) {
            let offsetY = 0;
            for (const [color, fraction] of stripes) {
                const h = flagH * fraction;
                ctx.fillStyle = color;
                ctx.fillRect(fx, fy + offsetY, flagW, h);
                offsetY += h;
            }

            // Special overlays for certain flags
            if (countryCode === 'JPN') {
                // Red circle on white
                ctx.beginPath();
                ctx.arc(fx + flagW / 2, fy + flagH / 2, flagH * 0.28, 0, Math.PI * 2);
                ctx.fillStyle = '#BC002D';
                ctx.fill();
            } else if (countryCode === 'FIN') {
                // Blue cross on white
                ctx.fillStyle = '#003580';
                ctx.fillRect(fx + flagW * 0.28, fy, flagW * 0.14, flagH);
                ctx.fillRect(fx, fy + flagH * 0.36, flagW, flagH * 0.28);
            } else if (countryCode === 'SWE') {
                // Yellow cross on blue
                ctx.fillStyle = '#FECC00';
                ctx.fillRect(fx + flagW * 0.28, fy, flagW * 0.12, flagH);
                ctx.fillRect(fx, fy + flagH * 0.38, flagW, flagH * 0.24);
            } else if (countryCode === 'SUI') {
                // White cross on red
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(fx + flagW * 0.38, fy + flagH * 0.2, flagW * 0.24, flagH * 0.6);
                ctx.fillRect(fx + flagW * 0.24, fy + flagH * 0.34, flagW * 0.52, flagH * 0.32);
            } else if (countryCode === 'NOR') {
                // Norwegian cross overlay (blue cross with white border)
                const cxOff = flagW * 0.33;
                const cyOff = flagH * 0.5;
                const cw = flagW * 0.1;
                const ch = flagH * 0.18;
                // White cross (thicker)
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(fx + cxOff - cw, fy, cw * 2, flagH);
                ctx.fillRect(fx, fy + cyOff - ch, flagW, ch * 2);
                // Blue cross (thinner)
                ctx.fillStyle = '#002868';
                ctx.fillRect(fx + cxOff - cw * 0.5, fy, cw, flagH);
                ctx.fillRect(fx, fy + cyOff - ch * 0.5, flagW, ch);
            } else if (countryCode === 'CZE') {
                // Blue triangle on left
                ctx.beginPath();
                ctx.moveTo(fx, fy);
                ctx.lineTo(fx + flagW * 0.45, fy + flagH / 2);
                ctx.lineTo(fx, fy + flagH);
                ctx.closePath();
                ctx.fillStyle = '#11457E';
                ctx.fill();
            }
        } else {
            // Fallback: gray with country code
            ctx.fillStyle = '#555555';
            ctx.fillRect(fx, fy, flagW, flagH);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 7px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(countryCode || '?', x, y);
        }

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // "Hopp igjen" button
    // -------------------------------------------------------------------

    _renderPlayAgainButton(ctx, width, height) {
        const btnW = Math.min(width * 0.55, 220);
        const btnH = 48;
        const btnX = (width - btnW) / 2;
        const btnY = height - 70;

        // Store for hit testing
        this._buttonRect = { x: btnX, y: btnY, w: btnW, h: btnH };

        ctx.save();

        // Button shadow
        ctx.shadowColor = 'rgba(0,150,255,0.4)';
        ctx.shadowBlur = 16;

        // Button gradient
        const grad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH);
        grad.addColorStop(0, '#2196F3');
        grad.addColorStop(1, '#1565C0');
        ctx.fillStyle = grad;
        this._roundRect(ctx, btnX, btnY, btnW, btnH, btnH / 2);
        ctx.fill();

        // Top highlight
        ctx.shadowBlur = 0;
        const highGrad = ctx.createLinearGradient(btnX, btnY, btnX, btnY + btnH * 0.5);
        highGrad.addColorStop(0, 'rgba(255,255,255,0.2)');
        highGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = highGrad;
        this._roundRect(ctx, btnX, btnY, btnW, btnH * 0.5, btnH / 2);
        ctx.fill();

        // Button text
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.min(width * 0.045, 18)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Ski emoji/icon: small "ski" symbol
        const label = 'Hopp igjen';
        ctx.fillText(label, width / 2 + 8, btnY + btnH / 2);

        // Small arrow/ski icon to the left of text
        const textW = ctx.measureText(label).width;
        const iconX = width / 2 - textW / 2 - 6;
        const iconY = btnY + btnH / 2;
        // Draw a small ski jump arrow
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(iconX - 6, iconY + 4);
        ctx.lineTo(iconX, iconY - 4);
        ctx.lineTo(iconX + 6, iconY - 2);
        ctx.stroke();

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Scroll indicator
    // -------------------------------------------------------------------

    _renderScrollIndicator(ctx, width, height, tableTop, maxScroll) {
        const buttonSpace = 80;
        const trackH = height - tableTop - buttonSpace - 10;
        const trackX = width - 6;
        const thumbH = Math.max(30, trackH * (trackH / (trackH + maxScroll)));
        const thumbY = tableTop + 5 + (this.scrollOffset / maxScroll) * (trackH - thumbH);

        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        this._roundRect(ctx, trackX, thumbY, 4, thumbH, 2);
        ctx.fill();
    }

    // -------------------------------------------------------------------
    // Input handling
    // -------------------------------------------------------------------

    /**
     * Handle touch/drag for scrolling.
     * @param {string} type - 'start', 'move', or 'end'
     * @param {number} y - touch Y position
     * @param {number} [x] - touch X position (for button detection)
     */
    handleScroll(type, y, x) {
        if (type === 'start') {
            this._touchStartY = y;
            this._scrollVelocity = 0;
        } else if (type === 'move' && this._touchStartY !== null) {
            const dy = this._touchStartY - y;
            this.scrollOffset += dy;
            this._scrollVelocity = dy;
            this._touchStartY = y;
        } else if (type === 'end') {
            this._touchStartY = null;

            // Check if tap was on the button
            if (x != null && this._buttonRect) {
                const b = this._buttonRect;
                if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
                    if (typeof this.onPlayAgain === 'function') {
                        this.onPlayAgain();
                    }
                }
            }
        }
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    _isCurrentJumper(jump, currentJumper, index) {
        if (currentJumper == null) return false;
        if (typeof currentJumper === 'number') return currentJumper === index;
        return jump.name === currentJumper;
    }

    _getRankColor(rank) {
        if (rank === 1) return '#FFD700'; // Gold
        if (rank === 2) return '#C0C0C0'; // Silver
        if (rank === 3) return '#CD7F32'; // Bronze
        return 'rgba(255,255,255,0.5)';
    }

    _truncateName(ctx, name, maxWidth) {
        if (ctx.measureText(name).width <= maxWidth) return name;
        let truncated = name;
        while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
            truncated = truncated.slice(0, -1);
        }
        return truncated + '…';
    }

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}
