"use strict";

  /* ============================================================================
   * 11. TACTICAL CTF HUD & 2D CANVAS RENDERER (With 20:00 Clock, Space-Drop & Hit Animations)
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

    addDamageNumber(worldPos, text, color = '#fbbf24', isLarge = false) {
      this.damageNumbers.push({
        worldPos: worldPos.clone(),
        text,
        color,
        isLarge,
        age: 0,
        life: 0.95,
        offsetX: (Math.random() - 0.5) * 26
      });
      if (this.damageNumbers.length > 18) this.damageNumbers.shift();
    }

    addPopup(text, color = '#00ff9d') {
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
      const hudColor = '#00ff9d';
      const warnColor = '#ff3b47';
      const cyanColor = '#38bdf8';
      const isMobile = Boolean(input && input.touchUIVisible);

      // 1. Live Green FPS Counter (Top-Left)
      const curFps = 1 / Math.max(0.001, dt);
      this.fps = this.fps ? (this.fps * 0.92 + curFps * 0.08) : curFps;
      this.renderFpsCounter(ctx);

      // 2. Dual Team Rosters (Red Top-Left, Blue Top-Right)
      if (!isMobile) {
        this.renderDualTeamRosters(ctx, w, h, allAircraft, ac);
      }

      // 3. Top-Center CTF Score, 10:00 Countdown Clock & Flag Status Banner
      this.renderCtfTopBanner(ctx, cx, teamCaptures, world.flags, ac, isMobile, remainingMatchSec, isSuddenDeath);

      if (!ac.alive) {
        ctx.save();
        ctx.fillStyle = '#fbbf24';
        ctx.font = isMobile ? 'bold 16px Consolas, monospace' : 'bold 22px Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`RE-DEPLOYING IN ${Math.max(0.1, ac.respawnTimer).toFixed(1)}s...`, cx, cy - 20);
        ctx.restore();
        return;
      }

      if (ac.isTakingOff) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fbbf24';
        ctx.font = isMobile ? '800 13px "Chakra Petch", sans-serif' : '800 16px "Chakra Petch", sans-serif';
        ctx.fillText('🛫 RUNWAY TAKEOFF ROLL // AFTERBURNER ENGAGED', cx, cy + 85);
        ctx.font = '700 11.5px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`AIRBORNE IN ${Math.max(0, ac.takeoffTimer).toFixed(1)}s`, cx, cy + 106);

        const barW = isMobile ? 160 : 220;
        const barH = 5;
        const p = Math.max(0, Math.min(1.0, (1.5 - ac.takeoffTimer) / 1.5));
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.fillRect(cx - barW * 0.5, cy + 114, barW, barH);
        ctx.fillStyle = '#00ff9d';
        ctx.fillRect(cx - barW * 0.5, cy + 114, barW * p, barH);
        ctx.restore();
      }

      if (cameraMode === 'COCKPIT') {
        ctx.save();
        ctx.strokeStyle = 'rgba(20, 32, 48, 0.88)';
        ctx.lineWidth = isMobile ? 9 : 14;
        ctx.beginPath();
        ctx.moveTo(w * 0.14, h);
        ctx.quadraticCurveTo(w * 0.25, h * 0.35, w * 0.36, 0);
        ctx.moveTo(w * 0.86, h);
        ctx.quadraticCurveTo(w * 0.75, h * 0.35, w * 0.64, 0);
        ctx.stroke();
        ctx.restore();
      }

      // High-Speed Anime Radial Speed Lines when Boosting or in Overdrive!
      if (ac.flight.isBoosting || ac.overdriveTimer > 0) {
        ctx.save();
        const isOD = ac.overdriveTimer > 0;
        const grad = ctx.createRadialGradient(cx, cy, h * 0.26, cx, cy, h * 0.68);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, isOD ? 'rgba(251, 191, 36, 0.20)' : 'rgba(56, 189, 248, 0.18)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = isOD ? 'rgba(251, 191, 36, 0.35)' : 'rgba(125, 211, 252, 0.28)';
        ctx.lineWidth = 1.6;
        const streakPhase = Math.floor(performance.now() / 45);
        for (let i = 0; i < 22; i++) {
          const ang = (i / 22) * Math.PI * 2 + (streakPhase * 0.17);
          const rInner = Math.min(w, h) * (0.36 + ((i * 7 + streakPhase) % 5) * 0.04);
          const rOuter = Math.max(w, h) * 0.68;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(ang) * rInner, cy + Math.sin(ang) * rInner);
          ctx.lineTo(cx + Math.cos(ang) * rOuter, cy + Math.sin(ang) * rOuter);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 2B. ANIMATED BULLET-HIT EFFECT WHEN PLAYER'S PLANE IS HIT BY BULLETS!
      if (this.playerHitTimer > 0) {
        this.playerHitTimer = Math.max(0, this.playerHitTimer - dt);
        const hitAlpha = Math.min(1.0, this.playerHitTimer / 0.55);

        ctx.save();
        const hitGrad = ctx.createRadialGradient(cx, cy, h * 0.22, cx, cy, h * 0.66);
        hitGrad.addColorStop(0, 'rgba(255, 40, 60, 0.0)');
        hitGrad.addColorStop(1, `rgba(255, 35, 55, ${(hitAlpha * 0.46).toFixed(3)})`);
        ctx.fillStyle = hitGrad;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = `rgba(255, 59, 71, ${(hitAlpha * 0.25).toFixed(3)})`;
        for (let s = 0; s < 4; s++) {
          const scanY = ((performance.now() * 0.8 + s * 190) % h);
          ctx.fillRect(0, scanY, w, 3);
        }

        const arcRadius = Math.min(w, h) * 0.23;
        ctx.strokeStyle = `rgba(255, 59, 71, ${(hitAlpha * 0.95).toFixed(3)})`;
        ctx.lineWidth = 7.0;
        ctx.beginPath();
        ctx.arc(cx, cy, arcRadius, this.playerHitAngle - Math.PI * 0.5 - 0.42, this.playerHitAngle - Math.PI * 0.5 + 0.42);
        ctx.stroke();

        const silX = cx;
        const silY = cy + 88;
        ctx.translate(silX, silY);
        const joltX = (Math.random() - 0.5) * 6 * hitAlpha;
        const joltY = (Math.random() - 0.5) * 6 * hitAlpha;
        ctx.translate(joltX, joltY);

        ctx.fillStyle = `rgba(255, 59, 71, ${(hitAlpha * 0.85).toFixed(3)})`;
        ctx.strokeStyle = `rgba(255, 255, 255, ${(hitAlpha * 0.95).toFixed(3)})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(5, -6);
        ctx.lineTo(22, 6);
        ctx.lineTo(22, 11);
        ctx.lineTo(6, 8);
        ctx.lineTo(9, 17);
        ctx.lineTo(0, 14);
        ctx.lineTo(-9, 17);
        ctx.lineTo(-6, 8);
        ctx.lineTo(-22, 11);
        ctx.lineTo(-22, 6);
        ctx.lineTo(-5, -6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = `rgba(251, 191, 36, ${(hitAlpha * 0.95).toFixed(3)})`;
        ctx.lineWidth = 2.0;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + performance.now() * 0.02;
          const r1 = 10 + (1 - hitAlpha) * 12;
          const r2 = r1 + 9;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
          ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
          ctx.stroke();
        }

        ctx.font = 'bold 13px Consolas, monospace';
        ctx.fillStyle = '#ff3b47';
        ctx.textAlign = 'center';
        ctx.fillText(`💥 HULL HIT! -${this.playerHitLastDmg} HP`, 0, 32);
        ctx.restore();
      }

      ctx.save();
      ctx.font = 'bold 12px Consolas, monospace';
      ctx.strokeStyle = hudColor;
      ctx.fillStyle = hudColor;
      ctx.lineWidth = 1.6;

      // 3. Aircraft Boresight Crosshair & Horizon-Stabilized Mouse Reticle
      _v1.set(0, 0, -1).applyQuaternion(ac.mesh.quaternion);
      _v2.copy(ac.mesh.position).addScaledVector(_v1, 600);
      const bsScreen = this.projectToScreen(_v2, camera, w, h);
      const bx = bsScreen.inFront ? bsScreen.x : cx;
      const by = bsScreen.inFront ? bsScreen.y : cy;

      ctx.beginPath();
      ctx.moveTo(bx - 12, by); ctx.lineTo(bx - 4, by);
      ctx.moveTo(bx + 4, by);  ctx.lineTo(bx + 12, by);
      ctx.moveTo(bx, by - 12); ctx.lineTo(bx, by - 4);
      ctx.moveTo(bx, by + 4);  ctx.lineTo(bx, by + 12);
      ctx.stroke();

      if (input && !isSpectating && !isMobile) {
        const mx = input.mouseScreenX;
        const my = input.mouseScreenY;
        const firing = input.mouseButtons.left || input.keys['KeyF'];
        const hasAssistLock = Boolean(ac.aimAssistTarget);

        ctx.save();
        ctx.strokeStyle = hasAssistLock ? 'rgba(0, 255, 157, 0.75)' : 'rgba(56, 189, 248, 0.45)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(mx, my);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = hasAssistLock ? '#00ff9d' : (firing ? '#fbbf24' : '#38bdf8');
        ctx.lineWidth = firing || hasAssistLock ? 2.5 : 1.8;
        ctx.beginPath();
        ctx.arc(mx, my, firing ? 18 : 14, 0, Math.PI * 2);
        ctx.stroke();

        if (hasAssistLock) {
          ctx.font = 'bold 10px Consolas, monospace';
          ctx.fillStyle = '#00ff9d';
          ctx.textAlign = 'center';
          ctx.fillText('AUTO-LEAD LOCKED', mx, my - 22);
        }

        ctx.fillStyle = firing ? '#fbbf24' : '#00ff9d';
        ctx.beginPath();
        ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (this.hitmarkerTimer > 0) {
        this.hitmarkerTimer = Math.max(0, this.hitmarkerTimer - dt);
        const hx = (!isMobile && input) ? input.mouseScreenX : bx;
        const hy = (!isMobile && input) ? input.mouseScreenY : by;
        const sz = this.hitmarkerIsKill ? 16 : 11;
        ctx.save();
        ctx.strokeStyle = this.hitmarkerIsKill ? '#ff3b47' : '#fbbf24';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(hx - sz, hy - sz); ctx.lineTo(hx - 4, hy - 4);
        ctx.moveTo(hx + sz, hy - sz); ctx.lineTo(hx + 4, hy - 4);
        ctx.moveTo(hx - sz, hy + sz); ctx.lineTo(hx - 4, hy + 4);
        ctx.moveTo(hx + sz, hy + sz); ctx.lineTo(hx + 4, hy + 4);
        ctx.stroke();
        ctx.restore();
      }

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
          ctx.font = dn.isLarge ? 'bold 16px Consolas, monospace' : 'bold 13px Consolas, monospace';
          ctx.fillStyle = dn.color;
          ctx.textAlign = 'center';
          ctx.fillText(dn.text, scr.x + dn.offsetX, scr.y - 18 - dn.age * 42);
          ctx.restore();
        }
      }

      _euler1.setFromQuaternion(ac.mesh.quaternion, 'YXZ');
      const headingDeg = (THREE.MathUtils.radToDeg(-_euler1.y) % 360 + 360) % 360;
      const altM = Math.max(0, Math.round(ac.mesh.position.y));
      const groundH = world
        ? Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(ac.mesh.position.x, ac.mesh.position.z))
        : CONFIG.WORLD.seaLevel;
      const aglM = Math.max(0, Math.round(ac.mesh.position.y - groundH));

      // 4. Center-Reticle Airbrake Turn Feedback
      if (!isMobile && ac.flight.isAirBraking) {
        ctx.save();
        ctx.fillStyle = '#38bdf8';
        ctx.font = '700 11px "Orbitron", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⟲ HIGH-G AIR-BRAKE TURN (+38% AGILITY)', cx, cy + 122);
        ctx.restore();
      }

      // 5. Bottom-Center Futuristic Metallic Hull Health Bar
      this.renderBottomCenterHealthBar(ctx, cx, h, ac);

      // 6. Bottom-Right Circular Speedometer & Vertical Nitro Boost Tube
      this.renderSpeedometerAndBoostTube(ctx, w, h, ac, altM, aglM, isMobile);

      // 5. 3D World Flag Beacons
      this.renderFlagMarkers3D(ctx, ac, world.flags, camera, w, h);

      // 6. Aircraft Target Boxes & Lead Indicator Pippers (With Live Situational AI State Tags!)
      for (const other of allAircraft) {
        if (!other.alive || other === ac) continue;
        const isEnemy = other.team !== ac.team;
        const isCurrentTarget = other === ac.target;
        const screen = this.projectToScreen(other.mesh.position, camera, w, h);
        const dist = Math.round(ac.mesh.position.distanceTo(other.mesh.position));

        if (screen.inFront && screen.x >= 20 && screen.x <= w - 20 && screen.y >= 20 && screen.y <= h - 20) {
          if (isEnemy && (isCurrentTarget || other.carryingFlag || dist < 2600)) {
            const isBeingHit = other.hitFlashTimer > 0;
            const boxS = isCurrentTarget ? (isBeingHit ? 22 : 18) : 13;
            ctx.strokeStyle = isBeingHit
              ? '#ffffff'
              : (other.carryingFlag ? '#fbbf24' : (isCurrentTarget ? warnColor : 'rgba(255, 71, 87, 0.78)'));
            ctx.lineWidth = isBeingHit ? 2.6 : (isCurrentTarget || other.carryingFlag ? 2.0 : 1.3);

            // High-Tech Corner Brackets
            const bL = Math.max(4, boxS * 0.42);
            ctx.beginPath();
            ctx.moveTo(screen.x - boxS, screen.y - boxS + bL); ctx.lineTo(screen.x - boxS, screen.y - boxS); ctx.lineTo(screen.x - boxS + bL, screen.y - boxS);
            ctx.moveTo(screen.x + boxS - bL, screen.y - boxS); ctx.lineTo(screen.x + boxS, screen.y - boxS); ctx.lineTo(screen.x + boxS, screen.y - boxS + bL);
            ctx.moveTo(screen.x + boxS, screen.y + boxS - bL); ctx.lineTo(screen.x + boxS, screen.y + boxS); ctx.lineTo(screen.x + boxS - bL, screen.y + boxS);
            ctx.moveTo(screen.x - boxS + bL, screen.y + boxS); ctx.lineTo(screen.x - boxS, screen.y + boxS); ctx.lineTo(screen.x - boxS, screen.y + boxS - bL);
            ctx.stroke();

            ctx.fillStyle = other.carryingFlag ? '#fbbf24' : (isCurrentTarget ? '#ff4757' : '#fda4af');
            ctx.font = '700 11px "Orbitron", Consolas, monospace';
            const tag = other.carryingFlag ? `🚩 ${other.callsign}` : other.callsign;
            ctx.fillText(tag, screen.x - boxS, screen.y - boxS - 14);

            ctx.font = '600 9.5px "Exo 2", monospace';
            ctx.fillStyle = '#cbd5e1';
            ctx.fillText(`${dist}m`, screen.x - boxS, screen.y - boxS - 3);

            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(screen.x - boxS, screen.y + boxS + 4, boxS * 2, 4);
            ctx.fillStyle = isBeingHit ? '#fbbf24' : warnColor;
            ctx.fillRect(screen.x - boxS, screen.y + boxS + 4, (boxS * 2) * (other.hp / other.maxHp), 4);

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
                ctx.strokeStyle = isLocked ? '#00ff9d' : (isCurrentTarget ? '#38bdf8' : 'rgba(251, 191, 36, 0.78)');
                ctx.lineWidth = isLocked ? 2.4 : 1.5;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(screen.x, screen.y);
                ctx.lineTo(leadScreen.x, leadScreen.y);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.beginPath();
                ctx.arc(leadScreen.x, leadScreen.y, isLocked ? 12 : (isCurrentTarget ? 9 : 6), 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(leadScreen.x, leadScreen.y, 2.5, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          } else if (!isEnemy && (dist < 2200 || other.carryingFlag)) {
            ctx.strokeStyle = other.carryingFlag ? '#00ff9d' : 'rgba(56, 189, 248, 0.65)';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(screen.x - 8, screen.y - 8, 16, 16);
            if (other.carryingFlag) {
              ctx.fillStyle = '#00ff9d';
              ctx.font = 'bold 10px Consolas, monospace';
              ctx.fillText(`🚩 ESCORT ${other.callsign}`, screen.x - 24, screen.y - 12);
            }
          }
        } else if (isEnemy && (isCurrentTarget || other.carryingFlag)) {
          _v3.copy(other.mesh.position).applyMatrix4(camera.matrixWorldInverse);
          const angle = Math.atan2(_v3.y, _v3.x);
          const arrowRadius = Math.min(w, h) * 0.35;
          const ax = cx + Math.cos(angle) * arrowRadius;
          const ay = cy - Math.sin(angle) * arrowRadius;

          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(-angle);
          ctx.fillStyle = other.carryingFlag ? '#fbbf24' : warnColor;
          const sz = other.carryingFlag ? 12 : 9;
          ctx.beginPath();
          ctx.moveTo(sz, 0);
          ctx.lineTo(-sz, -sz * 0.65);
          ctx.lineTo(-sz * 0.5, 0);
          ctx.lineTo(-sz, sz * 0.65);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      // 7. Floating Action Popups
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
        ctx.font = 'bold 16px Consolas, monospace';
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, cx, popY - p.age * 18);
        ctx.restore();
        popY -= 22;
      }

      // 8. Carrying Flag Banner Alert (With [SPACE] TO DROP FLAG Prompt!)
      const blink = Math.floor(performance.now() / 200) % 2 === 0;
      if (ac.carryingFlag) {
        ctx.fillStyle = blink ? '#fbbf24' : '#00ff9d';
        ctx.font = isMobile ? 'bold 12px Consolas, monospace' : 'bold 16px Consolas, monospace';
        ctx.fillText('🚩 CARRYING ENEMY FLAG! FLY HOME TO CAPTURE • PRESS [SPACE] TO DROP FLAG 🚩', cx, isMobile ? 64 : 104);
      }

      const bottomWarnY = isMobile ? (h - 24) : (cy + 150);
      if (ac.flight.autopilotOverride && blink) {
        ctx.fillStyle = warnColor;
        ctx.font = 'bold 15px Consolas, monospace';
        ctx.fillText('⚠ LEAVING SECTOR - AUTOPILOT RETURNING ⚠', cx, bottomWarnY - 24);
      } else if (ac.flight.outOfBoundsWarning && blink) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 15px Consolas, monospace';
        ctx.fillText('⚠ SECTOR BOUNDARY AHEAD - TURN BACK ⚠', cx, bottomWarnY - 24);
      }
      if (ac.flight.isStalling && blink) {
        ctx.fillStyle = warnColor;
        ctx.font = 'bold 15px Consolas, monospace';
        ctx.fillText('⚠ STALL - PRESS [W] OR [SHIFT] BOOST ⚠', cx, bottomWarnY);
      } else if (aglM < 85 && blink) {
        ctx.fillStyle = warnColor;
        ctx.font = 'bold 15px Consolas, monospace';
        ctx.fillText(`⚠ LOW ALTITUDE (${aglM}m AGL) ⚠`, cx, bottomWarnY);
      }
      ctx.textAlign = 'left';

      // 9. Circular CTF Radar
      this.renderRadar(ctx, ac, allAircraft, world, w, h, headingDeg, isMobile);

      ctx.restore();
    }

    renderCtfTopBanner(ctx, cx, teamCaptures, flags, ac, isMobile, remainingMatchSec = 600, isSuddenDeath = false) {
      ctx.save();
      const bw = isMobile ? 310 : 480;
      const bh = isMobile ? 38 : 50;
      const bx = cx - bw * 0.5;
      const by = 8;

      ctx.fillStyle = 'rgba(6, 14, 28, 0.88)';
      if (isSuddenDeath) {
        ctx.strokeStyle = ((Math.floor(performance.now() / 200) % 2 === 0) ? '#fbbf24' : '#ef4444');
        ctx.lineWidth = 2.4;
      } else {
        ctx.strokeStyle = remainingMatchSec < 60 ? 'rgba(255, 59, 71, 0.75)' : 'rgba(56, 189, 248, 0.50)';
        ctx.lineWidth = 1.6;
      }
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);

      const capGoal = CONFIG.CTF.capturesToWin;
      const makePips = (count) => {
        let s = '';
        for (let i = 0; i < capGoal; i++) s += (i < count ? '●' : '○');
        return s;
      };

      const describeFlag = (f) => {
        if (!f) return 'HOME';
        if (f.state === 'AT_BASE') return 'AT BASE';
        if (f.state === 'DROPPED') return `DROPPED (${Math.ceil(f.dropTimer)}s)`;
        if (f.state === 'CARRIED' && f.carrier) return `CARRIED BY ${f.carrier.callsign.slice(0, 9)}`;
        return 'ACTIVE';
      };

      ctx.font = isMobile ? 'bold 12px Consolas, monospace' : 'bold 14px Consolas, monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'left';
      ctx.fillText(`BLUE ${teamCaptures.BLUE}/${capGoal} ${makePips(teamCaptures.BLUE)}`, bx + 12, by + (isMobile ? 15 : 19));

      ctx.fillStyle = '#ff4757';
      ctx.textAlign = 'right';
      ctx.fillText(`${makePips(teamCaptures.RED)} ${teamCaptures.RED}/${capGoal} RED`, bx + bw - 12, by + (isMobile ? 15 : 19));

      // Center Clock or Sudden Death Banner
      ctx.textAlign = 'center';
      if (isSuddenDeath) {
        ctx.fillStyle = (Math.floor(performance.now() / 200) % 2 === 0) ? '#fbbf24' : '#ffffff';
        ctx.font = isMobile ? 'bold 10px Consolas, monospace' : 'bold 12.5px Consolas, monospace';
        ctx.fillText(`⚡ SUDDEN DEATH: GOLDEN CAP!`, cx, by + (isMobile ? 15 : 19));
      } else {
        const clockStr = HUDRenderer.formatClock(remainingMatchSec);
        ctx.fillStyle = remainingMatchSec < 60
          ? ((Math.floor(performance.now() / 250) % 2 === 0) ? '#ff3b47' : '#ffffff')
          : (remainingMatchSec < 180 ? '#fbbf24' : '#00ff9d');
        ctx.font = isMobile ? 'bold 11px Consolas, monospace' : 'bold 13px Consolas, monospace';
        ctx.fillText(`⏱ ${clockStr} • FIRST TO ${capGoal}`, cx, by + (isMobile ? 15 : 19));
      }

      ctx.font = isMobile ? '9px Consolas, monospace' : '10.5px Consolas, monospace';
      ctx.fillStyle = '#7dd3fc';
      ctx.textAlign = 'left';
      ctx.fillText(`🚩 ${describeFlag(flags.BLUE)}`, bx + 12, by + (isMobile ? 30 : 38));

      ctx.fillStyle = '#fda4af';
      ctx.textAlign = 'right';
      ctx.fillText(`${describeFlag(flags.RED)} 🚩`, bx + bw - 12, by + (isMobile ? 30 : 38));

      ctx.restore();
    }

    renderFpsCounter(ctx) {
      ctx.save();
      ctx.font = '700 16px "Orbitron", Consolas, monospace';
      ctx.fillStyle = '#00ff9d';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`${Math.round(this.fps || 60)}`, 18, 16);
      ctx.restore();
    }

    renderDualTeamRosters(ctx, w, h, allAircraft, playerAc) {
      ctx.save();
      const getPilotLevel = (p) => {
        if (p.isPlayer) {
          const xp = (window.airCombatSim && window.airCombatSim.career) ? window.airCombatSim.career.xp : 2400;
          return Math.min(250, Math.floor(xp / 280) + 1);
        }
        let hash = 0;
        for (let i = 0; i < p.callsign.length; i++) hash = (hash * 31 + p.callsign.charCodeAt(i)) & 0xffff;
        return 40 + (hash % 195);
      };

      const redPilots = allAircraft.filter(a => a.team === 'RED').sort((a, b) => b.score - a.score);
      const bluePilots = allAircraft.filter(a => a.team === 'BLUE').sort((a, b) => b.score - a.score);
      const blink = Math.floor(performance.now() / 250) % 2 === 0;

      // 1. Red Squadron Roster (Top-Left, below FPS)
      const leftX = 18;
      let leftY = 46;
      for (let i = 0; i < redPilots.length; i++) {
        const p = redPilots[i];
        const isSelf = p === playerAc;
        const isDead = !p.alive;
        const hasFlag = p.carryingFlag;

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // Pilot Callsign
        ctx.font = isSelf ? '800 13px "Orbitron", Consolas, monospace' : '700 12px "Orbitron", Consolas, monospace';
        if (isDead) {
          ctx.fillStyle = 'rgba(255, 71, 87, 0.42)';
        } else if (isSelf) {
          ctx.fillStyle = '#00ff9d';
        } else {
          ctx.fillStyle = hasFlag ? (blink ? '#fbbf24' : '#ff4757') : '#ff4757';
        }

        const flagPrefix = hasFlag ? '🚩 ' : '';
        const deadSuffix = isDead ? ` [DOWN ${Math.ceil(p.respawnTimer)}s]` : '';
        ctx.fillText(`${flagPrefix}${p.callsign}${deadSuffix}`, leftX, leftY);

        // Pilot Stats: K: X  F: Y  Lvl: Z
        ctx.font = '600 10px "Exo 2", Consolas, monospace';
        ctx.fillStyle = isDead ? 'rgba(254, 205, 211, 0.35)' : '#fda4af';
        ctx.fillText(`K: ${p.kills}  F: ${p.flagCaptures}  Lvl: ${getPilotLevel(p)}`, leftX, leftY + 14);

        leftY += 30;
      }

      // 2. Blue Squadron Roster (Top-Right)
      const rightX = w - 18;
      let rightY = 46;
      for (let i = 0; i < bluePilots.length; i++) {
        const p = bluePilots[i];
        const isSelf = p === playerAc;
        const isDead = !p.alive;
        const hasFlag = p.carryingFlag;

        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';

        // Pilot Callsign
        ctx.font = isSelf ? '800 13px "Orbitron", Consolas, monospace' : '700 12px "Orbitron", Consolas, monospace';
        if (isDead) {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.42)';
        } else if (isSelf) {
          ctx.fillStyle = '#00ff9d';
        } else {
          ctx.fillStyle = hasFlag ? (blink ? '#fbbf24' : '#38bdf8') : '#38bdf8';
        }

        const flagPrefix = hasFlag ? '🚩 ' : '';
        const deadSuffix = isDead ? ` [DOWN ${Math.ceil(p.respawnTimer)}s]` : '';
        ctx.fillText(`${flagPrefix}${p.callsign}${deadSuffix}`, rightX, rightY);

        // Pilot Stats: K: X  F: Y  Lvl: Z
        ctx.font = '600 10px "Exo 2", Consolas, monospace';
        ctx.fillStyle = isDead ? 'rgba(186, 230, 253, 0.35)' : '#bae6fd';
        ctx.fillText(`K: ${p.kills}  F: ${p.flagCaptures}  Lvl: ${getPilotLevel(p)}`, rightX, rightY + 14);

        rightY += 30;
      }

      ctx.restore();
    }

    renderBottomCenterHealthBar(ctx, cx, h, ac) {
      ctx.save();
      const barW = Math.min(380, this.logicalW * 0.40);
      const barH = 15;
      const halfW = barW * 0.5;
      const bx = cx - halfW;
      const by = h - 22;

      const hpRatio = Math.max(0, Math.min(1.0, ac.hp / ac.maxHp));
      const isDamagedRecently = ac.timeSinceDamage < 0.4;
      const isLowHp = ac.hp <= 30;
      const blink = Math.floor(performance.now() / 180) % 2 === 0;

      // 1. Futuristic Beveled Chassis
      ctx.fillStyle = 'rgba(4, 9, 20, 0.88)';
      ctx.strokeStyle = isLowHp && blink ? '#ff3b47' : 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1.6;

      ctx.beginPath();
      ctx.moveTo(bx - 14, by + barH * 0.5);
      ctx.lineTo(bx - 4, by - 4);
      ctx.lineTo(bx + barW + 4, by - 4);
      ctx.lineTo(bx + barW + 14, by + barH * 0.5);
      ctx.lineTo(bx + barW + 4, by + barH + 4);
      ctx.lineTo(bx - 4, by + barH + 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Side wing bracket accent notches
      ctx.fillStyle = isLowHp ? '#ff3b47' : '#00ff9d';
      ctx.fillRect(bx - 12, by + 4, 3, barH - 8);
      ctx.fillRect(bx + barW + 9, by + 4, 3, barH - 8);

      // 2. Interior Health Bar Track (Empty Background)
      ctx.fillStyle = 'rgba(12, 18, 30, 0.95)';
      ctx.fillRect(bx, by, barW, barH);

      // Subtle track grid lines on empty segments
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 9; i++) {
        const sx = bx + barW * (i / 10);
        ctx.beginPath();
        ctx.moveTo(sx, by);
        ctx.lineTo(sx, by + barH);
        ctx.stroke();
      }

      // 3. Double-Sided Active Health Fill (Draining symmetrically from both outer ends inward)
      const currentHalfFill = halfW * hpRatio;
      if (currentHalfFill > 0.5) {
        // Left Wing Fill: fills from (cx - currentHalfFill) to cx
        const leftGrad = ctx.createLinearGradient(cx - currentHalfFill, by, cx, by);
        if (isLowHp) {
          leftGrad.addColorStop(0, '#ea580c');
          leftGrad.addColorStop(1, '#ff3b47');
        } else {
          leftGrad.addColorStop(0, '#0284c7');
          leftGrad.addColorStop(0.65, '#38bdf8');
          leftGrad.addColorStop(1, '#00ff9d');
        }

        ctx.fillStyle = isDamagedRecently ? '#ffffff' : leftGrad;
        ctx.fillRect(cx - currentHalfFill, by, currentHalfFill, barH);

        // Right Wing Fill: fills from cx to (cx + currentHalfFill)
        const rightGrad = ctx.createLinearGradient(cx, by, cx + currentHalfFill, by);
        if (isLowHp) {
          rightGrad.addColorStop(0, '#ff3b47');
          rightGrad.addColorStop(1, '#ea580c');
        } else {
          rightGrad.addColorStop(0, '#00ff9d');
          rightGrad.addColorStop(0.35, '#38bdf8');
          rightGrad.addColorStop(1, '#0284c7');
        }

        ctx.fillStyle = isDamagedRecently ? '#ffffff' : rightGrad;
        ctx.fillRect(cx, by, currentHalfFill, barH);

        // Mirrored Segment Dividers across active fill
        ctx.strokeStyle = 'rgba(4, 9, 20, 0.65)';
        ctx.lineWidth = 1.2;
        for (let i = 1; i <= 4; i++) {
          const offset = halfW * (i / 5);
          if (offset < currentHalfFill) {
            // Left divider
            ctx.beginPath();
            ctx.moveTo(cx - offset, by);
            ctx.lineTo(cx - offset, by + barH);
            ctx.stroke();

            // Right divider
            ctx.beginPath();
            ctx.moveTo(cx + offset, by);
            ctx.lineTo(cx + offset, by + barH);
            ctx.stroke();
          }
        }
      }

      // 4. Center Spine Divider & Notches (Zero text in the middle of the bar)
      ctx.strokeStyle = isLowHp && blink ? '#ff3b47' : 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, by - 3);
      ctx.lineTo(cx, by + barH + 3);
      ctx.stroke();

      // High-tech micro indicator pips on top & bottom center
      ctx.fillStyle = isLowHp ? '#ff3b47' : '#00ff9d';
      ctx.beginPath();
      ctx.moveTo(cx - 3, by - 3);
      ctx.lineTo(cx + 3, by - 3);
      ctx.lineTo(cx, by - 6);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx - 3, by + barH + 3);
      ctx.lineTo(cx + 3, by + barH + 3);
      ctx.lineTo(cx, by + barH + 6);
      ctx.closePath();
      ctx.fill();

      // Left numeric readout (speed in KM/H)
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = '600 11px "Orbitron", monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${Math.round(ac.flight.speed)}`, bx - 22, by + barH * 0.5);

      // Right numeric readout (HP)
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '700 11px "Orbitron", monospace';
      ctx.fillStyle = isLowHp ? (blink ? '#ff3b47' : '#ffffff') : '#00ff9d';
      ctx.fillText(`${Math.ceil(ac.hp)} HP`, bx + barW + 22, by + barH * 0.5);

      // Slow Regen Indicator (Displayed subtly on right flank above HP when active)
      if (ac.hp < ac.maxHp) {
        const isRegen = ac.timeSinceDamage >= CONFIG.REGEN.regenDelay;
        ctx.textAlign = 'left';
        ctx.font = '600 9px "Orbitron", monospace';
        ctx.fillStyle = isRegen ? '#00ff9d' : '#fbbf24';
        const waitSec = Math.max(0, CONFIG.REGEN.regenDelay - ac.timeSinceDamage).toFixed(1);
        ctx.fillText(isRegen ? '⚡ REGEN' : `+${waitSec}s`, bx + barW + 22, by - 8);
      }

      ctx.restore();
    }

    renderSpeedometerAndBoostTube(ctx, w, h, ac, altM, aglM, isMobile) {
      ctx.save();
      const speedKmh = Math.round(ac.flight.speed);
      const maxSpd = (ac.stats.boostMaxSpeed || 655);
      const speedFrac = Math.max(0, Math.min(1.0, (speedKmh - 60) / (maxSpd - 60)));

      // Coordinates
      const dialR = isMobile ? 48 : 62;
      const dialCx = w - (isMobile ? 80 : 115);
      const dialCy = h - (isMobile ? 75 : 90);

      // 1. Outer Metallic Bezel Ring
      const bgGrad = ctx.createRadialGradient(dialCx, dialCy, dialR * 0.2, dialCx, dialCy, dialR);
      bgGrad.addColorStop(0, 'rgba(12, 18, 30, 0.94)');
      bgGrad.addColorStop(0.85, 'rgba(6, 10, 20, 0.96)');
      bgGrad.addColorStop(1, 'rgba(30, 41, 59, 0.98)');

      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(dialCx, dialCy, dialR, 0, Math.PI * 2);
      ctx.fill();

      // Outer bezel trim
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Inner thin rim
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(dialCx, dialCy, dialR - 4, 0, Math.PI * 2);
      ctx.stroke();

      // 2. Speed Gauge Arc (from 135 deg to 405 deg)
      const startAngle = Math.PI * 0.75;
      const totalAngle = Math.PI * 1.5;
      const endAngle = startAngle + totalAngle;
      const curAngle = startAngle + speedFrac * totalAngle;

      // Arc background track
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(dialCx, dialCy, dialR - 9, startAngle, endAngle);
      ctx.stroke();

      // Active speed arc (orange / red / flame)
      const isBoosting = ac.flight.isBoosting;
      const arcGrad = ctx.createLinearGradient(
        dialCx - dialR, dialCy,
        dialCx + dialR, dialCy
      );
      if (isBoosting) {
        arcGrad.addColorStop(0, '#fbbf24');
        arcGrad.addColorStop(0.5, '#f97316');
        arcGrad.addColorStop(1, '#ef4444');
      } else {
        arcGrad.addColorStop(0, '#38bdf8');
        arcGrad.addColorStop(0.6, '#f97316');
        arcGrad.addColorStop(1, '#ef4444');
      }
      ctx.strokeStyle = arcGrad;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(dialCx, dialCy, dialR - 9, startAngle, curAngle);
      ctx.stroke();

      // Tick marks along the dial
      ctx.save();
      ctx.translate(dialCx, dialCy);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i <= 18; i++) {
        const ang = startAngle + (i / 18) * totalAngle;
        const r1 = dialR - 14;
        const r2 = dialR - (i % 3 === 0 ? 19 : 16);
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
        ctx.lineTo(Math.cos(ang) * r2, Math.sin(ang) * r2);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Embedded Top Readout: ALT (matching 614 in reference)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 10px "Orbitron", monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`${altM}`, dialCx, dialCy - dialR + 24);

      // 4. Center Bold Digital Speed Number (e.g. 618)
      ctx.font = isMobile ? '800 22px "Orbitron", sans-serif' : '800 28px "Orbitron", sans-serif';
      ctx.fillStyle = isBoosting ? '#fbbf24' : '#ffffff';
      ctx.fillText(`${speedKmh}`, dialCx, dialCy + 3);

      ctx.font = '600 8.5px "Orbitron", monospace';
      ctx.fillStyle = isBoosting ? '#fbbf24' : '#94a3b8';
      ctx.fillText(isBoosting ? 'NITRO' : 'KM/H', dialCx, dialCy + 16);

      // 5. Embedded Bottom Readout: AGL (matching 739 in reference)
      ctx.font = '700 9.5px "Orbitron", monospace';
      ctx.fillStyle = aglM < 90 ? '#ff3b47' : 'rgba(203, 213, 225, 0.85)';
      ctx.fillText(`${aglM}`, dialCx, dialCy + dialR - 18);

      // 6. Upgraded Curved Outer Halo Boost Energy Arc (Wrapping over top of dial)
      const haloR = dialR + (isMobile ? 7 : 9);
      const bStartAngle = Math.PI * 1.12; // ~201 degrees (top-left)
      const bEndAngle = Math.PI * 1.88;   // ~339 degrees (top-right)
      const bTotalAngle = bEndAngle - bStartAngle;

      const boostRatio = Math.max(0, Math.min(1.0, ac.boostEnergy / CONFIG.BOOST.maxEnergy));
      const isOverdrive = ac.overdriveTimer > 0;
      const bCurAngle = bStartAngle + boostRatio * bTotalAngle;

      // Halo Arc Track (Dark Glass Chassis)
      ctx.save();
      ctx.lineCap = 'round';

      // Outer bezel trim track
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.lineWidth = isMobile ? 8 : 10;
      ctx.beginPath();
      ctx.arc(dialCx, dialCy, haloR, bStartAngle, bEndAngle);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(dialCx, dialCy, haloR + (isMobile ? 4.5 : 5.5), bStartAngle, bEndAngle);
      ctx.stroke();

      // Active Energy Flame Gradient Fill
      if (boostRatio > 0.01) {
        const boostGrad = ctx.createLinearGradient(
          dialCx - haloR, dialCy - haloR,
          dialCx + haloR, dialCy - haloR
        );

        if (isOverdrive) {
          boostGrad.addColorStop(0, '#fef08a');
          boostGrad.addColorStop(0.4, '#fbbf24');
          boostGrad.addColorStop(0.8, '#f97316');
          boostGrad.addColorStop(1, '#ef4444');
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 14;
        } else if (isBoosting) {
          // Dynamic pulsing flame while boosting
          const pulse = Math.sin(performance.now() * 0.02) * 0.15;
          boostGrad.addColorStop(0, '#ffffff');
          boostGrad.addColorStop(0.25 + pulse, '#38bdf8');
          boostGrad.addColorStop(0.7, '#00ff9d');
          boostGrad.addColorStop(1, '#f59e0b');
          ctx.shadowColor = '#00ff9d';
          ctx.shadowBlur = 16;
        } else {
          // Normal idle/recharging cyan/emerald energy
          boostGrad.addColorStop(0, '#00ff9d');
          boostGrad.addColorStop(0.55, '#38bdf8');
          boostGrad.addColorStop(1, '#0284c7');
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 8;
        }

        ctx.strokeStyle = boostGrad;
        ctx.lineWidth = isMobile ? 6 : 7.5;
        ctx.beginPath();
        ctx.arc(dialCx, dialCy, haloR, bStartAngle, bCurAngle);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Energy Gradation Ticks along Halo Arc
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.7)';
        ctx.lineWidth = 1.5;
        for (let i = 1; i <= 8; i++) {
          const segAng = bStartAngle + (i / 9) * bTotalAngle;
          if (segAng < bCurAngle) {
            const r1 = haloR - (isMobile ? 3 : 4);
            const r2 = haloR + (isMobile ? 3 : 4);
            ctx.beginPath();
            ctx.moveTo(dialCx + Math.cos(segAng) * r1, dialCy + Math.sin(segAng) * r1);
            ctx.lineTo(dialCx + Math.cos(segAng) * r2, dialCy + Math.sin(segAng) * r2);
            ctx.stroke();
          }
        }
      }

      // Halo Boost Status Text (Right above apex of halo arc)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = '700 8.5px "Orbitron", monospace';
      if (isOverdrive) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('⚡ OVERDRIVE ACTIVE', dialCx, dialCy - haloR - 4);
      } else if (isBoosting) {
        ctx.fillStyle = '#00ff9d';
        ctx.fillText('🔥 AFTERBURNER BOOST', dialCx, dialCy - haloR - 4);
      } else if (boostRatio < 0.98) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
        ctx.fillText('NITRO ' + Math.round(boostRatio * 100) + '%', dialCx, dialCy - haloR - 4);
      } else {
        ctx.fillStyle = 'rgba(0, 255, 157, 0.65)';
        ctx.fillText('NITRO READY', dialCx, dialCy - haloR - 4);
      }

      ctx.restore();

      // Small version / ping label in bottom right corner (matching 63 / v155)
      ctx.font = '700 9px "Orbitron", monospace';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`v2.0`, w - 12, h - 6);

      ctx.restore();
    }

    renderFlagMarkers3D(ctx, ac, flags, camera, w, h) {
      if (!flags) return;
      for (const key of ['BLUE', 'RED']) {
        const f = flags[key];
        if (!f || f.carrier === ac) continue;

        _v1.copy(f.pos).add(new THREE.Vector3(0, 65, 0));
        const scr = this.projectToScreen(_v1, camera, w, h);
        const dist = Math.round(ac.mesh.position.distanceTo(f.pos));
        const col = key === 'BLUE' ? '#38bdf8' : '#ff3b47';
        const isEnemyFlag = key !== ac.team;

        if (scr.inFront && scr.x >= 30 && scr.x <= w - 30 && scr.y >= 30 && scr.y <= h - 30) {
          ctx.save();
          ctx.strokeStyle = col;
          ctx.fillStyle = col;
          ctx.lineWidth = 2.0;
          ctx.beginPath();
          ctx.moveTo(scr.x, scr.y - 14);
          ctx.lineTo(scr.x + 14, scr.y);
          ctx.lineTo(scr.x, scr.y + 14);
          ctx.lineTo(scr.x - 14, scr.y);
          ctx.closePath();
          ctx.stroke();

          ctx.font = '700 11px "Orbitron", Consolas, monospace';
          ctx.textAlign = 'center';
          const actionLbl = isEnemyFlag
            ? (f.state === 'CARRIED' ? `ESCORT CARRIER` : `STEAL ${key} FLAG`)
            : (f.state === 'AT_BASE' ? `${key} BASE` : (f.state === 'DROPPED' ? `RETURN ${key} FLAG` : `DEFEND ${key} BASE`));
          ctx.fillText(`🚩 ${actionLbl} [${dist}m]`, scr.x, scr.y - 19);
          ctx.restore();
        }
      }
    }

    renderRadar(ctx, ac, allAircraft, world, w, h, headingDeg, isMobile = false) {
      const rRadius = isMobile ? 48 : 82;
      const rx = 18 + rRadius;
      const ry = isMobile ? (14 + rRadius) : (h - 22 - rRadius);
      const radarRange = 9500;

      ctx.save();

      // Outer Bezel & Dark Glass Body
      const bgGrad = ctx.createRadialGradient(rx, ry, rRadius * 0.1, rx, ry, rRadius);
      bgGrad.addColorStop(0, 'rgba(4, 14, 28, 0.92)');
      bgGrad.addColorStop(0.75, 'rgba(6, 12, 24, 0.95)');
      bgGrad.addColorStop(1, 'rgba(15, 23, 42, 0.98)');
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.arc(rx, ry, rRadius, 0, Math.PI * 2);
      ctx.fill();

      // Outer metallic neon ring
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Thin inner rim
      ctx.strokeStyle = 'rgba(0, 255, 157, 0.35)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.arc(rx, ry, rRadius - 4, 0, Math.PI * 2);
      ctx.stroke();

      // Concentric Range Rings (3.1km & 6.3km)
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.lineWidth = 1.0;
      for (const frac of [0.33, 0.66]) {
        ctx.beginPath();
        ctx.arc(rx, ry, rRadius * frac, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Compass Crosshairs & N, S, E, W Labels
      const rotRad = THREE.MathUtils.degToRad(-headingDeg);
      const cosR = Math.cos(rotRad);
      const sinR = Math.sin(rotRad);

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(rx - rRadius + 6, ry);
      ctx.lineTo(rx + rRadius - 6, ry);
      ctx.moveTo(rx, ry - rRadius + 6);
      ctx.lineTo(rx, ry + rRadius - 6);
      ctx.stroke();

      // Compass Cardinal Points
      const cardinalPts = [
        { label: 'N', ang: -Math.PI * 0.5 + rotRad },
        { label: 'E', ang: 0 + rotRad },
        { label: 'S', ang: Math.PI * 0.5 + rotRad },
        { label: 'W', ang: Math.PI + rotRad }
      ];
      ctx.font = '700 8.5px "Orbitron", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const pt of cardinalPts) {
        const lx = rx + Math.cos(pt.ang) * (rRadius - 10);
        const ly = ry + Math.sin(pt.ang) * (rRadius - 10);
        ctx.fillStyle = pt.label === 'N' ? '#ff4757' : 'rgba(148, 163, 184, 0.6)';
        ctx.fillText(pt.label, lx, ly);
      }

      // Sweeping Radar Line (Smooth phosphor radar sweep effect)
      const sweepAngle = (performance.now() * 0.0022) % (Math.PI * 2);
      const sweepGrad = ctx.createRadialGradient(rx, ry, 0, rx, ry, rRadius - 5);
      sweepGrad.addColorStop(0, 'rgba(0, 255, 157, 0.0)');
      sweepGrad.addColorStop(1, 'rgba(0, 255, 157, 0.12)');
      ctx.fillStyle = sweepGrad;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.arc(rx, ry, rRadius - 5, sweepAngle - 0.45, sweepAngle);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(0, 255, 157, 0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.cos(sweepAngle) * (rRadius - 5), ry + Math.sin(sweepAngle) * (rRadius - 5));
      ctx.stroke();

      // Plot Aircraft Contacts
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
          ctx.fillStyle = pBlink ? '#fbbf24' : '#ffffff';
          ctx.strokeStyle = '#ea580c';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px, py - 5);
          ctx.lineTo(px + 5, py);
          ctx.lineTo(px, py + 5);
          ctx.lineTo(px - 5, py);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillStyle = (other.team === 'BLUE') ? '#38bdf8' : '#ff4757';
          ctx.shadowColor = (other.team === 'BLUE') ? '#38bdf8' : '#ff4757';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(px, py, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Plot Base Flags on radar
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

        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = key === 'BLUE' ? '#38bdf8' : '#ff3b47';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(px, py - 4);
        ctx.lineTo(px + 4, py);
        ctx.lineTo(px, py + 4);
        ctx.lineTo(px - 4, py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Player center arrow
      ctx.fillStyle = '#00ff9d';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx, ry - 6);
      ctx.lineTo(rx - 4.5, ry + 4.5);
      ctx.lineTo(rx, ry + 2);
      ctx.lineTo(rx + 4.5, ry + 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (!isMobile) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
        ctx.font = '700 8.5px "Orbitron", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('CTF RADAR • 9.5KM', rx, ry + rRadius + 6);
      }

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
