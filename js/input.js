"use strict";

  /* ============================================================================
   * 3. INPUT MANAGER (Effortless Horizon-Stabilized Mouse Steering & Controls)
   * ============================================================================
   */
  class InputManager {
    constructor(audio) {
      this.audio = audio;
      this.keys = {};
      this.justPressed = {};
      this.mouseX = 0;
      this.mouseY = 0;
      this.mouseNdcX = 0;
      this.mouseNdcY = 0;
      this.mouseScreenX = window.innerWidth * 0.5;
      this.mouseScreenY = window.innerHeight * 0.5;
      this.freeMouseSteer = true;
      this.mouseButtons = { left: false, right: false };

      this.isTouchDevice = Boolean(
        (window.__detectPhone && window.__detectPhone()) ||
        ('ontouchstart' in window) ||
        (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)
      );
      this.touchUIVisible = this.isTouchDevice;
      this.showPcControlsGuide = true;
      this.steerTouchId = null;
      this.anyTouchActive = false;

      // Virtual Dynamic Flight Joystick (Touch / Phone)
      this.joystick = {
        active: false,
        touchId: null,
        baseX: 88,
        baseY: 0,
        knobX: 88,
        knobY: 0,
        normX: 0,
        normY: 0,
        maxRadius: 55
      };

      this.touchHold = {
        spdUp: false,
        spdDn: false,
        brake: false,
        rollL: false,
        rollR: false,
        gun: false,
        boost: false
      };

      const isTypingInput = (el) => {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
      };

      window.addEventListener('keydown', (e) => {
        if (isTypingInput(e.target)) return;
        if (!this.keys[e.code]) {
          this.justPressed[e.code] = true;
        }
        this.keys[e.code] = true;
        if (['Space', 'Tab', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
          e.preventDefault();
        }
      });

      window.addEventListener('keyup', (e) => {
        this.keys[e.code] = false;
      });

      const releaseAllInputs = () => {
        this.keys = {};
        this.justPressed = {};
        this.mouseButtons.left = false;
        this.mouseButtons.right = false;
        this.steerTouchId = null;
        for (const k in this.touchHold) this.touchHold[k] = false;
      };
      window.addEventListener('blur', releaseAllInputs);
      document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAllInputs(); });

      const updatePointerCoords = (clientX, clientY) => {
        const w = Math.max(1, window.innerWidth);
        const h = Math.max(1, window.innerHeight);

        this.mouseScreenX = clientX;
        this.mouseScreenY = clientY;
        this.mouseNdcX = (clientX / w) * 2 - 1;
        this.mouseNdcY = -(clientY / h) * 2 + 1;

        const cx = w * 0.5;
        const cy = h * 0.5;
        const maxR = Math.min(cx, cy) * 0.65;
        this.mouseX = Math.max(-1, Math.min(1, (clientX - cx) / maxR));
        this.mouseY = Math.max(-1, Math.min(1, (clientY - cy) / maxR));
      };

      window.addEventListener('mousemove', (e) => updatePointerCoords(e.clientX, e.clientY));

      const webglCanvas = document.getElementById('webgl-canvas');
      webglCanvas.addEventListener('mousedown', (e) => {
        if (this.audio) this.audio.init();
        updatePointerCoords(e.clientX, e.clientY);
        if (e.button === 0) this.mouseButtons.left = true;
        if (e.button === 2) this.mouseButtons.right = true;
      });

      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouseButtons.left = false;
        if (e.button === 2) this.mouseButtons.right = false;
      });

      webglCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (this.audio) this.audio.init();
        if (window.__triggerAutoFullscreen) window.__triggerAutoFullscreen();

        this.isTouchDevice = true;
        this.touchUIVisible = true;
        this.anyTouchActive = true;

        const vjoyContainer = document.getElementById('virtual-joystick-container');
        if (vjoyContainer) vjoyContainer.classList.remove('hidden');
        const tc = document.getElementById('touch-controls');
        if (tc) tc.classList.remove('hidden');

        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          // Left 60% of screen claims the virtual flight stick
          if (t.clientX < window.innerWidth * 0.60 && this.joystick.touchId === null) {
            this.joystick.touchId = t.identifier;
            this.joystick.active = true;
            this.joystick.baseX = t.clientX;
            this.joystick.baseY = t.clientY;
            this.joystick.knobX = t.clientX;
            this.joystick.knobY = t.clientY;
            this.joystick.normX = 0;
            this.joystick.normY = 0;
            this.updateJoystickUI();
          } else if (this.steerTouchId === null) {
            this.steerTouchId = t.identifier;
            updatePointerCoords(t.clientX, t.clientY);
          }
        }
      }, { passive: false });

      webglCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.joystick.touchId) {
            let dx = t.clientX - this.joystick.baseX;
            let dy = t.clientY - this.joystick.baseY;
            const dist = Math.hypot(dx, dy);
            const maxR = this.joystick.maxRadius;
            if (dist > maxR) {
              const clampedX = (dx / dist) * maxR;
              const clampedY = (dy / dist) * maxR;
              // Smooth dynamic base dragging so thumb never slips off stick
              this.joystick.baseX = t.clientX - clampedX;
              this.joystick.baseY = t.clientY - clampedY;
              dx = clampedX;
              dy = clampedY;
            }
            this.joystick.normX = dx / maxR;
            this.joystick.normY = dy / maxR;
            this.joystick.knobX = this.joystick.baseX + dx;
            this.joystick.knobY = this.joystick.baseY + dy;
            this.updateJoystickUI();
          } else if (t.identifier === this.steerTouchId) {
            updatePointerCoords(t.clientX, t.clientY);
          }
        }
      }, { passive: false });

      const endTouch = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.joystick.touchId) {
            this.joystick.active = false;
            this.joystick.touchId = null;
            this.joystick.normX = 0;
            this.joystick.normY = 0;
            this.resetJoystickUI();
          }
          if (t.identifier === this.steerTouchId) {
            this.steerTouchId = null;
          }
        }
        if (e.touches.length === 0) {
          this.anyTouchActive = false;
        }
      };
      webglCanvas.addEventListener('touchend', endTouch, { passive: false });
      webglCanvas.addEventListener('touchcancel', endTouch, { passive: false });

      window.addEventListener('contextmenu', (e) => e.preventDefault());
      this.bindTouchButtons();
    }

    updateJoystickUI() {
      const baseEl = document.getElementById('vjoy-base');
      const knobEl = document.getElementById('vjoy-knob');
      if (baseEl && knobEl) {
        baseEl.classList.remove('idle');
        baseEl.style.left = `${this.joystick.baseX}px`;
        baseEl.style.top = `${this.joystick.baseY}px`;
        baseEl.style.bottom = 'auto';
        const kx = (this.joystick.knobX - this.joystick.baseX);
        const ky = (this.joystick.knobY - this.joystick.baseY);
        knobEl.style.transform = `translate(${kx}px, ${ky}px)`;
      }
    }

    resetJoystickUI() {
      const baseEl = document.getElementById('vjoy-base');
      const knobEl = document.getElementById('vjoy-knob');
      if (baseEl && knobEl) {
        baseEl.classList.add('idle');
        baseEl.style.left = '88px';
        baseEl.style.top = 'auto';
        baseEl.style.bottom = '88px';
        knobEl.style.transform = 'translate(0px, 0px)';
      }
    }

    bindTouchButtons() {
      const bindHold = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        const start = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.audio) this.audio.init();
          this.touchHold[key] = true;
          el.classList.add('pressed');
        };
        const end = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.touchHold[key] = false;
          el.classList.remove('pressed');
        };
        el.addEventListener('touchstart', start, { passive: false });
        el.addEventListener('touchend', end, { passive: false });
        el.addEventListener('touchcancel', end, { passive: false });
        el.addEventListener('mousedown', start);
        el.addEventListener('mouseup', end);
        el.addEventListener('mouseleave', end);
      };

      bindHold('tbtn-boost', 'boost');
      bindHold('tbtn-brake', 'brake');

      const bindTap = (id, code) => {
        const el = document.getElementById(id);
        if (!el) return;
        const trigger = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.audio) this.audio.init();
          this.justPressed[code] = true;
          el.classList.add('pressed');
          setTimeout(() => el.classList.remove('pressed'), 140);
        };
        el.addEventListener('touchstart', trigger, { passive: false });
        el.addEventListener('mousedown', trigger);
      };

      bindTap('tbtn-target', 'KeyR');
      bindTap('tbtn-drop-flag', 'TouchDropFlag');

      const pauseBtn = document.getElementById('tbtn-pause');
      if (pauseBtn) {
        const toggleP = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.audio) this.audio.init();
          if (window.airCombatSim) {
            window.airCombatSim.setPaused(window.airCombatSim.state !== 'PAUSED');
          }
        };
        pauseBtn.addEventListener('touchstart', toggleP, { passive: false });
        pauseBtn.addEventListener('mousedown', toggleP);
      }
    }

    consumePressed(code) {
      if (this.justPressed[code]) {
        this.justPressed[code] = false;
        return true;
      }
      return false;
    }

    clearJustPressed() {
      this.justPressed = {};
    }

    resetPointerToCenter() {
      this.mouseX = 0;
      this.mouseY = 0;
      this.mouseNdcX = 0;
      this.mouseNdcY = 0;
      this.mouseScreenX = window.innerWidth * 0.5;
      this.mouseScreenY = window.innerHeight * 0.5;
      this.mouseButtons.left = false;
      this.mouseButtons.right = false;
    }

    getFlightControls(playerAc, camera) {
      let pitch = 0;
      let roll = 0;
      let yaw = 0;
      let throttleDelta = 0;
      let fireCannon = false;
      let boost = false;
      let cycleTarget = false;
      let toggleCam = false;
      let mouseAimActive = false;
      let mouseAimWorldDir = null;

      // Manual Aileron Roll (A / D keys or Touch buttons):
      // Rolls at a steady rate while pressed; stopping rotation instantly when released!
      if (this.keys['KeyD'] || this.touchHold.rollR) roll += 1;
      if (this.keys['KeyA'] || this.touchHold.rollL) roll -= 1;

      // Keyboard Pitch & Yaw (Arrow keys):
      if (this.keys['ArrowUp']) pitch += 1;
      if (this.keys['ArrowDown']) pitch -= 1;
      if (this.keys['ArrowRight']) yaw += 1;
      if (this.keys['ArrowLeft']) yaw -= 1;

      // Direct Mouse Steering or Virtual Joystick:
      const shouldFollowPointer = !this.isTouchDevice || (this.steerTouchId !== null) || this.joystick.active;
      if (shouldFollowPointer && playerAc) {
        mouseAimActive = true;
        const curEl = playerAc.flight ? playerAc.flight.elevation : 0;
        const curHdg = playerAc.flight ? playerAc.flight.heading : 0;
        const cosEl = Math.cos(curEl);
        mouseAimWorldDir = new THREE.Vector3(
          -Math.sin(curHdg) * cosEl,
          Math.sin(curEl),
          -Math.cos(curHdg) * cosEl
        ).normalize();
      }

      // W and S control throttle & airbrake
      if (this.keys['KeyW'] || this.touchHold.spdUp) throttleDelta += 1;
      if (this.keys['KeyS'] || this.touchHold.spdDn || this.touchHold.brake) throttleDelta -= 1;

      // Shift activates regenerating Boost
      boost = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.touchHold.boost);

      // Continuous 24/7 cannon fire on mobile while holding screen / joystick to fly:
      if (this.isTouchDevice) {
        if (this.joystick.active || this.anyTouchActive || this.steerTouchId !== null || this.touchHold.gun) {
          fireCannon = true;
        }
      } else {
        fireCannon = Boolean(
          this.mouseButtons.left ||
          this.keys['Space'] ||
          this.keys['KeyF'] ||
          this.touchHold.gun
        );
      }

      // Drop flag: G, X, or mobile Drop Flag button
      const dropFlag = this.consumePressed('KeyG') || this.consumePressed('KeyX') || this.consumePressed('TouchDropFlag');

      cycleTarget = this.consumePressed('KeyR');
      toggleCam = this.consumePressed('KeyC');

      const invertY = Boolean(playerAc && playerAc.stats && playerAc.stats.invertY);
      let steerX = this.mouseX;
      let steerY = invertY ? this.mouseY : -this.mouseY;

      if (this.isTouchDevice && this.joystick.active) {
        steerX = this.joystick.normX;
        // In flight controls, pulling DOWN on stick (normY > 0) climbs (+steerY). Pushing UP dives (-steerY).
        steerY = invertY ? -this.joystick.normY : this.joystick.normY;
      }

      return {
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
        yaw: Math.max(-1, Math.min(1, yaw)),
        steerX,
        steerY,
        throttleDelta,
        boost,
        fireCannon,
        dropFlag,
        cycleTarget,
        toggleCam,
        mouseAimActive,
        mouseAimWorldDir,
        isTouchDevice: this.isTouchDevice
      };
    }
  }

window.InputManager = InputManager;
