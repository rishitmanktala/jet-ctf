"use strict";

  /* ============================================================================
   * 7. PARTICLES & VISUAL EFFECTS (Bullet-Hit Shockwave Rings, Sparks & Wrecks)
   * ============================================================================
   */
  class ParticleManager {
    constructor(scene) {
      this.scene = scene;
      this.particles = [];
      this.pool = [];
      this.shockRings = [];
      this.wrecks = [];
      this.sharedGeo = new THREE.BoxGeometry(1, 1, 1);
      this.ringGeo = new THREE.TorusGeometry(1.0, 0.08, 8, 24);
    }

    acquireParticleMesh(colorHex, additive) {
      let mesh;
      if (this.pool.length > 0) {
        mesh = this.pool.pop();
        const mat = mesh.material;
        mat.color.setHex(colorHex);
        mat.opacity = 0.90;
        const targetBlending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
        if (mat.blending !== targetBlending) {
          mat.blending = targetBlending;
          mat.needsUpdate = true;
        }
        mesh.visible = true;
      } else {
        const mat = new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.90,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          depthWrite: false
        });
        mesh = new THREE.Mesh(this.sharedGeo, mat);
      }
      this.scene.add(mesh);
      return mesh;
    }

    releaseParticleMesh(mesh) {
      this.scene.remove(mesh);
      mesh.visible = false;
      this.pool.push(mesh);
    }

    spawnParticle(pos, vel, colorHex, sizeStart, sizeEnd, life, additive = false) {
      if (this.particles.length > 520) return;
      const mesh = this.acquireParticleMesh(colorHex, additive);
      mesh.position.copy(pos);
      mesh.scale.setScalar(sizeStart);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);

      this.particles.push({
        mesh,
        vel: vel.clone(),
        sizeStart,
        sizeEnd,
        age: 0,
        life
      });
    }

    spawnBulletImpact(pos, planeVel, isPlayerVictim = false) {
      // 1. Bright incandescent flash core at the bullet impact point
      this.spawnParticle(
        pos,
        planeVel ? planeVel.clone().multiplyScalar(0.5) : _v4.set(0, 0, 0),
        0xffffff,
        isPlayerVictim ? 4.5 : 5.5,
        isPlayerVictim ? 14.0 : 18.0,
        0.18,
        true
      );

      // 2. Expanding 3D Impact Shockwave Ring around the bullet strike
      const ringMat = new THREE.MeshBasicMaterial({
        color: isPlayerVictim ? 0xff3b47 : 0xfbbf24,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
      ringMesh.position.copy(pos);
      ringMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      this.scene.add(ringMesh);
      this.shockRings.push({
        mesh: ringMesh,
        age: 0,
        life: 0.26,
        startScale: 2.2,
        endScale: isPlayerVictim ? 13.5 : 16.5
      });

      // 3. Shower of electric welding sparks & glowing armor shrapnel flying into the slipstream
      const sparkCount = isPlayerVictim ? 16 : 14;
      for (let i = 0; i < sparkCount; i++) {
        const sparkVel = new THREE.Vector3(
          (Math.random() - 0.5) * 95,
          (Math.random() - 0.35) * 95,
          (Math.random() - 0.5) * 95
        );
        if (planeVel) {
          sparkVel.addScaledVector(planeVel, 0.35);
        }
        const sparkColor = i % 3 === 0 ? 0xffffff : (i % 2 === 0 ? 0xff3b47 : 0xfbbf24);
        this.spawnParticle(
          pos,
          sparkVel,
          sparkColor,
          isPlayerVictim ? 1.4 : 1.8,
          0.3,
          0.25 + Math.random() * 0.22,
          true
        );
      }
    }

    spawnExplosion(pos, scale = 1.0) {
      // 1. Superheated Core Flash
      this.spawnParticle(pos, _v4.set(0, 0, 0), 0xffffff, 12 * scale, 52 * scale, 0.32, true);

      // 2. Expanding Shockwave Ring
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffaa33,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
      ringMesh.position.copy(pos);
      ringMesh.rotation.set(Math.PI * 0.5, 0, 0);
      this.scene.add(ringMesh);
      this.shockRings.push({
        mesh: ringMesh,
        age: 0,
        life: 0.38,
        startScale: 3.5 * scale,
        endScale: 42.0 * scale
      });

      // 3. Multi-Layer Expanding Fiery Fireball Cloud
      for (let i = 0; i < 28; i++) {
        const dir = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize().multiplyScalar((18 + Math.random() * 85) * scale);
        const col = i % 3 === 0 ? 0xffea00 : (i % 2 === 0 ? 0xff5511 : 0xff2200);
        this.spawnParticle(
          pos,
          dir,
          col,
          (4 + Math.random() * 5) * scale,
          (18 + Math.random() * 18) * scale,
          0.75 + Math.random() * 0.9,
          true
        );
      }

      // 4. Heavy Billowing Dark Smoke Plume
      for (let i = 0; i < 20; i++) {
        const dir = new THREE.Vector3(
          (Math.random() - 0.5) * 35,
          8 + Math.random() * 25,
          (Math.random() - 0.5) * 35
        ).multiplyScalar(scale);
        this.spawnParticle(
          pos,
          dir,
          0x1a202c,
          (6 + Math.random() * 6) * scale,
          (26 + Math.random() * 20) * scale,
          1.4 + Math.random() * 1.0,
          false
        );
      }

      // 5. Burning Shrapnel Sparks
      for (let i = 0; i < 16; i++) {
        const dir = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() * 0.8,
          Math.random() - 0.5
        ).normalize().multiplyScalar((45 + Math.random() * 90) * scale);
        this.spawnParticle(
          pos,
          dir,
          0xffbb22,
          1.8 * scale,
          0.4 * scale,
          0.5 + Math.random() * 0.45,
          true
        );
      }

      // 6. Camera Shake if player is near explosion
      if (this.game && this.game.player && this.game.player.alive) {
        const dist = pos.distanceTo(this.game.player.mesh.position);
        if (dist < 650) {
          const intensity = Math.max(0.1, 1.2 * (1.0 - dist / 650));
          this.game.addCamShake(0.24, intensity);
        }
      }
    }

    spawnFallingWreck(aircraftMesh, velocity) {
      const wreck = aircraftMesh.clone();
      wreck.visible = true;
      this.scene.add(wreck);
      this.wrecks.push({
        mesh: wreck,
        vel: velocity.clone().multiplyScalar(0.65),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 3.5,
          (Math.random() - 0.5) * 2.0,
          (Math.random() - 0.5) * 4.5
        ),
        age: 0,
        maxLife: 7.5,
        smokeTimer: 0
      });
    }

    update(dt, world) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.age += dt;
        if (p.age >= p.life) {
          this.releaseParticleMesh(p.mesh);
          this.particles.splice(i, 1);
          continue;
        }
        const t = p.age / p.life;
        p.mesh.position.addScaledVector(p.vel, dt);
        const s = p.sizeStart + (p.sizeEnd - p.sizeStart) * t;
        p.mesh.scale.setScalar(s);
        p.mesh.material.opacity = (1.0 - t) * 0.90;
      }

      for (let i = this.shockRings.length - 1; i >= 0; i--) {
        const r = this.shockRings[i];
        r.age += dt;
        if (r.age >= r.life) {
          this.scene.remove(r.mesh);
          r.mesh.material.dispose();
          this.shockRings.splice(i, 1);
          continue;
        }
        const t = r.age / r.life;
        const scale = r.startScale + (r.endScale - r.startScale) * t;
        r.mesh.scale.setScalar(scale);
        r.mesh.material.opacity = (1.0 - t) * 0.92;
      }

      for (let i = this.wrecks.length - 1; i >= 0; i--) {
        const w = this.wrecks[i];
        w.age += dt;
        w.vel.y -= CONFIG.PHYSICS.gravity * 1.25 * dt;
        w.mesh.position.addScaledVector(w.vel, dt);
        w.mesh.rotateX(w.rotVel.x * dt);
        w.mesh.rotateY(w.rotVel.y * dt);
        w.mesh.rotateZ(w.rotVel.z * dt);

        w.smokeTimer += dt;
        if (w.smokeTimer > 0.05) {
          w.smokeTimer = 0;
          this.spawnParticle(
            w.mesh.position,
            _v4.set((Math.random() - 0.5) * 8, 6, (Math.random() - 0.5) * 8),
            Math.random() > 0.4 ? 0x222222 : 0xff5500,
            3.5,
            15.0,
            1.1,
            Math.random() <= 0.4
          );
        }

        const groundY = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(w.mesh.position.x, w.mesh.position.z));
        if (w.mesh.position.y <= groundY || w.age >= w.maxLife) {
          this.spawnExplosion(w.mesh.position, 1.3);
          this.scene.remove(w.mesh);
          this.wrecks.splice(i, 1);
        }
      }
    }

    clear() {
      for (const p of this.particles) this.releaseParticleMesh(p.mesh);
      for (const r of this.shockRings) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
      }
      for (const w of this.wrecks) this.scene.remove(w.mesh);
      this.particles = [];
      this.shockRings = [];
      this.wrecks = [];
    }
  }

window.ParticleManager = ParticleManager;
