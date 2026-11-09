"use strict";

  /* ============================================================================
   * 6. FLIGHT MODEL (Horizon-Stabilized Mouse-Aim, Auto-Level & Barrel Roll Dodge)
   * ============================================================================
   */
  class FlightModel {
    constructor(stats) {
      this.stats = stats;
      this.speed = stats.cruiseSpeed;
      this.throttle = 0.72;
      this.isBoosting = false;
      this.isAirBraking = false;
      this.velocity = new THREE.Vector3(0, 0, -this.speed);
      this.heading = 0;      // Yaw angle (radians, YXZ order)
      this.elevation = 0;    // Pitch angle (radians, clamped so plane never flips upside-down)
      this.bank = 0;         // Roll angle (radians)
      this.pitchVel = 0;
      this.rollVel = 0;
      this.yawVel = 0;
      this.gForce = 1.0;
      this.aoa = 0;
      this.isStalling = false;
      this.outOfBoundsWarning = false;
      this.autopilotOverride = false;
    }

    update(dt, mesh, controls, boostActive, world = null, aircraft = null) {
      const phys = CONFIG.PHYSICS;
      const st = this.stats;
      this.isBoosting = Boolean(boostActive);
      this.isAirBraking = Boolean(controls.throttleDelta < 0 && !this.isBoosting);

      // 1. Update throttle via W and S keys (0.0 to 1.0)
      if (controls.throttleDelta !== 0) {
        this.throttle = Math.max(0.0, Math.min(1.0, this.throttle + controls.throttleDelta * 0.70 * dt));
      }

      // 2. World Boundary Protection & Auto Turn-Back
      const pos = mesh.position;
      const horizDist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
      this.outOfBoundsWarning = horizDist > CONFIG.WORLD.softBoundary || pos.y > CONFIG.WORLD.maxAltitude;
      this.autopilotOverride = horizDist > CONFIG.WORLD.hardBoundary || pos.y > CONFIG.WORLD.maxAltitude + 400;

      // 3. Stall Check
      if (this.speed < phys.stallSpeed && !this.isBoosting) {
        this.isStalling = true;
      } else if (this.speed > phys.recoverySpeed || this.isBoosting) {
        this.isStalling = false;
      }

      // 4. Control Authority + High-G Air-Brake Turn Boost (+38% turn rate when holding S!)
      let authority = 1.0;
      if (this.speed < phys.optimalSpeed) {
        const ratio = Math.max(0.55, (this.speed - 30) / (phys.optimalSpeed - 30));
        authority = Math.pow(ratio, 0.75 / st.lowSpeedAgility);
      }
      if (this.isAirBraking) {
        authority *= 1.38; // High-G Air-Brake Drift Turn!
      }
      if (this.isStalling) authority *= 0.65;

      // 5. FLIGHT STEERING (Player Rate-Based Attitude Retention vs AI Target Tracking)
      if (controls.mouseAimActive && controls.mouseAimWorldDir) {
        if (aircraft && aircraft.isPlayer && !this.autopilotOverride) {
          // PLAYER: Attitude & Pitch Retention Flight Mode
          // Moving mouse off-center applies turn and climb/dive rotation rates.
          // Centering mouse or stopping movement maintains the EXACT current elevation and heading!
          // Zero horizon auto-snapping!
          const deadzone = 0.035;
          const sX = controls.steerX || 0;
          const sY = controls.steerY || 0;
          const mag = Math.hypot(sX, sY);

          let steerFactorX = 0;
          let steerFactorY = 0;
          if (mag > deadzone) {
            const norm = Math.min(1.0, (mag - deadzone) / (1.0 - deadzone));
            const curved = norm * norm; // Quadratic response curve: gentle near center, responsive at edges
            steerFactorX = (sX / mag) * curved;
            steerFactorY = (sY / mag) * curved;
          }

          // Combine with Arrow keys
          const totalPitchInput = Math.max(-1, Math.min(1, steerFactorY + (controls.pitch || 0)));
          const totalYawInput = Math.max(-1, Math.min(1, steerFactorX + (controls.yaw || 0)));

          const maxTurnRate = st.yawRate * 1.55 * authority;
          const maxPitchRate = st.pitchRate * 1.55 * authority;

          const desiredYawVel = -totalYawInput * maxTurnRate;
          const desiredPitchVel = totalPitchInput * maxPitchRate;

          // Responsive lerp to desired rotation velocities
          this.yawVel += (desiredYawVel - this.yawVel) * Math.min(1, 14.0 * dt);
          this.pitchVel += (desiredPitchVel - this.pitchVel) * Math.min(1, 14.0 * dt);

          // Damp to exact 0 when input is 0 to avoid micro-drift
          if (Math.abs(desiredYawVel) < 0.001 && Math.abs(this.yawVel) < 0.01) this.yawVel = 0;
          if (Math.abs(desiredPitchVel) < 0.001 && Math.abs(this.pitchVel) < 0.01) this.pitchVel = 0;

          const maxPitch = 1.38; // ~79 degrees max climb/dive
          this.heading += this.yawVel * dt;
          this.elevation = Math.max(-maxPitch, Math.min(maxPitch, this.elevation + this.pitchVel * dt));

          // Natural Aerodynamic Roll Recovery with smooth exponential damping:
          if (controls.roll !== 0) {
            const rollInput = -controls.roll;
            const targetRollRate = rollInput * (st.rollRate || 4.2) * 0.95;
            this.rollVel += (targetRollRate - this.rollVel) * Math.min(1.0, 12.0 * dt);
            this.bank = Math.atan2(Math.sin(this.bank + this.rollVel * dt), Math.cos(this.bank + this.rollVel * dt));
          } else {
            // Smoothly damp residual roll inertia
            this.rollVel *= Math.exp(-7.5 * dt);
            // Coordinated banking organically proportional to yaw turn rate
            const targetNaturalBank = Math.max(-0.92, Math.min(0.92, -this.yawVel * 0.40));
            const bankDiff = Math.atan2(Math.sin(targetNaturalBank - this.bank), Math.cos(targetNaturalBank - this.bank));
            // Aerodynamic leveling torque scaled by dynamic airspeed ratio
            const speedRatio = Math.max(0.4, Math.min(1.4, this.speed / (st.cruiseSpeed || 320)));
            const recoveryRate = 3.2 * speedRatio;
            const step = bankDiff * (1.0 - Math.exp(-recoveryRate * dt));
            this.bank = Math.atan2(Math.sin(this.bank + step + this.rollVel * dt), Math.cos(this.bank + step + this.rollVel * dt));
          }

          _euler1.set(this.elevation, this.heading, this.bank, 'YXZ');
          mesh.quaternion.setFromEuler(_euler1);
        } else {
          // AI Bot or Autopilot Override Steering
          let targetDir = controls.mouseAimWorldDir;
          if (this.autopilotOverride) {
            targetDir = _v1.set(-pos.x, 700 - pos.y, -pos.z).normalize();
          }

          const targetHeading = Math.atan2(-targetDir.x, -targetDir.z);
          const maxPitch = 1.28; // ~73 degrees max climb/dive so the plane never flips inverted!
          const targetElevation = Math.max(-maxPitch, Math.min(maxPitch, Math.asin(Math.max(-0.98, Math.min(0.98, targetDir.y)))));

          const headingDiff = Math.atan2(Math.sin(targetHeading - this.heading), Math.cos(targetHeading - this.heading));

          const pitchDiff = targetElevation - this.elevation;

          const maxTurnRate = st.yawRate * 1.55 * authority;
          const maxPitchRate = st.pitchRate * 1.55 * authority;

          // Direct Mouse Aim tracking
          const sens = (st.mouseSens || 1.0);
          const desiredYawVel = Math.max(-maxTurnRate, Math.min(maxTurnRate, headingDiff * 6.5 * sens));
          const desiredPitchVel = Math.max(-maxPitchRate, Math.min(maxPitchRate, pitchDiff * 6.5 * sens));

          this.yawVel += (desiredYawVel - this.yawVel) * Math.min(1, 14.0 * dt);
          this.pitchVel += (desiredPitchVel - this.pitchVel) * Math.min(1, 14.0 * dt);

          this.heading += this.yawVel * dt;
          this.elevation = Math.max(-maxPitch, Math.min(maxPitch, this.elevation + this.pitchVel * dt));

          // Natural Aerodynamic Roll Recovery with smooth exponential damping:
          if (controls.roll !== 0) {
            const rollInput = -controls.roll;
            const targetRollRate = rollInput * (st.rollRate || 4.2) * 0.95;
            this.rollVel += (targetRollRate - this.rollVel) * Math.min(1.0, 12.0 * dt);
            this.bank = Math.atan2(Math.sin(this.bank + this.rollVel * dt), Math.cos(this.bank + this.rollVel * dt));
          } else {
            // Smoothly damp residual roll inertia
            this.rollVel *= Math.exp(-7.5 * dt);
            // Coordinated banking organically proportional to yaw turn rate
            const targetNaturalBank = Math.max(-0.92, Math.min(0.92, -this.yawVel * 0.40));
            const bankDiff = Math.atan2(Math.sin(targetNaturalBank - this.bank), Math.cos(targetNaturalBank - this.bank));
            // Aerodynamic leveling torque scaled by dynamic airspeed ratio
            const speedRatio = Math.max(0.4, Math.min(1.4, this.speed / (st.cruiseSpeed || 320)));
            const recoveryRate = 3.2 * speedRatio;
            const step = bankDiff * (1.0 - Math.exp(-recoveryRate * dt));
            this.bank = Math.atan2(Math.sin(this.bank + step + this.rollVel * dt), Math.cos(this.bank + step + this.rollVel * dt));
          }

          _euler1.set(this.elevation, this.heading, this.bank, 'YXZ');
          mesh.quaternion.setFromEuler(_euler1);
        }
      } else {
        // AI Bot Quaternion Steering
        let pitchIn = controls.pitch;
        let rollIn = controls.roll;
        let yawIn = controls.yaw;

        if (this.autopilotOverride) {
          _v1.set(-pos.x, 900 - pos.y, -pos.z).normalize();
          _q1.copy(mesh.quaternion).invert();
          _v2.copy(_v1).applyQuaternion(_q1);
          rollIn = Math.max(-1, Math.min(1, Math.atan2(_v2.x, _v2.y) * 2.2));
          pitchIn = Math.max(-1, Math.min(1, _v2.y * 2.2));
          if (_v2.z > 0 && Math.abs(_v2.y) < 0.25) pitchIn = 1.0;
        }

        const targetPitchVel = pitchIn * st.pitchRate * authority;
        const targetRollVel = -rollIn * st.rollRate * authority;
        const targetYawVel = -yawIn * st.yawRate * authority;

        this.pitchVel += (targetPitchVel - this.pitchVel) * Math.min(1, phys.pitchDamping * dt);
        this.rollVel += (targetRollVel - this.rollVel) * Math.min(1, phys.rollDamping * dt);
        this.yawVel += (targetYawVel - this.yawVel) * Math.min(1, phys.yawDamping * dt);

        mesh.rotateX(this.pitchVel * dt);
        mesh.rotateZ(this.rollVel * dt);
        mesh.rotateY(this.yawVel * dt);

        _euler1.setFromQuaternion(mesh.quaternion, 'YXZ');
        this.heading = _euler1.y;
        this.elevation = _euler1.x;
        this.bank = _euler1.z;
      }

      _v1.set(0, 0, -1).applyQuaternion(mesh.quaternion); // forward
      _v2.set(0, 1, 0).applyQuaternion(mesh.quaternion);  // up

      // 6. Thrust, Shift Boost & Rebalanced Speed Envelope:
      // Non-boost top speed is much lower (245 / 230) for easy dogfighting,
      // while Shift Boost top speed stays at the exact same blistering 655 / 624!
      const effectiveThrottle = this.isBoosting ? 1.0 : this.throttle;
      const isAB = effectiveThrottle > 0.78 || this.isBoosting;
      let thrustMag = isAB
        ? st.baseThrust + ((effectiveThrottle - 0.78) / 0.22) * (st.abThrust - st.baseThrust)
        : effectiveThrottle * st.baseThrust;

      if (this.isBoosting) {
        thrustMag *= CONFIG.BOOST.thrustMultiplier;
      }

      const boostTopSpeed = st.boostMaxSpeed || (st.maxSpeed * CONFIG.BOOST.speedMultiplier);
      let maxAllowedSpeed = this.isBoosting
        ? boostTopSpeed
        : st.maxSpeed * (0.42 + 0.58 * this.throttle);

      // Slow down opposing AI planes so they are never frustratingly fast
      if (aircraft && !aircraft.isPlayer && aircraft.ai) {
        maxAllowedSpeed *= aircraft.ai.diff.maxSpeedUse;
      }

      // Flag Carrier Drag Penalty so flag carriers can be chased down!
      if (aircraft && aircraft.carryingFlag) {
        maxAllowedSpeed *= (aircraft.isPlayer ? 0.88 : CONFIG.CTF.carrierSpeedMult);
      }

      const accelFromThrust = thrustMag * st.accelMultiplier;
      const parasiticDrag = phys.parasiticDrag * this.speed * this.speed * 11.5;
      const turnRateMag = Math.sqrt(this.pitchVel * this.pitchVel + this.yawVel * this.yawVel);
      const inducedDrag = turnRateMag * this.speed * phys.inducedDrag * (this.isBoosting ? 0.30 : 0.70);
      const gravityAlongFlight = -_v1.y * phys.gravity;

      const netAccel = accelFromThrust - parasiticDrag - inducedDrag + gravityAlongFlight;
      this.speed = Math.max(st.minSpeed, Math.min(boostTopSpeed, this.speed + netAccel * dt));

      // Smoothly brake back down to non-boost maxAllowedSpeed when Shift is released
      if (this.speed > maxAllowedSpeed) {
        const decelRate = this.isAirBraking ? 5.2 : 3.2;
        this.speed -= (this.speed - maxAllowedSpeed) * Math.min(1, decelRate * dt);
      }

      _v3.copy(_v1).multiplyScalar(this.speed);
      const alignRate = Math.min(1.0, 10.0 * dt);
      this.velocity.lerp(_v3, alignRate);
      pos.addScaledVector(this.velocity, dt);

      // Aerodynamic ground effect & safety cushion: prevents accidental clipping into terrain
      if (world) {
        const groundNow = Math.max(CONFIG.WORLD.seaLevel, world.getTerrainHeight(pos.x, pos.z));
        const minFuselageClearance = 8.5;
        if (pos.y < groundNow + minFuselageClearance) {
          // If not in a catastrophic vertical crash dive (velocity.y > -42 m/s)
          if (this.velocity.y > -42) {
            pos.y = groundNow + minFuselageClearance;
            if (this.velocity.y < 0) this.velocity.y = Math.max(12, -this.velocity.y * 0.25);
            this.elevation = Math.max(this.elevation, 0.10);
            this.pitchVel = Math.max(this.pitchVel, 1.2);
          }
        }
      }

      const centripetalAccel = this.speed * Math.hypot(this.pitchVel, this.yawVel);
      const verticalG = 1.0 + (centripetalAccel / 18.0);
      this.gForce += (Math.max(-2.0, Math.min(9.5, verticalG)) - this.gForce) * Math.min(1, 8 * dt);
      this.aoa = Math.abs(this.pitchVel) * 10.5 + 2.0;
    }
  }

window.FlightModel = FlightModel;
