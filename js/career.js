"use strict";

  /* ============================================================================
   * 1C. CAREER & META-PROGRESSION MANAGER (5 Jets, Upgrades, Ranks, Credits, LocalStorage)
   * ============================================================================
   */
  class CareerManager {
    static get STORAGE_KEY() { return 'fjets3d_career_v2'; }

    static getDefaultProfile() {
      return {
        version: 2,
        callsign: 'NightHawk_IN',
        xp: 0,
        credits: 600,
        unlockedAircraft: ['FALCON'],
        selectedAircraft: 'FALCON',
        selectedTeam: 'BLUE',
        selectedLivery: 0,
        selectedTracer: 0,
        upgrades: {
          FALCON:  { speed: 1, agility: 1, firepower: 1, armor: 1, boost: 1 },
          VIPER:   { speed: 1, agility: 1, firepower: 1, armor: 1, boost: 1 },
          TITAN:   { speed: 1, agility: 1, firepower: 1, armor: 1, boost: 1 },
          PHANTOM: { speed: 1, agility: 1, firepower: 1, armor: 1, boost: 1 },
          SPECTRE: { speed: 1, agility: 1, firepower: 1, armor: 1, boost: 1 }
        },
        stats: {
          sorties: 0,
          wins: 0,
          losses: 0,
          kills: 0,
          deaths: 0,
          captures: 0,
          returns: 0,
          shotsFired: 0,
          hits: 0
        },
        settings: {
          mouseSens: 1.0,
          invertY: false,
          musicVol: 0.85,
          sfxVol: 0.85,
          graphics: 'HIGH',
          hudColor: 'GREEN',
          showFps: false
        },
        tutorialDone: false
      };
    }

    static load() {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const initial = this.getDefaultProfile();
          const merged = Object.assign({}, initial, parsed);
          merged.upgrades = Object.assign({}, initial.upgrades, parsed.upgrades || {});
          merged.stats = Object.assign({}, initial.stats, parsed.stats || {});
          merged.settings = Object.assign({}, initial.settings, parsed.settings || {});
          if (!Array.isArray(merged.unlockedAircraft)) merged.unlockedAircraft = ['FALCON'];
          if (!merged.unlockedAircraft.includes('FALCON')) merged.unlockedAircraft.push('FALCON');
          if (merged.settings.musicVol === undefined || merged.settings.musicVol < 0.75) {
            merged.settings.musicVol = 0.85;
          }
          return merged;
        }
      } catch (e) {}
      return this.getDefaultProfile();
    }

    static save(profile) {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(profile));
      } catch (e) {}
    }

    static getRank(xp) {
      const ranks = CONFIG.RANKS;
      let cur = ranks[0];
      let next = ranks[1] || null;
      let idx = 0;
      for (let i = ranks.length - 1; i >= 0; i--) {
        if (xp >= ranks[i].minXp) {
          cur = ranks[i];
          next = ranks[i + 1] || null;
          idx = i;
          break;
        }
      }
      const prevMin = cur.minXp;
      const nextMin = next ? next.minXp : (prevMin + 15000);
      const progress = Math.min(1.0, Math.max(0.0, (xp - prevMin) / (nextMin - prevMin)));
      return { cur, next, idx, progress };
    }

    static getEffectiveAircraftStats(typeId, profile) {
      const base = CONFIG.AIRCRAFT[typeId] || CONFIG.AIRCRAFT.FALCON;
      const s = Object.assign({}, base);
      const up = (profile && profile.upgrades && profile.upgrades[typeId])
        ? profile.upgrades[typeId]
        : { speed: 1, agility: 1, firepower: 1, armor: 1, boost: 1 };

      // Top Speed bonus (+4% per level above 1)
      const spdMult = 1 + (up.speed - 1) * 0.04;
      s.maxSpeed = Math.round(base.maxSpeed * spdMult);
      s.boostMaxSpeed = Math.round(base.boostMaxSpeed * spdMult);
      s.cruiseSpeed = Math.round(base.cruiseSpeed * spdMult);

      // Agility bonus (+5% turn rates per level above 1)
      const agiMult = 1 + (up.agility - 1) * 0.05;
      s.pitchRate = Number((base.pitchRate * agiMult).toFixed(2));
      s.rollRate = Number((base.rollRate * agiMult).toFixed(2));
      s.yawRate = Number((base.yawRate * agiMult).toFixed(2));

      // Firepower bonus (+1 dmg per level, +2 fire rate)
      s.cannonDamage = base.cannonDamage + (up.firepower - 1);
      s.cannonFireRate = base.cannonFireRate + (up.firepower - 1) * 2;

      // Armor bonus (+12 HP per level)
      s.maxHp = base.maxHp + (up.armor - 1) * 12;
      s.playerMaxHp = s.maxHp;

      // Nitro Boost Fuel bonus (+15% max boost capacity)
      s.boostMaxEnergy = 100 + (up.boost - 1) * 15;

      // Sensitivity and Invert Y from settings
      if (profile && profile.settings) {
        s.mouseSens = profile.settings.mouseSens || 1.0;
        s.invertY = Boolean(profile.settings.invertY);
      }
      return s;
    }

    static getUpgradePreviewStats(typeId, category, profile) {
      if (!profile || !profile.upgrades || !profile.upgrades[typeId]) {
        return this.getEffectiveAircraftStats(typeId, profile);
      }
      const curUp = profile.upgrades[typeId];
      const curLvl = curUp[category] || 1;
      if (curLvl >= 5) return this.getEffectiveAircraftStats(typeId, profile);
      const nextProfile = Object.assign({}, profile, {
        upgrades: Object.assign({}, profile.upgrades, {
          [typeId]: Object.assign({}, curUp, { [category]: curLvl + 1 })
        })
      });
      return this.getEffectiveAircraftStats(typeId, nextProfile);
    }
  }

window.CareerManager = CareerManager;
