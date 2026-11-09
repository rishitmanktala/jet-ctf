"use strict";

  /* ============================================================================
   * 2. PROCEDURAL WEBAUDIO SYNTHESIZER (AudioEngine)
   * ============================================================================
   */
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.platformMuted = false;
      this.adMuted = false;
      this.initialized = false;
      this.engineGain = null;
      this.turbineOsc = null;
      this.noiseBuffer = null;

      const unlockAudio = () => {
        if (!this.initialized) {
          this.init();
        }
        if (this.ctx && (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted')) {
          this.ctx.resume().catch(() => {});
        }
      };
      window.addEventListener('touchend', unlockAudio, { passive: true });
      window.addEventListener('mousedown', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
    }

    isMuted() {
      return Boolean(this.muted || this.platformMuted || this.adMuted);
    }

    syncMasterGain() {
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(this.isMuted() ? 0 : 0.55, this.ctx.currentTime, 0.04);
      }
    }

    setPlatformMuted(flag) {
      this.platformMuted = Boolean(flag);
      this.syncMasterGain();
    }

    setAdMuted(flag) {
      this.adMuted = Boolean(flag);
      this.syncMasterGain();
    }

    init() {
      if (this.initialized) {
        if (this.ctx && (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted')) {
          this.ctx.resume().catch(() => {});
        }
        return;
      }
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();

        const sampleRate = this.ctx.sampleRate;
        this.noiseBuffer = this.ctx.createBuffer(1, sampleRate * 2, sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < data.length; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.997 * b0 + white * 0.029;
          b1 = 0.985 * b1 + white * 0.032;
          b2 = 0.950 * b2 + white * 0.048;
          data[i] = (b0 + b1 + b2 + white * 0.18) * 0.5;
        }

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.isMuted() ? 0 : 0.55;
        this.masterGain.connect(this.ctx.destination);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.85;
        this.sfxGain.connect(this.masterGain);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.85;
        this.musicGain.connect(this.masterGain);

        // Plane / engine sound is completely removed per user preference.
        // Gain nodes remain at strictly 0 with no continuous oscillators/noise running.
        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.0;
        this.turbineGain = this.ctx.createGain();
        this.turbineGain.gain.value = 0.0;
        this.windGain = this.ctx.createGain();
        this.windGain.gain.value = 0.0;
        this.abGain = this.ctx.createGain();
        this.abGain.gain.value = 0.0;
        this.hangarHumGain = this.ctx.createGain();
        this.hangarHumGain.gain.value = 0.0;

        this.initialized = true;
        this.startMusic();
      } catch (e) {}
    }

    setMusicVolume(vol) {
      if (this.musicGain && this.ctx) {
        const v = Math.max(0, Math.min(1, vol));
        this.musicGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
      }
    }

    setSfxVolume(vol) {
      if (this.sfxGain && this.ctx) {
        const v = Math.max(0, Math.min(1, vol));
        this.sfxGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
      }
    }

    startMusic() {
      if (this.musicPlaying || !this.ctx) return;
      this.musicPlaying = true;
      this.musicStep = 0;
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this.scheduleMusicLoop();
    }

    stopMusic() {
      this.musicPlaying = false;
      if (this.musicTimer) clearTimeout(this.musicTimer);
    }

    scheduleMusicLoop() {
      if (!this.musicPlaying || !this.ctx) return;
      const bpm = 126;
      const stepTime = 60.0 / bpm / 4;
      const bassNotes = [
        73.42, 73.42, 146.83, 73.42,
        87.31, 87.31, 174.61, 87.31,
        98.00, 98.00, 196.00, 98.00,
        110.00, 98.00, 87.31, 73.42
      ];
      const leadArp = [
        293.66, 349.23, 440.00, 523.25,
        440.00, 349.23, 293.66, 349.23,
        329.63, 392.00, 493.88, 587.33,
        493.88, 392.00, 349.23, 329.63
      ];

      // Anti-catchup guard: Prevent audio node storm if browser was throttled or paused
      if (this.nextNoteTime < this.ctx.currentTime) {
        this.nextNoteTime = this.ctx.currentTime + 0.05;
      }

      let maxNotesPerBatch = 6;
      while (this.nextNoteTime < this.ctx.currentTime + 0.25 && maxNotesPerBatch-- > 0) {
        if (!this.isMuted() && this.musicGain && this.musicGain.gain.value > 0.001) {
          const t = this.nextNoteTime;
          const step = this.musicStep;

          // 1. Synthwave Bassline (Punchy analog bass)
          const bassFreq = bassNotes[step % bassNotes.length];
          const bassOsc = this.ctx.createOscillator();
          const bassGain = this.ctx.createGain();
          const bassFilter = this.ctx.createBiquadFilter();

          bassOsc.type = (step % 2 === 0) ? 'sawtooth' : 'triangle';
          bassOsc.frequency.setValueAtTime(bassFreq, t);

          bassFilter.type = 'lowpass';
          bassFilter.frequency.setValueAtTime(480 + Math.sin(step * 0.25) * 200, t);
          bassFilter.Q.value = 2.2;

          bassGain.gain.setValueAtTime(0.20, t);
          bassGain.gain.exponentialRampToValueAtTime(0.001, t + stepTime * 0.92);

          bassOsc.connect(bassFilter);
          bassFilter.connect(bassGain);
          bassGain.connect(this.musicGain);

          bassOsc.start(t);
          bassOsc.stop(t + stepTime);

          // 2. Synth Arpeggio Melody (driving synthwave lead)
          const leadFreq = leadArp[step % leadArp.length];
          const leadOsc = this.ctx.createOscillator();
          const leadGain = this.ctx.createGain();
          const leadFilter = this.ctx.createBiquadFilter();

          leadOsc.type = (step % 4 === 0) ? 'sawtooth' : 'triangle';
          leadOsc.frequency.setValueAtTime(leadFreq, t);

          leadFilter.type = 'bandpass';
          leadFilter.frequency.setValueAtTime(1100 + Math.cos(step * 0.2) * 400, t);
          leadFilter.Q.value = 1.6;

          leadGain.gain.setValueAtTime(0.10, t);
          leadGain.gain.exponentialRampToValueAtTime(0.001, t + stepTime * 0.85);

          leadOsc.connect(leadFilter);
          leadFilter.connect(leadGain);
          leadGain.connect(this.musicGain);

          leadOsc.start(t);
          leadOsc.stop(t + stepTime);

          // 3. Crisp Synth Snare on beats 2 & 4 (steps 4 & 12)
          if ((step % 8 === 4) && this.noiseBuffer) {
            const snareNoise = this.ctx.createBufferSource();
            snareNoise.buffer = this.noiseBuffer;
            const snareFilter = this.ctx.createBiquadFilter();
            snareFilter.type = 'highpass';
            snareFilter.frequency.setValueAtTime(1400, t);
            const snareGain = this.ctx.createGain();
            snareGain.gain.setValueAtTime(0.14, t);
            snareGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
            snareNoise.connect(snareFilter);
            snareFilter.connect(snareGain);
            snareGain.connect(this.musicGain);
            snareNoise.start(t);
            snareNoise.stop(t + 0.12);
          }

          // 4. Subtle Closed Hi-Hat on offbeats
          if ((step % 2 === 0) && this.noiseBuffer) {
            const hh = this.ctx.createBufferSource();
            hh.buffer = this.noiseBuffer;
            const hhFilter = this.ctx.createBiquadFilter();
            hhFilter.type = 'highpass';
            hhFilter.frequency.setValueAtTime(6500, t);
            const hhGain = this.ctx.createGain();
            hhGain.gain.setValueAtTime(0.04, t);
            hhGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
            hh.connect(hhFilter);
            hhFilter.connect(hhGain);
            hhGain.connect(this.musicGain);
            hh.start(t);
            hh.stop(t + 0.035);
          }
        }
        this.nextNoteTime += stepTime;
        this.musicStep++;
      }

      this.musicTimer = setTimeout(() => this.scheduleMusicLoop(), 100);
    }

    setMuted(mute) {
      this.muted = Boolean(mute);
      this.syncMasterGain();
    }

    startHangarAmbience() {
      // Ambience removed to keep soundscape clean and focused on music
    }

    stopHangarAmbience() {
    }

    updateEngine(throttle, speedRatio, isBoosting, active) {
      // Plane / engine sound removed per user preference - all engine gains remain strictly 0
      if (!this.initialized || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (this.engineGain) this.engineGain.gain.setValueAtTime(0, now);
      if (this.turbineGain) this.turbineGain.gain.setValueAtTime(0, now);
      if (this.windGain) this.windGain.gain.setValueAtTime(0, now);
      if (this.abGain) this.abGain.gain.setValueAtTime(0, now);
    }

    playCannonBurst(isOverdrive = false) {
      if (!this.initialized || this.isMuted()) return;
      const now = this.ctx.currentTime;

      // Layer 1: High-energy mechanical breech crack & pitch transient
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = isOverdrive ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(isOverdrive ? 420 : 340, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.052);
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc.connect(gain);
      gain.connect(this.sfxGain || this.masterGain);
      osc.start(now);
      osc.stop(now + 0.058);

      // Layer 2: Sub-bass 65Hz barrel concussion punch
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(78, now);
      sub.frequency.exponentialRampToValueAtTime(32, now + 0.065);
      subGain.gain.setValueAtTime(0.38, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      sub.connect(subGain);
      subGain.connect(this.sfxGain || this.masterGain);
      sub.start(now);
      sub.stop(now + 0.072);

      // Layer 3: 20mm M61 Vulcan Muzzle Blast (Bandpass noise crackle)
      if (this.noiseBuffer) {
        const nSrc = this.ctx.createBufferSource();
        nSrc.buffer = this.noiseBuffer;
        const nFilter = this.ctx.createBiquadFilter();
        nFilter.type = 'bandpass';
        nFilter.frequency.value = isOverdrive ? 1500 : 1050;
        nFilter.Q.value = 1.4;
        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.36, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.048);
        nSrc.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(this.sfxGain || this.masterGain);
        nSrc.start(now, Math.random() * 1.5, 0.052);
      }
    }

    playBulletImpactOnHull() {
      // Visceral metallic hull concussion + ricochet zing when player takes fire
      if (!this.initialized || this.isMuted()) return;
      const now = this.ctx.currentTime;
      const thud = this.ctx.createOscillator();
      const thudGain = this.ctx.createGain();
      thud.type = 'triangle';
      thud.frequency.setValueAtTime(120, now);
      thud.frequency.exponentialRampToValueAtTime(28, now + 0.12);
      thudGain.gain.setValueAtTime(0.55, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      thud.connect(thudGain);
      thudGain.connect(this.sfxGain || this.masterGain);
      thud.start(now);
      thud.stop(now + 0.14);

      // Metallic armor deformation zing
      const ping = this.ctx.createOscillator();
      const pingGain = this.ctx.createGain();
      ping.type = 'sine';
      const startFreq = 1800 + Math.random() * 800;
      ping.frequency.setValueAtTime(startFreq, now);
      ping.frequency.exponentialRampToValueAtTime(320, now + 0.09);
      pingGain.gain.setValueAtTime(0.24, now);
      pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      ping.connect(pingGain);
      pingGain.connect(this.sfxGain || this.masterGain);
      ping.start(now);
      ping.stop(now + 0.10);
    }

    playHitmarker(isKill = false, combo = 1) {
      // Crisp, punchy armor hit feedback sound when shooting enemies
      if (!this.initialized || this.isMuted()) return;
      const now = this.ctx.currentTime;
      const pitchBoost = Math.min(450, (combo - 1) * 45);

      if (isKill) {
        // Glorious kill confirmation: heavy sub detonation + soaring dual tone
        this.playTone(880 + pitchBoost, 0.09, 'triangle', 0.35);
        setTimeout(() => this.playTone(1320 + pitchBoost, 0.22, 'triangle', 0.40), 50);
        setTimeout(() => this.playTone(1760 + pitchBoost, 0.30, 'sine', 0.30), 100);
      } else {
        // High-velocity armor plate penetration snap
        const snap = this.ctx.createOscillator();
        const snapGain = this.ctx.createGain();
        snap.type = 'sine';
        snap.frequency.setValueAtTime(1850 + pitchBoost, now);
        snap.frequency.exponentialRampToValueAtTime(450, now + 0.045);
        snapGain.gain.setValueAtTime(0.38, now);
        snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.048);
        snap.connect(snapGain);
        snapGain.connect(this.sfxGain || this.masterGain);
        snap.start(now);
        snap.stop(now + 0.05);

        // Low-end armor penetration thud
        const thud = this.ctx.createOscillator();
        const thudGain = this.ctx.createGain();
        thud.type = 'triangle';
        thud.frequency.setValueAtTime(260, now);
        thud.frequency.exponentialRampToValueAtTime(55, now + 0.06);
        thudGain.gain.setValueAtTime(0.26, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
        thud.connect(thudGain);
        thudGain.connect(this.sfxGain || this.masterGain);
        thud.start(now);
        thud.stop(now + 0.07);
      }
    }

    playBoostEngage() {
      if (!this.initialized || this.isMuted()) return;
      this.playTone(240, 0.18, 'sawtooth', 0.16);
      setTimeout(() => this.playTone(480, 0.22, 'triangle', 0.14), 50);
    }

    playRingBoost() {
      if (!this.initialized || this.isMuted()) return;
      this.playTone(587.33, 0.10, 'triangle', 0.20);
      setTimeout(() => this.playTone(880, 0.18, 'triangle', 0.22), 65);
    }

    playFlagFanfare(isPositive = true) {
      if (!this.initialized || this.isMuted()) return;
      if (isPositive) {
        this.playTone(523.25, 0.12, 'triangle', 0.22);
        setTimeout(() => this.playTone(659.25, 0.12, 'triangle', 0.22), 110);
        setTimeout(() => this.playTone(783.99, 0.14, 'triangle', 0.24), 220);
        setTimeout(() => this.playTone(1046.50, 0.30, 'triangle', 0.26), 340);
      } else {
        this.playTone(440, 0.16, 'sawtooth', 0.18);
        setTimeout(() => this.playTone(330, 0.28, 'sawtooth', 0.20), 150);
      }
    }

    playExplosion(distance = 100) {
      if (!this.initialized || this.isMuted() || !this.noiseBuffer) return;
      const atten = Math.max(0.08, Math.min(1.0, 650 / (distance + 180)));
      const now = this.ctx.currentTime;

      // Roaring explosive shockwave noise
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(620 * atten + 140, now);
      filter.frequency.exponentialRampToValueAtTime(45, now + 1.25);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.85 * atten, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain || this.masterGain);
      src.start(now, 0, 1.35);

      // Deep visceral chest-thumping sub-bass rumble
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(110, now);
      sub.frequency.exponentialRampToValueAtTime(18, now + 0.65);
      subGain.gain.setValueAtTime(0.75 * atten, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.70);
      sub.connect(subGain);
      subGain.connect(this.sfxGain || this.masterGain);
      sub.start(now);
      sub.stop(now + 0.72);
    }

    playTone(freq, duration, type = 'sine', volume = 0.1) {
      if (!this.initialized || this.isMuted()) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.sfxGain || this.masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.01);
    }
  }

window.AudioEngine = AudioEngine;
