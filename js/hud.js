"use strict";

  /* ============================================================================
   * 11. COMBAT AVIONICS HUD RENDERER (Compass Tape, De-Conflicted IFF & MFD)
   * ============================================================================
   */
  class HUDRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.logicalW = window.innerWidth;
      this.logicalH = window.innerHeight;
      this.dpr = 1;
      this.hitmarkerTimer = 0;
      this.hitmarkerIsKill = false;
      this.popups = [];
      this.damageNumbers = [];
      this.playerHitTimer = 0;
      this.playerHitAngle = 0;
      this.playerHitLastDmg = 0;
      this.hudColorTheme = 'GREEN';
      this.showFps = false;
    }

    getThemePalette() {
      const themes = {
        AMBER: {
          main: '#d9822b',
          soft: 'rgba(217, 130, 43, 0.48)',
          dim: 'rgba(217, 130, 43, 0.22)',
          glass: 'rgba(217, 130, 43, 0.045)'
        },
        ICE: {
          main: '#69b8f5',
          soft: 'rgba(105, 184, 245, 0.45)',
          dim: 'rgba(105, 184, 245, 0.22)',
          glass: 'rgba(105, 184, 245, 0.045)'
        },
        GREEN: {
          main: '#52c468',
          soft: 'rgba(82, 196, 104, 0.44)',
          dim: 'rgba(82, 196, 104, 0.22)',
          glass: 'rgba(82, 196, 104, 0.04)'
        }
      };
      return themes[this.hudColorTheme] || themes.GREEN;
    }

    resize(w, h) {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.logicalW = w;
      this.logicalH = h;
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    clear() {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.ctx.clearRect(0, 0, this.logicalW, this.logicalH);
    }

    triggerHitmarker(isKill = false) {
      this.hitmarkerTimer = isKill ? 0.38 : 0.18;
      this.hitmarkerIsKill = isKill;
    }

    triggerPlayerHitEffect(playerAc, attackerAc, dmgAmount) {
      this.playerHitTimer = 0.55;
      this.playerHitLastDmg = dmgAmount;
      if (playerAc && attackerAc) {
        _v1.subVectors(attackerAc.mesh.position, playerAc.mesh.position).normalize();
        _q1.copy(playerAc.mesh.quaternion).invert();
        _v1.applyQuaternion(_q1);
        this.playerHitAngle = Math.atan2(_v1.x, -_v1.z);
      } else {
        this.playerHitAngle = (Math.random() - 0.5) * Math.PI;
      }
    }

    addDamageNumber(worldPos, text, color = '#d9822b', isLarge = false) {
      this.damageNumbers.push({
        worldPos: worldPos.clone(),
        text,
        color,
        isLarge,
        age: 0,
        life: 0.95,
        offsetX: (Math.random() - 0.5) * 24
      });
      if (this.damageNumbers.length > 18) this.damageNumbers.shift();
    }

    addPopup(text, color = '#52c468') {
      this.popups.push({
        text,
        color,
        age: 0,
        life: 2.2
      });
      if (this.popups.length > 5) this.popups.shift();
    }

    static formatClock(sec) {
      const s = Math.max(0, Math.ceil(sec));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    }

    render(dt, ac, allAircraft, world, camera, isSpectating, cameraMode, input, teamCaptures, highScore, remainingMatchSec = 600, isSuddenDeath = false) {
      const ctx = this.ctx;
      const w = this.logicalW;
      const h = this.logicalH;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (!ac) return;

      const cx = w * 0.5;
      const cy = h * 0.5;
      const pal = this.getThemePalette();
      const hudColor = pal.main;
      const warnColor = '#c9443e';
      const isMobile = Boolean(input && input.touchUIVisible);

      if (dt > 0.0005) {
        const curFps = 1 / dt;
        this.fps = this.fps ? (this.fps * 0.92 + curFps * 0.08) : curFps;
      } else if (!this.fps) {
        this.fps = 60;
      }

      if (this.showFps) {
        this.renderFpsCounter(ctx, pal);
      }
      this.renderCtfTopBanner(ctx, cx, teamCaptures, world.flags, remainingMatchSec, isSuddenDeath);

      if (!ac.alive) {
        ctx.save();
        ctx.fillStyle = '#d9822b';
        ctx.font = '700 18px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`RE-DEPLOY IN ${Math.max(0.1, ac.respawnTimer).toFixed(1)}s`, cx, cy - 20);
        ctx.restore();
        return;
      }

      _euler1.setFromQuaternion(ac.mesh.quaternion, 'YXZ');
      const headingDeg = (THREE.MathUtils.radToDeg(-_euler1.y) % 360 + 360) % 360;
      const pitchRad = _euler1.x;
      const bankRad = _euler1.z;
      const altM = Math.max(0, Math.round(ac.mesh.position.y));
      const groundH = world
        ? Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(ac.mesh.position.x, ac.mesh.position.z))
        : CONFIG.WORLD.seaLevel;
      const aglM = Math.max(0, Math.round(ac.mesh.position.y - groundH));

      if (cameraMode === 'COCKPIT') {
        this.renderCockpitCanopyFrame(ctx, w, h, cx, cy, pal);
      }

      this.renderCompassTape(ctx, cx, headingDeg, pal);
      this.renderHorizonAndPitchLadder(ctx, cx, cy, pitchRad, bankRad, pal);

      if (ac.isTakingOff) {
        this.renderTakeoffRollBanner(ctx, cx, cy, ac);
      }

      if (ac.flight.isBoosting || ac.overdriveTimer > 0) {
        this.renderSpeedLines(ctx, cx, cy, w, h, ac.overdriveTimer > 0);
      }

      if (this.playerHitTimer > 0) {
        this.renderPlayerHitEffect(ctx, dt, cx, cy, w, h);
      }

      // Boresight & Stabilized Aim Reticle
      const { bx, by } = this.renderReticles(ctx, dt, ac, camera, input, isSpectating, isMobile, w, h, cx, cy, hudColor);

      // Floating Damage Numbers
      this.renderDamageNumbers(ctx, dt, camera, w, h);

      // Airbrake Turn Feedback
      if (!isMobile && ac.flight.isAirBraking) {
        ctx.save();
        ctx.fillStyle = '#d9822b';
        ctx.font = '700 10.5px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('AIRBRAKE ACTIVE', cx, cy + 122);
        ctx.restore();
      }

      // De-conflicted Flags, Offscreen Chevrons & Target Acquisition Boxes
      this.renderWorldMarkersAndTargets(ctx, ac, allAircraft, world.flags, camera, w, h, cx, cy, bx, by, warnColor, pal);

      // Popups & Center Alerts
      this.renderCenterPopupsAndWarnings(ctx, dt, cx, cy, ac, aglM, warnColor);

      // Grounded Tactical Radar & Right Avionics Block
      this.renderRadar(ctx, ac, allAircraft, world, w, h, headingDeg, isMobile, pal);
      this.renderAvionicsBlock(ctx, w, h, ac, altM, aglM, pal);
    }

    renderFpsCounter(ctx, pal) {
      ctx.save();
      ctx.font = '700 10.5px "Share Tech Mono", monospace';
      ctx.fillStyle = pal ? pal.main : 'rgba(82, 196, 104, 0.85)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`${Math.round(this.fps || 60)} FPS`, 16, 14);
      ctx.restore();
    }

    renderCtfTopBanner(ctx, cx, teamCaptures, flags, remainingMatchSec = 600, isSuddenDeath = false) {
      ctx.save();
      const bw = 420;
      const bh = 38;
      const bx = cx - bw * 0.5;
      const by = 8;

      ctx.fillStyle = 'rgba(12, 14, 17, 0.86)';
      ctx.fillRect(bx, by, bw, bh);

      if (isSuddenDeath) {
        ctx.strokeStyle = ((Math.floor(performance.now() / 220) % 2 === 0) ? '#d9822b' : '#c9443e');
        ctx.lineWidth = 1.6;
      } else {
        ctx.strokeStyle = remainingMatchSec < 60 ? 'rgba(201, 68, 62, 0.7)' : 'rgba(234, 231, 223, 0.22)';
        ctx.lineWidth = 1.2;
      }
      ctx.strokeRect(bx, by, bw, bh);

      const capGoal = CONFIG.CTF.capturesToWin;
      const drawPips = (startX, count, color, reverse) => {
        for (let i = 0; i < capGoal; i++) {
          const idx = reverse ? (capGoal - 1 - i) : i;
          const filled = i < count;
          const px = startX + idx * 10;
          ctx.fillStyle = filled ? color : 'rgba(255, 255, 255, 0.14)';
          ctx.fillRect(px, by + 10, 7, 6);
        }
      };

      const flagStateLabel = (f) => {
        if (!f || f.state === 'AT_BASE') return 'HOME';
        if (f.state === 'DROPPED') return `DROP ${Math.ceil(f.dropTimer)}s`;
        if (f.state === 'CARRIED' && f.carrier) return f.carrier.callsign.slice(0, 8).toUpperCase();
        return 'ACTIVE';
      };

      // Blue Left Side
      ctx.font = '700 13px "Share Tech Mono", monospace';
      ctx.fillStyle = '#5e97d1';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`BLUE ${teamCaptures.BLUE}`, bx + 12, by + 6);
      drawPips(bx + 72, teamCaptures.BLUE, '#5e97d1', false);

      ctx.font = '600 9.5px "Share Tech Mono", monospace';
      ctx.fillStyle = flags.BLUE && flags.BLUE.state === 'AT_BASE' ? 'rgba(167, 197, 227, 0.72)' : '#d9822b';
      ctx.fillText(`FLAG: ${flagStateLabel(flags.BLUE)}`, bx + 12, by + 23);

      // Red Right Side
      ctx.font = '700 13px "Share Tech Mono", monospace';
      ctx.fillStyle = '#c9443e';
      ctx.textAlign = 'right';
      ctx.fillText(`${teamCaptures.RED} RED`, bx + bw - 12, by + 6);
      drawPips(bx + bw - 98, teamCaptures.RED, '#c9443e', true);

      ctx.font = '600 9.5px "Share Tech Mono", monospace';
      ctx.fillStyle = flags.RED && flags.RED.state === 'AT_BASE' ? 'rgba(226, 164, 161, 0.72)' : '#d9822b';
      ctx.fillText(`FLAG: ${flagStateLabel(flags.RED)}`, bx + bw - 12, by + 23);

      // Center Clock / Match Goal
      ctx.textAlign = 'center';
      if (isSuddenDeath) {
        ctx.fillStyle = (Math.floor(performance.now() / 220) % 2 === 0) ? '#d9822b' : '#eae7df';
        ctx.font = '700 11px "Share Tech Mono", monospace';
        ctx.fillText('SUDDEN DEATH', cx, by + 9);
        ctx.font = '600 9px "Share Tech Mono", monospace';
        ctx.fillStyle = '#9a9e9f';
        ctx.fillText('GOLDEN CAPTURE', cx, by + 23);
      } else {
        const clockStr = HUDRenderer.formatClock(remainingMatchSec);
        ctx.fillStyle = remainingMatchSec < 60
          ? ((Math.floor(performance.now() / 250) % 2 === 0) ? '#c9443e' : '#eae7df')
          : (remainingMatchSec < 180 ? '#d9822b' : '#eae7df');
        ctx.font = '700 14px "Share Tech Mono", monospace';
        ctx.fillText(clockStr, cx, by + 6);
        ctx.font = '600 9px "Share Tech Mono", monospace';
        ctx.fillStyle = '#9a9e9f';
        ctx.fillText(`FIRST TO ${capGoal}`, cx, by + 24);
      }
      ctx.restore();
    }

    renderCompassTape(ctx, cx, headingDeg, pal) {
      ctx.save();
      const tapeW = 260;
      const tapeY = 54;
      const pxPerDeg = 2.6;

      // Clip horizontal heading window
      ctx.beginPath();
      ctx.rect(cx - tapeW * 0.5, tapeY, tapeW, 20);
      ctx.clip();

      ctx.strokeStyle = 'rgba(234, 231, 223, 0.28)';
      ctx.fillStyle = 'rgba(234, 231, 223, 0.72)';
      ctx.font = '700 9.5px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const cardinals = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
      const centerDeg = Math.round(headingDeg / 15) * 15;
      for (let d = centerDeg - 60; d <= centerDeg + 60; d += 15) {
        const normD = ((d % 360) + 360) % 360;
        let diff = d - headingDeg;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        const x = cx + diff * pxPerDeg;

        const isMajor = normD % 45 === 0;
        ctx.beginPath();
        ctx.moveTo(x, tapeY);
        ctx.lineTo(x, tapeY + (isMajor ? 6 : 4));
        ctx.stroke();

        const lbl = cardinals[normD] || String(normD).padStart(3, '0');
        ctx.fillStyle = normD === 0 ? '#d9822b' : (isMajor ? 'rgba(234, 231, 223, 0.85)' : 'rgba(234, 231, 223, 0.45)');
        ctx.fillText(lbl, x, tapeY + 7);
      }
      ctx.restore();

      // Center lubber caret
      ctx.save();
      ctx.fillStyle = pal ? pal.main : '#52c468';
      ctx.beginPath();
      ctx.moveTo(cx, 54);
      ctx.lineTo(cx - 3.5, 50);
      ctx.lineTo(cx + 3.5, 50);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    renderHorizonAndPitchLadder(ctx, cx, cy, pitchRad, bankRad, pal) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-bankRad);

      const pitchOffsetY = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(pitchRad) * 4.5, -160, 160);
      ctx.translate(0, pitchOffsetY);

      ctx.strokeStyle = pal ? pal.dim : 'rgba(82, 196, 104, 0.28)';
      ctx.fillStyle = pal ? pal.soft : 'rgba(82, 196, 104, 0.40)';
      ctx.font = '600 8.5px "Share Tech Mono", monospace';
      ctx.lineWidth = 1.1;

      const rungs = [-20, -10, 0, 10, 20];
      for (const deg of rungs) {
        const y = -deg * 4.5;
        if (Math.abs(y + pitchOffsetY) > 125) continue;

        const innerGap = deg === 0 ? 52 : 42;
        const outerSpan = deg === 0 ? 112 : 76;

        ctx.beginPath();
        if (deg < 0) ctx.setLineDash([4, 3]);
        else ctx.setLineDash([]);
        ctx.moveTo(-outerSpan, y);
        ctx.lineTo(-innerGap, y);
        ctx.moveTo(innerGap, y);
        ctx.lineTo(outerSpan, y);
        ctx.stroke();

        ctx.setLineDash([]);
        if (deg !== 0) {
          const tickDir = deg > 0 ? 5 : -5;
          ctx.beginPath();
          ctx.moveTo(-outerSpan, y);
          ctx.lineTo(-outerSpan, y + tickDir);
          ctx.moveTo(outerSpan, y);
          ctx.lineTo(outerSpan, y + tickDir);
          ctx.stroke();

          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${Math.abs(deg)}`, outerSpan + 5, y);
        }
      }
      ctx.restore();
    }

    renderTakeoffRollBanner(ctx, cx, cy, ac) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#d9822b';
      ctx.font = '700 13px "Chakra Petch", sans-serif';
      ctx.fillText('TAKEOFF ROLL — AFTERBURNER ENGAGED', cx, cy + 88);
      ctx.font = '700 10.5px "Share Tech Mono", monospace';
      ctx.fillStyle = '#eae7df';
      ctx.fillText(`ROTATE IN ${Math.max(0, ac.takeoffTimer).toFixed(1)}s`, cx, cy + 106);

      const barW = 200;
      const barH = 4;
      const p = Math.max(0, Math.min(1.0, (1.5 - ac.takeoffTimer) / 1.5));
      ctx.fillStyle = 'rgba(14, 16, 18, 0.85)';
      ctx.fillRect(cx - barW * 0.5, cy + 114, barW, barH);
      ctx.fillStyle = '#d9822b';
      ctx.fillRect(cx - barW * 0.5, cy + 114, barW * p, barH);
      ctx.restore();
    }

    renderCockpitCanopyFrame(ctx, w, h, cx, cy, pal) {
      ctx.save();
      const hudGlass = pal ? pal.glass : 'rgba(82, 196, 104, 0.04)';
      const hudBorder = pal ? pal.dim : 'rgba(82, 196, 104, 0.24)';

      // 1. Central Wide-Angle HUD Combiner Glass Panel
      const combW = Math.min(340, w * 0.28);
      const combH = Math.min(260, h * 0.34);
      const combX = cx - combW * 0.5;
      const combY = cy - combH * 0.58;
      ctx.fillStyle = hudGlass;
      ctx.beginPath();
      ctx.moveTo(combX + 18, combY);
      ctx.lineTo(combX + combW - 18, combY);
      ctx.lineTo(combX + combW, combY + 26);
      ctx.lineTo(combX + combW - 10, combY + combH);
      ctx.lineTo(combX + 10, combY + combH);
      ctx.lineTo(combX, combY + 26);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = hudBorder;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Side optical combiner mount struts
      ctx.strokeStyle = 'rgba(20, 23, 27, 0.88)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(combX + 12, combY + combH);
      ctx.lineTo(combX + 26, h * 0.84);
      ctx.moveTo(combX + combW - 12, combY + combH);
      ctx.lineTo(combX + combW - 26, h * 0.84);
      ctx.stroke();

      // 2. Sculpted Forward Glareshield Coaming Silhouette (Bottom Center)
      ctx.fillStyle = 'rgba(13, 15, 18, 0.94)';
      ctx.beginPath();
      ctx.moveTo(w * 0.24, h);
      ctx.lineTo(w * 0.30, h * 0.85);
      ctx.lineTo(cx - 105, h * 0.80);
      ctx.lineTo(cx + 105, h * 0.80);
      ctx.lineTo(w * 0.70, h * 0.85);
      ctx.lineTo(w * 0.76, h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(234, 231, 223, 0.14)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 3. Outer Angled Canopy Bow Framing Struts
      ctx.strokeStyle = 'rgba(15, 17, 20, 0.92)';
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(w * 0.11, h);
      ctx.quadraticCurveTo(w * 0.21, h * 0.34, w * 0.33, 0);
      ctx.moveTo(w * 0.89, h);
      ctx.quadraticCurveTo(w * 0.79, h * 0.34, w * 0.67, 0);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(234, 231, 223, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * 0.116, h);
      ctx.quadraticCurveTo(w * 0.216, h * 0.34, w * 0.336, 0);
      ctx.moveTo(w * 0.884, h);
      ctx.quadraticCurveTo(w * 0.784, h * 0.34, w * 0.664, 0);
      ctx.stroke();

      ctx.restore();
    }

    renderSpeedLines(ctx, cx, cy, w, h, isOverdrive) {
      ctx.save();
      const grad = ctx.createRadialGradient(cx, cy, h * 0.30, cx, cy, h * 0.72);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, isOverdrive ? 'rgba(217, 130, 43, 0.12)' : 'rgba(234, 231, 223, 0.08)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = isOverdrive ? 'rgba(217, 130, 43, 0.22)' : 'rgba(234, 231, 223, 0.16)';
      ctx.lineWidth = 1.2;
      const streakPhase = Math.floor(performance.now() / 45);
      for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2 + (streakPhase * 0.17);
        const rInner = Math.min(w, h) * (0.38 + ((i * 7 + streakPhase) % 5) * 0.04);
        const rOuter = Math.max(w, h) * 0.68;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * rInner, cy + Math.sin(ang) * rInner);
        ctx.lineTo(cx + Math.cos(ang) * rOuter, cy + Math.sin(ang) * rOuter);
        ctx.stroke();
      }
      ctx.restore();
    }

    renderPlayerHitEffect(ctx, dt, cx, cy, w, h) {
      this.playerHitTimer = Math.max(0, this.playerHitTimer - dt);
      const hitAlpha = Math.min(1.0, this.playerHitTimer / 0.55);

      ctx.save();
      const hitGrad = ctx.createRadialGradient(cx, cy, h * 0.24, cx, cy, h * 0.66);
      hitGrad.addColorStop(0, 'rgba(201, 68, 62, 0.0)');
      hitGrad.addColorStop(1, `rgba(201, 68, 62, ${(hitAlpha * 0.42).toFixed(3)})`);
      ctx.fillStyle = hitGrad;
      ctx.fillRect(0, 0, w, h);

      const arcRadius = Math.min(w, h) * 0.22;
      ctx.strokeStyle = `rgba(201, 68, 62, ${(hitAlpha * 0.95).toFixed(3)})`;
      ctx.lineWidth = 6.0;
      ctx.beginPath();
      ctx.arc(cx, cy, arcRadius, this.playerHitAngle - Math.PI * 0.5 - 0.38, this.playerHitAngle - Math.PI * 0.5 + 0.38);
      ctx.stroke();

      ctx.font = '700 12px "Share Tech Mono", monospace';
      ctx.fillStyle = `rgba(201, 68, 62, ${hitAlpha.toFixed(2)})`;
      ctx.textAlign = 'center';
      ctx.fillText(`IMPACT -${this.playerHitLastDmg} HP`, cx, cy + 102);
      ctx.restore();
    }

    renderReticles(ctx, dt, ac, camera, input, isSpectating, isMobile, w, h, cx, cy, hudColor) {
      ctx.save();
      ctx.strokeStyle = hudColor;
      ctx.fillStyle = hudColor;
      ctx.lineWidth = 1.5;

      // Boresight fixed crosshair
      _v1.set(0, 0, -1).applyQuaternion(ac.mesh.quaternion);
      _v2.copy(ac.mesh.position).addScaledVector(_v1, 600);
      const bsScreen = this.projectToScreen(_v2, camera, w, h);
      const bx = bsScreen.inFront ? bsScreen.x : cx;
      const by = bsScreen.inFront ? bsScreen.y : cy;

      ctx.beginPath();
      ctx.moveTo(bx - 11, by); ctx.lineTo(bx - 3, by);
      ctx.moveTo(bx + 3, by);  ctx.lineTo(bx + 11, by);
      ctx.moveTo(bx, by - 11); ctx.lineTo(bx, by - 3);
      ctx.moveTo(bx, by + 3);  ctx.lineTo(bx, by + 11);
      ctx.stroke();

      // Mouse Flight Aim Ring
      if (input && !isSpectating && !isMobile) {
        const mx = input.mouseScreenX;
        const my = input.mouseScreenY;
        const firing = input.mouseButtons.left || input.keys['KeyF'];
        const hasAssistLock = Boolean(ac.aimAssistTarget);

        ctx.strokeStyle = hasAssistLock ? hudColor : 'rgba(234, 231, 223, 0.22)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = hasAssistLock ? hudColor : (firing ? '#d9822b' : 'rgba(234, 231, 223, 0.72)');
        ctx.lineWidth = firing || hasAssistLock ? 2.0 : 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, firing ? 16 : 13, 0, Math.PI * 2);
        ctx.stroke();

        if (hasAssistLock) {
          ctx.font = '700 9.5px "Share Tech Mono", monospace';
          ctx.fillStyle = hudColor;
          ctx.textAlign = 'center';
          ctx.fillText('LEAD LOCK', mx, my - 20);
        }

        ctx.fillStyle = firing ? '#d9822b' : hudColor;
        ctx.beginPath();
        ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (this.hitmarkerTimer > 0) {
        this.hitmarkerTimer = Math.max(0, this.hitmarkerTimer - dt);
        const hx = (!isMobile && input) ? input.mouseScreenX : bx;
        const hy = (!isMobile && input) ? input.mouseScreenY : by;
        const sz = this.hitmarkerIsKill ? 15 : 10;
        ctx.strokeStyle = this.hitmarkerIsKill ? '#c9443e' : '#eae7df';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(hx - sz, hy - sz); ctx.lineTo(hx - 4, hy - 4);
        ctx.moveTo(hx + sz, hy - sz); ctx.lineTo(hx + 4, hy - 4);
        ctx.moveTo(hx - sz, hy + sz); ctx.lineTo(hx - 4, hy + 4);
        ctx.moveTo(hx + sz, hy + sz); ctx.lineTo(hx + 4, hy + 4);
        ctx.stroke();
      }
      ctx.restore();

      return { bx, by };
    }

    renderDamageNumbers(ctx, dt, camera, w, h) {
      for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
        const dn = this.damageNumbers[i];
        dn.age += dt;
        if (dn.age >= dn.life) {
          this.damageNumbers.splice(i, 1);
          continue;
        }
        const scr = this.projectToScreen(dn.worldPos, camera, w, h);
        if (scr.inFront) {
          const alpha = Math.min(1, (1 - dn.age / dn.life) * 1.4);
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.font = dn.isLarge ? '700 15px "Share Tech Mono", monospace' : '700 12px "Share Tech Mono", monospace';
          ctx.fillStyle = dn.color;
          ctx.textAlign = 'center';
          ctx.fillText(dn.text, scr.x + dn.offsetX, scr.y - 18 - dn.age * 40);
          ctx.restore();
        }
      }
    }

    _computeOffscreenChevron(worldPos, camera, cx, cy, w, h, color, label, distStr, isPriority = false) {
      _v3.copy(worldPos).applyMatrix4(camera.matrixWorldInverse);
      let dx = _v3.x;
      let dy = -_v3.y;
      if (_v3.z > 0) {
        const mag = Math.hypot(dx, dy);
        if (mag < 0.001) { dx = 0; dy = 1; }
      }
      const len = Math.max(0.0001, Math.hypot(dx, dy));
      dx /= len;
      dy /= len;

      const rx = w * 0.5 - 52;
      const ryTop = cy - 92;
      const ryBot = h - cy - 58;
      const sx = dx !== 0 ? Math.abs(rx / dx) : 1e6;
      const sy = dy < 0 ? Math.abs(ryTop / dy) : (dy > 0 ? Math.abs(ryBot / dy) : 1e6);
      const t = Math.min(sx, sy, Math.min(w, h) * 0.42);

      let ax = Math.max(46, Math.min(w - 46, cx + dx * t));
      let ay = Math.max(92, Math.min(h - 54, cy + dy * t));
      // Protect bottom-left Radar & bottom-right Avionics MFD safe zones
      if (ax < 220 && ay > h - 215) ay = h - 215;
      if (ax > w - 295 && ay > h - 185) ay = h - 185;

      return {
        ax,
        ay,
        dx,
        dy,
        ang: Math.atan2(dy, dx),
        sz: isPriority ? 10 : 8,
        color,
        text: label ? (distStr ? `${label} ${distStr}` : label) : '',
        priority: isPriority ? 3 : 1
      };
    }

    renderWorldMarkersAndTargets(ctx, ac, allAircraft, flags, camera, w, h, cx, cy, bx, by, warnColor, pal) {
      const labelQueue = [];
      const offscreenQueue = [];
      const lockCol = pal ? pal.main : '#52c468';

      // Track carriers already represented by flag chevrons so we don't draw duplicate chevrons on the same jet
      const flagCarriedTargets = new Set();

      // 1. Project & draw CTF Flag Diamonds at exact world screen coordinates + Offscreen Chevrons
      if (flags) {
        for (const key of ['BLUE', 'RED']) {
          const f = flags[key];
          if (!f || f.carrier === ac) continue;

          _v1.copy(f.pos).add(new THREE.Vector3(0, 65, 0));
          const scr = this.projectToScreen(_v1, camera, w, h);
          const distM = Math.round(ac.mesh.position.distanceTo(f.pos));
          const distStr = distM >= 1000 ? `${(distM / 1000).toFixed(1)}km` : `${distM}m`;
          const col = key === 'BLUE' ? '#5e97d1' : '#c9443e';
          const isEnemyFlag = key !== ac.team;
          const flagLbl = isEnemyFlag
            ? (f.state === 'CARRIED' ? 'ESCORT' : `${key} FLAG`)
            : (f.state === 'AT_BASE' ? `${key} BASE` : (f.state === 'DROPPED' ? `RECOVER ${key}` : `DEFEND ${key}`));

          if (scr.inFront && scr.x >= 32 && scr.x <= w - 32 && scr.y >= 80 && scr.y <= h - 32) {
            ctx.save();
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(scr.x, scr.y - 11);
            ctx.lineTo(scr.x + 11, scr.y);
            ctx.lineTo(scr.x, scr.y + 11);
            ctx.lineTo(scr.x - 11, scr.y);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();

            labelQueue.push({
              anchorX: scr.x,
              anchorY: scr.y - 14,
              x: scr.x,
              y: scr.y - 22,
              text: `${flagLbl} ${distStr}`,
              subText: null,
              color: col,
              align: 'center',
              priority: isEnemyFlag || f.state !== 'AT_BASE' ? 4 : 2,
              distSq: distM * distM
            });
          } else {
            if (f.state === 'CARRIED' && f.carrier) flagCarriedTargets.add(f.carrier);
            offscreenQueue.push(
              this._computeOffscreenChevron(f.pos, camera, cx, cy, w, h, col, flagLbl, distStr, isEnemyFlag || f.state !== 'AT_BASE')
            );
          }
        }
      }

      // 2. Project & draw Enemy & Friendly Target Brackets
      for (const other of allAircraft) {
        if (!other.alive || other === ac) continue;
        const isEnemy = other.team !== ac.team;
        const isCurrentTarget = other === ac.target;
        const screen = this.projectToScreen(other.mesh.position, camera, w, h);
        const dist = Math.round(ac.mesh.position.distanceTo(other.mesh.position));
        const distStr = dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${dist}m`;

        if (screen.inFront && screen.x >= 20 && screen.x <= w - 20 && screen.y >= 78 && screen.y <= h - 20) {
          if (isEnemy && (isCurrentTarget || other.carryingFlag || dist < 3400)) {
            const isBeingHit = other.hitFlashTimer > 0;
            const isDistant = !isCurrentTarget && !other.carryingFlag && dist > 2600;
            const boxS = isCurrentTarget ? (isBeingHit ? 20 : 17) : (isDistant ? 9 : 12);
            const inBoresightCone = Math.hypot(screen.x - bx, screen.y - by) < 86;

            ctx.save();
            ctx.strokeStyle = isBeingHit
              ? '#eae7df'
              : (other.carryingFlag ? '#d9822b' : (isCurrentTarget ? warnColor : (isDistant ? 'rgba(201, 68, 62, 0.42)' : 'rgba(201, 68, 62, 0.78)')));
            ctx.lineWidth = isBeingHit ? 2.4 : (isCurrentTarget || other.carryingFlag ? 1.8 : 1.15);

            const bL = Math.max(3.5, boxS * 0.40);
            ctx.beginPath();
            ctx.moveTo(screen.x - boxS, screen.y - boxS + bL); ctx.lineTo(screen.x - boxS, screen.y - boxS); ctx.lineTo(screen.x - boxS + bL, screen.y - boxS);
            ctx.moveTo(screen.x + boxS - bL, screen.y - boxS); ctx.lineTo(screen.x + boxS, screen.y - boxS); ctx.lineTo(screen.x + boxS, screen.y - boxS + bL);
            ctx.moveTo(screen.x + boxS, screen.y + boxS - bL); ctx.lineTo(screen.x + boxS, screen.y + boxS); ctx.lineTo(screen.x + boxS - bL, screen.y + boxS);
            ctx.moveTo(screen.x - boxS + bL, screen.y + boxS); ctx.lineTo(screen.x - boxS, screen.y + boxS); ctx.lineTo(screen.x - boxS, screen.y + boxS - bL);
            ctx.stroke();

            // Thin hostile HP bar under bracket (skip faint far non-priority brackets)
            if (!isDistant) {
              ctx.fillStyle = 'rgba(0,0,0,0.65)';
              ctx.fillRect(screen.x - boxS, screen.y + boxS + 4, boxS * 2, 3);
              ctx.fillStyle = isBeingHit ? '#d9822b' : warnColor;
              ctx.fillRect(screen.x - boxS, screen.y + boxS + 4, (boxS * 2) * Math.max(0, other.hp / other.maxHp), 3);
            }

            // Lead Pipper
            if ((isCurrentTarget || other.carryingFlag || dist < 1800) && dist < 2300) {
              const lead = WeaponsManager.computeLeadPosition(
                ac.mesh.position,
                ac.flight.velocity,
                other.mesh.position,
                other.flight.velocity
              );
              const leadScreen = this.projectToScreen(lead.leadPos, camera, w, h);
              if (leadScreen.inFront) {
                const isLocked = ac.aimAssistTarget === other;
                ctx.strokeStyle = isLocked ? lockCol : (isCurrentTarget ? '#eae7df' : 'rgba(217, 130, 43, 0.72)');
                ctx.lineWidth = isLocked ? 2.2 : 1.4;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(screen.x, screen.y);
                ctx.lineTo(leadScreen.x, leadScreen.y);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.beginPath();
                ctx.arc(leadScreen.x, leadScreen.y, isLocked ? 11 : (isCurrentTarget ? 8 : 5.5), 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = ctx.strokeStyle;
                ctx.beginPath();
                ctx.arc(leadScreen.x, leadScreen.y, 2.2, 0, Math.PI * 2);
                ctx.fill();
              }
            }
            ctx.restore();

            // Aggressively declutter: suppress non-locked callsign labels inside boresight cone or >2.6km
            if (isCurrentTarget || other.carryingFlag || (!inBoresightCone && !isDistant)) {
              labelQueue.push({
                anchorX: screen.x,
                anchorY: screen.y - boxS - 4,
                x: screen.x,
                y: screen.y - boxS - 13,
                text: other.carryingFlag ? `[FLAG] ${other.callsign}` : other.callsign,
                subText: distStr,
                color: other.carryingFlag ? '#d9822b' : (isCurrentTarget ? '#e86862' : '#e2a4a1'),
                align: 'center',
                priority: other.carryingFlag ? 5 : (isCurrentTarget ? 4 : 1),
                distSq: dist * dist
              });
            }
          } else if (!isEnemy && (dist < 2200 || other.carryingFlag)) {
            ctx.save();
            ctx.strokeStyle = other.carryingFlag ? '#52c468' : 'rgba(94, 151, 209, 0.58)';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(screen.x - 7, screen.y - 7, 14, 14);
            ctx.restore();

            if (other.carryingFlag) {
              labelQueue.push({
                anchorX: screen.x,
                anchorY: screen.y - 10,
                x: screen.x,
                y: screen.y - 18,
                text: `ESCORT ${other.callsign}`,
                subText: distStr,
                color: '#52c468',
                align: 'center',
                priority: 3,
                distSq: dist * dist
              });
            }
          }
        } else if (isEnemy && (isCurrentTarget || other.carryingFlag) && !flagCarriedTargets.has(other)) {
          offscreenQueue.push(
            this._computeOffscreenChevron(
              other.mesh.position,
              camera,
              cx,
              cy,
              w,
              h,
              other.carryingFlag ? '#d9822b' : warnColor,
              other.carryingFlag ? 'CARRIER' : 'TGT',
              distStr,
              true
            )
          );
        }
      }

      // 3. De-conflict & render Offscreen Chevrons cleanly
      offscreenQueue.sort((a, b) => a.ay - b.ay);
      for (let i = 1; i < offscreenQueue.length; i++) {
        const cur = offscreenQueue[i];
        for (let j = 0; j < i; j++) {
          const prev = offscreenQueue[j];
          if (Math.abs(cur.ax - prev.ax) < 120 && Math.abs(cur.ay - prev.ay) < 26) {
            cur.ay = prev.ay - 26;
            if (cur.ay < 92) cur.ay = prev.ay + 26;
          }
        }
      }
      for (const ch of offscreenQueue) {
        ctx.save();
        ctx.translate(ch.ax, ch.ay);
        ctx.rotate(ch.ang);
        ctx.fillStyle = ch.color;
        ctx.beginPath();
        ctx.moveTo(ch.sz, 0);
        ctx.lineTo(-ch.sz, -ch.sz * 0.65);
        ctx.lineTo(-ch.sz * 0.48, 0);
        ctx.lineTo(-ch.sz, ch.sz * 0.65);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        if (ch.text) {
          const lx = ch.ax - ch.dx * 16;
          const ly = ch.ay - ch.dy * 12;
          ctx.save();
          ctx.font = '700 9px "Share Tech Mono", monospace';
          ctx.fillStyle = ch.color;
          ctx.textAlign = ch.dx > 0.35 ? 'right' : (ch.dx < -0.35 ? 'left' : 'center');
          ctx.textBaseline = 'middle';
          ctx.fillText(ch.text, lx, ly);
          ctx.restore();
        }
      }

      // 3. Cap simultaneous floating labels (priority & proximity first) + Screen-Space De-Confliction Pass
      labelQueue.sort((a, b) => (b.priority - a.priority) || (a.distSq - b.distSq));
      const cappedLabels = labelQueue.slice(0, 6);
      cappedLabels.sort((a, b) => a.y - b.y);
      const minSpacingY = 22;
      const horizOverlapThresh = 96;
      for (let i = 1; i < cappedLabels.length; i++) {
        const cur = cappedLabels[i];
        for (let j = 0; j < i; j++) {
          const prev = cappedLabels[j];
          if (Math.abs(cur.x - prev.x) < horizOverlapThresh) {
            const needGap = prev.subText ? minSpacingY + 8 : minSpacingY;
            if (cur.y - prev.y < needGap) {
              cur.y = prev.y - needGap;
            }
          }
        }
      }

      ctx.save();
      ctx.textBaseline = 'middle';
      for (const lbl of cappedLabels) {
        ctx.textAlign = lbl.align;
        ctx.font = '700 10.5px "Chakra Petch", sans-serif';
        ctx.fillStyle = lbl.color;
        ctx.fillText(lbl.text, lbl.x, lbl.y);
        if (lbl.subText) {
          ctx.font = '600 9px "Share Tech Mono", monospace';
          ctx.fillStyle = 'rgba(234, 231, 223, 0.72)';
          ctx.fillText(lbl.subText, lbl.x, lbl.y + 11);
        }
      }
      ctx.restore();
    }

    renderCenterPopupsAndWarnings(ctx, dt, cx, cy, ac, aglM, warnColor) {
      ctx.save();
      ctx.textAlign = 'center';
      let popY = cy - 95;
      for (let i = this.popups.length - 1; i >= 0; i--) {
        const p = this.popups[i];
        p.age += dt;
        if (p.age >= p.life) {
          this.popups.splice(i, 1);
          continue;
        }
        const alpha = Math.min(1, (1 - p.age / p.life) * 1.5);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '700 14px "Share Tech Mono", monospace';
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, cx, popY - p.age * 16);
        ctx.restore();
        popY -= 20;
      }

      const blink = Math.floor(performance.now() / 220) % 2 === 0;
      if (ac.carryingFlag) {
        ctx.fillStyle = blink ? '#d9822b' : '#52c468';
        ctx.font = '700 12.5px "Share Tech Mono", monospace';
        ctx.fillText('CARRYING ENEMY FLAG — RETURN TO HOME RUNWAY  ([G] / [X] DROP)', cx, 88);
      }

      const bottomWarnY = cy + 148;
      if (ac.flight.autopilotOverride && blink) {
        ctx.fillStyle = warnColor;
        ctx.font = '700 12.5px "Share Tech Mono", monospace';
        ctx.fillText('LEAVING SECTOR — AUTOPILOT ENGAGED', cx, bottomWarnY - 22);
      } else if (ac.flight.outOfBoundsWarning && blink) {
        ctx.fillStyle = '#d9822b';
        ctx.font = '700 12.5px "Share Tech Mono", monospace';
        ctx.fillText('SECTOR BOUNDARY AHEAD — REVERSE HEADING', cx, bottomWarnY - 22);
      }
      if (ac.flight.isStalling && blink) {
        ctx.fillStyle = warnColor;
        ctx.font = '700 12.5px "Share Tech Mono", monospace';
        ctx.fillText('STALL WARNING — THROTTLE [W] OR AFTERBURNER [SHIFT]', cx, bottomWarnY);
      } else if (aglM < 85 && blink) {
        ctx.fillStyle = warnColor;
        ctx.font = '700 12.5px "Share Tech Mono", monospace';
        ctx.fillText(`PULL UP — ${aglM}M AGL`, cx, bottomWarnY);
      }
      ctx.restore();
    }

    renderAvionicsBlock(ctx, w, h, ac, altM, aglM, pal) {
      ctx.save();
      const boxW = 252;
      const boxH = 142;
      const bx = w - boxW - 20;
      const by = h - boxH - 18;

      const accentCol = pal ? pal.main : '#52c468';
      const isBoosting = ac.flight.isBoosting;
      const isAirBraking = ac.flight.isAirBraking;
      const isOverdrive = ac.overdriveTimer > 0;
      const hpRatio = Math.max(0, Math.min(1.0, ac.hp / ac.maxHp));
      const maxBoost = ac.maxBoostEnergy || CONFIG.BOOST.maxEnergy;
      const boostRatio = Math.max(0, Math.min(1.0, ac.boostEnergy / maxBoost));
      const ovdRatio = isOverdrive
        ? Math.max(0, Math.min(1.0, ac.overdriveTimer / 7.0))
        : Math.max(0, Math.min(1.0, (ac.overdriveMeter || 0) / 100));
      const isLowHp = ac.hp <= 30;
      const isMedHp = ac.hp <= 55;
      const blink = Math.floor(performance.now() / 190) % 2 === 0;
      const hpColor = isLowHp ? '#c9443e' : (isMedHp ? '#d9822b' : accentCol);

      // Matte MFD Chassis
      ctx.fillStyle = 'rgba(12, 14, 17, 0.88)';
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.strokeStyle = isLowHp && blink ? '#c9443e' : 'rgba(234, 231, 223, 0.20)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(bx, by, boxW, boxH);

      // Left tactical accent bar
      ctx.fillStyle = isOverdrive || isBoosting ? '#d9822b' : accentCol;
      ctx.fillRect(bx, by, 3, boxH);

      // Primary Speed Readout
      const speedKmh = Math.round(ac.flight.speed);
      const thrPct = Math.round((ac.flight.throttle || 0) * 100);
      const gLoad = (ac.flight.gForce || 1.0).toFixed(1);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = '700 9px "Share Tech Mono", monospace';
      ctx.fillStyle = '#9a9e9f';
      ctx.fillText('AIRSPEED', bx + 14, by + 10);

      ctx.font = '700 26px "Share Tech Mono", monospace';
      ctx.fillStyle = isBoosting ? '#d9822b' : '#eae7df';
      ctx.fillText(`${speedKmh}`, bx + 14, by + 21);

      ctx.font = '600 9px "Share Tech Mono", monospace';
      ctx.fillStyle = '#9a9e9f';
      ctx.fillText('KM/H', bx + 74, by + 32);

      // Compact Throttle & G-Force Sub-Telemetry
      ctx.font = '600 9px "Share Tech Mono", monospace';
      ctx.fillStyle = isAirBraking ? '#d9822b' : 'rgba(234, 231, 223, 0.62)';
      ctx.fillText(isAirBraking ? `AIRBRK ${gLoad}G` : `THR ${thrPct}% · ${gLoad}G`, bx + 14, by + 48);

      // Explicit Labeled ALT & AGL Column
      ctx.textAlign = 'right';
      ctx.font = '600 10px "Share Tech Mono", monospace';
      ctx.fillStyle = '#9a9e9f';
      ctx.fillText('ALT', bx + boxW - 58, by + 12);
      ctx.fillStyle = '#eae7df';
      ctx.fillText(`${altM}m`, bx + boxW - 14, by + 12);

      ctx.fillStyle = aglM < 90 ? '#c9443e' : '#9a9e9f';
      ctx.fillText('AGL', bx + boxW - 58, by + 29);
      ctx.fillStyle = aglM < 90 ? '#c9443e' : (aglM < 160 ? '#d9822b' : '#eae7df');
      ctx.fillText(`${aglM}m`, bx + boxW - 14, by + 29);

      // Divider
      ctx.fillStyle = 'rgba(234, 231, 223, 0.10)';
      ctx.fillRect(bx + 14, by + 62, boxW - 28, 1);

      // Afterburner Fuel Bar
      const barW = boxW - 28;
      const abState = isBoosting ? 'ENGAGED' : `${Math.round(boostRatio * 100)}%`;
      const abCol = isBoosting ? '#d9822b' : '#eae7df';
      ctx.textAlign = 'left';
      ctx.font = '600 9px "Share Tech Mono", monospace';
      ctx.fillStyle = '#9a9e9f';
      ctx.fillText('AFTERBURNER', bx + 14, by + 69);
      ctx.textAlign = 'right';
      ctx.fillStyle = abCol;
      ctx.fillText(abState, bx + boxW - 14, by + 69);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
      ctx.fillRect(bx + 14, by + 80, barW, 4);
      ctx.fillStyle = isBoosting ? '#d9822b' : '#9a9e9f';
      ctx.fillRect(bx + 14, by + 80, barW * boostRatio, 4);

      // Overdrive / Combo Gauge
      const ovdLbl = isOverdrive
        ? `ACTIVE ${ac.overdriveTimer.toFixed(1)}S`
        : `${Math.round(ovdRatio * 100)}% · x${ac.comboCount || 1}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9a9e9f';
      ctx.fillText('OVERDRIVE', bx + 14, by + 90);
      ctx.textAlign = 'right';
      ctx.fillStyle = isOverdrive ? (blink ? '#f0d284' : '#d9822b') : 'rgba(234, 231, 223, 0.72)';
      ctx.fillText(ovdLbl, bx + boxW - 14, by + 90);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
      ctx.fillRect(bx + 14, by + 101, barW, 4);
      ctx.fillStyle = isOverdrive ? '#f0d284' : '#d9822b';
      ctx.fillRect(bx + 14, by + 101, barW * ovdRatio, 4);

      // Airframe Hull Integrity Bar
      let hullStatus = `${Math.ceil(ac.hp)}/${Math.round(ac.maxHp)}`;
      if (ac.hp < ac.maxHp && ac.timeSinceDamage >= CONFIG.REGEN.regenDelay) {
        hullStatus = `${Math.ceil(ac.hp)}/${Math.round(ac.maxHp)} REGEN`;
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9a9e9f';
      ctx.fillText('HULL INTEGRITY', bx + 14, by + 112);
      ctx.textAlign = 'right';
      ctx.fillStyle = isLowHp && blink ? '#c9443e' : hpColor;
      ctx.fillText(hullStatus, bx + boxW - 14, by + 112);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
      ctx.fillRect(bx + 14, by + 124, barW, 6);
      ctx.fillStyle = ac.timeSinceDamage < 0.35 ? '#eae7df' : hpColor;
      ctx.fillRect(bx + 14, by + 124, barW * hpRatio, 6);

      ctx.restore();
    }

    renderRadar(ctx, ac, allAircraft, world, w, h, headingDeg, isMobile = false, pal = null) {
      const rRadius = isMobile ? 48 : 80;
      const rx = 20 + rRadius;
      const ry = h - 22 - rRadius;
      const radarRange = 9500;
      const ringCol = pal ? pal.dim : 'rgba(82, 196, 104, 0.20)';
      const sweepCol = pal ? pal.soft : 'rgba(82, 196, 104, 0.62)';
      const coneCol = pal ? pal.glass : 'rgba(82, 196, 104, 0.05)';

      ctx.save();

      ctx.fillStyle = 'rgba(12, 14, 17, 0.88)';
      ctx.beginPath();
      ctx.arc(rx, ry, rRadius, 0, Math.PI * 2);
      ctx.fill();

      // Forward FOV Wedge (~56 deg)
      ctx.fillStyle = coneCol;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.arc(rx, ry, rRadius - 2, -Math.PI * 0.5 - 0.49, -Math.PI * 0.5 + 0.49);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(234, 231, 223, 0.24)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(rx, ry, rRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = ringCol;
      ctx.lineWidth = 1.0;
      for (const frac of [0.33, 0.66]) {
        ctx.beginPath();
        ctx.arc(rx, ry, rRadius * frac, 0, Math.PI * 2);
        ctx.stroke();
      }

      const rotRad = THREE.MathUtils.degToRad(-headingDeg);
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);

      ctx.strokeStyle = 'rgba(234, 231, 223, 0.14)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(rx - rRadius + 6, ry);
      ctx.lineTo(rx + rRadius - 6, ry);
      ctx.moveTo(rx, ry - rRadius + 6);
      ctx.lineTo(rx, ry + rRadius - 6);
      ctx.stroke();

      const cardinalPts = [
        { label: 'N', ang: -Math.PI * 0.5 + rotRad },
        { label: 'E', ang: 0 + rotRad },
        { label: 'S', ang: Math.PI * 0.5 + rotRad },
        { label: 'W', ang: Math.PI + rotRad }
      ];
      ctx.font = '700 8.5px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const pt of cardinalPts) {
        const lx = rx + Math.cos(pt.ang) * (rRadius - 10);
        const ly = ry + Math.sin(pt.ang) * (rRadius - 10);
        ctx.fillStyle = pt.label === 'N' ? '#c9443e' : 'rgba(234, 231, 223, 0.55)';
        ctx.fillText(pt.label, lx, ly);
      }

      // Sweep wedge
      const sweepAngle = (performance.now() * 0.0022) % (Math.PI * 2);
      const sweepGrad = ctx.createRadialGradient(rx, ry, 0, rx, ry, rRadius - 4);
      sweepGrad.addColorStop(0, 'rgba(0, 0, 0, 0.0)');
      sweepGrad.addColorStop(1, ringCol);
      ctx.fillStyle = sweepGrad;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.arc(rx, ry, rRadius - 4, sweepAngle - 0.45, sweepAngle);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = sweepCol;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.cos(sweepAngle) * (rRadius - 4), ry + Math.sin(sweepAngle) * (rRadius - 4));
      ctx.stroke();

      // Aircraft Contacts
      for (const other of allAircraft) {
        if (!other.alive || other === ac) continue;
        const dx = (other.mesh.position.x - ac.mesh.position.x) / radarRange;
        const dz = (other.mesh.position.z - ac.mesh.position.z) / radarRange;
        const rxRel = dx * cosR - dz * sinR;
        const ryRel = dx * sinR + dz * cosR;
        const distNorm = Math.min(0.92, Math.sqrt(rxRel * rxRel + ryRel * ryRel));
        const ang = Math.atan2(ryRel, rxRel);
        const px = rx + Math.cos(ang) * distNorm * rRadius;
        const py = ry + Math.sin(ang) * distNorm * rRadius;

        if (other.carryingFlag) {
          const pBlink = Math.floor(performance.now() / 200) % 2 === 0;
          ctx.fillStyle = pBlink ? '#d9822b' : '#eae7df';
          ctx.strokeStyle = '#0c0d0f';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(px, py - 5);
          ctx.lineTo(px + 5, py);
          ctx.lineTo(px, py + 5);
          ctx.lineTo(px - 5, py);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = (other.team === 'BLUE') ? '#5e97d1' : '#c9443e';
          ctx.beginPath();
          ctx.arc(px, py, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Relative Altitude Pip for contacts >160m above/below
        const altDiff = other.mesh.position.y - ac.mesh.position.y;
        if (Math.abs(altDiff) > 160) {
          ctx.fillStyle = other.team === 'BLUE' ? 'rgba(94, 151, 209, 0.85)' : 'rgba(201, 68, 62, 0.85)';
          const tickY = altDiff > 0 ? py - 5 : py + 5;
          ctx.fillRect(px - 1.5, tickY, 3, 1.5);
        }

        // Crisp Locked Target Bracket on Radar
        if (other === ac.target) {
          ctx.strokeStyle = '#eae7df';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(px - 5.5, py - 5.5, 11, 11);
        }
      }

      // Flag Beacons
      for (const key of ['BLUE', 'RED']) {
        const f = world.flags[key];
        if (!f) continue;
        const dx = (f.pos.x - ac.mesh.position.x) / radarRange;
        const dz = (f.pos.z - ac.mesh.position.z) / radarRange;
        const rxRel = dx * cosR - dz * sinR;
        const ryRel = dx * sinR + dz * cosR;
        const distNorm = Math.min(0.94, Math.sqrt(rxRel * rxRel + ryRel * ryRel));
        const ang = Math.atan2(ryRel, rxRel);
        const px = rx + Math.cos(ang) * distNorm * rRadius;
        const py = ry + Math.sin(ang) * distNorm * rRadius;

        ctx.strokeStyle = '#eae7df';
        ctx.fillStyle = key === 'BLUE' ? '#5e97d1' : '#c9443e';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(px, py - 4);
        ctx.lineTo(px + 4, py);
        ctx.lineTo(px, py + 4);
        ctx.lineTo(px - 4, py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Player center marker
      ctx.fillStyle = '#eae7df';
      ctx.strokeStyle = '#0c0d0f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx, ry - 6);
      ctx.lineTo(rx - 4.5, ry + 4.5);
      ctx.lineTo(rx, ry + 2);
      ctx.lineTo(rx + 4.5, ry + 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(234, 231, 223, 0.55)';
      ctx.font = '700 8.5px "Share Tech Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('RADAR 9.5KM', rx, ry + rRadius + 5);

      ctx.restore();
    }

    projectToScreen(worldPos, camera, width, height) {
      _v4.copy(worldPos).project(camera);
      return {
        x: (_v4.x * 0.5 + 0.5) * width,
        y: (-_v4.y * 0.5 + 0.5) * height,
        inFront: _v4.z < 1.0
      };
    }
  }

window.HUDRenderer = HUDRenderer;
