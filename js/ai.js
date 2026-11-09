"use strict";

  /* ============================================================================
   * 9. HUMAN-LIKE SITUATIONAL AI ENGINE (Low/Mid-Altitude Horizon-Stabilized Flight & Strong Flag Focus)
   * ============================================================================
   */
  class AIBotController {
    constructor(aircraft, difficultyKey, roleObj, wingIndex) {
      this.ac = aircraft;
      this.diff = CONFIG.AI_DIFFICULTY[difficultyKey] || CONFIG.AI_DIFFICULTY.NORMAL;
      this.role = roleObj || CONFIG.ROLES[wingIndex % CONFIG.ROLES.length];
      this.wingIndex = wingIndex;

      this.decisionTimer = Math.random() * 0.35;
      this.aimPhase = Math.random() * Math.PI * 2;
      this.maneuverTimer = 1.5 + Math.random() * 2.5;
      this.stuntRollDir = 0;
      this.evasiveJinkSign = Math.random() < 0.5 ? -1 : 1;

      // Human-like situational state & mood tracking
      this.situationalState = 'PATROL';
      this.adrenaline = 0.0;
      this.burstTimer = 0.5 + Math.random() * 0.5;
      this.burstCooling = false;
      this.humanAimDir = new THREE.Vector3(0, 0, -1);
      this.flankSide = (wingIndex % 2 === 0) ? 1 : -1;

      // Keep all roam waypoints in the low/mid canyon action band!
      this.roamWaypoint = new THREE.Vector3(
        this.flankSide * (650 + Math.random() * 650),
        220,
        (Math.random() - 0.5) * 5500
      );
    }

    assessThreatEnvironment(allAircraft) {
      const pos = this.ac.mesh.position;
      const forward = _v1.set(0, 0, -1).applyQuaternion(this.ac.mesh.quaternion);

      let nearestEnemy = null;
      let nearestEnemyDist = Infinity;
      let tailChaser = null;
      let tailChaserDist = Infinity;
      let enemiesNearbyCount = 0;
      let enemyAimingAtMe = null;

      for (const other of allAircraft) {
        if (!other.alive || other.team === this.ac.team) continue;
        const d = pos.distanceTo(other.mesh.position);
        if (d < nearestEnemyDist) {
          nearestEnemyDist = d;
          nearestEnemy = other;
        }
        if (d < 1300) {
          enemiesNearbyCount++;
        }

        // Check if this enemy is pointing their nose directly toward me
        _v2.set(0, 0, -1).applyQuaternion(other.mesh.quaternion);
        _v3.subVectors(pos, other.mesh.position).normalize();
        const enemyAimDot = _v2.dot(_v3); // > 0.85 means pointing within ~30 deg of me

        if (d < 1150 && enemyAimDot > 0.84) {
          if (!enemyAimingAtMe || d < pos.distanceTo(enemyAimingAtMe.mesh.position)) {
            enemyAimingAtMe = other;
          }
        }

        // Check if this enemy is in my rear 6-o'clock hemisphere and pursuing me
        _v4.subVectors(other.mesh.position, pos).normalize();
        const myDotToEnemy = forward.dot(_v4); // < -0.20 means behind me
        if (d < 950 && myDotToEnemy < -0.20 && enemyAimDot > 0.78) {
          if (d < tailChaserDist) {
            tailChaserDist = d;
            tailChaser = other;
          }
        }
      }

      return {
        nearestEnemy,
        nearestEnemyDist,
        tailChaser,
        tailChaserDist,
        enemiesNearbyCount,
        enemyAimingAtMe
      };
    }

    findSneakyLowRiskTarget(allAircraft) {
      // Used by SHENANIGANS (the sneaky coward):
      // Finds an enemy who is weak or distracted, facing away from us, and has no other enemies nearby!
      const pos = this.ac.mesh.position;
      let bestVictim = null;
      let bestScore = Infinity;

      for (const cand of allAircraft) {
        if (!cand.alive || cand.team === this.ac.team) continue;
        const dist = pos.distanceTo(cand.mesh.position);
        if (dist > 2800 || dist < 150) continue;

        // Is the candidate looking at us? If so, TOO RISKY for the coward!
        _v2.set(0, 0, -1).applyQuaternion(cand.mesh.quaternion);
        _v3.subVectors(pos, cand.mesh.position).normalize();
        const candLookingAtUs = _v2.dot(_v3);
        if (candLookingAtUs > 0.25) continue;

        // Count how many other enemies are near this candidate (avoid furballs!)
        let protectorsNearCand = 0;
        for (const other of allAircraft) {
          if (other === cand || !other.alive || other.team === this.ac.team) continue;
          if (other.mesh.position.distanceTo(cand.mesh.position) < 1100) {
            protectorsNearCand++;
          }
        }
        if (protectorsNearCand >= 2) continue;

        const isLowHp = cand.hp <= 60;
        const isDistracted = cand.target && cand.target !== this.ac;
        if (!isLowHp && !isDistracted && !cand.carryingFlag) continue;

        let riskScore = dist;
        if (isLowHp) riskScore *= 0.40;
        if (isDistracted) riskScore *= 0.65;
        if (candLookingAtUs < -0.45) riskScore *= 0.70;
        if (protectorsNearCand === 1) riskScore *= 1.40;

        if (riskScore < bestScore) {
          bestScore = riskScore;
          bestVictim = cand;
        }
      }
      return bestVictim;
    }

    // Helper: compute direction from `pos` toward a 3D target point `dest`, sampling intervening terrain
    // so flight paths smoothly clear mountain ridges instead of aiming through them!
    computeLevelInterceptDir(pos, destVec, minAlt = 145, maxAlt = 2400) {
      const targetX = destVec.x;
      const targetZ = destVec.z;
      const groundAtDest = Math.max(CONFIG.WORLD.seaLevel, this.worldRef ? this.worldRef.getTerrainHeight(targetX, targetZ) : 0);

      // Probe intermediate points along flight path to clear intervening mountain ridges
      const mx1 = pos.x + (targetX - pos.x) * 0.33;
      const mz1 = pos.z + (targetZ - pos.z) * 0.33;
      const gMid1 = Math.max(CONFIG.WORLD.seaLevel, this.worldRef ? this.worldRef.getTerrainHeight(mx1, mz1) : 0);

      const mx2 = pos.x + (targetX - pos.x) * 0.67;
      const mz2 = pos.z + (targetZ - pos.z) * 0.67;
      const gMid2 = Math.max(CONFIG.WORLD.seaLevel, this.worldRef ? this.worldRef.getTerrainHeight(mx2, mz2) : 0);

      const maxIntervening = Math.max(groundAtDest, gMid1, gMid2);
      const safeFloor = Math.max(minAlt, maxIntervening + 85);
      const clampedY = Math.max(safeFloor, Math.min(maxAlt, destVec.y));
      return _v5.set(targetX - pos.x, clampedY - pos.y, targetZ - pos.z).normalize().clone();
    }

    update(dt, allAircraft, world, game = null) {
      this.worldRef = world;
      this.decisionTimer -= dt;
      this.aimPhase += dt * 2.0;
      this.maneuverTimer -= dt;
      this.burstTimer -= dt;

      const pos = this.ac.mesh.position;
      const vel = this.ac.flight.velocity;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.ac.mesh.quaternion);

      if (this.humanAimDir.lengthSq() < 0.01) {
        this.humanAimDir.copy(forward);
      }

      // 1. Predictive Multi-Probe Terrain Avoidance System
      const curSpeed = Math.max(120, vel.length());
      const lookDist1 = curSpeed * 1.2;
      const lookDist2 = curSpeed * 2.4;
      const lookDist3 = curSpeed * 3.8;

      const groundNow = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(pos.x, pos.z));
      const g1 = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(pos.x + forward.x * lookDist1, pos.z + forward.z * lookDist1));
      const g2 = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(pos.x + forward.x * lookDist2, pos.z + forward.z * lookDist2));
      const g3 = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(pos.x + forward.x * lookDist3, pos.z + forward.z * lookDist3));

      const highestTerrainAhead = Math.max(groundNow, g1, g2, g3);
      const safeClearance = 85;
      const safeAltCeiling = highestTerrainAhead + safeClearance;
      const terrainDeficit = safeAltCeiling - pos.y;
      const isTerrainEmergency = terrainDeficit > 0;

      // Lateral slope probes (+-35 deg) to detect valleys & canyon escape routes
      const cosP = 0.819, sinP = 0.573;
      const leftDirX = forward.x * cosP - forward.z * sinP;
      const leftDirZ = forward.x * sinP + forward.z * cosP;
      const gLeft = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(pos.x + leftDirX * lookDist2, pos.z + leftDirZ * lookDist2));

      const rightDirX = forward.x * cosP + forward.z * sinP;
      const rightDirZ = -forward.x * sinP + forward.z * cosP;
      const gRight = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(pos.x + rightDirX * lookDist2, pos.z + rightDirZ * lookDist2));

      let collisionThreat = null;
      for (const other of allAircraft) {
        if (other === this.ac || !other.alive) continue;
        if (pos.distanceToSquared(other.mesh.position) < 82 * 82) {
          collisionThreat = other;
          break;
        }
      }

      // 2. Assess Live Battlefield Situation (Threats, Scoreboard, Clock & HP)
      const threat = this.assessThreatEnvironment(allAircraft);
      const ownTeam = this.ac.team;
      const enemyTeam = ownTeam === 'BLUE' ? 'RED' : 'BLUE';
      const ownFlag = world.flags[ownTeam];
      const enemyFlag = world.flags[enemyTeam];
      const roleId = this.role.id;

      const myCaps = game ? (game.teamCaptures[ownTeam] || 0) : 0;
      const enemyCaps = game ? (game.teamCaptures[enemyTeam] || 0) : 0;
      const remSec = game ? (game.remainingMatchSec || 1200) : 1200;

      const isClutchSituation = (enemyCaps > myCaps) || (enemyCaps >= 2 && myCaps < 2) || (remSec < 180 && myCaps <= enemyCaps);
      const isLeadLockdown = (myCaps >= 2 && enemyCaps === 0) || (myCaps > enemyCaps && remSec < 180);

      const underFire = this.ac.timeSinceDamage < 2.8 || Boolean(threat.tailChaser) || Boolean(threat.enemyAimingAtMe);
      const targetAdrenaline = (underFire ? 0.65 : 0.0) + (isClutchSituation ? 0.35 : 0.0) + (this.ac.hp < 45 ? 0.4 : 0.0);
      this.adrenaline += (Math.min(1.0, targetAdrenaline) - this.adrenaline) * Math.min(1.0, dt * 3.0);

      if (this.decisionTimer <= 0) {
        const reactMult = Math.max(0.55, 1.0 - this.adrenaline * 0.30);
        this.decisionTimer = this.diff.reactionDelay * reactMult * (0.85 + Math.random() * 0.30);
        this.evaluateTargetsByPersonality(allAircraft, world, threat, isClutchSituation, game);
      }

      if (this.maneuverTimer <= 0) {
        this.maneuverTimer = 2.0 + Math.random() * 2.8;
        this.evasiveJinkSign = -this.evasiveJinkSign;
        this.stuntRollDir = (underFire && Math.random() < 0.60) ? this.evasiveJinkSign : 0;
      }

      // Human burst fire rhythm
      if (this.burstTimer <= 0) {
        this.burstCooling = !this.burstCooling;
        this.burstTimer = this.burstCooling ? (0.14 + Math.random() * 0.14) : (0.55 + Math.random() * 0.45);
      }

      let desiredDir = forward.clone();
      let desiredThrottle = 0.76 * this.diff.maxSpeedUse;
      let wantBoost = false;
      let wantFireGun = false;

      // Check if seriously damaged and kiting for the 3.0-second health regen delay
      const needsRegenKite = (roleId === 'SHENANIGANS')
        ? (this.ac.hp < 75 && this.ac.timeSinceDamage < 3.6)
        : (this.ac.hp < 35 && this.ac.timeSinceDamage < 3.4 && roleId !== 'FLAG_CHASER' && roleId !== 'FLAG_PROTECTOR');

      // 3. Hierarchical Human Situational Behavior Tree
      if (this.ac.carryingFlag) {
        // =========================================================================
        // PRIORITY 1: CARRYING THE ENEMY FLAG -> SPRINT DIRECTLY TO HOME BASE WITH AFTERBURNER!
        // DUAL-FLAG RULE: If our home flag is stolen/missing, we cannot capture!
        // Loiter defensively 650m outside home base in safe holding orbit until our flag is returned!
        // =========================================================================
        const distToHome = pos.distanceTo(ownFlag.homePos);
        const ownFlagAtBase = ownFlag && ownFlag.state === 'AT_BASE';

        if (ownFlagAtBase || distToHome > 850) {
          this.situationalState = 'CAPTURING_FLAG';
          _v2.copy(ownFlag.homePos);
          _v2.y = ownFlag.homePos.y + 16;
          desiredDir = this.computeLevelInterceptDir(pos, _v2, 140, 600);
        } else {
          // Dual-Flag holding pattern: Own flag is missing, so we cannot capture yet!
          this.situationalState = 'HOLDING_FLAG_WAIT_RECOVERY';
          const orbitAng = this.aimPhase * 0.45;
          const orbX = ownFlag.homePos.x + Math.cos(orbitAng) * 650;
          const orbZ = ownFlag.homePos.z + Math.sin(orbitAng) * 650;
          const orbG = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(orbX, orbZ));
          _v2.set(orbX, orbG + 160, orbZ);
          desiredDir = this.computeLevelInterceptDir(pos, _v2, 160, 500);
        }

        if (threat.tailChaser && distToHome > 800) {
          desiredDir.x += Math.sin(this.aimPhase * 3.0) * 0.20;
          desiredDir.normalize();
          this.stuntRollDir = this.evasiveJinkSign;
        }
        desiredThrottle = 1.0;
        wantBoost = this.ac.boostEnergy > 10;

      } else if (ownFlag && ownFlag.state === 'CARRIED' && ownFlag.carrier && ownFlag.carrier.alive && (this.wingIndex % 4 !== 0 || roleId === 'HUNTER_KILLER')) {
        // =========================================================================
        // PINCER INTERCEPT / HUNTER-KILLER: Enemy is running our flag! Converge with afterburner!
        // =========================================================================
        this.situationalState = 'PINCER_INTERCEPT';
        const carrier = ownFlag.carrier;
        this.ac.target = carrier;

        const lead = WeaponsManager.computeLeadPosition(pos, vel, carrier.mesh.position, carrier.flight.velocity);
        const flankSign = (this.wingIndex % 2 === 0) ? 1 : -1;
        const flankOffset = flankSign * Math.min(260, lead.dist * 0.22);
        _v2.copy(lead.leadPos);
        _v2.x += flankOffset;
        _v2.y += (this.wingIndex % 3 === 0) ? 35 : -15;

        desiredDir = this.computeLevelInterceptDir(pos, _v2, 130, 600);
        desiredThrottle = 1.0;
        wantBoost = (lead.dist > 450 || this.ac.timeSinceDamage < 2.0) && this.ac.boostEnergy > 12;

        if (lead.dist < 1550) {
          const toLead = _v3.subVectors(lead.leadPos, pos).normalize();
          const angleToLead = forward.angleTo(toLead);
          if (angleToLead < 0.24) {
            wantFireGun = !this.burstCooling;
          }
        }

      } else if (ownFlag && ownFlag.state === 'DROPPED' && pos.distanceTo(ownFlag.pos) < 4500) {
        // =========================================================================
        // RETURN DROPPED FLAG: Touch dropped flag to restore base and gain +150 points!
        // =========================================================================
        this.situationalState = 'RETURN_FLAG';
        _v2.copy(ownFlag.pos);
        _v2.y = ownFlag.pos.y + 12;
        desiredDir = this.computeLevelInterceptDir(pos, _v2, 140, 600);
        desiredThrottle = 1.0;
        wantBoost = this.ac.boostEnergy > 15;

      } else if (roleId === 'STEALTH_FLANKER' || roleId === 'SHENANIGANS') {
        // =========================================================================
        // STEALTH_FLANKER: Wide-Flanking Canyon Infiltrator & Surprise Objective Thief!
        // =========================================================================
        const inDanger = Boolean(threat.tailChaser) ||
                         Boolean(threat.enemyAimingAtMe) ||
                         threat.enemiesNearbyCount >= 2 ||
                         (threat.nearestEnemyDist < 820) ||
                         needsRegenKite;

        if (inDanger) {
          this.situationalState = this.ac.hp < 75 ? 'HIDE_HEAL' : 'COWARD_FLEE';
          const dangerSrc = threat.tailChaser || threat.enemyAimingAtMe || threat.nearestEnemy;
          if (dangerSrc) {
            _v2.subVectors(pos, dangerSrc.mesh.position);
            _v2.y = 0;
            if (_v2.lengthSq() < 1) _v2.set(this.flankSide, 0, 1);
            _v2.normalize();
            _v3.subVectors(ownFlag.homePos, pos);
            _v3.y = 0;
            _v3.normalize();
            _v4.copy(pos).addScaledVector(_v2, 1200).addScaledVector(_v3, 700);
            _v4.y = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(_v4.x, _v4.z)) + 140;
            desiredDir = this.computeLevelInterceptDir(pos, _v4, 150, 600);
          } else {
            _v4.set(this.flankSide * 1100, 0, ownFlag.homePos.z * 0.6);
            _v4.y = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(_v4.x, _v4.z)) + 140;
            desiredDir = this.computeLevelInterceptDir(pos, _v4, 150, 600);
          }
          this.stuntRollDir = this.evasiveJinkSign;
          desiredThrottle = 0.94;
          wantBoost = this.ac.boostEnergy > 18;

        } else {
          const sneakyVictim = this.findSneakyLowRiskTarget(allAircraft);
          const distToEnemyFlag = enemyFlag ? pos.distanceTo(enemyFlag.pos) : Infinity;

          if (enemyFlag && enemyFlag.state !== 'CARRIED') {
            this.situationalState = 'SNEAK_FLAG';
            _v2.copy(enemyFlag.pos);
            _v2.y = enemyFlag.pos.y + 14;
            if (distToEnemyFlag > 1800) {
              _v2.x += this.flankSide * 850;
              _v2.y = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(_v2.x, _v2.z)) + 140;
            }
            desiredDir = this.computeLevelInterceptDir(pos, _v2, 140, 600);
            desiredThrottle = 0.94;
            wantBoost = distToEnemyFlag < 2200 && this.ac.boostEnergy > 20;
          } else if (sneakyVictim && distToEnemyFlag > 1400 && pos.distanceTo(sneakyVictim.mesh.position) < 2100) {
            this.situationalState = 'SNEAK_KILL';
            this.ac.target = sneakyVictim;
            const lead = WeaponsManager.computeLeadPosition(pos, vel, sneakyVictim.mesh.position, sneakyVictim.flight.velocity);
            desiredDir = this.computeLevelInterceptDir(pos, lead.leadPos, 130, 600);
            desiredThrottle = lead.dist > 800 ? 0.90 : 0.65;
            wantBoost = lead.dist > 1100 && this.ac.boostEnergy > 25;
          } else {
            this.situationalState = 'STALKING';
            if (pos.distanceTo(this.roamWaypoint) < 600) {
              this.flankSide = -this.flankSide;
              const rwX = this.flankSide * (650 + Math.random() * 650);
              const rwZ = (Math.random() - 0.5) * 5500;
              const rwG = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(rwX, rwZ));
              this.roamWaypoint.set(rwX, rwG + 140 + Math.random() * 100, rwZ);
            }
            desiredDir = this.computeLevelInterceptDir(pos, this.roamWaypoint, 150, 600);
            desiredThrottle = 0.85;
          }
        }

      } else if (roleId === 'FLAG_RUNNER' || roleId === 'FLAG_CHASER') {
        // =========================================================================
        // FLAG_RUNNER: Relentlessly charges enemy flag or hunts enemy carrier!
        // =========================================================================
        if (enemyFlag && enemyFlag.state !== 'CARRIED') {
          this.situationalState = isClutchSituation ? 'CLUTCH_RAID' : 'STEAL_FLAG';
          _v2.copy(enemyFlag.pos);
          _v2.y = enemyFlag.pos.y + 14;
          const distToFlag = pos.distanceTo(_v2);
          if (distToFlag > 2200) {
            _v2.x += this.flankSide * 550;
            _v2.y = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(_v2.x, _v2.z)) + 140;
          }
          desiredDir = this.computeLevelInterceptDir(pos, _v2, 140, 600);
          if (threat.tailChaser && distToFlag > 900) {
            this.stuntRollDir = this.evasiveJinkSign;
          }
          desiredThrottle = 0.90;
          wantBoost = (distToFlag < 2000 || Boolean(threat.tailChaser)) && this.ac.boostEnergy > 25;
        } else if (ownFlag && ownFlag.state === 'CARRIED' && ownFlag.carrier && ownFlag.carrier.alive) {
          this.situationalState = 'HUNT_CARRIER';
          this.ac.target = ownFlag.carrier;
          const lead = WeaponsManager.computeLeadPosition(pos, vel, ownFlag.carrier.mesh.position, ownFlag.carrier.flight.velocity);
          desiredDir = this.computeLevelInterceptDir(pos, lead.leadPos, 130, 600);
          desiredThrottle = 0.92;
          wantBoost = lead.dist > 800 && this.ac.boostEnergy > 25;
        } else if (this.ac.target && this.ac.target.alive) {
          this.situationalState = 'CLEAR_BASE';
          const lead = WeaponsManager.computeLeadPosition(pos, vel, this.ac.target.mesh.position, this.ac.target.flight.velocity);
          desiredDir = this.computeLevelInterceptDir(pos, lead.leadPos, 140, 600);
          desiredThrottle = 0.80;
        }

      } else if (roleId === 'BASE_GUARDIAN' || roleId === 'FLAG_PROTECTOR') {
        // =========================================================================
        // BASE_GUARDIAN: Guards Home Base Flag Stand & Intercepts Attackers!
        // =========================================================================
        if (ownFlag && ownFlag.state === 'DROPPED') {
          this.situationalState = 'RETURN_FLAG';
          _v2.copy(ownFlag.pos);
          _v2.y = ownFlag.pos.y + 12;
          desiredDir = this.computeLevelInterceptDir(pos, _v2, 140, 600);
          desiredThrottle = 0.92;
          wantBoost = this.ac.boostEnergy > 25;
        } else if (ownFlag && ownFlag.state === 'CARRIED' && ownFlag.carrier && ownFlag.carrier.alive) {
          this.situationalState = 'HUNT_THIEF';
          const thief = ownFlag.carrier;
          this.ac.target = thief;
          const lead = WeaponsManager.computeLeadPosition(pos, vel, thief.mesh.position, thief.flight.velocity);
          desiredDir = this.computeLevelInterceptDir(pos, lead.leadPos, 130, 600);
          desiredThrottle = 0.92;
          wantBoost = lead.dist > 750 && this.ac.boostEnergy > 25;
        } else if (isClutchSituation && enemyFlag && enemyFlag.state !== 'CARRIED') {
          this.situationalState = 'CLUTCH_PUSH';
          _v2.copy(enemyFlag.pos);
          _v2.y = enemyFlag.pos.y + 14;
          desiredDir = this.computeLevelInterceptDir(pos, _v2, 140, 600);
          desiredThrottle = 0.90;
          wantBoost = this.ac.boostEnergy > 35;
        } else if (this.ac.target && this.ac.target.alive && this.ac.target.mesh.position.distanceTo(ownFlag.homePos) < 3400) {
          this.situationalState = 'DEFEND_BASE';
          const lead = WeaponsManager.computeLeadPosition(pos, vel, this.ac.target.mesh.position, this.ac.target.flight.velocity);
          desiredDir = this.computeLevelInterceptDir(pos, lead.leadPos, 140, 600);
          desiredThrottle = 0.82;
        } else {
          this.situationalState = 'GUARD_FLAG';
          const orbitAng = this.aimPhase * 0.40 + this.wingIndex;
          const orbX = ownFlag.homePos.x + Math.cos(orbitAng) * 650;
          const orbZ = ownFlag.homePos.z + Math.sin(orbitAng) * 650;
          const orbG = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(orbX, orbZ));
          _v2.set(orbX, orbG + 130, orbZ);
          desiredDir = this.computeLevelInterceptDir(pos, _v2, 180, 500);
          desiredThrottle = 0.70;
        }

      } else if (roleId === 'HUNTER_KILLER') {
        // =========================================================================
        // HUNTER_KILLER: Dedicated Flag Thief Hunter & Interceptor
        // =========================================================================
        if (ownFlag && ownFlag.state === 'CARRIED' && ownFlag.carrier && ownFlag.carrier.alive) {
          this.situationalState = 'HUNT_THIEF';
          const thief = ownFlag.carrier;
          this.ac.target = thief;
          const lead = WeaponsManager.computeLeadPosition(pos, vel, thief.mesh.position, thief.flight.velocity);
          desiredDir = this.computeLevelInterceptDir(pos, lead.leadPos, 130, 600);
          desiredThrottle = 1.0;
          wantBoost = lead.dist > 500 && this.ac.boostEnergy > 15;
          const toLead = _v3.subVectors(lead.leadPos, pos).normalize();
          if (forward.angleTo(toLead) < 0.26) {
            wantFireGun = !this.burstCooling;
          }
        } else if (ownFlag && ownFlag.state === 'DROPPED') {
          this.situationalState = 'RETURN_FLAG';
          _v2.copy(ownFlag.pos);
          _v2.y = ownFlag.pos.y + 12;
          desiredDir = this.computeLevelInterceptDir(pos, _v2, 140, 600);
          desiredThrottle = 1.0;
          wantBoost = this.ac.boostEnergy > 20;
        } else if (this.ac.target && this.ac.target.alive) {
          this.situationalState = 'INTERCEPT';
          const lead = WeaponsManager.computeLeadPosition(pos, vel, this.ac.target.mesh.position, this.ac.target.flight.velocity);
          desiredDir = this.computeLevelInterceptDir(pos, lead.leadPos, 140, 600);
          desiredThrottle = 0.92;
          wantBoost = lead.dist > 600 && this.ac.boostEnergy > 20;
        } else {
          this.situationalState = 'PATROL_BASE';
          desiredDir = this.computeLevelInterceptDir(pos, ownFlag.homePos, 160, 600);
          desiredThrottle = 0.80;
        }

      } else {
        // =========================================================================
        // ESCORT_WING: Dedicated Wingman Escort for Friendly Flag Carrier (Bot or Player)
        // =========================================================================
        const friendlyCarrier = (enemyFlag && enemyFlag.state === 'CARRIED' && enemyFlag.carrier && enemyFlag.carrier.team === ownTeam && enemyFlag.carrier.alive) ? enemyFlag.carrier : null;
        if (friendlyCarrier && friendlyCarrier !== this.ac) {
          this.situationalState = 'ESCORT_FLAG';
          let carrierThreat = null;
          for (const other of allAircraft) {
            if (other.alive && other.team !== ownTeam && other.mesh.position.distanceTo(friendlyCarrier.mesh.position) < 1600) {
              carrierThreat = other;
              break;
            }
          }
          if (carrierThreat) {
            this.situationalState = 'PEEL_THREAT';
            this.ac.target = carrierThreat;
            const lead = WeaponsManager.computeLeadPosition(pos, vel, carrierThreat.mesh.position, carrierThreat.flight.velocity);
            desiredDir = this.computeLevelInterceptDir(pos, lead.leadPos, 140, 600);
            const angleToTarget = forward.angleTo(desiredDir);
            desiredThrottle = (angleToTarget > 0.50) ? 0.35 : 0.88;
            wantBoost = lead.dist > 400 && angleToTarget < 0.50 && this.ac.boostEnergy > (isClutchSituation ? 8 : 18);
          } else {
            // Convoy formation with carrier
            const flankSign = (this.wingIndex % 2 === 0) ? 1 : -1;
            const distBehind = 140 + (this.wingIndex % 3) * 45;
            _v2.copy(friendlyCarrier.mesh.position).add(new THREE.Vector3(flankSign * (120 + (this.wingIndex % 3) * 35), 25, distBehind));
            desiredDir = this.computeLevelInterceptDir(pos, _v2, 150, 600);
            desiredThrottle = 0.88;
            wantBoost = pos.distanceTo(_v2) > 500 && this.ac.boostEnergy > 25;
          }
        } else if (this.ac.target && this.ac.target.alive) {
          this.situationalState = 'SUPPORT';
          const lead = WeaponsManager.computeLeadPosition(pos, vel, this.ac.target.mesh.position, this.ac.target.flight.velocity);
          desiredDir = this.computeLevelInterceptDir(pos, lead.leadPos, 140, 600);
          const angleToTarget = forward.angleTo(desiredDir);
          desiredThrottle = (angleToTarget > 0.50) ? 0.35 : ((lead.dist > 750) ? 0.92 : 0.78);
          wantBoost = lead.dist > 400 && angleToTarget < 0.50 && this.ac.boostEnergy > (isClutchSituation ? 8 : 18);
        } else {
          this.situationalState = 'SWEEP';
          const swpG = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(0, 0));
          _v2.set(0, swpG + 140, 0);
          desiredDir = this.computeLevelInterceptDir(pos, _v2, 160, 600);
          desiredThrottle = 0.74;
        }
      }

      // 4. TERRAIN PROXIMITY SAFETY OVERRIDE:
      // If closing in on rising terrain or mountains, dynamically pull up and steer into the valley!
      if (isTerrainEmergency) {
        this.situationalState = 'TERRAIN_AVOID';
        const urgency = Math.min(1.0, terrainDeficit / 110);

        // Calculate climb angle (proportional to terrain deficit, up to 0.85 = ~58 degrees!)
        const pullUpPitch = Math.max(0.40, Math.min(0.85, 0.32 + terrainDeficit / 140));

        // Steer away from higher terrain towards lower valley / canyon center
        const canyonBias = -Math.sign(pos.x) * 0.60;
        const slopeBias = (gLeft < gRight) ? 0.70 : -0.70;
        const steerSide = slopeBias + canyonBias;

        const escapeDirX = forward.x * (1.0 - urgency * 0.75) + steerSide * urgency;
        const escapeDirZ = forward.z * (1.0 - urgency * 0.75);
        const escapeDir = _v4.set(escapeDirX, pullUpPitch, escapeDirZ).normalize();

        desiredDir.lerp(escapeDir, Math.min(1.0, 0.50 + urgency * 0.50)).normalize();
        desiredThrottle = Math.max(desiredThrottle, 0.95);
        if (terrainDeficit > 30 && this.ac.boostEnergy > 15) {
          wantBoost = true;
        }
      }

      if (collisionThreat) {
        _v4.subVectors(pos, collisionThreat.mesh.position).normalize();
        _v4.y = Math.max(-0.15, Math.min(0.35, _v4.y));
        desiredDir.lerp(_v4.normalize(), 0.65).normalize();
      }

      // 5. Altitude Ceiling Governor: gently guide down only if drifting extremely high (> 2400m)
      // and safely above all terrain!
      if (pos.y > 2400 && pos.y - highestTerrainAhead > 400) {
        const pullDownStrength = Math.min(0.35, (pos.y - 2400) / 1000);
        desiredDir.y = Math.min(desiredDir.y, -pullDownStrength * 0.25);
        desiredDir.normalize();
      }

      // 5. Smooth Grand Ace Aiming & Opportunistic Gunfire
      const trackMult = isClutchSituation ? 1.25 : 1.0;
      const trackRate = Math.min(1.0, (9.5 + this.diff.aggressiveness * 6.5) * trackMult * dt);
      this.humanAimDir.lerp(desiredDir, trackRate).normalize();

      // Check if an enemy is in front of the AI's nose -> fire burst!
      if (this.ac.target && this.ac.target.alive && !this.burstCooling) {
        const isTrainee = (this.ac.target.isPlayer && game && game.tutorial && game.tutorial.active);
        const cowardFleeing = (roleId === 'SHENANIGANS' && (this.situationalState === 'COWARD_FLEE' || this.situationalState === 'HIDE_HEAL'));
        if (!cowardFleeing && !isTrainee) {
          const lead = WeaponsManager.computeLeadPosition(pos, vel, this.ac.target.mesh.position, this.ac.target.flight.velocity);
          _v3.subVectors(lead.leadPos, pos).normalize();
          const angleToAim = forward.angleTo(_v3);
          // Tight precision firing window (within ~4.3 degrees) so cannon rounds shred the target
          if (lead.dist < 1400 && angleToAim < 0.075 + this.diff.aimErrorRad) {
            wantFireGun = true;
          }
        }
      }

      const throttleDelta = desiredThrottle > this.ac.flight.throttle + 0.03
        ? 1
        : (desiredThrottle < this.ac.flight.throttle - 0.03 ? -1 : 0);

      // CRITICAL FIX: Use Horizon-Stabilized 3D Vector Steering (`mouseAimActive: true`) for AI jets too!
      // This prevents the inverted-roll upward-spiral bug and makes AI jets bank, dive, skim the canyon,
      // and fly cleanly through the low-altitude Flag Stands just like a real human player!
      return {
        pitch: 0,
        roll: this.stuntRollDir,
        yaw: 0,
        throttleDelta,
        boost: wantBoost,
        fireCannon: wantFireGun,
        mouseAimActive: true,
        mouseAimWorldDir: this.humanAimDir.clone()
      };
    }

    evaluateTargetsByPersonality(allAircraft, world, threat = null, isClutchSituation = false, game = null) {
      const pos = this.ac.mesh.position;
      const roleId = this.role.id;
      const isTutorialActive = Boolean(game && game.tutorial && game.tutorial.active);

      // If SHENANIGANS (the sneaky coward), prefer low-risk distracted/damaged targets!
      if (roleId === 'SHENANIGANS') {
        const sneakyVictim = this.findSneakyLowRiskTarget(allAircraft);
        if (sneakyVictim && !(isTutorialActive && sneakyVictim.isPlayer)) {
          this.ac.target = sneakyVictim;
          return;
        }
      }

      // Human retaliation instinct: if someone just shot me and I'm a Brawler or Defender, snap-target them!
      if ((roleId === 'BRAWLER' || roleId === 'FLAG_PROTECTOR') &&
          this.ac.lastAttacker && this.ac.lastAttacker.alive &&
          this.ac.lastAttacker.team !== this.ac.team && this.ac.timeSinceDamage < 3.5) {
        if (pos.distanceTo(this.ac.lastAttacker.mesh.position) < 2000) {
          if (!(isTutorialActive && this.ac.lastAttacker.isPlayer)) {
            this.ac.target = this.ac.lastAttacker;
            return;
          }
        }
      }

      // Find top scorer on enemy team
      let topEnemyScorer = null;
      let topEnemyScore = -1;
      for (const other of allAircraft) {
        if (other.alive && other.team !== this.ac.team) {
          if (isTutorialActive && other.isPlayer) continue;
          if (other.score > topEnemyScore) {
            topEnemyScore = other.score;
            topEnemyScorer = other;
          }
        }
      }

      let bestTarget = null;
      let bestScore = Infinity;

      for (const other of allAircraft) {
        if (!other.alive || other.team === this.ac.team) continue;
        // Flight School Trainee Immunity: Enemy bots focus on other wingmen while tutorial is active
        if (isTutorialActive && other.isPlayer) continue;
        const dist = pos.distanceTo(other.mesh.position);
        let priorityDist = dist * (0.85 + Math.random() * 0.20);

        // Flag carriers are the absolute #1 priority (+350 shutdown pts & prevents scoring!)
        if (other.carryingFlag) {
          priorityDist *= 0.05;
        }
        // Enemy Team Top Scorer (MVP): hunt down the opposing team's high-scoring ace!
        if (other === topEnemyScorer && topEnemyScore > 0) {
          priorityDist *= 0.28;
        }
        // High scoring hunger: hunt enemies on killstreaks for major streak-ender bonuses!
        if (other.killStreak >= 2) {
          priorityDist *= 0.48;
        }
        // Ruthless kill-stealing: finish off weakened smoking targets (< 40 HP)
        if (other.hp < 40) {
          priorityDist *= 0.40;
        }

        if (priorityDist < bestScore) {
          bestScore = priorityDist;
          bestTarget = other;
        }
      }

      this.ac.target = bestTarget;
    }
  }

  /* ============================================================================
   * 9B. PURE-CTF ADAPTIVE TEAM STRATEGIC COMMANDER (3 Core Flag Doctrines & Theft Reactivity)
   * ============================================================================
   */
  class TeamCommander {
    constructor(team) {
      this.team = team;
      this.currentDoctrine = 'SWARM_PUSH'; // 'SWARM_PUSH', 'SPLIT_INFILTRATION', 'HUNTER_KILLER'
      this.doctrineTimer = 0;
      this.doctrineKills = 0;
      this.doctrineDeaths = 0;
      this.doctrineCaps = 0;
      this.doctrineLosses = 0;
      this.flagHoldDuration = 0;
      this.flagStolenDuration = 0;
      this.consecutiveDeathsInDoctrine = 0;
      this.minSampleTime = 20.0; // 20s evaluation window
      this.minSampleEvents = 3;  // Minimum 3 casualties/captures before evaluating
      this.doctrineHistory = [];
    }

    reset() {
      this.currentDoctrine = 'SWARM_PUSH';
      this.doctrineTimer = 0;
      this.doctrineKills = 0;
      this.doctrineDeaths = 0;
      this.doctrineCaps = 0;
      this.doctrineLosses = 0;
      this.flagHoldDuration = 0;
      this.flagStolenDuration = 0;
      this.consecutiveDeathsInDoctrine = 0;
      this.doctrineHistory = [];
    }

    recordKill() {
      this.doctrineKills++;
      this.consecutiveDeathsInDoctrine = 0;
    }

    recordDeath() {
      this.doctrineDeaths++;
      this.consecutiveDeathsInDoctrine++;
    }

    recordCapture() {
      this.doctrineCaps++;
      this.flagHoldDuration = 0;
      this.consecutiveDeathsInDoctrine = 0;
    }

    recordLoss() {
      this.doctrineLosses++;
      this.flagStolenDuration = 0;
    }

    setDoctrine(newDoctrine, allAircraft) {
      if (newDoctrine === this.currentDoctrine) {
        this.applyDoctrineToSquadron(allAircraft);
        return;
      }
      this.doctrineHistory.push({
        doctrine: this.currentDoctrine,
        duration: this.doctrineTimer,
        kills: this.doctrineKills,
        deaths: this.doctrineDeaths,
        caps: this.doctrineCaps
      });
      this.currentDoctrine = newDoctrine;
      this.doctrineTimer = 0;
      this.doctrineKills = 0;
      this.doctrineDeaths = 0;
      this.doctrineCaps = 0;
      this.doctrineLosses = 0;
      this.consecutiveDeathsInDoctrine = 0;
      this.applyDoctrineToSquadron(allAircraft);
    }

    update(dt, allAircraft, world, game) {
      this.doctrineTimer += dt;

      const ownFlag = world && world.flags ? world.flags[this.team] : null;
      const enemyTeam = this.team === 'BLUE' ? 'RED' : 'BLUE';
      const enemyFlag = world && world.flags ? world.flags[enemyTeam] : null;

      const teamHoldsEnemyFlag = Boolean(enemyFlag && enemyFlag.state === 'CARRIED' && enemyFlag.carrier && enemyFlag.carrier.team === this.team);
      if (teamHoldsEnemyFlag) {
        this.flagHoldDuration += dt;
      } else {
        this.flagHoldDuration = 0;
      }

      const homeFlagStolen = Boolean(ownFlag && ownFlag.state === 'CARRIED');
      if (homeFlagStolen) {
        this.flagStolenDuration += dt;
      } else {
        this.flagStolenDuration = 0;
      }

      // 1. INSTANT THEFT REACTION:
      // The moment home flag is stolen, activate HUNTER_KILLER immediately!
      if (homeFlagStolen) {
        if (this.currentDoctrine !== 'HUNTER_KILLER') {
          this.setDoctrine('HUNTER_KILLER', allAircraft);
          return;
        }
      } else if (this.currentDoctrine === 'HUNTER_KILLER' && !homeFlagStolen) {
        // Stolen flag recovered! Immediate transition back to offensive strategies
        if (teamHoldsEnemyFlag) {
          // We still hold their flag! Swarm Push & Convoy to finish the capture!
          this.setDoctrine('SWARM_PUSH', allAircraft);
          return;
        } else {
          this.setDoctrine('SPLIT_INFILTRATION', allAircraft);
          return;
        }
      }

      // 2. SAFE-FLAG EFFICIENCY THRESHOLD EVALUATION:
      const totalEvents = this.doctrineKills + this.doctrineDeaths + this.doctrineCaps + this.doctrineLosses;
      if (this.doctrineTimer < this.minSampleTime && totalEvents < this.minSampleEvents) {
        // Even within sample time, refresh bot roles dynamically if carrier status changed
        this.applyDoctrineToSquadron(allAircraft);
        return;
      }

      const weightedNumerator = this.doctrineKills + 3.0 * this.doctrineCaps;
      const weightedDenominator = Math.max(1, this.doctrineDeaths + 3.0 * this.doctrineLosses);
      let efficiency = weightedNumerator / weightedDenominator;

      // Penalize long flag hold without scoring (stalemate / enemy defense too tight)
      if (this.flagHoldDuration > 35.0) {
        efficiency -= 0.40;
      }

      const isTrailing = game ? (game.teamCaptures[this.team] < game.teamCaptures[enemyTeam]) : false;

      if (efficiency < 0.85 || this.consecutiveDeathsInDoctrine >= 3) {
        if (this.currentDoctrine === 'SWARM_PUSH') {
          this.setDoctrine('SPLIT_INFILTRATION', allAircraft);
        } else if (this.currentDoctrine === 'SPLIT_INFILTRATION') {
          this.setDoctrine('SWARM_PUSH', allAircraft);
        }
      } else if (isTrailing && this.currentDoctrine !== 'SWARM_PUSH' && this.doctrineTimer > 35.0) {
        this.setDoctrine('SWARM_PUSH', allAircraft);
      } else {
        this.applyDoctrineToSquadron(allAircraft);
      }
    }

    applyDoctrineToSquadron(allAircraft) {
      const teamBots = allAircraft.filter(a => !a.isPlayer && a.team === this.team && a.ai);
      if (teamBots.length === 0) return;

      let friendlyCarrier = null;
      let enemyCarrier = null;

      for (const a of allAircraft) {
        if (!a.alive || !a.carryingFlag) continue;
        if (a.team === this.team) friendlyCarrier = a;
        else enemyCarrier = a;
      }

      if (this.currentDoctrine === 'SWARM_PUSH') {
        // STRATEGY 1: Swarm Push & Convoy
        // Charge forward together to claim flag; whichever plane captures, all teammates escort it!
        if (friendlyCarrier) {
          // ALL non-carrier bots escort the carrier!
          teamBots.forEach((bot, idx) => {
            if (bot !== friendlyCarrier) {
              bot.ai.role = CONFIG.ROLES[2]; // ESCORT_WING
            }
          });
        } else {
          // Push forward together to seize flag
          teamBots.forEach((bot, idx) => {
            if (idx === 0) bot.ai.role = CONFIG.ROLES[1]; // 1 BASE_GUARDIAN anchor
            else bot.ai.role = CONFIG.ROLES[0];           // Remaining jets FLAG_RUNNER charge
          });
        }
      } else if (this.currentDoctrine === 'SPLIT_INFILTRATION') {
        // STRATEGY 2: Split Infiltration & Forward Screen
        // 2 flank runners sneak via canyon wings; others establish midfield forward screen
        if (friendlyCarrier) {
          teamBots.forEach((bot, idx) => {
            if (bot !== friendlyCarrier) {
              bot.ai.role = (idx < 2) ? CONFIG.ROLES[2] : CONFIG.ROLES[1]; // ESCORT_WING / BASE_GUARDIAN
            }
          });
        } else {
          teamBots.forEach((bot, idx) => {
            if (idx < 2) bot.ai.role = CONFIG.ROLES[3];        // 2 STEALTH_FLANKER
            else if (idx === 2) bot.ai.role = CONFIG.ROLES[0]; // 1 FLAG_RUNNER
            else bot.ai.role = CONFIG.ROLES[1];                 // BASE_GUARDIAN screen
          });
        }
      } else if (this.currentDoctrine === 'HUNTER_KILLER') {
        // STRATEGY 3: Hunter-Killer Retrieval Pack
        // Immediate counter-attack to retrieve stolen flag!
        if (enemyCarrier) {
          // Sort available bots by proximity to enemy carrier
          const sorted = [...teamBots].sort((a, b) => {
            return a.mesh.position.distanceToSquared(enemyCarrier.mesh.position) -
                   b.mesh.position.distanceToSquared(enemyCarrier.mesh.position);
          });
          sorted.forEach((bot, idx) => {
            if (bot === friendlyCarrier) {
              bot.ai.role = CONFIG.ROLES[1]; // Protect self near base while holding enemy flag
            } else if (idx < 3) {
              bot.ai.role = CONFIG.ROLES[4]; // HUNTER_KILLER: pincer intercept
            } else if (friendlyCarrier) {
              bot.ai.role = CONFIG.ROLES[2]; // ESCORT_WING: guard our carrier
            } else {
              bot.ai.role = CONFIG.ROLES[3]; // STEALTH_FLANKER: steal enemy flag on counter
            }
          });
        } else {
          teamBots.forEach((bot, idx) => {
            bot.ai.role = (idx === 0) ? CONFIG.ROLES[0] : CONFIG.ROLES[4];
          });
        }
      }
    }
  }

window.AIBotController = AIBotController;
window.TeamCommander = TeamCommander;
