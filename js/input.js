"use strict";

  /* ============================================================================
   * 3. INPUT MANAGER (Desktop Mouse Steering & Keyboard Flight Controls)
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

      this.isTouchDevice = false;
      this.touchUIVisible = false;
      this.showPcControlsGuide = true;

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
      if (webglCanvas) {
        webglCanvas.addEventListener('mousedown', (e) => {
          if (this.audio) this.audio.init();
          updatePointerCoords(e.clientX, e.clientY);
          if (e.button === 0) this.mouseButtons.left = true;
          if (e.button === 2) this.mouseButtons.right = true;
        });
      }

      window.addEventListener('mouseup', (e) => {
        if (e.button === 0) this.mouseButtons.left = false;
        if (e.button === 2) this.mouseButtons.right = false;
      });

      window.addEventListener('contextmenu', (e) => e.preventDefault());
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

      // Manual Aileron Roll (A / D keys):
      if (this.keys['KeyD']) roll += 1;
      if (this.keys['KeyA']) roll -= 1;

      // Keyboard Pitch & Yaw (Arrow keys):
      if (this.keys['ArrowUp']) pitch += 1;
      if (this.keys['ArrowDown']) pitch -= 1;
      if (this.keys['ArrowRight']) yaw += 1;
      if (this.keys['ArrowLeft']) yaw -= 1;

      // Direct Mouse Steering:
      if (playerAc) {
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
      if (this.keys['KeyW']) throttleDelta += 1;
      if (this.keys['KeyS']) throttleDelta -= 1;

      // Shift activates regenerating Boost
      boost = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);

      // Cannon fire: Left mouse, Space, or F
      fireCannon = Boolean(
        this.mouseButtons.left ||
        this.keys['Space'] ||
        this.keys['KeyF']
      );

      // Drop flag: G or X
      const dropFlag = this.consumePressed('KeyG') || this.consumePressed('KeyX');

      cycleTarget = this.consumePressed('KeyR');
      toggleCam = this.consumePressed('KeyC');

      const invertY = Boolean(playerAc && playerAc.stats && playerAc.stats.invertY);
      const steerX = this.mouseX;
      const steerY = invertY ? this.mouseY : -this.mouseY;

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
        isTouchDevice: false
      };
    }
  }

window.InputManager = InputManager;
