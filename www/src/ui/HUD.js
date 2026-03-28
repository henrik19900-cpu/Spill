/**
 * HUD.js - In-game heads-up display for Vinter-OL Skihopp
 *
 * Renders speed gauge, distance, wind indicator, phase text, timing bar,
 * angle indicator, and tap prompts. All Canvas 2D, mobile portrait (~390x844).
 */

export default class HUD {
    constructor() {
        this._time = 0;
        this._displayedDistance = 0;
    }

    // -------------------------------------------------------------------
    // Main render
    // -------------------------------------------------------------------

    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} width
     * @param {number} height
     * @param {object} hudData
     *   { speed, distance, bodyAngle, windSpeed, windDirection,
     *     phase, takeoffQuality, takeoffTiming (0-1, current bar pos) }
     */
    render(ctx, width, height, hudData = {}) {
        this._time += 0.016;

        const d = {
            speed: 0,
            distance: 0,
            bodyAngle: 0,
            windSpeed: 0,
            windDirection: 0,
            phase: 'INRUN',
            takeoffQuality: null,
            takeoffTiming: null,
            ...hudData,
        };

        // Smoothly animate distance counter
        const distDelta = d.distance - this._displayedDistance;
        this._displayedDistance += distDelta * 0.15;
        if (Math.abs(distDelta) < 0.05) this._displayedDistance = d.distance;

        this._renderPhaseIndicator(ctx, width, height, d);
        this._renderDistance(ctx, width, height, d);
        this._renderSpeedGauge(ctx, width, height, d);
        this._renderWindIndicator(ctx, width, height, d);

        if (d.phase === 'TAKEOFF' && d.takeoffTiming !== null) {
            this._renderTakeoffBar(ctx, width, height, d);
        }

        if (d.phase === 'FLIGHT') {
            this._renderAngleIndicator(ctx, width, height, d);
        }

        if (d.phase === 'READY' || d.phase === 'TAKEOFF' || d.phase === 'LANDING') {
            this._renderTapPrompt(ctx, width, height, d);
        }
    }

    // -------------------------------------------------------------------
    // Phase indicator (top-left) - pill-shaped, color-coded
    // -------------------------------------------------------------------

    _renderPhaseIndicator(ctx, width, height, d) {
        const phaseNames = {
            READY: 'Klar',
            INRUN: 'Tilløp',
            TAKEOFF: 'Sats',
            FLIGHT: 'Svev',
            LANDING: 'Landing',
            SCORE: 'Poeng',
        };

        const phaseColors = {
            READY: '#888888',
            INRUN: '#2196F3',
            TAKEOFF: '#FF9800',
            FLIGHT: '#00BCD4',
            LANDING: '#4CAF50',
            SCORE: '#9C27B0',
        };

        const label = phaseNames[d.phase] || d.phase;
        const color = phaseColors[d.phase] || '#888888';
        const x = 16;
        const y = 52;

        ctx.save();
        const pillW = 120;
        const pillH = 36;
        const pillX = x;
        const pillY = y - pillH / 2;

        // Colored pill background with soft shadow
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = color;
        this._roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
        ctx.fill();

        // Slight inner darkening at top for depth
        ctx.shadowBlur = 0;
        const innerGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
        innerGrad.addColorStop(0, 'rgba(255,255,255,0.2)');
        innerGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
        innerGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
        ctx.fillStyle = innerGrad;
        this._roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
        ctx.fill();

        // Phase text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label.toUpperCase(), pillX + pillW / 2, y + 1);
        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Distance (top-center) - large bold with glow
    // -------------------------------------------------------------------

    _renderDistance(ctx, width, height, d) {
        if (d.phase !== 'FLIGHT' && d.phase !== 'LANDING' && d.phase !== 'SCORE') return;

        const x = width / 2;
        const y = 52;

        ctx.save();

        // Background
        const bgW = 200;
        const bgH = 56;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        this._roundRect(ctx, x - bgW / 2, y - bgH / 2, bgW, bgH, bgH / 2);
        ctx.fill();

        // Subtle border
        ctx.strokeStyle = 'rgba(100,200,255,0.25)';
        ctx.lineWidth = 1.5;
        this._roundRect(ctx, x - bgW / 2, y - bgH / 2, bgW, bgH, bgH / 2);
        ctx.stroke();

        // Distance number with glow
        const dist = this._displayedDistance.toFixed(1);
        ctx.shadowColor = 'rgba(100,200,255,0.7)';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dist, x - 10, y);

        // "m" suffix slightly smaller and dimmer
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(200,230,255,0.7)';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'left';
        const numW = ctx.measureText(dist).width;
        // Recalculate after font change
        ctx.font = 'bold 34px sans-serif';
        const actualNumW = ctx.measureText(dist).width;
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(' m', x - 10 + actualNumW / 2, y + 2);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Speed gauge (bottom-left) - circular speedometer with ticks & needle
    // -------------------------------------------------------------------

    _renderSpeedGauge(ctx, width, height, d) {
        const cx = 64;
        const cy = height - 88;
        const r = 50;
        const maxSpeed = 100;

        ctx.save();

        // Outer shadow ring
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = 'rgba(10,15,30,0.75)';
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Subtle ring border
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.stroke();

        // Arc angles: 135deg to 405deg (270deg sweep)
        const startAngle = Math.PI * 0.75;
        const endAngle = Math.PI * 2.25;
        const sweepAngle = endAngle - startAngle;
        const speedFrac = Math.min(d.speed / maxSpeed, 1);

        // Gradient arc track (dim)
        ctx.beginPath();
        ctx.arc(cx, cy, r - 6, startAngle, endAngle);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 7;
        ctx.lineCap = 'butt';
        ctx.stroke();

        // Gradient filled arc (blue -> yellow -> red)
        if (speedFrac > 0.01) {
            const currentAngle = startAngle + speedFrac * sweepAngle;
            // Draw in small segments for smooth gradient
            const segments = Math.max(2, Math.floor(speedFrac * 60));
            for (let i = 0; i < segments; i++) {
                const t0 = i / segments;
                const t1 = (i + 1) / segments;
                const a0 = startAngle + t0 * speedFrac * sweepAngle;
                const a1 = startAngle + t1 * speedFrac * sweepAngle;
                const frac = t1 * speedFrac; // overall fraction for color

                let r2, g, b;
                if (frac < 0.5) {
                    // Blue to yellow
                    const t = frac / 0.5;
                    r2 = Math.round(30 + t * 225);
                    g = Math.round(140 + t * 115);
                    b = Math.round(255 - t * 200);
                } else {
                    // Yellow to red
                    const t = (frac - 0.5) / 0.5;
                    r2 = 255;
                    g = Math.round(255 - t * 200);
                    b = Math.round(55 - t * 55);
                }

                ctx.beginPath();
                ctx.arc(cx, cy, r - 6, a0, a1 + 0.02);
                ctx.strokeStyle = `rgb(${r2},${g},${b})`;
                ctx.lineWidth = 7;
                ctx.lineCap = 'butt';
                ctx.stroke();
            }

            // Glow on the arc
            ctx.beginPath();
            ctx.arc(cx, cy, r - 6, startAngle, currentAngle);
            ctx.strokeStyle = 'rgba(255,200,80,0.15)';
            ctx.lineWidth = 14;
            ctx.stroke();
        }

        // Tick marks
        const tickCount = 10;
        for (let i = 0; i <= tickCount; i++) {
            const frac = i / tickCount;
            const angle = startAngle + frac * sweepAngle;
            const isMajor = (i % 5 === 0);
            const innerR = r - (isMajor ? 16 : 13);
            const outerR = r - 9;

            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
            ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
            ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)';
            ctx.lineWidth = isMajor ? 2 : 1;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Needle
        const needleAngle = startAngle + speedFrac * sweepAngle;
        const needleLen = r - 14;

        // Needle shadow
        ctx.save();
        ctx.shadowColor = 'rgba(255,60,60,0.4)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(
            cx + Math.cos(needleAngle) * needleLen,
            cy + Math.sin(needleAngle) * needleLen
        );
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();

        // Needle tip dot
        const tipX = cx + Math.cos(needleAngle) * needleLen;
        const tipY = cy + Math.sin(needleAngle) * needleLen;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ff5555';
        ctx.fill();

        // Center cap
        ctx.beginPath();
        ctx.arc(cx, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Speed text - large digits
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(d.speed), cx, cy + 18);

        // Unit label
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '9px sans-serif';
        ctx.fillText('km/h', cx, cy + 30);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Wind indicator (top-right) - windsock icon
    // -------------------------------------------------------------------

    _renderWindIndicator(ctx, width, height, d) {
        const x = width - 75;
        const y = 52;

        ctx.save();

        // Background
        const bgW = 130;
        const bgH = 50;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this._roundRect(ctx, x - bgW / 2, y - bgH / 2, bgW, bgH, 12);
        ctx.fill();

        // Subtle border
        ctx.strokeStyle = 'rgba(136,204,255,0.15)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, x - bgW / 2, y - bgH / 2, bgW, bgH, 12);
        ctx.stroke();

        // Windsock icon
        const sockX = x - 38;
        const sockY = y;
        const windStr = Math.min(d.windSpeed / 5, 1); // 0-1 how strong wind blows
        const dir = (d.windDirection || 0) * (Math.PI / 180);

        ctx.save();
        ctx.translate(sockX, sockY);

        // Pole
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(0, -12);
        ctx.strokeStyle = 'rgba(200,200,200,0.8)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Pole top ball
        ctx.beginPath();
        ctx.arc(0, -13, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200,200,200,0.8)';
        ctx.fill();

        // Windsock (cone shape, direction based on wind)
        const sockLen = 16 + windStr * 12;
        const sockWideEnd = 8;
        const sockNarrowEnd = 3;
        // Droop angle: less wind = more droop
        const droopAngle = (1 - windStr) * 0.6;
        const blowAngle = dir;
        const blowX = Math.cos(blowAngle);
        // Combine horizontal direction with droop
        const endX = blowX * sockLen;
        const endY = -12 + droopAngle * sockLen;
        const midX = blowX * sockLen * 0.5;
        const midY = -12 + droopAngle * sockLen * 0.3;

        // Sock stripes (red and white alternating)
        const stripes = 4;
        for (let i = 0; i < stripes; i++) {
            const t0 = i / stripes;
            const t1 = (i + 1) / stripes;
            const w0 = sockWideEnd - t0 * (sockWideEnd - sockNarrowEnd);
            const w1 = sockWideEnd - t1 * (sockWideEnd - sockNarrowEnd);
            // Bezier interpolation for positions
            const x0 = t0 * t0 * endX + 2 * t0 * (1 - t0) * midX;
            const y0 = -12 + t0 * t0 * (endY + 12) + 2 * t0 * (1 - t0) * (midY + 12);
            const x1 = t1 * t1 * endX + 2 * t1 * (1 - t1) * midX;
            const y1 = -12 + t1 * t1 * (endY + 12) + 2 * t1 * (1 - t1) * (midY + 12);

            ctx.beginPath();
            ctx.moveTo(x0, y0 - w0);
            ctx.lineTo(x1, y1 - w1);
            ctx.lineTo(x1, y1 + w1);
            ctx.lineTo(x0, y0 + w0);
            ctx.closePath();
            ctx.fillStyle = (i % 2 === 0) ? '#e53935' : '#ffffff';
            ctx.globalAlpha = 0.9;
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // Wind flutter animation (subtle)
        const flutter = Math.sin(this._time * 8) * 1.5 * windStr;
        // Draw a small flutter line at sock tip
        ctx.beginPath();
        ctx.moveTo(endX, endY - sockNarrowEnd + flutter);
        ctx.lineTo(endX + 4 * blowX, endY - sockNarrowEnd * 0.5 + flutter);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();

        // Wind speed text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.windSpeed.toFixed(1), x + 15, y - 6);

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '10px sans-serif';
        ctx.fillText('m/s', x + 15, y + 10);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Takeoff timing - expanding ring with green zone
    // -------------------------------------------------------------------

    _renderTakeoffBar(ctx, width, height, d) {
        const cx = width / 2;
        const cy = height * 0.35;
        const outerR = 70;

        ctx.save();

        // Outer background ring
        ctx.beginPath();
        ctx.arc(cx, cy, outerR + 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();

        // Track ring
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 14;
        ctx.stroke();

        // Green sweet-spot zone (arc from ~144deg to ~216deg = center 40%-60%)
        const sweetStart = Math.PI * 2 * 0.4 - Math.PI / 2;
        const sweetEnd = Math.PI * 2 * 0.6 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, sweetStart, sweetEnd);
        ctx.strokeStyle = 'rgba(0,200,100,0.4)';
        ctx.lineWidth = 14;
        ctx.stroke();

        // Perfect zone (tighter arc, brighter green)
        const perfStart = Math.PI * 2 * 0.47 - Math.PI / 2;
        const perfEnd = Math.PI * 2 * 0.53 - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, perfStart, perfEnd);
        ctx.strokeStyle = 'rgba(0,255,120,0.7)';
        ctx.lineWidth = 14;
        ctx.stroke();

        // Moving indicator (bright dot traveling around the ring)
        const timing = Math.max(0, Math.min(1, d.takeoffTiming));
        const indicatorAngle = Math.PI * 2 * timing - Math.PI / 2;
        const indicatorX = cx + Math.cos(indicatorAngle) * outerR;
        const indicatorY = cy + Math.sin(indicatorAngle) * outerR;

        // Glow behind indicator
        ctx.shadowColor = 'rgba(255,255,255,0.8)';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(indicatorX, indicatorY, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Inner bright dot
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(indicatorX, indicatorY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Center label
        ctx.fillStyle = 'rgba(255,200,50,0.9)';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SATS!', cx, cy);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Angle indicator (during FLIGHT) - semi-circular with optimal zone
    // -------------------------------------------------------------------

    _renderAngleIndicator(ctx, width, height, d) {
        const cx = width - 64;
        const cy = height - 88;
        const r = 50;

        ctx.save();

        // Background
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(10,15,30,0.75)';
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
        ctx.stroke();

        // Semi-circular arc: maps -10deg to 60deg body angle
        // Display as upper half arc
        const minAngle = -10;
        const maxAngle = 60;
        const arcStart = Math.PI; // left
        const arcEnd = 0;        // right (upper semi-circle)

        // Full track
        ctx.beginPath();
        ctx.arc(cx, cy, r - 8, arcStart, arcEnd, false);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'butt';
        ctx.stroke();

        // Danger zone (red) - far from optimal
        ctx.beginPath();
        ctx.arc(cx, cy, r - 8, arcStart, arcStart + (arcEnd - arcStart + Math.PI * 2) % (Math.PI * 2) * 0.2, false);
        ctx.strokeStyle = 'rgba(255,60,60,0.3)';
        ctx.lineWidth = 8;
        ctx.stroke();

        // High end danger
        const dangerHighStart = arcStart + Math.PI * 0.8;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 8, dangerHighStart, arcEnd, false);
        ctx.strokeStyle = 'rgba(255,60,60,0.3)';
        ctx.lineWidth = 8;
        ctx.stroke();

        // Optimal zone (green) - around 30-40 degrees (roughly 0.57-0.71 of the arc)
        // 35deg optimal = (35-(-10))/(60-(-10)) = 45/70 = 0.643 of range
        const optLowFrac = (25 - minAngle) / (maxAngle - minAngle); // 25deg
        const optHighFrac = (45 - minAngle) / (maxAngle - minAngle); // 45deg
        const optArcStart = arcStart + optLowFrac * Math.PI;
        const optArcEnd = arcStart + optHighFrac * Math.PI;

        ctx.beginPath();
        ctx.arc(cx, cy, r - 8, optArcStart, optArcEnd, false);
        ctx.strokeStyle = 'rgba(0,220,100,0.5)';
        ctx.lineWidth = 8;
        ctx.stroke();

        // Sweet spot (brighter green, ~33-37 deg)
        const sweetLowFrac = (31 - minAngle) / (maxAngle - minAngle);
        const sweetHighFrac = (39 - minAngle) / (maxAngle - minAngle);
        const sweetArcStart = arcStart + sweetLowFrac * Math.PI;
        const sweetArcEnd = arcStart + sweetHighFrac * Math.PI;
        ctx.beginPath();
        ctx.arc(cx, cy, r - 8, sweetArcStart, sweetArcEnd, false);
        ctx.strokeStyle = 'rgba(0,255,120,0.8)';
        ctx.lineWidth = 8;
        ctx.stroke();

        // Tick marks
        const ticks = [0, 10, 20, 30, 40, 50, 60];
        for (const tickVal of ticks) {
            const frac = (tickVal - minAngle) / (maxAngle - minAngle);
            const angle = arcStart + frac * Math.PI;
            const isMajor = (tickVal % 20 === 0);
            const inner = r - (isMajor ? 16 : 14);
            const outer = r - 10;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
            ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
            ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)';
            ctx.lineWidth = isMajor ? 1.5 : 1;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Current angle needle
        const angleFrac = Math.max(0, Math.min(1, (d.bodyAngle - minAngle) / (maxAngle - minAngle)));
        const needleAngle = arcStart + angleFrac * Math.PI;
        const needleLen = r - 16;
        const nx = cx + Math.cos(needleAngle) * needleLen;
        const ny = cy + Math.sin(needleAngle) * needleLen;

        // Is it in optimal zone?
        const inOptimal = d.bodyAngle >= 25 && d.bodyAngle <= 45;
        const needleColor = inOptimal ? '#44ff88' : '#ff8844';

        ctx.shadowColor = needleColor;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = needleColor;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Tip dot
        ctx.beginPath();
        ctx.arc(nx, ny, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = needleColor;
        ctx.fill();

        // Center cap
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();

        // Angle text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${d.bodyAngle.toFixed(0)}°`, cx, cy + 16);

        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '9px sans-serif';
        ctx.fillText('vinkel', cx, cy + 28);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Tap prompt - large pulsing with scale + finger icon
    // -------------------------------------------------------------------

    _renderTapPrompt(ctx, width, height, d) {
        const pulse = 0.7 + Math.sin(this._time * 6) * 0.3;
        const scalePulse = 1.0 + Math.sin(this._time * 5) * 0.08;

        ctx.save();

        const x = width / 2;
        const y = height * 0.55;

        ctx.translate(x, y);
        ctx.scale(scalePulse, scalePulse);
        ctx.translate(-x, -y);

        ctx.globalAlpha = pulse;

        // Large pill background
        const pillW = 170;
        const pillH = 70;

        // Outer glow
        ctx.shadowColor = 'rgba(255,80,80,0.6)';
        ctx.shadowBlur = 28;
        ctx.fillStyle = 'rgba(220,50,50,0.5)';
        this._roundRect(ctx, x - pillW / 2, y - pillH / 2, pillW, pillH, pillH / 2);
        ctx.fill();

        // Inner brighter fill
        ctx.shadowBlur = 0;
        const grad = ctx.createLinearGradient(x, y - pillH / 2, x, y + pillH / 2);
        grad.addColorStop(0, 'rgba(255,100,80,0.7)');
        grad.addColorStop(1, 'rgba(200,40,40,0.7)');
        ctx.fillStyle = grad;
        this._roundRect(ctx, x - pillW / 2, y - pillH / 2, pillW, pillH, pillH / 2);
        ctx.fill();

        // Finger/hand icon (simple pointing finger)
        const iconX = x - 40;
        const iconY = y;
        ctx.save();
        ctx.translate(iconX, iconY);
        // Draw a simplified finger tap icon
        // Circle (fingertip)
        ctx.beginPath();
        ctx.arc(0, -4, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
        // Finger body
        ctx.beginPath();
        ctx.moveTo(-5, -2);
        ctx.lineTo(-4, 12);
        ctx.lineTo(4, 12);
        ctx.lineTo(5, -2);
        ctx.closePath();
        ctx.fill();
        // Tap ripple rings
        const rippleAlpha = 0.4 * (0.5 + Math.sin(this._time * 8) * 0.5);
        ctx.strokeStyle = `rgba(255,255,255,${rippleAlpha})`;
        ctx.lineWidth = 1.5;
        const rippleR = 12 + Math.sin(this._time * 4) * 4;
        ctx.beginPath();
        ctx.arc(0, -4, rippleR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // TAP! text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('TAP!', x + 15, y);

        ctx.restore();
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

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
