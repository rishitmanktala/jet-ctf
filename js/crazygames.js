"use strict";

  /* ============================================================================
   * 1B. CRAZYGAMES SDK v3 BRIDGE
   * ============================================================================
   */
  class CrazyGamesBridge {
    constructor() {
      this.sdk = null;
      this.ready = false;
      this.gameplayActive = false;
      this.lastAdTime = 0;
      this.lastHappyTime = 0;
    }

    async init(game) {
      if (!window.CrazyGames || !window.CrazyGames.SDK) return;
      try {
        this.sdk = window.CrazyGames.SDK;
        await this.sdk.init();
        if (this.sdk.environment === 'disabled') {
          this.sdk = null;
          return;
        }
        this.ready = true;
        try { this.sdk.game.loadingStart(); } catch (e) {}

        if (this.sdk.game.settings && typeof this.sdk.game.settings.muteAudio === 'boolean') {
          game.audio.setPlatformMuted(this.sdk.game.settings.muteAudio);
        }
        if (this.sdk.game.addSettingsChangeListener) {
          this.sdk.game.addSettingsChangeListener((newSettings) => {
            if (newSettings && typeof newSettings.muteAudio === 'boolean') {
              game.audio.setPlatformMuted(newSettings.muteAudio);
            }
          });
        }

        const savedBest = this.getData('fighterjets3d_highscore');
        if (savedBest) {
          const parsed = parseInt(savedBest, 10);
          if (!isNaN(parsed) && parsed > game.highScore) game.highScore = parsed;
        }
        const savedAc = this.getData('fighterjets3d_aircraft');
        if (savedAc === 'F22' || savedAc === 'SU57') game.selectAirframe(savedAc);
        const savedLiv = this.getData('fighterjets3d_livery');
        if (savedLiv !== null && savedLiv !== undefined) {
          const livIdx = parseInt(savedLiv, 10);
          if (!isNaN(livIdx) && livIdx >= 0 && livIdx < CONFIG.LIVERIES.length) game.selectLivery(livIdx);
        }

        if (this.sdk.user && this.sdk.user.getUser) {
          try {
            const user = await this.sdk.user.getUser();
            const inputEl = document.getElementById('input-callsign');
            if (user && user.username && inputEl && (inputEl.value === 'NightHawk_IN' || !inputEl.value.trim())) {
              inputEl.value = String(user.username).slice(0, 16);
            }
          } catch (e) {}
        }

        try { this.sdk.game.loadingStop(); } catch (e) {}
        if (this.pendingGameplay) this.setGameplay(true);
      } catch (err) {
        this.sdk = null;
        this.ready = false;
      }
    }

    setGameplay(active) {
      this.pendingGameplay = Boolean(active);
      if (!this.ready || !this.sdk) return;
      const shouldBeActive = Boolean(active);
      if (this.gameplayActive === shouldBeActive) return;
      this.gameplayActive = shouldBeActive;
      try {
        if (shouldBeActive) this.sdk.game.gameplayStart();
        else this.sdk.game.gameplayStop();
      } catch (e) {}
    }

    happytime() {
      if (!this.ready || !this.sdk) return;
      const now = performance.now();
      if (now - this.lastHappyTime < 12000) return;
      this.lastHappyTime = now;
      try { this.sdk.game.happytime(); } catch (e) {}
    }

    getData(key) {
      try {
        if (this.ready && this.sdk && this.sdk.data) {
          const val = this.sdk.data.getItem(key);
          if (val !== null && val !== undefined) return val;
        }
      } catch (e) {}
      try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    setData(key, value) {
      const strVal = String(value);
      try {
        if (this.ready && this.sdk && this.sdk.data) this.sdk.data.setItem(key, strVal);
      } catch (e) {}
      try { localStorage.setItem(key, strVal); } catch (e) {}
    }

    requestMidgameAd(audio, onComplete) {
      const now = performance.now();
      if (!this.ready || !this.sdk || !this.sdk.ad || (now - this.lastAdTime < 60000)) {
        if (onComplete) onComplete();
        return;
      }
      this.lastAdTime = now;
      this.setGameplay(false);
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        if (audio) audio.setAdMuted(false);
        if (onComplete) onComplete();
      };
      try {
        this.sdk.ad.requestAd('midgame', {
          adStarted: () => { if (audio) audio.setAdMuted(true); },
          adFinished: () => finish(),
          adError: () => finish()
        });
      } catch (e) { finish(); }
    }
  }

window.CrazyGamesBridge = CrazyGamesBridge;
