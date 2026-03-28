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
    }

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
    }

    // -------------------------------------------------------------------
    // Header
    // -------------------------------------------------------------------

    _renderHeader(ctx, width, height) {
        const y = 50;

        // Background bar
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, width, 90);

        // Title
        ctx.save();
        ctx.shadowColor = 'rgba(200,220,255,0.5)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.min(width * 0.07, 28)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('RESULTATER', width / 2, y);
        ctx.restore();

        // Norwegian flag accent line
        const accentW = Math.min(width * 0.4, 160);
        const barH = 3;
        const barY = y + 22;
        const barX = (width - accentW) / 2;

        ctx.fillStyle = '#BA0C2F';
        ctx.fillRect(barX, barY, accentW / 3, barH);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(barX + accentW / 3, barY, accentW / 3, barH);
        ctx.fillStyle = '#00205B';
        ctx.fillRect(barX + (accentW / 3) * 2, barY, accentW / 3, barH);
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

        const tableTop = 100;
        const rowHeight = 56;
        const headerHeight = 36;
        const padX = 14;

        // Clamp scroll offset
        const maxScroll = Math.max(0, jumps.length * rowHeight + headerHeight - (height - tableTop - 30));
        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));

        // Column positions (relative to padX)
        const cols = {
            rank: padX + 10,
            name: padX + 50,
            country: padX + 170,
            distance: width - padX - 120,
            points: width - padX - 30,
        };

        ctx.save();

        // Clip to table area
        ctx.beginPath();
        ctx.rect(0, tableTop, width, height - tableTop);
        ctx.clip();

        // Column headers
        const headY = tableTop + headerHeight / 2 - this.scrollOffset;
        if (headY > tableTop - headerHeight) {
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.font = `bold ${Math.min(width * 0.032, 13)}px sans-serif`;
            ctx.textBaseline = 'middle';

            ctx.textAlign = 'center';
            ctx.fillText('#', cols.rank, headY);

            ctx.textAlign = 'left';
            ctx.fillText('NAVN', cols.name, headY);

            ctx.textAlign = 'center';
            ctx.fillText('🏴', cols.country, headY);

            ctx.textAlign = 'right';
            ctx.fillText('LENGDE', cols.distance + 40, headY);
            ctx.fillText('POENG', cols.points, headY);

            // Separator line
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
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

            // Row background
            if (isCurrent) {
                ctx.fillStyle = 'rgba(100,180,255,0.15)';
                this._roundRect(ctx, padX - 4, rowY + 4, width - padX * 2 + 8, rowHeight - 8, 10);
                ctx.fill();

                // Highlight border
                ctx.strokeStyle = 'rgba(100,180,255,0.4)';
                ctx.lineWidth = 1.5;
                this._roundRect(ctx, padX - 4, rowY + 4, width - padX * 2 + 8, rowHeight - 8, 10);
                ctx.stroke();
            } else if (i % 2 === 0) {
                ctx.fillStyle = 'rgba(255,255,255,0.03)';
                ctx.fillRect(padX, rowY + 4, width - padX * 2, rowHeight - 8);
            }

            // Rank with medal colors
            const rankColor = this._getRankColor(rank);
            ctx.fillStyle = rankColor;
            ctx.font = `bold ${Math.min(width * 0.045, 18)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (rank <= 3) {
                // Medal circle
                ctx.beginPath();
                ctx.arc(cols.rank, centerY, 15, 0, Math.PI * 2);
                ctx.fillStyle = rankColor;
                ctx.fill();
                ctx.fillStyle = rank === 1 ? '#1a1a2e' : '#ffffff';
                ctx.font = `bold 14px sans-serif`;
                ctx.fillText(rank, cols.rank, centerY);
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.font = `bold 16px sans-serif`;
                ctx.fillText(rank, cols.rank, centerY);
            }

            // Name
            ctx.fillStyle = isCurrent ? '#ffffff' : 'rgba(255,255,255,0.85)';
            ctx.font = `${isCurrent ? 'bold ' : ''}${Math.min(width * 0.04, 16)}px sans-serif`;
            ctx.textAlign = 'left';
            const displayName = this._truncateName(ctx, jump.name || 'Ukjent', cols.country - cols.name - 10);
            ctx.fillText(displayName, cols.name, centerY);

            // Country flag (emoji)
            ctx.font = `${Math.min(width * 0.05, 20)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(jump.country || '🏳️', cols.country, centerY);

            // Distance
            ctx.fillStyle = isCurrent ? '#ffffff' : 'rgba(255,255,255,0.8)';
            ctx.font = `${Math.min(width * 0.038, 15)}px sans-serif`;
            ctx.textAlign = 'right';
            const dist = typeof jump.distance === 'number' ? `${jump.distance.toFixed(1)} m` : '-';
            ctx.fillText(dist, cols.distance + 40, centerY);

            // Points
            ctx.fillStyle = isCurrent ? '#88ddff' : 'rgba(200,220,255,0.9)';
            ctx.font = `bold ${Math.min(width * 0.042, 17)}px sans-serif`;
            ctx.textAlign = 'right';
            const pts = typeof jump.totalPoints === 'number' ? jump.totalPoints.toFixed(1) : '-';
            ctx.fillText(pts, cols.points, centerY);

            // Separator line
            if (i < jumps.length - 1) {
                ctx.strokeStyle = 'rgba(255,255,255,0.06)';
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
    // Scroll indicator
    // -------------------------------------------------------------------

    _renderScrollIndicator(ctx, width, height, tableTop, maxScroll) {
        const trackH = height - tableTop - 20;
        const trackX = width - 6;
        const thumbH = Math.max(30, trackH * (trackH / (trackH + maxScroll)));
        const thumbY = tableTop + 10 + (this.scrollOffset / maxScroll) * (trackH - thumbH);

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
     */
    handleScroll(type, y) {
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
