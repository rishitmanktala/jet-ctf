"use strict";

  /* ============================================================================
   * 10. AIRCRAFT ENTITY (With 3D Bullet-Hit Animation, Flag Cooldown, Combo & Overdrive)
   * ============================================================================
   */
  class Aircraft {
    constructor(scene, typeId, callsign, team, isPlayer, difficultyKey, wingIndex, liveryIndex = 0, roleObj = null, statsOverride = null) {
      this.scene = scene;
      this.stats = statsOverride || CONFIG.AIRCRAFT[typeId] || CONFIG.AIRCRAFT.FALCON;
      this.typeId = typeId;
      this.team = team; // 'BLUE' or 'RED'
      this.callsign = callsign;
      this.isPlayer = isPlayer;
      this.wingIndex = wingIndex;
      this.liveryIndex = liveryIndex;

      this.mesh = AircraftModelFactory.createAircraftMesh(typeId, liveryIndex, team);
      // In-game airframe scale (1.75x heroic scale for high-visibility dogfighting)
      this.mesh.scale.set(1.75, 1.75, 1.75);
      this.scene.add(this.mesh);

      this.flight = new FlightModel(this.stats);
      this.ai = isPlayer ? null : new AIBotController(this, difficultyKey, roleObj, wingIndex);

      // Combat, Boost, Auto-Regen & Overdrive State
      this.alive = true;
      this.maxHp = isPlayer ? (this.stats.playerMaxHp || 100) : (this.stats.maxHp || 100);
      this.hp = this.maxHp;
      this.maxBoostEnergy = this.stats.boostMaxEnergy || CONFIG.BOOST.maxEnergy;
      this.boostEnergy = this.maxBoostEnergy;
      this.timeSinceDamage = 10.0;
      this.lastAttacker = null;
      this.boostRegenCooldown = 0;
      this.wasBoosting = false;
      this.ringBoostCooldown = 0;
      this.flagPickupCooldown = 0; // Cooldown after pressing G or X to drop the flag

      // 3D Bullet-Hit Animation State (Flashing Hull, Shield Ripple & Airframe Jolt)
      this.hitFlashTimer = 0;
      this.hitJoltTimer = 0;
      this.hitJoltRollSign = 1;
      this.hitJoltPitchSign = 1;

      // Addictive Combo & Overdrive State
      this.comboCount = 1;
      this.comboTimer = 0;
      this.overdriveMeter = 0; // 0 to 100
      this.overdriveTimer = 0; // Active Overdrive seconds remaining
      this.wingtipTrailTimer = 0;
      this.aimAssistTarget = null;

      this.cannonCooldown = 0;
      this.damageSmokeTimer = 0;
      this.respawnTimer = 0;
      this.carryingFlag = null;
      this.target = null;
      this.hideMeshForCockpit = false;

      // Runway Takeoff Roll State
      this.isTakingOff = false;
      this.takeoffTimer = 0;
      this.takeoffInitialY = 0;
      this.takeoffHeading = 0;

      // Telemetry & CTF Stats
      this.score = 0;
      this.kills = 0;
      this.killStreak = 0;
      this.deaths = 0;
      this.flagCaptures = 0;
      this.flagReturns = 0;
      this.shotsFired = 0;
      this.cannonHits = 0;
    }

    spawnAt(x, y, z, headingRad, isRunwayTakeoff = true) {
      this.alive = true;
      this.hp = this.maxHp;
      this.timeSinceDamage = 10.0;
      this.lastAttacker = null;
      this.boostEnergy = this.maxBoostEnergy || CONFIG.BOOST.maxEnergy;
      this.boostRegenCooldown = 0;
      this.ringBoostCooldown = 0;
      this.flagPickupCooldown = 0;
      this.killStreak = 0;
      this.comboCount = 1;
      this.comboTimer = 0;
      this.overdriveTimer = 0;
      this.hitFlashTimer = 0;
      this.hitJoltTimer = 0;
      this.carryingFlag = null;

      this.mesh.visible = true;
      this.mesh.position.set(x, y, z);
      this.mesh.rotation.set(0, headingRad, 0, 'YXZ');

      this.cannonCooldown = 0;
      this.flight.heading = headingRad;
      this.flight.elevation = 0;
      this.flight.bank = 0;
      this.flight.outOfBoundsWarning = false;
      this.flight.autopilotOverride = false;
      this.flight.gForce = 1.0;
      this.flight.speed = isRunwayTakeoff ? 85 : this.stats.cruiseSpeed;
      this.flight.throttle = 1.0;
      this.flight.isStalling = false;
      this.flight.pitchVel = 0;
      this.flight.rollVel = 0;
      this.flight.yawVel = 0;
      _v1.set(0, 0, -1).applyQuaternion(this.mesh.quaternion);
      this.flight.velocity.copy(_v1).multiplyScalar(this.flight.speed);

      this.isTakingOff = isRunwayTakeoff;
      this.takeoffTimer = isRunwayTakeoff ? 1.5 : 0;
      this.takeoffInitialY = y;
      this.takeoffHeading = headingRad;
    }

    triggerBulletHitAnimation() {
      this.hitFlashTimer = 0.18;
      this.hitJoltTimer = 0.26;
      this.hitJoltRollSign = Math.random() < 0.5 ? -1 : 1;
      this.hitJoltPitchSign = Math.random() < 0.5 ? -1 : 1;
    }

    addComboAction(basePoints, overdriveGain, game, popupText = null) {
      this.comboTimer = 6.5;
      const mult = Math.min(8, this.comboCount + (this.overdriveTimer > 0 ? 1 : 0));
      const totalPts = basePoints * mult;
      this.score += totalPts;

      if (this.overdriveTimer <= 0) {
        this.overdriveMeter = Math.min(100, this.overdriveMeter + overdriveGain);
        if (this.overdriveMeter >= 100) {
          this.overdriveMeter = 0;
          this.overdriveTimer = 9.0;
          this.boostEnergy = CONFIG.BOOST.maxEnergy;
          if (this.isPlayer && game) {
            game.audio.playFlagFanfare(true);
            game.addFloatingPopup('🔥 HYPER OVERDRIVE ACTIVATED! 2X FIREPOWER & INFINITE BOOST! 🔥', '#fbbf24');
          }
        }
      }

      if (this.isPlayer && popupText && game) {
        game.addFloatingPopup(`${popupText} (${mult}x COMBO!)`, '#00ff9d');
      }
      return totalPts;
    }

    update(dt, controls, weapons, particles, cameraPos, audio, allAircraft = null, world = null) {
      if (!this.alive) return;

      // Automated Takeoff Roll (1.5 seconds runway acceleration and positive climb)
      if (this.isTakingOff) {
        this.takeoffTimer -= dt;
        const progress = Math.max(0, Math.min(1.0, (1.5 - this.takeoffTimer) / 1.5));

        // Accelerate along runway centerline with full afterburner
        this.flight.throttle = 1.0;
        this.flight.speed = 85 + progress * 140; // 85 -> 225 m/s

        // Ground roll for first 0.5s, then smooth pitch rotation (13 deg) & climb to safe altitude (+72m)
        let pitchAng = 0;
        let targetY = this.takeoffInitialY;
        if (progress > 0.33) {
          const climbP = (progress - 0.33) / 0.67;
          pitchAng = THREE.MathUtils.degToRad(13.0) * Math.sin(climbP * Math.PI * 0.5);
          targetY = this.takeoffInitialY + climbP * climbP * 72.0;
        }

        this.flight.heading = this.takeoffHeading;
        this.flight.elevation = pitchAng;
        this.flight.bank = 0;
        this.flight.yawVel = 0;
        this.flight.pitchVel = 0;
        this.flight.rollVel = 0;

        _euler1.set(pitchAng, this.takeoffHeading, 0, 'YXZ');
        this.mesh.quaternion.setFromEuler(_euler1);
        this.flight.velocity.set(0, 0, -1).applyQuaternion(this.mesh.quaternion).multiplyScalar(this.flight.speed);

        this.mesh.position.addScaledVector(this.flight.velocity, dt);
        this.mesh.position.y = targetY;

        // Visual afterburner plumes
        const ud = this.mesh.userData;
        if (ud && ud.abGroup) {
          ud.abGroup.visible = true;
          ud.abGroup.scale.set(1.15, 1.15, 1.8);
        }

        if (this.isPlayer && audio) {
          audio.updateEngine(1.0, this.flight.speed, true, false);
        }

        if (this.takeoffTimer <= 0) {
          this.isTakingOff = false;
          if (this.isPlayer && audio) {
            audio.playTone(880, 0.20, 'triangle', 0.25);
          }
        }
        return;
      }

      this.cannonCooldown = Math.max(0, this.cannonCooldown - dt);
      this.ringBoostCooldown = Math.max(0, this.ringBoostCooldown - dt);
      this.flagPickupCooldown = Math.max(0, this.flagPickupCooldown - dt);
      this.timeSinceDamage += dt;

      // Combo & Overdrive timers
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.comboCount = 1;
      }
      if (this.overdriveTimer > 0) {
        this.overdriveTimer = Math.max(0, this.overdriveTimer - dt);
        this.boostEnergy = CONFIG.BOOST.maxEnergy;
      }

      // 1. Automatic Hull HP Regeneration (NO health regenerated within 3.0 seconds of being hit, slow pace afterwards)
      if (this.hp < this.maxHp && this.timeSinceDamage >= CONFIG.REGEN.regenDelay) {
        this.hp = Math.min(this.maxHp, this.hp + CONFIG.REGEN.regenRate * dt);
      }

      // 2. Shift Boost Energy Drain & Regeneration
      let boostActive = false;
      if ((controls.boost || this.overdriveTimer > 0) && this.boostEnergy > 1.5) {
        boostActive = Boolean(controls.boost || this.overdriveTimer > 0);
        if (this.overdriveTimer <= 0) {
          this.boostEnergy = Math.max(0, this.boostEnergy - CONFIG.BOOST.drainRate * dt);
        }
        this.boostRegenCooldown = CONFIG.BOOST.regenDelay;
        if (this.isPlayer && !this.wasBoosting && audio) {
          audio.playBoostEngage();
        }
      } else {
        this.boostRegenCooldown = Math.max(0, this.boostRegenCooldown - dt);
        const maxB = this.maxBoostEnergy || CONFIG.BOOST.maxEnergy;
        if (this.boostRegenCooldown <= 0 && this.boostEnergy < maxB) {
          this.boostEnergy = Math.min(maxB, this.boostEnergy + CONFIG.BOOST.regenRate * dt);
        }
      }
      this.wasBoosting = boostActive;

      // 3. Flight Physics (with Horizon-Stabilized Mouse Aim & Low-Altitude Skim Assist)
      this.flight.update(dt, this.mesh, controls, boostActive, world, this);

      const ud = this.mesh.userData;

      // 4. 3D BULLET-HIT ANIMATION ON AIRCRAFT MESH (Hull Emissive Flash, Shield Shell & Physical Airframe Shudder!)
      if (this.hitFlashTimer > 0) {
        this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
        const flashIntensity = this.hitFlashTimer / 0.18;
        const flashHex = (Math.floor(performance.now() / 35) % 2 === 0) ? 0xff2a3a : 0xffaa00;
        if (ud.bodyMat && ud.darkMat) {
          ud.bodyMat.emissive.setHex(flashHex);
          ud.darkMat.emissive.setHex(flashHex);
        }
        if (ud.hitShell && ud.hitShellMat) {
          ud.hitShell.visible = !this.hideMeshForCockpit;
          ud.hitShellMat.opacity = flashIntensity * 0.78;
          ud.hitShellMat.color.setHex(this.isPlayer ? 0xff3b47 : 0xfbbf24);
          const pulseScale = 1.0 + (1.0 - flashIntensity) * 0.25;
          ud.hitShell.scale.set(pulseScale, pulseScale, pulseScale);
        }
      } else {
        if (ud.bodyMat && ud.darkMat) {
          const odHex = this.overdriveTimer > 0 ? 0x332200 : 0x000000;
          ud.bodyMat.emissive.setHex(odHex);
          ud.darkMat.emissive.setHex(odHex);
        }
        if (ud.hitShell) {
          ud.hitShell.visible = false;
        }
      }

      // Physical 3D Airframe Jolt / Shudder oscillation when struck by bullets
      if (this.hitJoltTimer > 0 && ud.hiDetail) {
        this.hitJoltTimer = Math.max(0, this.hitJoltTimer - dt);
        const env = this.hitJoltTimer / 0.26;
        const wave = Math.sin((1.0 - env) * Math.PI * 7.0);
        ud.hiDetail.rotation.z = wave * 0.22 * env * this.hitJoltRollSign;
        ud.hiDetail.rotation.x = wave * 0.11 * env * this.hitJoltPitchSign;
        ud.hiDetail.position.set(
          wave * 0.35 * env * this.hitJoltRollSign,
          wave * 0.22 * env * this.hitJoltPitchSign,
          0
        );
      } else if (ud.hiDetail) {
        ud.hiDetail.rotation.set(0, 0, 0);
        ud.hiDetail.position.set(0, 0, 0);
      }

      if (ud.leftElev && ud.rightElev) {
        ud.leftElev.rotation.x = this.flight.pitchVel * 0.22 - this.flight.bank * 0.18;
        ud.rightElev.rotation.x = this.flight.pitchVel * 0.22 + this.flight.bank * 0.18;
      }
      if (ud.abGroup) {
        const t = boostActive ? 1.45 : this.flight.throttle;
        const scaleZ = Math.max(0.18, (t - 0.15) * 1.55 + (boostActive ? 1.2 + Math.random() * 0.35 : 0));
        const scaleXY = 0.68 + t * 0.50;
        if (Math.abs(ud.abGroup.position.z) > 0.1) {
          ud.abGroup.scale.set(scaleXY, scaleXY, scaleZ);
        } else {
          for (let i = 0; i < ud.abGroup.children.length; i++) {
            ud.abGroup.children[i].scale.set(scaleXY, scaleXY, scaleZ);
          }
        }
        ud.abGroup.visible = t > 0.20;
      }

      if (cameraPos && ud.hiDetail && ud.loDetail) {
        const distSq = this.mesh.position.distanceToSquared(cameraPos);
        const isFar = distSq > CONFIG.WORLD.lodDistance * CONFIG.WORLD.lodDistance;
        ud.hiDetail.visible = !isFar && !this.hideMeshForCockpit;
        ud.loDetail.visible = isFar && !this.hideMeshForCockpit;
      }

      // Wingtip Vortex Contrails during high-G turns, Boost, or Barrel Roll
      if (boostActive || Math.abs(this.flight.yawVel) > 0.9 || Math.abs(this.flight.barrelRollSpeed) > 0.5) {
        this.wingtipTrailTimer += dt;
        if (this.wingtipTrailTimer >= 0.025) {
          this.wingtipTrailTimer = 0;
          const trailCol = this.overdriveTimer > 0 ? 0xfbbf24 : (boostActive ? 0x38bdf8 : 0xa5f3fc);
          for (const wx of [-6.8, 6.8]) {
            _v1.set(wx, 0, 2.8).applyQuaternion(this.mesh.quaternion).add(this.mesh.position);
            particles.spawnParticle(_v1, _v2.set(0, 0, 0), trailCol, 0.95, 2.4, 0.28, true);
          }
        }
      }

      // 5. Smart Magnetic Lead-Assist Cannon Aiming
      this.aimAssistTarget = null;
      let aimOverride = null;
      if (this.isPlayer && controls.mouseAimWorldDir) {
        aimOverride = controls.mouseAimWorldDir.clone();
        if (allAircraft) {
          let bestConeAngle = CONFIG.WEAPONS.CANNON.aimAssistConeRad;
          for (const other of allAircraft) {
            if (!other.alive || other.team === this.team) continue;
            const dist = this.mesh.position.distanceTo(other.mesh.position);
            if (dist > 2200) continue;
            const lead = WeaponsManager.computeLeadPosition(
              this.mesh.position,
              this.flight.velocity,
              other.mesh.position,
              other.flight.velocity
            );
            _v3.subVectors(lead.leadPos, this.mesh.position).normalize();
            const angle = controls.mouseAimWorldDir.angleTo(_v3);
            if (angle < bestConeAngle) {
              bestConeAngle = angle;
              this.aimAssistTarget = other;
              aimOverride.lerp(_v3, 0.78).normalize();
            }
          }
        }
      }

      if (controls.fireCannon && !this.isTakingOff) {
        const jitter = this.isPlayer ? 0.0018 : (this.ai ? this.ai.diff.aimErrorRad * 0.45 : 0.016);
        weapons.fireCannon(this, aimOverride, jitter);
      }

      // 6. Damage Smoke
      if (this.hp < 55) {
        this.damageSmokeTimer += dt;
        const interval = this.hp < 28 ? 0.04 : 0.08;
        if (this.damageSmokeTimer >= interval) {
          this.damageSmokeTimer = 0;
          const isFire = this.hp < 28 && Math.random() < 0.45;
          particles.spawnParticle(
            this.mesh.position,
            _v4.set((Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4),
            isFire ? 0xff5511 : 0x2a2e33,
            2.2,
            11.0,
            0.9,
            isFire
          );
        }
      }
    }
  }

window.Aircraft = Aircraft;
