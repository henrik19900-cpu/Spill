/**
 * StatsScreen.js - Statistics and achievements screen for Vinter-OL Skihopp
 *
 * Renders directly to Canvas 2D context. Designed for mobile portrait (~390x844).
 * Displays player stats, XP progress, mini jump graph, and achievements.
 */

export default class StatsScreen {
    constructor() {
        /** Scroll offset for the entire content area. */
        this.scrollOffset = 0;

        /** Cached back button hit area. */
        this._backRect = null;

        /** Total content height (recalculated each render). */
        this._contentHeight = 0;

        /** Animation time tracker. */
        this._time = 0;

        /** For touch-scroll tracking (smooth momentum). */
        this._touchStartY = null;
        this._scrollVelocity = 0;
    }

    // -------------------------------------------------------------------
    // Main render
    // -------------------------------------------------------------------

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width   - logical CSS pixels
     * @param {number} height  - logical CSS pixels
     * @param {object} statsData - from ProgressionManager.getStats()
     */
    render(ctx, width, height, statsData = {}) {
        this._time += 0.016;

        const data = {
            totalJumps: 0,
            bestDistances: {},
            bestScores: {},
            avgScore: 0,
            perfectLandings: 0,
            level: 1,
            xp: 0,
            xpForNextLevel: 100,
            achievements: [],
            recentJumps: [],
            ...statsData,
        };

        // Apply inertia scrolling (smooth momentum)
        if (Math.abs(this._scrollVelocity) > 0.2) {
            this.scrollOffset += this._scrollVelocity;
            this._scrollVelocity *= 0.92;
        } else {
            this._scrollVelocity = 0;
        }

        // Clamp scroll
        const headerH = 60;
        const maxScroll = Math.max(0, this._contentHeight - (height - headerH));
        this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));

        this._renderBackground(ctx, width, height);
        this._renderHeader(ctx, width, height);

        // Clip content below header
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, headerH, width, height - headerH);
        ctx.clip();

        let cursorY = headerH + 20 - this.scrollOffset;

        cursorY = this._renderLevelSection(ctx, width, cursorY, data);
        cursorY = this._renderStatsGrid(ctx, width, cursorY, data);
        cursorY = this._renderMiniGraph(ctx, width, cursorY, data);
        cursorY = this._renderAchievements(ctx, width, cursorY, data);

        // Extra bottom padding
        cursorY += 40;

        ctx.restore();

        // Track total content height for scroll clamping
        this._contentHeight = cursorY + this.scrollOffset - headerH;
    }

    // -------------------------------------------------------------------
    // Background
    // -------------------------------------------------------------------

    _renderBackground(ctx, width, height) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#0a0e1a');
        grad.addColorStop(0.4, '#111827');
        grad.addColorStop(1, '#0f172a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }

    // -------------------------------------------------------------------
    // Header: "STATISTIKK" + back button
    // -------------------------------------------------------------------

    _renderHeader(ctx, width, height) {
        const headerH = 60;

        // Header background
        const grad = ctx.createLinearGradient(0, 0, 0, headerH);
        grad.addColorStop(0, 'rgba(0,0,0,0.6)');
        grad.addColorStop(1, 'rgba(0,0,0,0.2)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, headerH);

        // Bottom separator
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, headerH);
        ctx.lineTo(width, headerH);
        ctx.stroke();

        // Back button arrow
        const btnSize = 40;
        const btnX = 10;
        const btnY = (headerH - btnSize) / 2;
        this._backRect = { x: btnX, y: btnY, w: btnSize, h: btnSize };

        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const cx = btnX + btnSize / 2;
        const cy = btnY + btnSize / 2;
        ctx.beginPath();
        ctx.moveTo(cx + 4, cy - 10);
        ctx.lineTo(cx - 6, cy);
        ctx.lineTo(cx + 4, cy + 10);
        ctx.stroke();
        ctx.restore();

        // Title
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.min(width * 0.055, 22)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('STATISTIKK', width / 2, headerH / 2);
        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Level + XP bar
    // -------------------------------------------------------------------

    /**
     * Get level tier colors based on level number.
     */
    _getLevelTier(level) {
        if (level >= 50) return { name: 'DIAMANT', primary: '#b9f2ff', secondary: '#00d4ff', dark: '#006080', glow: 'rgba(0,212,255,0.6)' };
        if (level >= 25) return { name: 'GULL', primary: '#FFD700', secondary: '#FFA500', dark: '#8B6914', glow: 'rgba(255,215,0,0.6)' };
        if (level >= 10) return { name: 'SOLV', primary: '#E0E0E0', secondary: '#B0B0B0', dark: '#606060', glow: 'rgba(200,200,200,0.5)' };
        return { name: 'BRONSE', primary: '#CD7F32', secondary: '#A0522D', dark: '#5C3317', glow: 'rgba(205,127,50,0.5)' };
    }

    _renderLevelSection(ctx, width, y, data) {
        const padX = 20;
        const panelW = width - padX * 2;
        const panelH = 90;
        const tier = this._getLevelTier(data.level);

        // Panel background with subtle tier-colored border
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        this._roundRect(ctx, padX, y, panelW, panelH, 14);
        ctx.fill();
        ctx.strokeStyle = `${tier.glow.replace(/[\d.]+\)$/, '0.2)')}`;
        ctx.lineWidth = 1;
        this._roundRect(ctx, padX, y, panelW, panelH, 14);
        ctx.stroke();

        // Level badge circle
        const badgeR = 24;
        const badgeCX = padX + 16 + badgeR;
        const badgeCY = y + 34;

        // Badge glow
        ctx.shadowColor = tier.glow;
        ctx.shadowBlur = 12;

        // Badge gradient circle
        const badgeGrad = ctx.createRadialGradient(badgeCX - 4, badgeCY - 4, 2, badgeCX, badgeCY, badgeR);
        badgeGrad.addColorStop(0, tier.primary);
        badgeGrad.addColorStop(0.7, tier.secondary);
        badgeGrad.addColorStop(1, tier.dark);
        ctx.beginPath();
        ctx.arc(badgeCX, badgeCY, badgeR, 0, Math.PI * 2);
        ctx.fillStyle = badgeGrad;
        ctx.fill();

        // Badge shine arc
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(badgeCX - 3, badgeCY - 3, badgeR - 6, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Level number inside badge
        ctx.fillStyle = data.level >= 50 ? '#003040' : (data.level >= 25 ? '#5a4800' : '#ffffff');
        ctx.font = `bold ${Math.min(badgeR * 0.9, 20)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(data.level), badgeCX, badgeCY + 1);

        // Level text and tier name
        const textLeft = badgeCX + badgeR + 14;
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.min(width * 0.05, 20)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Level ${data.level}`, textLeft, y + 24);

        // Tier name
        ctx.fillStyle = tier.primary;
        ctx.font = `bold ${Math.min(width * 0.028, 11)}px sans-serif`;
        ctx.letterSpacing = '2px';
        ctx.fillText(tier.name, textLeft, y + 40);
        ctx.letterSpacing = '0px';

        // XP text on the right
        const progress = data.xpForNextLevel > 0
            ? Math.min(1, data.xp / data.xpForNextLevel)
            : 0;
        const pctText = `${Math.round(progress * 100)}%`;
        const xpText = `${data.xp} / ${data.xpForNextLevel} XP`;

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `${Math.min(width * 0.03, 12)}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(xpText, padX + panelW - 16, y + 24);

        // Percentage text
        ctx.fillStyle = tier.primary;
        ctx.font = `bold ${Math.min(width * 0.03, 12)}px sans-serif`;
        ctx.fillText(pctText, padX + panelW - 16, y + 40);

        // XP bar track
        const barX = padX + 16;
        const barY = y + 60;
        const barW = panelW - 32;
        const barH = 12;

        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        this._roundRect(ctx, barX, barY, barW, barH, barH / 2);
        ctx.fill();

        // XP bar fill with tier-colored gradient
        const fillW = Math.max(barH, barW * progress);

        if (progress > 0) {
            const barGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
            barGrad.addColorStop(0, tier.dark);
            barGrad.addColorStop(0.5, tier.secondary);
            barGrad.addColorStop(1, tier.primary);
            ctx.fillStyle = barGrad;
            this._roundRect(ctx, barX, barY, fillW, barH, barH / 2);
            ctx.fill();

            // Sheen on bar
            const sheenGrad = ctx.createLinearGradient(barX, barY, barX, barY + barH * 0.5);
            sheenGrad.addColorStop(0, 'rgba(255,255,255,0.25)');
            sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = sheenGrad;
            this._roundRect(ctx, barX, barY, fillW, barH * 0.5, barH / 2);
            ctx.fill();
        }

        ctx.restore();

        return y + panelH + 20;
    }

    // -------------------------------------------------------------------
    // Stats grid (2x3)
    // -------------------------------------------------------------------

    _renderStatsGrid(ctx, width, y, data) {
        const padX = 20;
        const gap = 10;
        const cols = 2;
        const rows = 3;
        const cellW = (width - padX * 2 - gap) / cols;
        const cellH = 78;

        // Section header
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `bold ${Math.min(width * 0.032, 13)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('OVERSIKT', padX, y + 8);
        ctx.restore();

        y += 24;

        const stats = [
            { value: data.totalJumps, label: 'Total hopp', icon: '\u26F7' },
            { value: this._formatDist(data.bestDistances?.K90), label: 'Beste K90', icon: '\u2B50' },
            { value: this._formatDist(data.bestDistances?.K120), label: 'Beste K120', icon: '\u2B50' },
            { value: this._formatDist(data.bestDistances?.K185), label: 'Beste K185', icon: '\u2B50' },
            { value: data.avgScore != null ? data.avgScore.toFixed(1) : '-', label: 'Snittpoeng', icon: '\u2300' },
            { value: data.perfectLandings, label: 'Perfekte landinger', icon: '\u2714' },
        ];

        const valueFontSize = Math.min(width * 0.075, 30);
        const labelFontSize = Math.min(width * 0.028, 11);

        for (let i = 0; i < stats.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cx = padX + col * (cellW + gap);
            const cy = y + row * (cellH + gap);

            ctx.save();

            // Cell background with subtle gradient
            const cellGrad = ctx.createLinearGradient(cx, cy, cx, cy + cellH);
            cellGrad.addColorStop(0, 'rgba(255,255,255,0.07)');
            cellGrad.addColorStop(1, 'rgba(255,255,255,0.03)');
            ctx.fillStyle = cellGrad;
            this._roundRect(ctx, cx, cy, cellW, cellH, 12);
            ctx.fill();

            // Subtle top border highlight
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.lineWidth = 1;
            this._roundRect(ctx, cx, cy, cellW, cellH, 12);
            ctx.stroke();

            // Large bold value
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${valueFontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(stats[i].value), cx + cellW / 2, cy + cellH * 0.38);

            // Label below
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = `${labelFontSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.letterSpacing = '0.5px';
            ctx.fillText(stats[i].label.toUpperCase(), cx + cellW / 2, cy + cellH * 0.72);
            ctx.letterSpacing = '0px';

            // Subtle bottom accent line
            const accentW = cellW * 0.3;
            ctx.strokeStyle = 'rgba(100,160,255,0.15)';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(cx + (cellW - accentW) / 2, cy + cellH - 6);
            ctx.lineTo(cx + (cellW + accentW) / 2, cy + cellH - 6);
            ctx.stroke();

            ctx.restore();
        }

        return y + rows * (cellH + gap) + 10;
    }

    // -------------------------------------------------------------------
    // Mini graph: last 10 jumps
    // -------------------------------------------------------------------

    _renderMiniGraph(ctx, width, y, data) {
        const jumps = data.recentJumps;
        if (!jumps || jumps.length === 0) return y;

        const padX = 20;
        const panelW = width - padX * 2;
        const panelH = 160;

        // Section label
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `bold ${Math.min(width * 0.032, 13)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('SISTE HOPP', padX, y + 8);
        ctx.restore();

        y += 22;

        // Panel background
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        this._roundRect(ctx, padX, y, panelW, panelH, 10);
        ctx.fill();

        // Graph area within panel
        const graphPadL = 40;
        const graphPadR = 16;
        const graphPadT = 18;
        const graphPadB = 28;
        const gx = padX + graphPadL;
        const gy = y + graphPadT;
        const gw = panelW - graphPadL - graphPadR;
        const gh = panelH - graphPadT - graphPadB;

        // Determine Y range
        const minDist = Math.min(...jumps);
        const maxDist = Math.max(...jumps);
        const rangeBuffer = Math.max(5, (maxDist - minDist) * 0.15);
        const yMin = Math.floor(minDist - rangeBuffer);
        const yMax = Math.ceil(maxDist + rangeBuffer);
        const yRange = yMax - yMin || 1;

        // Y-axis labels
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = `${Math.min(width * 0.025, 10)}px sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${yMax}m`, gx - 6, gy);
        ctx.fillText(`${yMin}m`, gx - 6, gy + gh);

        // Horizontal grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 3; i++) {
            const ly = gy + (gh / 3) * i;
            ctx.beginPath();
            ctx.moveTo(gx, ly);
            ctx.lineTo(gx + gw, ly);
            ctx.stroke();
        }

        // K-point reference line (dashed) - use K120 = 120m as a common reference
        const kPoint = 120;
        if (kPoint >= yMin && kPoint <= yMax) {
            const kY = gy + gh - ((kPoint - yMin) / yRange) * gh;
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(255,200,50,0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(gx, kY);
            ctx.lineTo(gx + gw, kY);
            ctx.stroke();
            ctx.setLineDash([]);

            // K-point label
            ctx.fillStyle = 'rgba(255,200,50,0.5)';
            ctx.font = `${Math.min(width * 0.022, 9)}px sans-serif`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText('K-punkt', gx - 6, kY - 2);
            ctx.restore();
        }

        // Plot data points and line
        const points = [];
        const count = jumps.length;
        for (let i = 0; i < count; i++) {
            const px = gx + (count > 1 ? (i / (count - 1)) * gw : gw / 2);
            const py = gy + gh - ((jumps[i] - yMin) / yRange) * gh;
            points.push({ x: px, y: py });
        }

        // Green connecting line
        if (points.length > 1) {
            ctx.save();
            ctx.strokeStyle = '#4ade80';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.stroke();

            // Subtle gradient fill under the line
            ctx.lineTo(points[points.length - 1].x, gy + gh);
            ctx.lineTo(points[0].x, gy + gh);
            ctx.closePath();
            const fillGrad = ctx.createLinearGradient(0, gy, 0, gy + gh);
            fillGrad.addColorStop(0, 'rgba(74,222,128,0.15)');
            fillGrad.addColorStop(1, 'rgba(74,222,128,0)');
            ctx.fillStyle = fillGrad;
            ctx.fill();
            ctx.restore();
        }

        // Dots with glow
        for (let i = 0; i < points.length; i++) {
            ctx.save();
            // Outer glow
            ctx.shadowColor = 'rgba(74,222,128,0.5)';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(points[i].x, points[i].y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#4ade80';
            ctx.fill();
            ctx.shadowBlur = 0;
            // White center dot
            ctx.beginPath();
            ctx.arc(points[i].x, points[i].y, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fill();
            ctx.restore();

            // Distance label on last point
            if (i === points.length - 1 && jumps[i] != null) {
                ctx.save();
                ctx.fillStyle = '#4ade80';
                ctx.font = `bold ${Math.min(width * 0.025, 10)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(`${jumps[i].toFixed(1)}m`, points[i].x, points[i].y - 8);
                ctx.restore();
            }
        }

        // X-axis: jump numbers
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = `${Math.min(width * 0.022, 9)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let i = 0; i < count; i++) {
            const px = gx + (count > 1 ? (i / (count - 1)) * gw : gw / 2);
            ctx.fillText(String(i + 1), px, gy + gh + 6);
        }

        ctx.restore();

        return y + panelH + 20;
    }

    // -------------------------------------------------------------------
    // Achievements section
    // -------------------------------------------------------------------

    _renderAchievements(ctx, width, y, data) {
        const achievements = data.achievements;
        if (!achievements || achievements.length === 0) return y;

        const padX = 20;

        // Section header with count
        const unlockedCount = achievements.filter(a => a.unlocked).length;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `bold ${Math.min(width * 0.032, 13)}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('OPPN\u00c5ELSER', padX, y + 8);

        // Count badge
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        const countText = `${unlockedCount}/${achievements.length}`;
        const countFontSize = Math.min(width * 0.028, 11);
        ctx.font = `bold ${countFontSize}px sans-serif`;
        const countW = ctx.measureText(countText).width + 14;
        const countX = padX + ctx.measureText('OPPN\u00c5ELSER').width + 12;
        this._roundRect(ctx, countX, y, countW, 18, 9);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(countText, countX + countW / 2, y + 9);
        ctx.restore();

        y += 26;

        // Achievement cards - 2 columns
        const gap = 10;
        const cols = 2;
        const cardW = (width - padX * 2 - gap) / cols;
        const cardH = 88;

        const nameFontSize = Math.min(width * 0.03, 12);
        const iconFontSize = Math.min(width * 0.06, 24);

        for (let i = 0; i < achievements.length; i++) {
            const ach = achievements[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cx = padX + col * (cardW + gap);
            const cy = y + row * (cardH + gap);
            const unlocked = ach.unlocked;

            ctx.save();

            // Card background
            if (unlocked) {
                const cardGrad = ctx.createLinearGradient(cx, cy, cx, cy + cardH);
                cardGrad.addColorStop(0, 'rgba(74,222,128,0.15)');
                cardGrad.addColorStop(1, 'rgba(74,222,128,0.05)');
                ctx.fillStyle = cardGrad;
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.025)';
            }
            this._roundRect(ctx, cx, cy, cardW, cardH, 12);
            ctx.fill();

            // Border
            if (unlocked) {
                ctx.strokeStyle = 'rgba(74,222,128,0.35)';
                ctx.lineWidth = 1;
                this._roundRect(ctx, cx, cy, cardW, cardH, 12);
                ctx.stroke();
            } else {
                ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                ctx.lineWidth = 1;
                this._roundRect(ctx, cx, cy, cardW, cardH, 12);
                ctx.stroke();
            }

            if (unlocked) {
                // --- Unlocked card ---
                // Icon
                ctx.font = `${iconFontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(ach.icon || '', cx + cardW / 2, cy + 28);

                // Name
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${nameFontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(ach.name || '', cx + cardW / 2, cy + 54);

                // Description if available
                if (ach.description) {
                    ctx.fillStyle = 'rgba(255,255,255,0.4)';
                    ctx.font = `${Math.min(width * 0.023, 9)}px sans-serif`;
                    ctx.fillText(ach.description, cx + cardW / 2, cy + 70);
                }

                // Green checkmark badge in top-right
                ctx.fillStyle = '#4ade80';
                ctx.beginPath();
                ctx.arc(cx + cardW - 12, cy + 12, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#0a0e1a';
                ctx.font = `bold 10px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('\u2713', cx + cardW - 12, cy + 12);
            } else {
                // --- Locked card: dimmed with lock icon ---
                ctx.globalAlpha = 0.35;

                // Draw a lock icon (canvas drawn, not emoji for consistency)
                const lockCX = cx + cardW / 2;
                const lockCY = cy + 26;
                const lockW = 14;
                const lockH = 12;

                // Lock shackle (arc)
                ctx.strokeStyle = 'rgba(255,255,255,0.6)';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(lockCX, lockCY - 4, 6, Math.PI, 0);
                ctx.stroke();

                // Lock body (rounded rect)
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                this._roundRect(ctx, lockCX - lockW / 2, lockCY, lockW, lockH, 2);
                ctx.fill();

                // Keyhole dot
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                ctx.beginPath();
                ctx.arc(lockCX, lockCY + lockH * 0.4, 2, 0, Math.PI * 2);
                ctx.fill();

                // Name (dimmed)
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.font = `bold ${nameFontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(ach.name || '???', cx + cardW / 2, cy + 54);

                // "Locked" text
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.font = `${Math.min(width * 0.023, 9)}px sans-serif`;
                ctx.fillText('L\u00e5st', cx + cardW / 2, cy + 70);
            }

            ctx.restore();
        }

        const totalRows = Math.ceil(achievements.length / cols);
        return y + totalRows * (cardH + gap);
    }

    // -------------------------------------------------------------------
    // Input handling
    // -------------------------------------------------------------------

    /**
     * Check if a tap hits the back button.
     * @param {number} x - tap X in CSS pixels
     * @param {number} y - tap Y in CSS pixels
     * @returns {string|null} 'back' or null
     */
    handleTap(x, y) {
        if (this._backRect) {
            const b = this._backRect;
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
                return 'back';
            }
        }
        return null;
    }

    /**
     * Scroll through the content. Supports both delta and touch modes.
     * @param {number|string} deltaYOrType - scroll delta (positive = scroll down), or touch type ('start'/'move'/'end')
     * @param {number} [touchY] - touch Y position (for touch mode)
     */
    handleScroll(deltaYOrType, touchY) {
        if (typeof deltaYOrType === 'string') {
            // Touch-based scrolling with momentum
            const type = deltaYOrType;
            if (type === 'start') {
                this._touchStartY = touchY;
                this._scrollVelocity = 0;
            } else if (type === 'move' && this._touchStartY !== null) {
                const dy = this._touchStartY - touchY;
                this.scrollOffset += dy;
                this._scrollVelocity = dy;
                this._touchStartY = touchY;
            } else if (type === 'end') {
                this._touchStartY = null;
                // Velocity is preserved for momentum in render loop
            }
        } else {
            // Simple delta scrolling
            this.scrollOffset += deltaYOrType;
        }
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    _formatDist(value) {
        if (value == null) return '-';
        return `${value.toFixed(1)}m`;
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
