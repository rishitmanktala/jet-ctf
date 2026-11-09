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

      this.isTouchDevice = Boolean(window.__detectPhone ? window.__detectPhone() : false);
      this.touchUIVisible = this.isTouchDevice;
      this.showPcControlsGuide = true;
      this.steerTouchId = null;
      this.touchHold = {
        spdUp: false,
        spdDn: false,
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
        if (!this.touchUIVisible) {
          this.touchUIVisible = true;
          const tc = document.getElementById('touch-controls');
          if (tc) tc.classList.remove('hidden');
        }
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (this.steerTouchId === null) {
            this.steerTouchId = t.identifier;
            updatePointerCoords(t.clientX, t.clientY);
            break;
          }
        }
      }, { passive: false });

      webglCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.steerTouchId) {
            updatePointerCoords(t.clientX, t.clientY);
            break;
          }
        }
      }, { passive: false });

      const endSteerTouch = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.steerTouchId) {
            this.steerTouchId = null;
            break;
          }
        }
      };
      webglCanvas.addEventListener('touchend', endSteerTouch, { passive: false });
      webglCanvas.addEventListener('touchcancel', endSteerTouch, { passive: false });

      window.addEventListener('contextmenu', (e) => e.preventDefault());
      this.bindTouchButtons();
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

      bindHold('tbtn-spd-up', 'spdUp');
      bindHold('tbtn-spd-dn', 'spdDn');
      bindHold('tbtn-roll-l', 'rollL');
      bindHold('tbtn-roll-r', 'rollR');
      bindHold('tbtn-gun', 'gun');
      bindHold('tbtn-boost', 'boost');

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

      // Direct Mouse Steering & Rate Control with Zero Level-Flight Snapping:
      const shouldFollowPointer = !this.isTouchDevice || (this.steerTouchId !== null);
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
      if (this.keys['KeyS'] || this.touchHold.spdDn) throttleDelta -= 1;

      // Shift activates regenerating Boost
      boost = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.touchHold.boost);

      // Left-Click or Space (or F / Touch Gun button) fires rotary cannon!
      fireCannon = Boolean(
        (!this.isTouchDevice && this.mouseButtons.left) ||
        this.keys['Space'] ||
        this.keys['KeyF'] ||
        this.touchHold.gun
      );

      // G or X key drops the carried flag!
      const dropFlag = this.consumePressed('KeyG') || this.consumePressed('KeyX');

      cycleTarget = this.consumePressed('KeyR');
      toggleCam = this.consumePressed('KeyC');

      const invertY = Boolean(playerAc && playerAc.stats && playerAc.stats.invertY);
      const rawSteerY = this.mouseY; // mouseY < 0 when cursor moved UP
      const steerY = invertY ? rawSteerY : -rawSteerY; // positive when pulling UP (climb)

      return {
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
        yaw: Math.max(-1, Math.min(1, yaw)),
        steerX: this.mouseX,
        steerY: steerY,
        throttleDelta,
        boost,
        fireCannon,
        dropFlag,
        cycleTarget,
        toggleCam,
        mouseAimActive,
        mouseAimWorldDir
      };
    }
  }

window.InputManager = InputManager;
