"use strict";

  /* ============================================================================
   * 11B. INTERACTIVE ONBOARDING TUTORIAL MANAGER
   * ============================================================================
   */
  class TutorialManager {
    constructor(game) {
      this.game = game;
      this.active = false;
      this.step = 0;
      this.stepTimer = 0;
      this.cardEl = document.getElementById('tutorial-card');
      this.steps = [
        {
          id: 'AIM',
          title: 'STEP 1/5: DIRECT MOUSE AIM',
          desc: 'Move your mouse cursor. The aircraft nose directly tracks your crosshair on screen for pinpoint gunnery.',
          hint: 'Aim around using your mouse...',
          isComplete: (dt, input, player) => {
            this.stepTimer += dt;
            return this.stepTimer > 3.5 || (input && input.mouseAimActive && (Math.abs(input.mouseNdcX) > 0.15 || Math.abs(input.mouseNdcY) > 0.15));
          }
        },
        {
          id: 'THROTTLE',
          title: 'STEP 2/5: THROTTLE & BOOST',
          desc: 'Hold [W] to throttle up. Hold [SHIFT] to ignite afterburner nitro boost.',
          hint: 'Hold [W] or [SHIFT] to accelerate...',
          isComplete: (dt, input, player) => {
            this.stepTimer += dt;
            return this.stepTimer > 4.5 || (player && player.flight && player.flight.isBoosting) || (input && input.keys['KeyW'] && this.stepTimer > 1.2);
          }
        },
        {
          id: 'ROLL',
          title: 'STEP 3/5: STEADY ROLL & AIRBRAKE',
          desc: 'Hold [A] or [D] to roll at a steady rate. Rotation stops immediately when released! Tap [S] to airbrake into tight turns.',
          hint: 'Tap [A] or [D] to roll...',
          isComplete: (dt, input, player) => {
            this.stepTimer += dt;
            return this.stepTimer > 4.5 || (input && (input.keys['KeyA'] || input.keys['KeyD']) && this.stepTimer > 1.2);
          }
        },
        {
          id: 'CANNON',
          title: 'STEP 4/5: ROTARY CANNON',
          desc: 'Click [LEFT-MOUSE] or tap [SPACE] to fire unlimited 20mm rotary cannon rounds. Lead your target reticle!',
          hint: 'Fire your rotary cannon...',
          isComplete: (dt, input, player) => {
            this.stepTimer += dt;
            return this.stepTimer > 4.5 || (input && (input.mouseButtons.left || input.keys['Space']) && this.stepTimer > 0.8);
          }
        },
        {
          id: 'CTF',
          title: 'STEP 5/5: CAPTURE THE FLAG (+1,000 PTS)',
          desc: 'Fly to the enemy base to snatch their flag, then bring it back to your home base to score 1,000 Points! DUAL-FLAG RULE: You can only capture when BOTH flags are at your base. If the enemy takes your flag, shoot down their carrier and return your flag first! First to 3 captures wins.',
          hint: 'Click "ENGAGE" or press [SPACE] to start!',
          button: 'ENGAGE HOSTILES ▶',
          isComplete: (dt, input, player) => {
            this.stepTimer += dt;
            return this.stepTimer > 8.0 || (this.stepTimer > 1.0 && input && input.keys && (input.keys['Space'] || input.keys['Enter']));
          }
        }
      ];
    }

    start() {
      this.active = true;
      this.step = 0;
      this.stepTimer = 0;
      this.renderCard();
      if (this.cardEl) this.cardEl.classList.remove('hidden');
    }

    stop() {
      this.active = false;
      if (this.cardEl) this.cardEl.classList.add('hidden');
      if (this.game && this.game.career) {
        this.game.career.tutorialDone = true;
        CareerManager.save(this.game.career);
      }
      if (this.game) {
        this.game.addFloatingPopup('⚡ TUTORIAL COMPLETE // AIR SUPERIORITY AUTHORIZED!', '#00ff9d');
        if (this.game.audio) this.game.audio.playTone(880, 0.25, 'triangle', 0.25);
      }
    }

    renderCard() {
      if (!this.cardEl) return;
      const cur = this.steps[this.step];
      if (!cur) return;
      const btnHtml = cur.button
        ? `<button id="btn-tut-next" class="primary-btn" style="font-size:11px;padding:6px 14px;">${cur.button}</button>`
        : '';
      this.cardEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span style="font-size:12px;font-weight:800;color:#38bdf8;letter-spacing:0.08em;">${cur.title}</span>
          <button id="btn-tut-skip" style="background:transparent;border:none;color:#94a3b8;font-size:10.5px;cursor:pointer;text-decoration:underline;">SKIP TUTORIAL</button>
        </div>
        <div style="font-size:12px;color:#cbd5e1;line-height:1.45;margin-bottom:8px;">${cur.desc}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:11px;color:#fbbf24;font-family:monospace;">${cur.hint}</span>
          ${btnHtml}
        </div>
      `;
      const skipBtn = document.getElementById('btn-tut-skip');
      if (skipBtn) skipBtn.onclick = (e) => { e.stopPropagation(); this.stop(); };
      const nextBtn = document.getElementById('btn-tut-next');
      if (nextBtn) nextBtn.onclick = (e) => { e.stopPropagation(); this.stop(); };
    }

    update(dt, input, player) {
      if (!this.active) return;
      const cur = this.steps[this.step];
      if (!cur) {
        this.stop();
        return;
      }
      if (cur.isComplete(dt, input, player)) {
        this.step++;
        this.stepTimer = 0;
        if (this.step >= this.steps.length) {
          this.stop();
        } else {
          this.renderCard();
        }
      }
    }
  }

window.TutorialManager = TutorialManager;
