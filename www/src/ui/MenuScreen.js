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

        // Track pressed button for press animation
        this._pressedButton = null;

        // Snowflake positions (generated once, rendered each frame)
        this._snowflakes = [];
        for (let i = 0; i < 80; i++) {
            this._snowflakes.push({
                x: Math.random(),
                y: Math.random(),
                size: 2 + Math.random() * 5,
                speed: 0.008 + Math.random() * 0.018,
                drift: (Math.random() - 0.5) * 0.003,
                wobbleSpeed: 1 + Math.random() * 3,
                wobbleAmp: 0.0005 + Math.random() * 0.002,
                opacity: 0.2 + Math.random() * 0.5,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.02,
            });
        }

        // Ski jumper silhouette state
        this._jumper = {
            x: -0.15,
            y: 0.35 + Math.random() * 0.2,
            speed: 0.0012 + Math.random() * 0.0008,
            scale: 0.6 + Math.random() * 0.4,
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
        this._renderSnowflakes(ctx, width, height);
        this._renderSkiJumper(ctx, width, height);
        this._renderNorwegianFlag(ctx, width, height);
        this._renderOlympicRings(ctx, width, height);
        this._renderTitle(ctx, width, height);
        this._renderButtons(ctx, width, height);
        this._renderPulsingTapText(ctx, width, height);
        this._renderFooter(ctx, width, height);
    }

    _renderBackground(ctx, width, height) {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#0a0e1a');
        grad.addColorStop(0.3, '#101830');
        grad.addColorStop(0.6, '#162048');
        grad.addColorStop(1, '#0c1a3a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // Aurora-like glow at the top
        const auroraGrad = ctx.createRadialGradient(
            width * 0.5, height * 0.05, 0,
            width * 0.5, height * 0.05, width * 0.8
        );
        auroraGrad.addColorStop(0, 'rgba(60,140,200,0.08)');
        auroraGrad.addColorStop(0.5, 'rgba(40,100,180,0.03)');
        auroraGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = auroraGrad;
        ctx.fillRect(0, 0, width, height * 0.5);

        // Layered mountain silhouettes
        // Far mountains (faintest)
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(0, height * 0.72);
        ctx.lineTo(width * 0.1, height * 0.68);
        ctx.lineTo(width * 0.2, height * 0.72);
        ctx.lineTo(width * 0.35, height * 0.60);
        ctx.lineTo(width * 0.5, height * 0.67);
        ctx.lineTo(width * 0.65, height * 0.58);
        ctx.lineTo(width * 0.8, height * 0.65);
        ctx.lineTo(width * 0.9, height * 0.61);
        ctx.lineTo(width, height * 0.68);
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();

        // Near mountains (slightly brighter)
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.beginPath();
        ctx.moveTo(0, height);
        ctx.lineTo(0, height * 0.82);
        ctx.lineTo(width * 0.12, height * 0.76);
        ctx.lineTo(width * 0.28, height * 0.80);
        ctx.lineTo(width * 0.42, height * 0.72);
        ctx.lineTo(width * 0.58, height * 0.78);
        ctx.lineTo(width * 0.72, height * 0.70);
        ctx.lineTo(width * 0.88, height * 0.77);
        ctx.lineTo(width, height * 0.80);
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();

        // Snow-covered ground at bottom
        ctx.fillStyle = 'rgba(200,220,255,0.03)';
        ctx.fillRect(0, height * 0.88, width, height * 0.12);
    }

    _renderSnowflakes(ctx, width, height) {
        for (const flake of this._snowflakes) {
            // Animate
            flake.y += flake.speed * 0.016 * 3;
            flake.x += flake.drift + Math.sin(this._time * flake.wobbleSpeed) * flake.wobbleAmp;
            flake.rotation += flake.rotSpeed;
            if (flake.y > 1.05) { flake.y = -0.05; flake.x = Math.random(); }
            if (flake.x > 1.05) flake.x = -0.05;
            if (flake.x < -0.05) flake.x = 1.05;

            const sx = flake.x * width;
            const sy = flake.y * height;

            ctx.save();
            ctx.globalAlpha = flake.opacity;
            ctx.translate(sx, sy);
            ctx.rotate(flake.rotation);

            // Draw a proper snowflake shape (6-armed star)
            const s = flake.size;
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = Math.max(0.5, s * 0.15);

            if (s > 3.5) {
                // Larger flakes get a crystal shape
                ctx.beginPath();
                for (let arm = 0; arm < 6; arm++) {
                    const angle = (arm / 6) * Math.PI * 2;
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(angle) * s, Math.sin(angle) * s);
                    // Small branches
                    const bx = Math.cos(angle) * s * 0.6;
                    const by = Math.sin(angle) * s * 0.6;
                    const perpAngle = angle + Math.PI / 4;
                    ctx.moveTo(bx, by);
                    ctx.lineTo(bx + Math.cos(perpAngle) * s * 0.3, by + Math.sin(perpAngle) * s * 0.3);
                    ctx.moveTo(bx, by);
                    ctx.lineTo(bx + Math.cos(perpAngle + Math.PI / 2) * s * 0.3, by + Math.sin(perpAngle + Math.PI / 2) * s * 0.3);
                }
                ctx.stroke();
            } else {
                // Small flakes are just circles
                ctx.beginPath();
                ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
                ctx.fill();
            }

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
        const arcY = j.y + Math.sin(j.x * Math.PI) * 0.08;

        if (j.x > 1.2) {
            // Reset for next pass
            j.x = -0.2;
            j.y = 0.30 + Math.random() * 0.20;
            j.speed = 0.001 + Math.random() * 0.001;
            j.scale = 0.5 + Math.random() * 0.5;
            j.delay = 3 + Math.random() * 5; // wait 3-8 seconds
            return;
        }

        const px = j.x * width;
        const py = arcY * height;
        const s = j.scale * Math.min(width * 0.06, 28);

        ctx.save();
        ctx.globalAlpha = 0.12 + j.scale * 0.08;
        ctx.translate(px, py);

        // Tilt based on trajectory
        const tilt = -0.2 + j.x * 0.15;
        ctx.rotate(tilt);

        // Draw ski jumper silhouette in flight pose
        ctx.fillStyle = 'rgba(200,220,255,0.9)';

        // Body (leaning forward)
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.2, s * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(s * 0.9, -s * 0.15, s * 0.22, 0, Math.PI * 2);
        ctx.fill();

        // Skis (V-style)
        ctx.strokeStyle = 'rgba(200,220,255,0.9)';
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        ctx.lineCap = 'round';
        // Left ski
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, s * 0.2);
        ctx.lineTo(-s * 1.8, s * 0.6);
        ctx.stroke();
        // Right ski
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, -s * 0.05);
        ctx.lineTo(-s * 1.8, -s * 0.5);
        ctx.stroke();

        // Small trail particles
        ctx.globalAlpha *= 0.4;
        for (let i = 1; i <= 4; i++) {
            const trailX = -s * 1.0 - i * s * 0.4;
            const trailY = Math.sin(this._time * 8 + i) * s * 0.15;
            ctx.beginPath();
            ctx.arc(trailX, trailY, s * 0.06 * (5 - i) / 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(200,220,255,0.6)';
            ctx.fill();
        }

        ctx.restore();
    }

    _renderNorwegianFlag(ctx, width, height) {
        // Full-width Norwegian flag stripe at the very top
        const barH = Math.max(6, height * 0.012);
        const totalH = barH * 3;

        // Red stripe
        ctx.fillStyle = '#BA0C2F';
        ctx.fillRect(0, 0, width, barH);

        // White stripe
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, barH, width, barH);

        // Blue stripe
        ctx.fillStyle = '#00205B';
        ctx.fillRect(0, barH * 2, width, barH);

        // Subtle glow beneath the flag
        const flagGlow = ctx.createLinearGradient(0, totalH, 0, totalH + 20);
        flagGlow.addColorStop(0, 'rgba(186,12,47,0.15)');
        flagGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = flagGlow;
        ctx.fillRect(0, totalH, width, 20);
    }

    _renderOlympicRings(ctx, width, height) {
        const centerX = width / 2;
        const topY = height * 0.09;
        const r = Math.min(width * 0.050, 24);
        const gap = r * 2.3;
        const lineWidth = Math.max(2.5, r * 0.28);

        // Official Olympic ring colors
        const colors = ['#0081C8', '#FCB131', '#000000', '#00A651', '#EE334E'];
        // Top row: blue, black, red    Bottom row: yellow, green
        const positions = [
            { x: centerX - gap * 2, y: topY },             // Blue (top left)
            { x: centerX - gap,     y: topY + r * 1.05 },  // Yellow (bottom left)
            { x: centerX,           y: topY },              // Black (top center)
            { x: centerX + gap,     y: topY + r * 1.05 },  // Green (bottom right)
            { x: centerX + gap * 2, y: topY },              // Red (top right)
        ];

        // Draw interlocking rings using clipping for proper overlap
        // The official interlocking pattern: each ring passes over and under its neighbors
        // Simplified approach: draw back row, then front row with strategic arc segments

        // We draw all rings twice - first the full rings, then the interlocking overlaps
        // Step 1: Draw all rings as complete circles
        for (let i = 0; i < 5; i++) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(positions[i].x, positions[i].y, r, 0, Math.PI * 2);
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            ctx.restore();
        }

        // Step 2: Draw interlocking segments
        // Yellow ring goes OVER blue ring on its right side
        this._drawRingSegment(ctx, positions[1], r, lineWidth, colors[1],
            -Math.PI * 0.6, -Math.PI * 0.35);
        // Yellow ring goes OVER black ring on its left side
        this._drawRingSegment(ctx, positions[1], r, lineWidth, colors[1],
            -Math.PI * 0.15, Math.PI * 0.05);

        // Green ring goes OVER black ring on its right side
        this._drawRingSegment(ctx, positions[3], r, lineWidth, colors[3],
            -Math.PI * 0.85, -Math.PI * 0.6);
        // Green ring goes OVER red ring on its left side
        this._drawRingSegment(ctx, positions[3], r, lineWidth, colors[3],
            Math.PI * 0.05, Math.PI * 0.2);

        // Black ring goes OVER yellow ring (bottom portion)
        this._drawRingSegment(ctx, positions[2], r, lineWidth, colors[2],
            Math.PI * 0.35, Math.PI * 0.65);
        // Black ring goes OVER green ring (bottom portion)
        this._drawRingSegment(ctx, positions[2], r, lineWidth, colors[2],
            Math.PI * 0.55, Math.PI * 0.75);

        // Subtle glow behind rings
        ctx.save();
        ctx.globalAlpha = 0.06;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(positions[i].x, positions[i].y, r + 4, 0, Math.PI * 2);
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = lineWidth + 6;
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawRingSegment(ctx, pos, r, lineWidth, color, startAngle, endAngle) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, startAngle, endAngle);
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth + 1; // slightly wider to cover the ring beneath
        ctx.lineCap = 'butt';
        ctx.stroke();
        ctx.restore();
    }

    _renderTitle(ctx, width, height) {
        const titleY = height * 0.21;
        const fontSize = Math.min(width * 0.18, 72);
        const letterSpacing = Math.min(width * 0.02, 10);
        const title = 'VINTER-OL';

        ctx.save();

        // Deep shadow layer
        ctx.font = `900 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,20,60,0.8)';
        ctx.fillText(title, width / 2 + 3, titleY + 5);

        // Blue outer glow
        ctx.shadowColor = 'rgba(80,160,255,0.7)';
        ctx.shadowBlur = 40;
        ctx.fillStyle = 'rgba(80,160,255,0.3)';
        ctx.fillText(title, width / 2, titleY);
        ctx.shadowBlur = 0;

        // Draw letters individually for letter-spacing and ice texture
        const totalWidth = this._measureSpacedText(ctx, title, letterSpacing);
        let curX = width / 2 - totalWidth / 2;

        for (let i = 0; i < title.length; i++) {
            const ch = title[i];
            const charW = ctx.measureText(ch).width;

            // Ice blue gradient fill for each letter
            const grad = ctx.createLinearGradient(curX, titleY - fontSize / 2, curX, titleY + fontSize / 2);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.3, '#e0f0ff');
            grad.addColorStop(0.5, '#ffffff');
            grad.addColorStop(0.7, '#c0dfff');
            grad.addColorStop(1, '#90c0e8');

            // Blue shadow underneath
            ctx.save();
            ctx.shadowColor = 'rgba(50,120,220,0.9)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 3;
            ctx.fillStyle = grad;
            ctx.fillText(ch, curX + charW / 2, titleY);
            ctx.restore();

            // Bright highlight on top half
            ctx.save();
            ctx.globalAlpha = 0.15 + Math.sin(this._time * 2 + i * 0.5) * 0.08;
            ctx.fillStyle = '#ffffff';
            // Clip to top half
            ctx.beginPath();
            ctx.rect(curX - 2, titleY - fontSize / 2, charW + 4, fontSize * 0.4);
            ctx.clip();
            ctx.fillText(ch, curX + charW / 2, titleY);
            ctx.restore();

            curX += charW + letterSpacing;
        }

        ctx.restore();

        // Subtitle
        const subY = titleY + fontSize * 0.65;
        const subFontSize = Math.min(width * 0.09, 36);

        // Decorative accent lines flanking subtitle
        const accentW = Math.min(width * 0.55, 220);
        const lineY = subY;
        ctx.save();
        ctx.strokeStyle = 'rgba(150,200,255,0.3)';
        ctx.lineWidth = 1;
        // Left line
        ctx.beginPath();
        ctx.moveTo(width / 2 - accentW / 2, lineY);
        ctx.lineTo(width / 2 - subFontSize * 2.2, lineY);
        ctx.stroke();
        // Right line
        ctx.beginPath();
        ctx.moveTo(width / 2 + subFontSize * 2.2, lineY);
        ctx.lineTo(width / 2 + accentW / 2, lineY);
        ctx.stroke();
        ctx.restore();

        // SKIHOPP subtitle with glow
        ctx.save();
        ctx.shadowColor = 'rgba(150,200,255,0.5)';
        ctx.shadowBlur = 12;
        ctx.fillStyle = 'rgba(200,225,255,0.9)';
        ctx.font = `300 ${subFontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S K I H O P P', width / 2, subY);
        ctx.restore();
    }

    _measureSpacedText(ctx, text, spacing) {
        let total = 0;
        for (let i = 0; i < text.length; i++) {
            total += ctx.measureText(text[i]).width;
            if (i < text.length - 1) total += spacing;
        }
        return total;
    }

    _renderButtons(ctx, width, height) {
        this._buttonRects = [];

        const btnW = Math.min(width * 0.78, 320);
        const btnH = 62;
        const gap = 20;
        const startY = height * 0.44;

        for (let i = 0; i < this.buttons.length; i++) {
            const btn = this.buttons[i];
            const x = (width - btnW) / 2;
            const y = startY + i * (btnH + gap);
            const isPressed = this._pressedButton === btn.id;

            // Store hit rect
            this._buttonRects.push({ x, y, w: btnW, h: btnH, id: btn.id, enabled: btn.enabled });

            const r = btnH / 2; // Pill shape

            ctx.save();

            // Press animation: slight scale down and translate
            if (isPressed && btn.enabled) {
                ctx.translate(x + btnW / 2, y + btnH / 2);
                ctx.scale(0.96, 0.96);
                ctx.translate(-(x + btnW / 2), -(y + btnH / 2));
            }

            if (btn.enabled) {
                // Outer glow
                ctx.save();
                ctx.shadowColor = isPressed ? 'rgba(80,160,255,0.5)' : 'rgba(80,160,255,0.25)';
                ctx.shadowBlur = isPressed ? 18 : 12;

                // Gradient fill - polished button look
                const grad = ctx.createLinearGradient(x, y, x, y + btnH);
                if (isPressed) {
                    grad.addColorStop(0, 'rgba(40,80,160,0.6)');
                    grad.addColorStop(0.5, 'rgba(50,100,180,0.5)');
                    grad.addColorStop(1, 'rgba(30,70,140,0.6)');
                } else {
                    grad.addColorStop(0, 'rgba(60,110,200,0.45)');
                    grad.addColorStop(0.5, 'rgba(50,100,190,0.35)');
                    grad.addColorStop(1, 'rgba(35,75,160,0.45)');
                }
                ctx.fillStyle = grad;
                this._roundRect(ctx, x, y, btnW, btnH, r);
                ctx.fill();
                ctx.restore();

                // Glass highlight (top half reflection)
                ctx.save();
                ctx.beginPath();
                this._roundRect(ctx, x, y, btnW, btnH / 2, { tl: r, tr: r, br: 0, bl: 0 });
                ctx.clip();
                const glassGrad = ctx.createLinearGradient(x, y, x, y + btnH / 2);
                glassGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
                glassGrad.addColorStop(1, 'rgba(255,255,255,0.02)');
                ctx.fillStyle = glassGrad;
                ctx.fillRect(x, y, btnW, btnH / 2);
                ctx.restore();

                // Border
                ctx.strokeStyle = 'rgba(120,180,255,0.4)';
                ctx.lineWidth = 1.5;
                this._roundRect(ctx, x, y, btnW, btnH, r);
                ctx.stroke();
            } else {
                // Disabled button
                ctx.fillStyle = 'rgba(255,255,255,0.03)';
                this._roundRect(ctx, x, y, btnW, btnH, r);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.lineWidth = 1;
                this._roundRect(ctx, x, y, btnW, btnH, r);
                ctx.stroke();
            }

            // Button label
            const labelSize = Math.min(width * 0.055, 22);
            ctx.fillStyle = btn.enabled ? '#ffffff' : 'rgba(255,255,255,0.25)';
            ctx.font = `${btn.enabled ? '600 ' : '400 '}${labelSize}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            if (btn.enabled) {
                // Subtle text shadow
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 4;
                ctx.shadowOffsetY = 1;
                ctx.fillText(btn.label, width / 2, y + btnH / 2);
                ctx.restore();
            } else {
                ctx.fillText(btn.label, width / 2, y + btnH / 2 - 6);
                // Disabled tag
                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ctx.font = `${Math.min(width * 0.028, 11)}px sans-serif`;
                ctx.fillText('(kommer snart)', width / 2, y + btnH / 2 + 14);
            }

            ctx.restore();
        }
    }

    _renderPulsingTapText(ctx, width, height) {
        const y = height * 0.78;

        // Pulsing "TAP FOR A STARTE" text
        const pulse = 0.35 + Math.sin(this._time * 3) * 0.35;
        const scale = 1.0 + Math.sin(this._time * 3) * 0.03;

        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.translate(width / 2, y);
        ctx.scale(scale, scale);
        ctx.translate(-width / 2, -y);

        ctx.fillStyle = 'rgba(200,225,255,0.9)';
        ctx.font = `300 ${Math.min(width * 0.04, 16)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('T A P   F O R   \u00C5   S T A R T E', width / 2, y);
        ctx.restore();

        // Small animated chevron below
        const chevronY = y + 22 + Math.sin(this._time * 4) * 3;
        ctx.save();
        ctx.globalAlpha = pulse * 0.6;
        ctx.strokeStyle = 'rgba(200,225,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(width / 2 - 8, chevronY);
        ctx.lineTo(width / 2, chevronY + 5);
        ctx.lineTo(width / 2 + 8, chevronY);
        ctx.stroke();
        ctx.restore();
    }

    _renderFooter(ctx, width, height) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = `${Math.min(width * 0.025, 11)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Vinter-OL Skihopp', width / 2, height - 20);
    }

    // -------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------

    _roundRect(ctx, x, y, w, h, r) {
        // r can be a number or an object { tl, tr, br, bl }
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
