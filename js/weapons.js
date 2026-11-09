"use strict";

  /* ============================================================================
   * 8. WEAPONS SYSTEM (Smart Lead-Assist Cannon + Overdrive Twin Plasma Streams)
   * ============================================================================
   */
  class WeaponsManager {
    constructor(scene, particles, audio, game = null) {
      this.scene = scene;
      this.particles = particles;
      this.audio = audio;
      this.game = game;
      this.bullets = [];

      this.bulletGeo = new THREE.BoxGeometry(0.48, 0.48, 13.0);
      this.bulletMatBlue = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      this.bulletMatRed  = new THREE.MeshBasicMaterial({ color: 0xff4757 });
      this.bulletMatGold = new THREE.MeshBasicMaterial({ color: 0x00ff9d });
      this.bulletMatOverdrive = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
      this.playerTracerMat = this.bulletMatGold;
    }

    setPlayerTracerColor(hex) {
      this.playerTracerMat = new THREE.MeshBasicMaterial({ color: hex });
    }

    static computeLeadPosition(shooterPos, shooterVel, targetPos, targetVel) {
      const dist = shooterPos.distanceTo(targetPos);
      const bulletSpeed = CONFIG.WEAPONS.CANNON.muzzleSpeed + shooterVel.length() * 0.5;
      const tFlight = dist / Math.max(250, bulletSpeed);
      const leadPos = targetPos.clone().addScaledVector(targetVel, tFlight);
      leadPos.y += 0.5 * CONFIG.WEAPONS.CANNON.gravityDrop * tFlight * tFlight;
      return { leadPos, tFlight, dist };
    }

    fireCannon(aircraft, aimDirOverride = null, aimJitterRad = 0) {
      const cfg = CONFIG.WEAPONS.CANNON;
      if (aircraft.cannonCooldown > 0) return false;

      const fireRate = aircraft.stats ? (aircraft.stats.cannonFireRate || cfg.fireRate) : cfg.fireRate;
      const muzzleSpeed = aircraft.stats ? (aircraft.stats.cannonMuzzleSpeed || cfg.muzzleSpeed) : cfg.muzzleSpeed;
      const bulletDamage = aircraft.stats ? (aircraft.stats.cannonDamage || cfg.damage) : cfg.damage;

      const isOverdrive = aircraft.overdriveTimer > 0;
      const rateMult = isOverdrive ? 1.55 : 1.0;
      aircraft.cannonCooldown = 1.0 / (fireRate * rateMult);
      aircraft.shotCounter = (aircraft.shotCounter || 0) + 1;
      if (aircraft.isPlayer) {
        aircraft.shotsFired++;
        this.audio.playCannonBurst(isOverdrive);
        if (this.game) {
          this.game.addCamShake(0.045, 0.22);
        }
      }

      const forward = aimDirOverride
        ? aimDirOverride.clone().normalize()
        : new THREE.Vector3(0, 0, -1).applyQuaternion(aircraft.mesh.quaternion);

      if (aimJitterRad > 0) {
        forward.x += (Math.random() - 0.5) * aimJitterRad;
        forward.y += (Math.random() - 0.5) * aimJitterRad;
        forward.z += (Math.random() - 0.5) * aimJitterRad;
        forward.normalize();
      }

      _v1.set(1, 0, 0).applyQuaternion(aircraft.mesh.quaternion);
      const _up = new THREE.Vector3(0, 1, 0).applyQuaternion(aircraft.mesh.quaternion);
      const mat = aircraft.isPlayer
        ? (isOverdrive ? this.bulletMatOverdrive : this.playerTracerMat)
        : (aircraft.team === 'BLUE' ? this.bulletMatBlue : this.bulletMatRed);

      const isTitan = aircraft.typeId === 'TITAN';
      const scaleMult = 1.75;

      // Titan GAU-8 fires from centered chin Gatling cannon (X = 0, Y = -0.48, forward = 8.85m)
      // Other fighters fire from alternating wingtip/fuselage hardpoints
      const offsets = isTitan
        ? (isOverdrive ? [-0.22 * scaleMult, 0.22 * scaleMult] : [0])
        : (isOverdrive ? [-1.6 * scaleMult, 1.6 * scaleMult] : [(aircraft.shotCounter % 2 === 0 ? 1.35 * scaleMult : -1.35 * scaleMult)]);

      const vertOffset = (isTitan ? -0.48 : 0) * scaleMult;
      const forwardDist = (isTitan ? 8.85 : 8.5) * scaleMult;

      for (const sideOffset of offsets) {
        const spawnPos = aircraft.mesh.position.clone()
          .addScaledVector(forward, forwardDist)
          .addScaledVector(_v1, sideOffset)
          .addScaledVector(_up, vertOffset);

        const mesh = new THREE.Mesh(this.bulletGeo, mat);
        mesh.position.copy(spawnPos);
        _v2.copy(spawnPos).add(forward);
        mesh.lookAt(_v2);
        this.scene.add(mesh);

        const vel = forward.clone().multiplyScalar(muzzleSpeed).add(aircraft.flight.velocity);
        this.bullets.push({
          mesh,
          vel,
          owner: aircraft,
          damage: bulletDamage,
          age: 0,
          maxLife: cfg.lifetime
        });
      }
      return true;
    }

    update(dt, aircraftList, world, onDamageCallback) {
      const bCfg = CONFIG.WEAPONS.CANNON;
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        b.age += dt;
        if (b.age >= b.maxLife) {
          this.scene.remove(b.mesh);
          this.bullets.splice(i, 1);
          continue;
        }

        _v1.copy(b.mesh.position);
        b.vel.y -= bCfg.gravityDrop * dt;
        b.mesh.position.addScaledVector(b.vel, dt);

        // Team-based CTF collision check against enemy aircraft (Physical Contact Accuracy)
        let hit = false;
        for (const ac of aircraftList) {
          if (!ac.alive || ac === b.owner || ac.team === b.owner.team) continue;
          if (this.checkAirframeHit(ac, _v1, b.mesh.position)) {
            hit = true;
            if (b.owner.isPlayer) b.owner.cannonHits++;
            // Trigger 3D Bullet Impact Animation at the strike point!
            this.particles.spawnBulletImpact(b.mesh.position, ac.flight.velocity, ac.isPlayer);
            onDamageCallback(ac, b.owner, b.damage || bCfg.damage, 'Rotary Cannon', b.mesh.position);
            break;
          }
        }

        const groundY = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(b.mesh.position.x, b.mesh.position.z));
        if (hit || b.mesh.position.y <= groundY) {
          if (!hit && b.mesh.position.y <= groundY) {
            this.particles.spawnParticle(b.mesh.position, _v2.set(0, 5, 0), 0x38bdf8, 2.0, 6.5, 0.25, true);
          }
          this.scene.remove(b.mesh);
          this.bullets.splice(i, 1);
        }
      }
    }

    pointToSegmentDistSq(p, a, b) {
      _v2.subVectors(b, a);
      _v3.subVectors(p, a);
      const lenSq = _v2.lengthSq();
      if (lenSq === 0) return _v3.lengthSq();
      const t = Math.max(0, Math.min(1, _v3.dot(_v2) / lenSq));
      _v4.copy(a).addScaledVector(_v2, t);
      return p.distanceToSquared(_v4);
    }

    // Physical Contact Airframe Hit Test (Damage ONLY when bullets physically touch the aircraft)
    checkAirframeHit(ac, segStart, segEnd) {
      // Broad-phase bounding sphere check (~18m around 1.75x scaled aircraft center)
      const distSq = this.pointToSegmentDistSq(ac.mesh.position, segStart, segEnd);
      if (distSq > 324) return false;

      // Narrow-phase true physical mesh volume & plane intersection in aircraft local space
      if (!this._invQuat) this._invQuat = new THREE.Quaternion();
      this._invQuat.copy(ac.mesh.quaternion).invert();

      if (!this._localA) this._localA = new THREE.Vector3();
      if (!this._localB) this._localB = new THREE.Vector3();
      if (!this._segDir) this._segDir = new THREE.Vector3();

      this._localA.subVectors(segStart, ac.mesh.position).applyQuaternion(this._invQuat);
      this._localB.subVectors(segEnd, ac.mesh.position).applyQuaternion(this._invQuat);
      this._segDir.subVectors(this._localB, this._localA);

      const lenSq = this._segDir.lengthSq();
      let t = 0;
      if (lenSq > 0) {
        t = Math.max(0, Math.min(1, -(this._localA.x * this._segDir.x + this._localA.y * this._segDir.y + this._localA.z * this._segDir.z) / lenSq));
      }

      // Closest point along bullet trajectory to aircraft center
      const cx = this._localA.x + t * this._segDir.x;
      const cy = this._localA.y + t * this._segDir.y;
      const cz = this._localA.z + t * this._segDir.z;

      // Airframe bounds for 1.75x scaled aircraft
      const isSpectre = ac.typeId === 'SPECTRE';
      const wingHalfSpan = isSpectre ? 14.5 : 12.2;

      // 1. Fuselage volume (nose-to-tail armored cylinder/box)
      if (Math.abs(cx) <= 2.4 && cy >= -2.4 && cy <= 3.6 && cz >= -15.5 && cz <= 12.0) return true;

      // 2. Main Wings volume (swept lifting surfaces)
      if (Math.abs(cx) <= wingHalfSpan && Math.abs(cy) <= 1.6 && cz >= -7.0 && cz <= 10.0) return true;

      // 3. Vertical Tail Stabilizers & Engine Nacelles
      if (Math.abs(cx) <= 4.2 && cy >= 0.2 && cy <= 5.4 && cz >= 1.0 && cz <= 12.0) return true;

      // 4. Continuous high-velocity swept-plane penetration check
      // Did bullet segment cross the horizontal wing plane (Y ≈ 0) within wing bounds?
      if (this._localA.y * this._localB.y <= 0 && Math.abs(this._segDir.y) > 0.001) {
        const ty = -this._localA.y / this._segDir.y;
        if (ty >= 0 && ty <= 1) {
          const px = this._localA.x + ty * this._segDir.x;
          const pz = this._localA.z + ty * this._segDir.z;
          if (Math.abs(px) <= wingHalfSpan && pz >= -7.0 && pz <= 10.0) return true;
        }
      }

      // Did bullet segment cross the vertical fuselage plane (X ≈ 0) within hull bounds?
      if (this._localA.x * this._localB.x <= 0 && Math.abs(this._segDir.x) > 0.001) {
        const tx = -this._localA.x / this._segDir.x;
        if (tx >= 0 && tx <= 1) {
          const py = this._localA.y + tx * this._segDir.y;
          const pz = this._localA.z + tx * this._segDir.z;
          if (py >= -2.4 && py <= 3.6 && pz >= -15.5 && pz <= 12.0) return true;
        }
      }

      return false;
    }

    clear() {
      for (const b of this.bullets) this.scene.remove(b.mesh);
      this.bullets = [];
    }
  }

window.WeaponsManager = WeaponsManager;
