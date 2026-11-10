"use strict";

  /* ============================================================================
   * 1. CONFIG OBJECT (Doubled 32KM Map, CTF Rules, Boost, Auto-Regen & Guns-Only)
   * ============================================================================
   */
  const CONFIG = {
    WORLD: {
      size: 48000,             // LARGER 48KM x 48KM Mega Map!
      softBoundary: 18500,     // Warning distance from origin
      hardBoundary: 21000,     // Autopilot turn-back boundary
      maxAltitude: 6500,       // 6,500m world ceiling limit
      seaLevel: 0,
      cloudCount: 150,         // Rich high-altitude cloud deck across the 48km map
      lodDistance: 5200,
      blueBasePos: new THREE.Vector3(0, 185, 6600),   // South Fortress Island
      redBasePos:  new THREE.Vector3(0, 185, -6600)   // North Citadel Island
    },
    CTF: {
      capturesToWin: 3,        // Strictly 3 Captures to Win!
      roundTimeLimit: 600,     // 10-Minute (600s) time-capped rounds with Sudden Death Golden Cap!
      pickupRadius: 165,       // Generous fly-through radius to snatch/capture flags
      returnRadius: 155,       // Fly-through radius to return a dropped friendly flag
      autoReturnTime: 25.0,    // Seconds before a dropped flag auto-returns to base
      dropPickupCooldown: 3.5, // Seconds before a pilot who dropped the flag can re-grab it
      capturePoints: 1000,     // 1000 points per flag capture!
      stealPoints: 100,
      returnPoints: 150,
      carrierKillBonus: 200,
      carrierSpeedMult: 0.86   // Slight drag when carrying flag
    },
    PHYSICS: {
      gravity: 15.0,
      stallSpeed: 50.0,
      recoverySpeed: 72.0,
      optimalSpeed: 230.0,
      liftCoeff: 1.28,
      inducedDrag: 0.12,
      parasiticDrag: 0.00010,
      pitchDamping: 11.0,
      rollDamping: 12.0,
      yawDamping: 10.0
    },
    BOOST: {
      maxEnergy: 100,
      drainRate: 22.0,         // % per second while holding Shift
      regenRate: 22.0,         // % per second when not boosting
      regenDelay: 0.45,        // Seconds after releasing Shift before regen starts
      speedMultiplier: 1.56,   // Massive nitro afterburner top speed multiplier
      thrustMultiplier: 2.20   // Massive afterburner kick
    },
    REGEN: {
      regenDelay: 3.0,         // NO health regenerated within 3.0 seconds of being hit!
      regenRate: 2.2           // Slow, steady health regeneration (2.2 HP/sec) after 3s out of damage
    },
    AIRCRAFT: {
      FALCON: {
        id: 'FALCON',
        name: 'Falcon F-22',
        shortName: 'Falcon',
        tagline: 'Balanced All-Rounder (Stealth Airframe)',
        unlockCost: 0,
        reqRank: 0,
        maxSpeed: 420,
        boostMaxSpeed: 655,
        cruiseSpeed: 260,
        minSpeed: 70,
        baseThrust: 230,
        abThrust: 355,
        accelMultiplier: 1.30,
        pitchRate: 2.70,
        rollRate: 4.80,
        yawRate: 2.60,
        lowSpeedAgility: 1.25,
        maxHp: 100,
        playerMaxHp: 100,
        cannonFireRate: 24,
        cannonMuzzleSpeed: 1480,
        cannonDamage: 5
      },
      VIPER: {
        id: 'VIPER',
        name: 'Viper Interceptor',
        shortName: 'Viper',
        tagline: 'Ultra-Fast Interceptor & Turbo Afterburner',
        unlockCost: 1200,
        reqRank: 3,
        maxSpeed: 460,
        boostMaxSpeed: 720,
        cruiseSpeed: 290,
        minSpeed: 80,
        baseThrust: 265,
        abThrust: 415,
        accelMultiplier: 1.45,
        pitchRate: 2.40,
        rollRate: 4.50,
        yawRate: 2.30,
        lowSpeedAgility: 1.10,
        maxHp: 85,
        playerMaxHp: 85,
        cannonFireRate: 26,
        cannonMuzzleSpeed: 1620,
        cannonDamage: 5
      },
      TITAN: {
        id: 'TITAN',
        name: 'Titan Fortress',
        shortName: 'Titan',
        tagline: 'Heavy Armored Gunship & Twin-Cannon Firepower',
        unlockCost: 2400,
        reqRank: 6,
        maxSpeed: 380,
        boostMaxSpeed: 590,
        cruiseSpeed: 235,
        minSpeed: 60,
        baseThrust: 240,
        abThrust: 360,
        accelMultiplier: 1.15,
        pitchRate: 2.20,
        rollRate: 4.00,
        yawRate: 2.15,
        lowSpeedAgility: 1.30,
        maxHp: 140,
        playerMaxHp: 140,
        cannonFireRate: 28,
        cannonMuzzleSpeed: 1380,
        cannonDamage: 6
      },
      PHANTOM: {
        id: 'PHANTOM',
        name: 'Phantom Dogfighter',
        shortName: 'Phantom',
        tagline: 'Forward-Swept Wings & Maximum Turn Agility',
        unlockCost: 3800,
        reqRank: 9,
        maxSpeed: 405,
        boostMaxSpeed: 630,
        cruiseSpeed: 250,
        minSpeed: 55,
        baseThrust: 225,
        abThrust: 350,
        accelMultiplier: 1.35,
        pitchRate: 3.40,
        rollRate: 5.60,
        yawRate: 3.20,
        lowSpeedAgility: 1.55,
        maxHp: 95,
        playerMaxHp: 95,
        cannonFireRate: 24,
        cannonMuzzleSpeed: 1480,
        cannonDamage: 5
      },
      SPECTRE: {
        id: 'SPECTRE',
        name: 'Spectre Stealth',
        shortName: 'Spectre',
        tagline: 'Flying-Wing Long-Range Precision Strike',
        unlockCost: 5500,
        reqRank: 12,
        maxSpeed: 430,
        boostMaxSpeed: 670,
        cruiseSpeed: 270,
        minSpeed: 68,
        baseThrust: 235,
        abThrust: 370,
        accelMultiplier: 1.28,
        pitchRate: 2.80,
        rollRate: 4.90,
        yawRate: 2.75,
        lowSpeedAgility: 1.25,
        maxHp: 110,
        playerMaxHp: 110,
        cannonFireRate: 22,
        cannonMuzzleSpeed: 1800,
        cannonDamage: 6
      }
    },
    WEAPONS: {
      CANNON: {
        fireRate: 24,            // 24 rounds/sec twin rotary cannon
        muzzleSpeed: 1480,       // High-velocity rounds
        damage: 5,               // Strictly 5 damage per bullet (20 hits to down a 100 HP plane)!
        lifetime: 2.2,
        hitRadius: 19.0,         // Generous arcade hit detection cylinder
        gravityDrop: 2.5,        // Flat, accurate trajectory
        aimAssistConeRad: 0.16   // Smart magnetic lead-assist cone around cursor
      }
    },
    AI_DIFFICULTY: {
      EASY: {
        label: 'Grand Ace',
        reactionDelay: 0.12,
        aimErrorRad: 0.008,
        aggressiveness: 0.98,
        turnCommit: 0.96,
        maxSpeedUse: 0.96,
        boostAggression: 0.90
      },
      NORMAL: {
        label: 'Grand Ace',
        reactionDelay: 0.12,
        aimErrorRad: 0.008,
        aggressiveness: 0.98,
        turnCommit: 0.96,
        maxSpeedUse: 0.96,
        boostAggression: 0.90
      },
      ACE: {
        label: 'Grand Ace',
        reactionDelay: 0.12,
        aimErrorRad: 0.008,
        aggressiveness: 0.98,
        turnCommit: 0.96,
        maxSpeedUse: 0.96,
        boostAggression: 0.90
      }
    },
    LIVERIES: [
      { name: 'Air Superiority Grey', body: 0x5c636b, dark: 0x2b3036, trim: 0xd9822b, abOuter: 0xe67322, abInner: 0xffe4a1 },
      { name: 'Fleet Naval Blue',     body: 0x485666, dark: 0x222a33, trim: 0x5e97d1, abOuter: 0x5e97d1, abInner: 0xdbeafe },
      { name: 'Aggressor Crimson',    body: 0x454141, dark: 0x201d1d, trim: 0xc9443e, abOuter: 0xd9483b, abInner: 0xfef08a },
      { name: 'Nighthawk Stealth',    body: 0x232528, dark: 0x121315, trim: 0x767b82, abOuter: 0xe67322, abInner: 0xfff3c4 },
      { name: 'Desert Flanker',       body: 0x7d705c, dark: 0x3b3328, trim: 0xcfa03e, abOuter: 0xe67322, abInner: 0xfef08a },
      { name: 'Arctic Splinter',      body: 0xcfd4d9, dark: 0x586069, trim: 0x456280, abOuter: 0x8cb3d9, abInner: 0xffffff }
    ],
    TRACERS: [
      { name: 'Incendiary Gold', hex: 0xf0d284 },
      { name: 'Tracer Amber', hex: 0xe07b28 },
      { name: 'Combat Crimson', hex: 0xc9443e },
      { name: 'Phosphor Green', hex: 0x52c468 },
      { name: 'Tactical Cobalt', hex: 0x5e97d1 },
      { name: 'Magnesium White', hex: 0xf2f0eb }
    ],
    RANKS: [
      { name: 'Cadet I', minXp: 0, badge: 'CADET I', icon: '[C-1]' },
      { name: 'Cadet II', minXp: 600, badge: 'CADET II', icon: '[C-2]' },
      { name: 'Cadet III', minXp: 1400, badge: 'CADET III', icon: '[C-3]' },
      { name: 'Bronze I', minXp: 2400, badge: 'BRONZE I', icon: '[B-1]' },
      { name: 'Bronze II', minXp: 3600, badge: 'BRONZE II', icon: '[B-2]' },
      { name: 'Bronze III', minXp: 5000, badge: 'BRONZE III', icon: '[B-3]' },
      { name: 'Silver I', minXp: 6800, badge: 'SILVER I', icon: '[S-1]' },
      { name: 'Silver II', minXp: 8800, badge: 'SILVER II', icon: '[S-2]' },
      { name: 'Silver III', minXp: 11200, badge: 'SILVER III', icon: '[S-3]' },
      { name: 'Gold I', minXp: 14000, badge: 'GOLD I', icon: '[G-1]' },
      { name: 'Gold II', minXp: 17200, badge: 'GOLD II', icon: '[G-2]' },
      { name: 'Gold III', minXp: 21000, badge: 'GOLD III', icon: '[G-3]' },
      { name: 'Platinum I', minXp: 25500, badge: 'PLATINUM I', icon: '[P-1]' },
      { name: 'Platinum II', minXp: 30500, badge: 'PLATINUM II', icon: '[P-2]' },
      { name: 'Diamond I', minXp: 36500, badge: 'DIAMOND I', icon: '[D-1]' },
      { name: 'Ace', minXp: 44000, badge: 'ACE PILOT', icon: '[ACE]' },
      { name: 'Grand Ace', minXp: 55000, badge: 'GRAND ACE', icon: '[TOP GUN]' }
    ],
    UPGRADE_COSTS: [0, 250, 550, 950, 1500],
    UPGRADE_DESCS: {
      speed: { name: 'Top Cruise & Afterburner Speed', perk: '+4% Speed per level' },
      agility: { name: 'Turn Authority & Airbrake Agility', perk: '+5% Pitch & Turn Rate' },
      firepower: { name: 'Rotary Cannon Damage & Fire-Rate', perk: '+1 Bullet DMG & +2 rds/s' },
      armor: { name: 'Reinforced Titanium Airframe HP', perk: '+12 Max Hull HP' },
      boost: { name: 'Nitro Afterburner Tank Capacity', perk: '+15% Boost Fuel Energy' }
    },
    // Dedicated Objective-Centric AI Personalities (Zero visible strategy tags to player)
    ROLES: [
      {
        id: 'FLAG_RUNNER',
        desc: 'Relentless Flag Thief & High-Speed Sprinter',
        ignoresFlags: false
      },
      {
        id: 'BASE_GUARDIAN',
        desc: 'Loyal Base & Flag Stand Guardian',
        ignoresFlags: false
      },
      {
        id: 'ESCORT_WING',
        desc: 'Tactical Wingman & Carrier Escort Shield',
        ignoresFlags: false
      },
      {
        id: 'STEALTH_FLANKER',
        desc: 'Wide-Flanking Canyon Infiltrator & Flag Thief',
        ignoresFlags: false
      },
      {
        id: 'HUNTER_KILLER',
        desc: 'Pincer Interceptor & Flag Retrieval Hunter',
        ignoresFlags: false
      }
    ],
    PILOT_NAMES: [
      'ViperActual', 'KuroNeko', 'Sokol_57', 'Ghost_IN', 'Maverick88',
      'NachtFalke', 'SkyReaper', 'ApexPred', 'Raijin_JP', 'ShadowFox',
      'IceMan_US', 'Fenrir', 'StormCrow', 'NovaStrike', 'ZephyrX', 'RedBaron_'
    ]
  };

  // Aircraft type backward aliases
  CONFIG.AIRCRAFT.F22 = CONFIG.AIRCRAFT.FALCON;
  CONFIG.AIRCRAFT.SU57 = CONFIG.AIRCRAFT.PHANTOM;
  CONFIG.AIRCRAFT_KEYS = ['FALCON', 'VIPER', 'TITAN', 'PHANTOM', 'SPECTRE'];

  // Role backward aliases
  CONFIG.ROLES.FLAG_CHASER = CONFIG.ROLES[0];
  CONFIG.ROLES.FLAG_PROTECTOR = CONFIG.ROLES[1];
  CONFIG.ROLES.ESCORT = CONFIG.ROLES[2];
  CONFIG.ROLES.SHENANIGANS = CONFIG.ROLES[3];
  CONFIG.ROLES.BRAWLER = CONFIG.ROLES[4];


  // Reusable scratch math objects
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _v3 = new THREE.Vector3();
  const _v4 = new THREE.Vector3();
  const _v5 = new THREE.Vector3();
  const _q1 = new THREE.Quaternion();
  const _q2 = new THREE.Quaternion();
  const _euler1 = new THREE.Euler();

window.CONFIG = CONFIG;
window._v1 = _v1;
window._v2 = _v2;
window._v3 = _v3;
window._v4 = _v4;
window._v5 = _v5;
window._q1 = _q1;
window._q2 = _q2;
window._euler1 = _euler1;
