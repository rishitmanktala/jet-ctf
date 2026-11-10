"use strict";

  /* ============================================================================
   * 11B. INTERACTIVE ONBOARDING TUTORIAL MANAGER (Two-Phase Pause-to-Read)
   * ============================================================================
   */
  class TutorialManager {
    constructor(game) {
      this.game = game;
      this.active = false;
      this.isFrozen = false;
      this.phase = 'BRIEFING'; // 'BRIEFING' (paused) | 'PRACTICE' (active flight)
      this.step = 0;
      this.stepTimer = 0;
      this.cardEl = document.getElementById('tutorial-card');
      this.steps = [
        {
          id: 'AIM',
          title: '01 / 05 — FLIGHT STEERING',
          desc: 'Move your cursor across the viewport. Your aircraft tracks your reticle dynamically.',
          practiceHint: 'PRACTICE: Steer across the horizon with your mouse.',
          isPracticeComplete: (dt, input, player) => {
            this.stepTimer += dt;
            return this.stepTimer > 4.2 || (this.stepTimer > 1.0 && input && (Math.abs(input.mouseNdcX) > 0.1 || Math.abs(input.mouseNdcY) > 0.1));
          }
        },
        {
          id: 'THROTTLE',
          title: '02 / 05 — THROTTLE & AFTERBURNER',
          desc: 'Hold [W] for military thrust. Hold [SHIFT] to light afterburner for maximum intercept speed.',
          practiceHint: 'PRACTICE: Hold [W] to throttle up or [SHIFT] for afterburner.',
          isPracticeComplete: (dt, input, player) => {
            this.stepTimer += dt;
            return this.stepTimer > 4.5 || (player && player.flight && player.flight.isBoosting) || (this.stepTimer > 1.0 && input && input.keys && (input.keys['KeyW'] || input.keys['ArrowUp']));
          }
        },
        {
          id: 'ROLL',
          title: '03 / 05 — BANKING & AIRBRAKE',
          desc: 'Hold [A] or [D] to roll steadily. Hold [S] to deploy airbrakes for tight high-G turns.',
          practiceHint: 'PRACTICE: Hold [A] or [D] to roll, or [S] to airbrake.',
          isPracticeComplete: (dt, input, player) => {
            this.stepTimer += dt;
            return this.stepTimer > 4.5 || (this.stepTimer > 1.0 && input && input.keys && (input.keys['KeyA'] || input.keys['KeyD'] || input.keys['KeyS'] || input.keys['ArrowLeft'] || input.keys['ArrowRight']));
          }
        },
        {
          id: 'CANNON',
          title: '04 / 05 — 20MM ROTARY CANNON',
          desc: 'Click [LEFT MOUSE] or hold [SPACE] to fire 20mm rounds. Aim for the HUD lead pipper.',
          practiceHint: 'PRACTICE: Fire cannon with [LEFT CLICK] or [SPACE].',
          isPracticeComplete: (dt, input, player) => {
            this.stepTimer += dt;
            return this.stepTimer > 4.5 || (this.stepTimer > 0.6 && input && ((input.mouseButtons && input.mouseButtons.left) || (input.keys && (input.keys['Space'] || input.keys['KeyF']))));
          }
        },
        {
          id: 'CTF',
          title: '05 / 05 — CAPTURE THE FLAG',
          desc: 'Fly through the enemy base to take their flag and bring it home (+1,000 PTS). Both flags must be at your base to score; if yours is taken, intercept the carrier first. Press [G] or [X] to drop a carried flag.',
          finalBriefingOnly: true,
          actionLabel: 'WEAPONS FREE'
        }
      ];
    }

    start() {
      this.active = true;
      this.step = 0;
      this.enterBriefing();
      if (this.cardEl) this.cardEl.classList.remove('hidden');
    }

    enterBriefing() {
      this.phase = 'BRIEFING';
      this.isFrozen = true;
      this.stepTimer = 0;
      if (this.game && this.game.input) {
        this.game.input.clearJustPressed();
      }
      this.renderCard();
    }

    beginPractice() {
      const cur = this.steps[this.step];
      if (!cur || cur.finalBriefingOnly) {
        this.stop();
        return;
      }
      this.phase = 'PRACTICE';
      this.isFrozen = false;
      this.stepTimer = 0;
      if (this.game && this.game.input) {
        this.game.input.clearJustPressed();
        this.game.input.resetPointerToCenter();
      }
      this.renderCard();
    }

    stop(skipped = false) {
      this.active = false;
      this.isFrozen = false;
      if (this.cardEl) this.cardEl.classList.add('hidden');
      if (this.game && this.game.input) {
        this.game.input.clearJustPressed();
        this.game.input.resetPointerToCenter();
      }
      if (this.game && this.game.career) {
        this.game.career.tutorialDone = true;
        CareerManager.save(this.game.career);
      }
      if (this.game) {
        this.game.addFloatingPopup(
          skipped ? 'TUTORIAL SKIPPED' : 'BRIEFING COMPLETE',
          '#52c468'
        );
        if (this.game.audio) this.game.audio.playTone(880, 0.22, 'triangle', 0.22);
      }
    }

    renderCard() {
      if (!this.cardEl) return;
      const cur = this.steps[this.step];
      if (!cur) return;

      const isBriefing = (this.phase === 'BRIEFING');
      const actionText = cur.actionLabel || 'TRY IT NOW';

      if (isBriefing) {
        this.cardEl.innerHTML = `
          <div class="tut-mfd-header">
            <div class="tut-title-group">
              <span class="tut-badge-paused">PAUSED</span>
              <span class="tut-step-title">${cur.title}</span>
            </div>
            <button id="btn-tut-skip" class="tut-esc-btn" title="Press ESC to skip tutorial">SKIP [ESC]</button>
          </div>
          <div class="tut-desc">${cur.desc}</div>
          <div class="tut-footer">
            <span class="tut-hint-muted">Flight paused while reading.</span>
            <button id="btn-tut-next" class="tut-primary-btn">${actionText} [SPACE]</button>
          </div>
        `;
      } else {
        this.cardEl.innerHTML = `
          <div class="tut-mfd-header">
            <div class="tut-title-group">
              <span class="tut-badge-live">LIVE</span>
              <span class="tut-step-title">${cur.title}</span>
            </div>
            <button id="btn-tut-skip" class="tut-esc-btn" title="Press ESC to skip tutorial">SKIP [ESC]</button>
          </div>
          <div class="tut-footer" style="margin-top:4px;">
            <span class="tut-hint-live">${cur.practiceHint}</span>
            <span class="tut-timer-pill">ACTIVE</span>
          </div>
        `;
      }

      const skipBtn = document.getElementById('btn-tut-skip');
      if (skipBtn) {
        skipBtn.onclick = (e) => {
          e.stopPropagation();
          this.stop(true);
        };
      }
      const nextBtn = document.getElementById('btn-tut-next');
      if (nextBtn) {
        nextBtn.onclick = (e) => {
          e.stopPropagation();
          this.beginPractice();
        };
      }
    }

    update(dt, input, player) {
      if (!this.active) return;

      if (input && input.consumePressed('Escape')) {
        this.stop(true);
        return;
      }

      const cur = this.steps[this.step];
      if (!cur) {
        this.stop(false);
        return;
      }

      if (this.phase === 'BRIEFING') {
        if (input && (input.consumePressed('Space') || input.consumePressed('Enter'))) {
          this.beginPractice();
        }
        return;
      }

      // PRACTICE PHASE
      if (cur.isPracticeComplete && cur.isPracticeComplete(dt, input, player)) {
        this.step++;
        if (this.step >= this.steps.length) {
          this.stop(false);
        } else {
          this.enterBriefing();
        }
      }
    }
  }

  window.TutorialManager = TutorialManager;
