"use strict";

  /* ============================================================================
   * 12. MAIN GAME CONTROLLER (5v5 Capture The Flag, 10-Min Round Cap & Meta-Progression)
   * ============================================================================
   */
  class Game {
    static escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    constructor() {
      this.canvas = document.getElementById('webgl-canvas');
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 1.5, 48000);

      this.cg = new CrazyGamesBridge();
      this.audio = new AudioEngine();
      this.input = new InputManager(this.audio);
      this.world = new World(this.scene);
      this.particles = new ParticleManager(this.scene);
      this.particles.game = this;
      this.weapons = new WeaponsManager(this.scene, this.particles, this.audio, this);
      this.hud = new HUDRenderer(document.getElementById('hud-canvas'));
      this.hud.resize(window.innerWidth, window.innerHeight);

      // Meta-Progression & Career Profile
      this.career = CareerManager.load();
      if (!this.career.unlockedAircraft || !this.career.unlockedAircraft.includes(this.career.selectedAircraft)) {
        this.career.selectedAircraft = (this.career.unlockedAircraft && this.career.unlockedAircraft[0]) || 'FALCON';
        CareerManager.save(this.career);
      }
      this.selectedAircraft = this.career.selectedAircraft || 'FALCON';
      this.previewAircraft = this.selectedAircraft;
      this.selectedTeam = this.career.selectedTeam || 'BLUE';
      this.selectedLivery = this.career.selectedLivery || 0;
      this.selectedTracer = this.career.selectedTracer || 0;
      if (CONFIG.TRACERS && CONFIG.TRACERS[this.selectedTracer]) {
        this.weapons.setPlayerTracerColor(CONFIG.TRACERS[this.selectedTracer].hex);
      }

      // Apply audio volumes from career settings
      this.audio.setMusicVolume(this.career.settings.musicVol);
      this.audio.setSfxVolume(this.career.settings.sfxVol);

      this.namePoolIndex = 0;
      this.highScore = this.career.stats.bestScore || 0;
      this.highScoreDirty = false;
      this.lastHighScoreSave = 0;

      this.state = 'MENU'; // MENU, PLAYING, PAUSED, SPECTATING, ENDED
      this.aircraftList = [];
      this.player = null;
      this.spectateTarget = null;
      this.cameraMode = 'CHASE';
      this.smoothCamPos = new THREE.Vector3();
      this.smoothCamLook = new THREE.Vector3();
      this.camShakeTimer = 0;
      this.camShakeIntensity = 0;
      this.tabPressTime = 0;
      this.elapsedSortieSec = 0;
      this.remainingMatchSec = CONFIG.CTF.roundTimeLimit;
      this.isSuddenDeath = false;
      this.timeAlertsTriggered = {};
      this.teamCaptures = { BLUE: 0, RED: 0 };
      this.teamCommanders = {
        BLUE: new TeamCommander('BLUE'),
        RED: new TeamCommander('RED')
      };

      this.tutorial = new TutorialManager(this);

      // Mid-Respawn Workshop & Deployment State
      this.inRespawnWorkshop = false;
      this.respawnAwaitingDeploy = false;
      this.respawnPreviewJet = this.selectedAircraft || 'FALCON';

      // Setup 3D Showroom Mouse Drag Orbit
      this.showroomOrbit = {
        isDragging: false,
        prevX: 0,
        prevY: 0,
        azimuth: 0.45,
        elevation: 0.16,
        dist: 17.5,
        autoSpinSpeed: 0.18
      };

      const cvs = this.canvas;
      cvs.addEventListener('pointerdown', (e) => {
        if (this.state !== 'MENU' && !this.inRespawnWorkshop) return;
        this.showroomOrbit.isDragging = true;
        this.showroomOrbit.prevX = e.clientX;
        this.showroomOrbit.prevY = e.clientY;
        try { cvs.setPointerCapture(e.pointerId); } catch (_) {}
      });
      window.addEventListener('pointermove', (e) => {
        if ((this.state !== 'MENU' && !this.inRespawnWorkshop) || !this.showroomOrbit.isDragging) return;
        const dx = e.clientX - this.showroomOrbit.prevX;
        const dy = e.clientY - this.showroomOrbit.prevY;
        this.showroomOrbit.prevX = e.clientX;
        this.showroomOrbit.prevY = e.clientY;

        this.showroomOrbit.azimuth -= dx * 0.0065;
        this.showroomOrbit.elevation = Math.max(-0.06, Math.min(0.55, this.showroomOrbit.elevation + dy * 0.0055));
      });
      const stopOrbitDrag = (e) => {
        if (this.showroomOrbit.isDragging) {
          this.showroomOrbit.isDragging = false;
          try { cvs.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      window.addEventListener('pointerup', stopOrbitDrag);
      window.addEventListener('pointercancel', stopOrbitDrag);

      // Setup 3D Tactical Military Bunker Hangar
      this.setupHangarBay();

      this.menuFighter = AircraftModelFactory.createAircraftMesh(this.selectedAircraft, this.selectedLivery, this.selectedTeam);
      this.menuFighter.position.set(0, 750, 0);
      this.scene.add(this.menuFighter);

      this.initHangarUI();
      this.bindUIEvents();
      this.handleResize();
      window.addEventListener('resize', () => this.handleResize());

      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'PLAYING') {
          this.setPaused(true);
        }
      });

      this.cg.init(this);
      this.lastTime = performance.now();

      if (!this.career.tutorialDone) {
        // Auto-Launch Maiden Flight Sortie for brand new pilots
        this.startMatch(true);
      } else {
        // Returning pilot: boot cleanly into 3D Hangar showroom
        this.state = 'MENU';
        document.getElementById('start-screen').classList.remove('hidden');
        document.getElementById('top-controls').classList.add('hidden');
        document.getElementById('touch-controls').classList.add('hidden');
        this.updateMenuPreviewMesh();
      }

      this.animate();
    }

    setupHangarBay() {
      if (this.hangarBay) return;
      this.hangarBay = new THREE.Group();
      this.hangarBay.position.set(0, 746, 0);
      this.hangarBayMeshes = [];

      // 1. Concrete Tarmac Floor with High-Res Procedural Canvas Texture
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');

      // Industrial concrete base
      ctx.fillStyle = '#0f1422';
      ctx.fillRect(0, 0, 1024, 1024);

      // Concrete tile expansion seams
      ctx.strokeStyle = '#070b14';
      ctx.lineWidth = 6;
      for (let x = 0; x <= 1024; x += 256) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke();
      }
      for (let y = 0; y <= 1024; y += 256) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
      }

      // Tactical yellow taxi hazard stripes (45-degree caution lines along bottom border)
      ctx.save();
      ctx.fillStyle = '#eab308';
      for (let i = -1024; i < 2048; i += 72) {
        ctx.beginPath();
        ctx.moveTo(i, 870);
        ctx.lineTo(i + 34, 870);
        ctx.lineTo(i + 134, 1024);
        ctx.lineTo(i + 100, 1024);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Aircraft Staging Parking Box
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 8;
      ctx.setLineDash([24, 16]);
      ctx.strokeRect(180, 180, 664, 664);
      ctx.setLineDash([]);

      // Corner Chevron Brackets
      ctx.strokeStyle = '#00ff9d';
      ctx.lineWidth = 10;
      const bLen = 80;
      ctx.beginPath(); ctx.moveTo(180, 180 + bLen); ctx.lineTo(180, 180); ctx.lineTo(180 + bLen, 180); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(844 - bLen, 180); ctx.lineTo(844, 180); ctx.lineTo(844, 180 + bLen); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(180, 844 - bLen); ctx.lineTo(180, 844); ctx.lineTo(180 + bLen, 844); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(844 - bLen, 844); ctx.lineTo(844, 844); ctx.lineTo(844, 844 - bLen); ctx.stroke();

      // Stenciled Military Markings
      ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.font = 'bold 34px "Orbitron", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('TACTICAL CTF AIRBASE // STAGING BAY 01', 512, 260);

      ctx.font = 'bold 22px monospace';
      ctx.fillStyle = 'rgba(251, 191, 36, 0.6)';
      ctx.fillText('CAUTION: KEEP CLEAR OF JET BLAST & INTAKES', 512, 780);

      const floorTex = new THREE.CanvasTexture(canvas);
      const floorGeo = new THREE.PlaneGeometry(120, 120);
      floorGeo.rotateX(-Math.PI * 0.5);
      const floorMat = new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: 0.65,
        metalness: 0.25
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.position.set(0, 0, 0);
      this.hangarBay.add(floorMesh);
      this.hangarBayMeshes.push(floorMesh);

      // 2. Bunker Blast Wall
      const wallGeo = new THREE.BoxGeometry(120, 40, 2);
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x080d1a,
        roughness: 0.8,
        metalness: 0.3
      });
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(0, 20, -50);
      this.hangarBay.add(wallMesh);
      this.hangarBayMeshes.push(wallMesh);

      // Hangar Structural Steel Trusses
      const trussGeo = new THREE.BoxGeometry(2, 40, 3);
      const trussMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
      for (const tx of [-40, -20, 0, 20, 40]) {
        const tMesh = new THREE.Mesh(trussGeo, trussMat);
        tMesh.position.set(tx, 20, -49);
        this.hangarBay.add(tMesh);
        this.hangarBayMeshes.push(tMesh);
      }

      // Overhead Ceiling Beam
      const beamGeo = new THREE.BoxGeometry(120, 3, 3);
      const beamMesh = new THREE.Mesh(beamGeo, trussMat);
      beamMesh.position.set(0, 38, -49);
      this.hangarBay.add(beamMesh);
      this.hangarBayMeshes.push(beamMesh);

      // 3. Overhead Industrial Floodlights
      const floodLight = new THREE.SpotLight(0xf1f5f9, 2.4, 90, Math.PI * 0.30, 0.6, 1.2);
      floodLight.position.set(0, 34, 6);
      floodLight.target.position.set(0, 4, 0);
      this.hangarBay.add(floodLight);
      this.hangarBay.add(floodLight.target);

      const rimLight = new THREE.SpotLight(0x38bdf8, 1.8, 75, Math.PI * 0.35, 0.7, 1.2);
      rimLight.position.set(-26, 16, -20);
      rimLight.target.position.set(0, 4, 0);
      this.hangarBay.add(rimLight);
      this.hangarBay.add(rimLight.target);

      const amberAccent = new THREE.PointLight(0xfbbf24, 1.2, 55);
      amberAccent.position.set(22, 4, 15);
      this.hangarBay.add(amberAccent);

      // 4. Staging Turntable Platform Disc with Glowing Rim
      const turntableGeo = new THREE.CylinderGeometry(15, 15.6, 0.35, 48);
      const turntableMat = new THREE.MeshStandardMaterial({
        color: 0x080f1d,
        roughness: 0.45,
        metalness: 0.75
      });
      const turntableMesh = new THREE.Mesh(turntableGeo, turntableMat);
      turntableMesh.position.set(0, 0.17, 0);
      this.hangarBay.add(turntableMesh);
      this.hangarBayMeshes.push(turntableMesh);

      // Glowing Cyan Perimeter Ring
      const ringGeo = new THREE.RingGeometry(14.8, 15.3, 64);
      ringGeo.rotateX(-Math.PI * 0.5);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(0, 0.36, 0);
      this.hangarBay.add(ringMesh);
      this.hangarBayMeshes.push(ringMesh);

      // Showroom Key / Fill Lights
      const showroomFill = new THREE.DirectionalLight(0xe0f2fe, 1.3);
      showroomFill.position.set(12, 16, 26);
      this.hangarBay.add(showroomFill);

      const showroomBacklight = new THREE.DirectionalLight(0x38bdf8, 0.9);
      showroomBacklight.position.set(-12, 14, -24);
      this.hangarBay.add(showroomBacklight);

      // 5. Atmospheric Floating Dust Specks
      const dustCount = 120;
      const dustGeo = new THREE.BufferGeometry();
      const dustPositions = new Float32Array(dustCount * 3);
      for (let i = 0; i < dustCount; i++) {
        dustPositions[i * 3 + 0] = (Math.random() - 0.5) * 36;
        dustPositions[i * 3 + 1] = 1 + Math.random() * 22;
        dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 36;
      }
      dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
      const dustMat = new THREE.PointsMaterial({
        color: 0xbae6fd,
        size: 0.35,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending
      });
      this.hangarDust = new THREE.Points(dustGeo, dustMat);
      this.hangarBay.add(this.hangarDust);
      this.hangarBayMeshes.push(this.hangarDust);

      this.scene.add(this.hangarBay);

      // Studio Dark Void Backdrop Sphere (isolates 3D aircraft so nothing else is visible mid-respawn)
      const studioVoidGeo = new THREE.SphereGeometry(65, 32, 24);
      const studioVoidMat = new THREE.MeshBasicMaterial({
        color: 0x030712,
        side: THREE.BackSide
      });
      this.studioVoid = new THREE.Mesh(studioVoidGeo, studioVoidMat);
      this.studioVoid.position.set(0, 750, 0);
      this.studioVoid.visible = false;
      this.scene.add(this.studioVoid);
    }

    addCamShake(duration, intensity) {
      this.camShakeTimer = Math.max(this.camShakeTimer, duration);
      this.camShakeIntensity = Math.max(this.camShakeIntensity, intensity);
    }

    initHangarUI() {
      this.renderHangarProfile();
      this.renderWorkshopUI();
      this.renderPilotStats();
      this.syncCustomizationUI();
      this.syncSettingsUI();
    }

    renderHangarProfile() {
      const rankInfo = CareerManager.getRank(this.career.xp);
      const iconEl = document.getElementById('hangar-rank-icon');
      const nameEl = document.getElementById('hangar-rank-name');
      const xpFillEl = document.getElementById('hangar-xp-fill');
      const creditsEl = document.getElementById('hangar-credits-val');

      if (iconEl) iconEl.textContent = rankInfo.cur.badge;
      if (nameEl) nameEl.textContent = rankInfo.cur.name;
      if (xpFillEl) xpFillEl.style.width = `${Math.round(rankInfo.progress * 100)}%`;
      if (creditsEl) creditsEl.textContent = this.career.credits.toLocaleString();

      const callsignInput = document.getElementById('input-callsign');
      if (callsignInput) callsignInput.value = this.career.callsign || 'NightHawk_IN';
    }

    renderWorkshopUI() {
      const targetJet = this.previewAircraft || this.selectedAircraft || 'FALCON';
      const baseDef = CONFIG.AIRCRAFT[targetJet] || CONFIG.AIRCRAFT.FALCON;
      const eff = CareerManager.getEffectiveAircraftStats(targetJet, this.career);
      const isUnlocked = this.career.unlockedAircraft.includes(targetJet);
      const isEquipped = (this.selectedAircraft === targetJet);
      const unlockCost = baseDef.unlockCost !== undefined ? baseDef.unlockCost : (baseDef.cost || 0);
      const idx = CONFIG.AIRCRAFT_KEYS.indexOf(targetJet);

      // 1. Carousel Header Info
      const counterEl = document.getElementById('carousel-jet-counter');
      const nameEl = document.getElementById('carousel-jet-name');
      const roleEl = document.getElementById('carousel-jet-role');
      const actionSlot = document.getElementById('carousel-jet-action-slot');
      const upJetName = document.getElementById('upgrade-jet-name');

      if (counterEl) counterEl.textContent = `AIRCRAFT ${idx + 1} OF ${CONFIG.AIRCRAFT_KEYS.length}`;
      if (nameEl) nameEl.textContent = baseDef.name;
      if (roleEl) roleEl.textContent = (baseDef.tagline || baseDef.tag || 'MULTI-ROLE COMBAT FIGHTER').toUpperCase();
      if (upJetName) upJetName.textContent = (baseDef.shortName || baseDef.name).toUpperCase();

      if (actionSlot) {
        actionSlot.innerHTML = '';
        if (isEquipped) {
          actionSlot.innerHTML = `<span class="jet-status-badge equipped">✓ EQUIPPED IN SERVICE</span>`;
        } else if (isUnlocked) {
          const btn = document.createElement('button');
          btn.className = 'primary-btn btn-equip-action';
          btn.style.cssText = 'font-size:12px;padding:7px 24px;background:#00ff9d;color:#040914;font-weight:800;border:none;border-radius:4px;cursor:pointer;';
          btn.textContent = '✈ EQUIP FIGHTER';
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.equipAircraft(targetJet);
          });
          actionSlot.appendChild(btn);
        } else {
          const btn = document.createElement('button');
          btn.className = 'primary-btn btn-unlock-action';
          btn.style.cssText = 'font-size:12px;padding:7px 24px;background:#fbbf24;color:#0f172a;font-weight:800;border:none;border-radius:4px;cursor:pointer;';
          btn.textContent = `🔓 UNLOCK AIRFRAME (₵${unlockCost.toLocaleString()})`;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.unlockAircraft(targetJet);
          });
          actionSlot.appendChild(btn);
        }
      }

      // 2. Quick Jet Picker Pills
      const pillRow = document.getElementById('jet-pill-row');
      if (pillRow) {
        pillRow.innerHTML = '';
        CONFIG.AIRCRAFT_KEYS.forEach(key => {
          const def = CONFIG.AIRCRAFT[key];
          const unl = this.career.unlockedAircraft.includes(key);
          const eqp = (this.selectedAircraft === key);
          const act = (targetJet === key);
          const pill = document.createElement('div');
          pill.className = `jet-pill ${act ? 'active' : ''} ${eqp ? 'equipped-pill' : ''}`;
          const icon = eqp ? '✓ ' : (!unl ? '🔒 ' : '');
          pill.textContent = `${icon}${def.shortName || def.name}`;
          pill.addEventListener('click', () => {
            this.selectAirframe(key);
          });
          pillRow.appendChild(pill);
        });
      }

      // 3. Upgrades Compact List
      const upContainer = document.getElementById('upgrades-grid-container');
      if (upContainer) {
        upContainer.innerHTML = '';
        const cats = ['speed', 'agility', 'firepower', 'armor', 'boost'];
        const catLabels = {
          speed: `Top Speed (${eff.maxSpeed} km/h)`,
          agility: `Agility & High-G Turn Authority`,
          firepower: `20mm Cannon Damage (${eff.cannonDamage} dmg)`,
          armor: `Hull Armor (${eff.maxHp} HP)`,
          boost: `Afterburner Fuel (${eff.boostMaxEnergy} fuel)`
        };

        const curUps = (this.career.upgrades && this.career.upgrades[targetJet])
          ? this.career.upgrades[targetJet]
          : { speed: 1, agility: 1, firepower: 1, armor: 1, boost: 1 };

        cats.forEach(cat => {
          const curLvl = curUps[cat] || 1;
          const nextCost = (curLvl < 5) ? CONFIG.UPGRADE_COSTS[curLvl] : 0;
          const upDescObj = CONFIG.UPGRADE_DESCS[cat];
          const desc = upDescObj ? `${upDescObj.name} • ${upDescObj.perk}` : '';

          let dotsHtml = '';
          for (let i = 1; i <= 5; i++) {
            dotsHtml += `<span class="lvl-dot ${i <= curLvl ? 'filled' : ''}"></span>`;
          }

          let btnHtml = '';
          if (curLvl < 5) {
            const canAfford = this.career.credits >= nextCost;
            btnHtml = `<button class="primary-btn btn-buy-upgrade" data-cat="${cat}" style="font-size:10px;padding:4px 10px;${canAfford ? 'background:#00ff9d;color:#040914;' : 'opacity:0.6;background:#64748b;color:#f8fafc;'}">UPGRADE (₵${nextCost})</button>`;
          } else {
            btnHtml = `<span style="font-size:10px;color:#00ff9d;font-weight:800;font-family:monospace;">MAX LEVEL</span>`;
          }

          const item = document.createElement('div');
          item.className = 'upgrade-row-item';
          item.innerHTML = `
            <div class="upgrade-row-header">
              <span class="upgrade-cat-name">${catLabels[cat]}</span>
              <span style="font-size:10px;color:#38bdf8;font-family:monospace;">Lvl ${curLvl} / 5</span>
            </div>
            <div class="upgrade-cat-perk">${desc}</div>
            <div class="upgrade-row-bottom">
              <div class="upgrade-level-dots" style="flex:1;max-width:140px;">${dotsHtml}</div>
              ${btnHtml}
            </div>
          `;

          const buyBtn = item.querySelector('.btn-buy-upgrade');
          if (buyBtn) {
            buyBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.purchaseUpgrade(cat);
            });
          }

          upContainer.appendChild(item);
        });
      }
    }

    renderPilotStats() {
      const s = this.career.stats;
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setText('stat-sorties', s.sorties || 0);
      setText('stat-wins', s.wins || 0);
      const totalMatches = (s.wins || 0) + (s.losses || 0);
      const winRate = totalMatches > 0 ? Math.round(((s.wins || 0) / totalMatches) * 100) : 0;
      setText('stat-winrate', `${winRate}%`);
      setText('stat-kills', s.kills || 0);
      const kd = (s.deaths || 0) > 0 ? ((s.kills || 0) / s.deaths).toFixed(2) : (s.kills || 0).toFixed(1);
      setText('stat-kd', kd);
      setText('stat-caps', s.captures || 0);
    }

    syncCustomizationUI() {
      document.querySelectorAll('#livery-group .livery-swatch').forEach(sw => {
        const idx = parseInt(sw.dataset.livery, 10) || 0;
        sw.classList.toggle('active', idx === this.selectedLivery);
      });
      document.querySelectorAll('#tracer-group .livery-swatch').forEach(sw => {
        const idx = parseInt(sw.dataset.tracer, 10) || 0;
        sw.classList.toggle('active', idx === this.selectedTracer);
      });
      const btnBlue = document.getElementById('opt-team-blue');
      const btnRed = document.getElementById('opt-team-red');
      if (btnBlue && btnRed) {
        btnBlue.classList.toggle('active-blue', this.selectedTeam === 'BLUE');
        btnRed.classList.toggle('active-red', this.selectedTeam === 'RED');
      }
    }

    syncSettingsUI() {
      const cfg = this.career.settings;
      const sensSlider = document.getElementById('set-mouse-sens');
      const sensLbl = document.getElementById('lbl-mouse-sens');
      if (sensSlider && sensLbl) {
        sensSlider.value = cfg.mouseSens || 1.0;
        sensLbl.textContent = `${Number(cfg.mouseSens).toFixed(1)}x`;
      }
      const invertCheck = document.getElementById('set-invert-y');
      if (invertCheck) invertCheck.checked = Boolean(cfg.invertY);

      const musicSlider = document.getElementById('set-music-vol');
      const musicLbl = document.getElementById('lbl-music-vol');
      if (musicSlider && musicLbl) {
        musicSlider.value = cfg.musicVol !== undefined ? cfg.musicVol : 0.65;
        musicLbl.textContent = `${Math.round(musicSlider.value * 100)}%`;
      }

      const sfxSlider = document.getElementById('set-sfx-vol');
      const sfxLbl = document.getElementById('lbl-sfx-vol');
      if (sfxSlider && sfxLbl) {
        sfxSlider.value = cfg.sfxVol !== undefined ? cfg.sfxVol : 0.85;
        sfxLbl.textContent = `${Math.round(sfxSlider.value * 100)}%`;
      }

      const gfxSelect = document.getElementById('set-graphics');
      if (gfxSelect) gfxSelect.value = cfg.graphics || 'HIGH';
    }

    unlockAircraft(key) {
      const baseDef = CONFIG.AIRCRAFT[key];
      if (!baseDef) return;
      const cost = baseDef.unlockCost !== undefined ? baseDef.unlockCost : (baseDef.cost || 0);
      if (this.career.credits < cost) {
        this.addFloatingPopup(`NEED ₵${(cost - this.career.credits).toLocaleString()} MORE CREDITS!`, '#ff3b47');
        this.audio.playTone(220, 0.15, 'sawtooth', 0.2);
        return;
      }
      this.career.credits -= cost;
      if (!this.career.unlockedAircraft.includes(key)) {
        this.career.unlockedAircraft.push(key);
      }
      this.selectedAircraft = key;
      this.previewAircraft = key;
      this.career.selectedAircraft = key;
      CareerManager.save(this.career);

      this.audio.playTone(523.25, 0.1, 'triangle', 0.2);
      setTimeout(() => this.audio.playTone(659.25, 0.12, 'triangle', 0.22), 80);
      setTimeout(() => this.audio.playTone(783.99, 0.18, 'triangle', 0.25), 160);
      this.addFloatingPopup(`✈ ${baseDef.name} UNLOCKED & EQUIPPED!`, '#00ff9d');

      this.renderHangarProfile();
      this.renderWorkshopUI();
      this.updateMenuPreviewMesh();
    }

    purchaseUpgrade(category) {
      const jet = this.previewAircraft || this.selectedAircraft;
      if (!this.career.upgrades[jet]) {
        this.career.upgrades[jet] = { speed: 1, agility: 1, firepower: 1, armor: 1, boost: 1 };
      }
      const curLvl = this.career.upgrades[jet][category] || 1;
      if (curLvl >= 5) return;
      const cost = CONFIG.UPGRADE_COSTS[curLvl];
      if (this.career.credits < cost) {
        this.addFloatingPopup(`NEED ₵${cost - this.career.credits} MORE CREDITS!`, '#ff3b47');
        this.audio.playTone(220, 0.15, 'sawtooth', 0.2);
        return;
      }
      this.career.credits -= cost;
      this.career.upgrades[jet][category] = curLvl + 1;
      CareerManager.save(this.career);

      this.audio.playTone(440, 0.08, 'triangle', 0.18);
      setTimeout(() => this.audio.playTone(880, 0.15, 'triangle', 0.22), 70);
      this.addFloatingPopup(`UPGRADE APPLIED: LEVEL ${curLvl + 1}!`, '#00ff9d');

      this.renderHangarProfile();
      this.renderWorkshopUI();
    }

    selectAirframe(acId) {
      if (!CONFIG.AIRCRAFT[acId]) return;
      this.previewAircraft = acId;
      this.renderWorkshopUI();
      this.updateMenuPreviewMesh();
    }

    equipAircraft(acId) {
      if (!CONFIG.AIRCRAFT[acId]) return;
      if (!this.career.unlockedAircraft.includes(acId)) return;
      this.selectedAircraft = acId;
      this.previewAircraft = acId;
      this.career.selectedAircraft = acId;
      CareerManager.save(this.career);
      if (this.cg) this.cg.setData('fighterjets3d_aircraft', this.selectedAircraft);
      this.audio.playTone(587.33, 0.1, 'triangle', 0.22);
      this.addFloatingPopup(`✈ ${CONFIG.AIRCRAFT[acId].name} READY FOR COMBAT!`, '#00ff9d');
      this.renderWorkshopUI();
      this.updateMenuPreviewMesh();
    }

    selectTeam(team) {
      this.selectedTeam = team === 'RED' ? 'RED' : 'BLUE';
      this.career.selectedTeam = this.selectedTeam;
      CareerManager.save(this.career);
      this.syncCustomizationUI();
      this.updateMenuPreviewMesh();
    }

    selectLivery(liveryIdx) {
      this.selectedLivery = liveryIdx;
      this.career.selectedLivery = liveryIdx;
      CareerManager.save(this.career);
      this.syncCustomizationUI();
      this.updateMenuPreviewMesh();
      if (this.cg) this.cg.setData('fighterjets3d_livery', this.selectedLivery);
    }

    selectTracer(tracerIdx) {
      this.selectedTracer = tracerIdx;
      this.career.selectedTracer = tracerIdx;
      CareerManager.save(this.career);
      this.syncCustomizationUI();
      if (CONFIG.TRACERS && CONFIG.TRACERS[tracerIdx]) {
        this.weapons.setPlayerTracerColor(CONFIG.TRACERS[tracerIdx].hex);
      }
    }

    bindUIEvents() {
      // Hangar Tab Switching (Workshop vs Pilot Info)
      document.querySelectorAll('.hangar-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.hangar-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const target = btn.dataset.tab;

          const wingLeftWorkshop = document.getElementById('wing-left-workshop');
          const wingLeftPilot = document.getElementById('wing-left-pilot');
          const wingRightWorkshop = document.getElementById('wing-right-workshop');
          const wingRightPilot = document.getElementById('wing-right-pilot');

          if (wingLeftWorkshop) wingLeftWorkshop.classList.toggle('hidden', target !== 'workshop');
          if (wingLeftPilot) wingLeftPilot.classList.toggle('hidden', target !== 'pilot');
          if (wingRightWorkshop) wingRightWorkshop.classList.toggle('hidden', target !== 'workshop');
          if (wingRightPilot) wingRightPilot.classList.toggle('hidden', target !== 'pilot');

          if (target === 'workshop') this.renderWorkshopUI();
          if (target === 'pilot') this.renderPilotStats();
        });
      });

      // Carousel Navigation Buttons
      const btnPrev = document.getElementById('btn-prev-jet');
      if (btnPrev) {
        btnPrev.addEventListener('click', () => {
          const curIdx = CONFIG.AIRCRAFT_KEYS.indexOf(this.previewAircraft || this.selectedAircraft);
          const newIdx = (curIdx - 1 + CONFIG.AIRCRAFT_KEYS.length) % CONFIG.AIRCRAFT_KEYS.length;
          this.selectAirframe(CONFIG.AIRCRAFT_KEYS[newIdx]);
        });
      }
      const btnNext = document.getElementById('btn-next-jet');
      if (btnNext) {
        btnNext.addEventListener('click', () => {
          const curIdx = CONFIG.AIRCRAFT_KEYS.indexOf(this.previewAircraft || this.selectedAircraft);
          const newIdx = (curIdx + 1) % CONFIG.AIRCRAFT_KEYS.length;
          this.selectAirframe(CONFIG.AIRCRAFT_KEYS[newIdx]);
        });
      }

      // Livery Swatches
      document.querySelectorAll('#livery-group .livery-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          this.selectLivery(parseInt(sw.dataset.livery, 10) || 0);
        });
      });

      // Tracer Swatches
      document.querySelectorAll('#tracer-group .livery-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          this.selectTracer(parseInt(sw.dataset.tracer, 10) || 0);
        });
      });

      // Squadron selection
      document.getElementById('opt-team-blue').addEventListener('click', () => this.selectTeam('BLUE'));
      document.getElementById('opt-team-red').addEventListener('click', () => this.selectTeam('RED'));

      // Callsign Input
      const callsignInput = document.getElementById('input-callsign');
      if (callsignInput) {
        callsignInput.addEventListener('change', () => {
          this.career.callsign = callsignInput.value.trim() || 'NightHawk_IN';
          CareerManager.save(this.career);
        });
      }

      // Settings Modal
      const openSettings = () => {
        this.syncSettingsUI();
        document.getElementById('settings-modal').classList.remove('hidden');
      };
      const closeSettings = () => {
        document.getElementById('settings-modal').classList.add('hidden');
      };
      const btnOpenHangarSettings = document.getElementById('btn-open-settings');
      if (btnOpenHangarSettings) btnOpenHangarSettings.addEventListener('click', openSettings);
      const btnOpenPauseSettings = document.getElementById('btn-pause-settings');
      if (btnOpenPauseSettings) btnOpenPauseSettings.addEventListener('click', openSettings);
      const btnCloseSettings = document.getElementById('btn-close-settings');
      if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettings);

      // Settings Sliders & Inputs
      const sensSlider = document.getElementById('set-mouse-sens');
      if (sensSlider) {
        sensSlider.addEventListener('input', () => {
          const v = parseFloat(sensSlider.value) || 1.0;
          this.career.settings.mouseSens = v;
          const lbl = document.getElementById('lbl-mouse-sens');
          if (lbl) lbl.textContent = `${v.toFixed(1)}x`;
          CareerManager.save(this.career);
          if (this.player && this.player.stats) this.player.stats.mouseSens = v;
        });
      }
      const invertCheck = document.getElementById('set-invert-y');
      if (invertCheck) {
        invertCheck.addEventListener('change', () => {
          this.career.settings.invertY = invertCheck.checked;
          CareerManager.save(this.career);
          if (this.player && this.player.stats) this.player.stats.invertY = invertCheck.checked;
        });
      }
      const musicSlider = document.getElementById('set-music-vol');
      if (musicSlider) {
        musicSlider.addEventListener('input', () => {
          const v = parseFloat(musicSlider.value) || 0;
          this.career.settings.musicVol = v;
          const lbl = document.getElementById('lbl-music-vol');
          if (lbl) lbl.textContent = `${Math.round(v * 100)}%`;
          this.audio.setMusicVolume(v);
          CareerManager.save(this.career);
        });
      }
      const sfxSlider = document.getElementById('set-sfx-vol');
      if (sfxSlider) {
        sfxSlider.addEventListener('input', () => {
          const v = parseFloat(sfxSlider.value) || 0;
          this.career.settings.sfxVol = v;
          const lbl = document.getElementById('lbl-sfx-vol');
          if (lbl) lbl.textContent = `${Math.round(v * 100)}%`;
          this.audio.setSfxVolume(v);
          CareerManager.save(this.career);
        });
      }
      const gfxSelect = document.getElementById('set-graphics');
      if (gfxSelect) {
        gfxSelect.addEventListener('change', () => {
          this.career.settings.graphics = gfxSelect.value;
          CareerManager.save(this.career);
          const dpr = gfxSelect.value === 'LOW' ? 1.0 : (gfxSelect.value === 'MEDIUM' ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2));
          this.renderer.setPixelRatio(dpr);
        });
      }
      const btnReplayTutorial = document.getElementById('btn-replay-tutorial');
      if (btnReplayTutorial) {
        btnReplayTutorial.addEventListener('click', () => {
          closeSettings();
          this.career.tutorialDone = false;
          CareerManager.save(this.career);
          if (this.state === 'PLAYING') {
            this.tutorial.start();
          } else {
            this.audio.init();
            this.startMatch(true);
          }
        });
      }
      const btnResetCareer = document.getElementById('btn-reset-career');
      if (btnResetCareer) {
        btnResetCareer.addEventListener('click', () => {
          if (window.confirm('Reset all pilot career progress, unlocks, upgrades, and stats?')) {
            localStorage.removeItem(CareerManager.STORAGE_KEY);
            this.career = CareerManager.getDefaultProfile();
            CareerManager.save(this.career);
            this.selectedAircraft = 'FALCON';
            this.selectedTeam = 'BLUE';
            this.selectedLivery = 0;
            this.selectedTracer = 0;
            this.initHangarUI();
            this.updateMenuPreviewMesh();
            closeSettings();
            this.addFloatingPopup('CAREER PROGRESS RESET', '#ff3b47');
          }
        });
      }

      // HUD Mini-Buttons
      document.getElementById('btn-cam').addEventListener('click', () => this.toggleCamera());
      const btnTouchUI = document.getElementById('btn-touch-ui');
      const syncTouchUI = (show) => {
        this.input.touchUIVisible = show;
        btnTouchUI.classList.toggle('active', show);
        document.getElementById('touch-controls').classList.toggle('hidden', !show || this.state !== 'PLAYING');
      };
      btnTouchUI.addEventListener('click', () => syncTouchUI(!this.input.touchUIVisible));
      btnTouchUI.classList.toggle('active', this.input.touchUIVisible);

      const helpBtn = document.getElementById('btn-help-hud');
      if (helpBtn) {
        helpBtn.addEventListener('click', () => {
          this.input.showPcControlsGuide = !this.input.showPcControlsGuide;
          helpBtn.classList.toggle('active', this.input.showPcControlsGuide);
        });
      }
      document.getElementById('btn-mute').addEventListener('click', () => this.toggleMute());
      const btnHangar = document.getElementById('btn-hangar');
      if (btnHangar) btnHangar.addEventListener('click', () => this.returnToMenu());
      document.getElementById('btn-pause').addEventListener('click', () => this.setPaused(this.state !== 'PAUSED'));

      document.getElementById('btn-launch').addEventListener('click', () => {
        this.audio.init();
        this.startMatch();
        this.handleResize();
      });

      document.addEventListener('click', (e) => {
        const b = e.target && e.target.closest ? e.target.closest('button') : null;
        if (b && e.detail > 0) b.blur();
      });

      window.addEventListener('fullscreenchange', () => this.handleResize());
      window.addEventListener('webkitfullscreenchange', () => this.handleResize());
      window.addEventListener('orientationchange', () => this.handleResize());

      document.getElementById('btn-resume').addEventListener('click', () => this.setPaused(false));
      document.getElementById('btn-restart').addEventListener('click', () => this.startMatch());
      document.getElementById('btn-return-menu').addEventListener('click', () => this.returnToMenu());
      document.getElementById('btn-play-again').addEventListener('click', () => this.startMatch());
      document.getElementById('btn-results-menu').addEventListener('click', () => this.returnToMenu());

      document.getElementById('btn-spec-next').addEventListener('click', () => this.cycleSpectateTarget());
      const btnSpecPlane = document.getElementById('btn-spec-plane');
      if (btnSpecPlane) btnSpecPlane.addEventListener('click', () => this.openRespawnWorkshop());
      document.getElementById('btn-spec-respawn').addEventListener('click', () => {
        this.deployPlayerFromRespawn();
      });
      document.getElementById('btn-spec-end').addEventListener('click', () => this.returnToMenu());

      // Center Respawn Overlay Buttons
      const btnCenterChangePlane = document.getElementById('btn-center-change-plane');
      if (btnCenterChangePlane) btnCenterChangePlane.addEventListener('click', () => this.openRespawnWorkshop());
      const btnCenterDeploy = document.getElementById('btn-center-deploy');
      if (btnCenterDeploy) btnCenterDeploy.addEventListener('click', () => this.deployPlayerFromRespawn());

      // Mid-Respawn Hangar Screen Buttons & Controls
      const btnRespawnLaunch = document.getElementById('btn-respawn-launch');
      if (btnRespawnLaunch) btnRespawnLaunch.addEventListener('click', () => this.deployPlayerFromRespawn());
      const btnRespawnSpectate = document.getElementById('btn-respawn-hangar-spectate');
      if (btnRespawnSpectate) btnRespawnSpectate.addEventListener('click', () => this.closeRespawnWorkshop(true));

      const btnRespawnPrev = document.getElementById('btn-respawn-prev-jet');
      if (btnRespawnPrev) btnRespawnPrev.addEventListener('click', () => this.cycleRespawnAircraft(-1));
      const btnRespawnNext = document.getElementById('btn-respawn-next-jet');
      if (btnRespawnNext) btnRespawnNext.addEventListener('click', () => this.cycleRespawnAircraft(1));

      // Mid-Respawn Livery Swatches
      document.querySelectorAll('#respawn-livery-group .livery-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          const idx = parseInt(sw.dataset.livery, 10) || 0;
          this.selectedLivery = idx;
          this.career.selectedLivery = idx;
          CareerManager.save(this.career);
          this.updateRespawnPreviewMesh();
          this.renderRespawnWorkshopUI();
        });
      });

      // Mid-Respawn Tracer Swatches
      document.querySelectorAll('#respawn-tracer-group .livery-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          const idx = parseInt(sw.dataset.tracer, 10) || 0;
          this.selectedTracer = idx;
          this.career.selectedTracer = idx;
          CareerManager.save(this.career);
          if (CONFIG.TRACERS && CONFIG.TRACERS[idx]) {
            this.weapons.setPlayerTracerColor(CONFIG.TRACERS[idx].hex);
          }
          this.renderRespawnWorkshopUI();
        });
      });
    }

    updateMenuPreviewMesh() {
      if (this.menuFighter) {
        this.scene.remove(this.menuFighter);
        AircraftModelFactory.disposeObject3D(this.menuFighter);
      }
      const previewJet = this.previewAircraft || this.selectedAircraft;
      this.menuFighter = AircraftModelFactory.createAircraftMesh(previewJet, this.selectedLivery, this.selectedTeam);
      this.menuFighter.position.set(0, 750, 0);
      this.scene.add(this.menuFighter);
    }

    getNextUniquePilotName() {
      const names = CONFIG.PILOT_NAMES;
      const used = new Set(this.aircraftList.map(a => a.callsign));
      for (let tries = 0; tries < names.length; tries++) {
        const candidate = names[(this.namePoolIndex++) % names.length];
        if (!used.has(candidate)) return candidate;
      }
      return `Pilot_${Math.floor(100 + Math.random() * 899)}`;
    }

    spawnAircraftNearTeamBase(ac) {
      const isBlue = ac.team === 'BLUE';
      const basePos = isBlue ? CONFIG.WORLD.blueBasePos : CONFIG.WORLD.redBasePos;
      const runwayHeading = isBlue ? 0 : Math.PI;

      // Stagger aircraft along the wide 160m runway apron so each aircraft has a clear takeoff lane
      const offsetsX = [0, -32, 32, -64, 64];
      const slotX = offsetsX[ac.wingIndex % offsetsX.length] || 0;
      const slotDistBehind = (ac.wingIndex % 5) * 35;

      const x = basePos.x + slotX;
      const y = 182.2; // Runway surface elevation (plateau is 180, runway slab is +1.1 + gear clearance)
      const z = isBlue
        ? (basePos.z + 460 + slotDistBehind) // Facing North (-Z)
        : (basePos.z - 460 - slotDistBehind); // Facing South (+Z)

      ac.spawnAt(x, y, z, runwayHeading, true);

      if (ac.isPlayer) {
        this.input.resetPointerToCenter();
      }
    }

    startMatch(isTutorial = false) {
      this.clearMatchEntities();
      this.world.resetFlags();
      if (this.menuFighter) this.menuFighter.visible = false;
      if (this.hangarBay) this.hangarBay.visible = false;
      if (this.audio) this.audio.stopHangarAmbience();

      document.getElementById('start-screen').classList.add('hidden');
      document.getElementById('pause-screen').classList.add('hidden');
      document.getElementById('results-screen').classList.add('hidden');
      document.getElementById('spectate-bar').classList.add('hidden');
      document.getElementById('respawn-center-overlay').classList.add('hidden');
      document.getElementById('respawn-hangar-screen').classList.add('hidden');
      if (this.studioVoid) this.studioVoid.visible = false;
      document.getElementById('settings-modal').classList.add('hidden');
      document.getElementById('top-controls').classList.remove('hidden');
      document.getElementById('touch-controls').classList.toggle('hidden', !this.input.touchUIVisible);
      document.getElementById('feed-container').innerHTML = '';

      this.inRespawnWorkshop = false;
      this.respawnAwaitingDeploy = false;

      this.state = 'PLAYING';
      this.teamCaptures = { BLUE: 0, RED: 0 };
      this.teamCommanders = {
        BLUE: new TeamCommander('BLUE'),
        RED: new TeamCommander('RED')
      };
      this.elapsedSortieSec = 0;
      this.remainingMatchSec = CONFIG.CTF.roundTimeLimit; // 600s = 10:00
      this.isSuddenDeath = false;
      this.timeAlertsTriggered = {};
      this.camShakeTimer = 0;
      this.input.clearJustPressed();

      // Auto-deploy previewed aircraft if player browsed in hangar
      if (this.previewAircraft && this.career.unlockedAircraft && this.career.unlockedAircraft.includes(this.previewAircraft)) {
        this.selectedAircraft = this.previewAircraft;
        this.career.selectedAircraft = this.previewAircraft;
        CareerManager.save(this.career);
      }
      this.selectedLivery = this.career.selectedLivery !== undefined ? this.career.selectedLivery : (this.selectedLivery || 0);
      if (CONFIG.TRACERS && CONFIG.TRACERS[this.selectedTracer]) {
        this.weapons.setPlayerTracerColor(CONFIG.TRACERS[this.selectedTracer].hex);
      }

      const playerCallsign = (this.career.callsign || 'NightHawk_IN').trim();
      const playerEffectiveStats = CareerManager.getEffectiveAircraftStats(this.selectedAircraft, this.career);

      // Spawn Player
      this.player = new Aircraft(
        this.scene,
        this.selectedAircraft,
        playerCallsign,
        this.selectedTeam,
        true,
        'ACE',
        0,
        this.selectedLivery,
        null,
        playerEffectiveStats
      );
      this.spawnAircraftNearTeamBase(this.player);
      this.aircraftList.push(this.player);

      // Default Hard Mode: All AI pilots operate at Grand Ace competitive human pro level
      const botDiff = 'ACE';

      // 5v5 Team Match: 4 friendly wingmen + 5 enemy squadron pilots
      const friendlyRoster = ['VIPER', 'TITAN', 'PHANTOM', 'SPECTRE'];
      const enemyRoster = ['FALCON', 'VIPER', 'TITAN', 'PHANTOM', 'SPECTRE'];
      const enemyTeam = (this.selectedTeam === 'BLUE') ? 'RED' : 'BLUE';

      // 4 Friendly Wingmen (Competitive Level 3 Upgraded Airframes)
      for (let i = 0; i < 4; i++) {
        const typeId = friendlyRoster[i % friendlyRoster.length];
        const liveryIdx = (i + 1) % 6;
        const roleOrder = [0, 1, 4, 2]; // 0:FLAG_CHASER, 1:FLAG_PROTECTOR, 4:ESCORT, 2:BRAWLER
        const roleObj = CONFIG.ROLES[roleOrder[i]];
        const name = this.getNextUniquePilotName();
        const botStats = CareerManager.getEffectiveAircraftStats(typeId, {
          upgrades: { [typeId]: { speed: 3, agility: 3, firepower: 3, armor: 3, boost: 3 } }
        });
        const bot = new Aircraft(this.scene, typeId, name, this.selectedTeam, false, botDiff, i + 1, liveryIdx, roleObj, botStats);
        this.spawnAircraftNearTeamBase(bot);
        this.aircraftList.push(bot);
      }

      // 5 Enemy Squadron Pilots (Competitive Level 3 Upgraded Airframes)
      for (let i = 0; i < 5; i++) {
        const typeId = enemyRoster[i % enemyRoster.length];
        const liveryIdx = (i + 2) % 6;
        const roleOrder = [0, 0, 1, 4, 2]; // 2 FLAG_CHASER, 1 FLAG_PROTECTOR, 1 ESCORT, 1 BRAWLER
        const roleObj = CONFIG.ROLES[roleOrder[i]];
        const name = this.getNextUniquePilotName();
        const botStats = CareerManager.getEffectiveAircraftStats(typeId, {
          upgrades: { [typeId]: { speed: 3, agility: 3, firepower: 3, armor: 3, boost: 3 } }
        });
        const bot = new Aircraft(this.scene, typeId, name, enemyTeam, false, botDiff, i + 5, liveryIdx, roleObj, botStats);
        this.spawnAircraftNearTeamBase(bot);
        this.aircraftList.push(bot);
      }

      if (this.teamCommanders) {
        this.teamCommanders.BLUE.applyDoctrineToSquadron(this.aircraftList);
        this.teamCommanders.RED.applyDoctrineToSquadron(this.aircraftList);
      }

      this.cyclePlayerTarget();
      for (const ac of this.aircraftList) {
        if (!ac.isPlayer && ac.ai) {
          ac.ai.evaluateTargetsByPersonality(this.aircraftList, this.world, null, false, this);
        }
      }

      this.updateCamera(1.0, this.player, true);
      if (this.cg) this.cg.setGameplay(true);

      // Start Adrenaline Synthwave BGM
      this.audio.startMusic();

      this.addFeedItem(`🚩 Capture The Flag Engaged! First to ${CONFIG.CTF.capturesToWin} Captures (10:00 Time Cap)!`, 'radio');

      // Tutorial trigger
      if (isTutorial || !this.career.tutorialDone) {
        this.tutorial.start();
      }
    }

    clearMatchEntities() {
      for (const ac of this.aircraftList) {
        this.scene.remove(ac.mesh);
        AircraftModelFactory.disposeObject3D(ac.mesh);
      }
      this.aircraftList = [];
      this.weapons.clear();
      this.particles.clear();
    }

    returnToMenu() {
      this.updateHighScore(true);
      this.clearMatchEntities();
      this.world.resetFlags();
      this.state = 'MENU';
      this.isSuddenDeath = false;
      this.hud.clear();
      if (this.cg) this.cg.setGameplay(false);
      this.audio.updateEngine(0, 0, false, false);
      this.audio.startMusic();
      if (this.tutorial) this.tutorial.stop();
      if (this.menuFighter) this.menuFighter.visible = true;
      if (this.hangarBay) this.hangarBay.visible = true;
      if (this.hangarBayMeshes) this.hangarBayMeshes.forEach(m => m.visible = true);
      if (this.audio) this.audio.startHangarAmbience();

      // Clean all input buffers so no leftover keys fire startMatch or actions
      this.input.clearJustPressed();
      this.input.keys = {};
      this.input.mouseButtons.left = false;
      this.input.mouseButtons.right = false;

      document.getElementById('top-controls').classList.add('hidden');
      document.getElementById('touch-controls').classList.add('hidden');
      document.getElementById('pause-screen').classList.add('hidden');
      document.getElementById('results-screen').classList.add('hidden');
      document.getElementById('spectate-bar').classList.add('hidden');
      document.getElementById('respawn-center-overlay').classList.add('hidden');
      document.getElementById('respawn-hangar-screen').classList.add('hidden');
      if (this.studioVoid) this.studioVoid.visible = false;
      document.getElementById('settings-modal').classList.add('hidden');
      document.getElementById('start-screen').classList.remove('hidden');

      this.inRespawnWorkshop = false;
      this.respawnAwaitingDeploy = false;

      this.initHangarUI();
      this.updateMenuPreviewMesh();
    }

    toggleCamera() {
      this.cameraMode = this.cameraMode === 'CHASE' ? 'COCKPIT' : 'CHASE';
      document.getElementById('btn-cam').textContent = this.input.isTouchDevice
        ? `CAM: ${this.cameraMode === 'CHASE' ? '3RD' : '1ST'}`
        : `CAM: ${this.cameraMode} [C]`;
    }

    toggleMute() {
      this.audio.setMuted(!this.audio.muted);
      const btn = document.getElementById('btn-mute');
      btn.textContent = this.input.isTouchDevice
        ? (this.audio.muted ? 'UNMUTE' : 'AUDIO')
        : `AUDIO: ${this.audio.muted ? 'MUTED' : 'ON'} [M]`;
      btn.classList.toggle('active', !this.audio.muted);
    }

    setPaused(pause) {
      if (this.state !== 'PLAYING' && this.state !== 'PAUSED') return;
      this.state = pause ? 'PAUSED' : 'PLAYING';
      const pauseEl = document.getElementById('pause-screen');
      if (!pause) this.tabPressTime = 0;
      if (pause) {
        this.updateHighScore(true);
        if (this.cg) this.cg.setGameplay(false);
        this.populateScoreboard('scoreboard-body');
        pauseEl.classList.remove('hidden');
        this.audio.updateEngine(0, 0, false, false);
      } else {
        pauseEl.classList.add('hidden');
        this.input.clearJustPressed();
        if (this.cg && this.player && this.player.alive) this.cg.setGameplay(true);
      }
    }

    cyclePlayerTarget() {
      if (!this.player) return;
      const enemies = this.aircraftList.filter(a => a.alive && a.team !== this.player.team);
      if (enemies.length === 0) {
        this.player.target = null;
        return;
      }
      enemies.sort((a, b) => {
        if (a.carryingFlag !== b.carryingFlag) return a.carryingFlag ? -1 : 1;
        return a.mesh.position.distanceToSquared(this.player.mesh.position) -
               b.mesh.position.distanceToSquared(this.player.mesh.position);
      });
      const curIdx = enemies.indexOf(this.player.target);
      this.player.target = enemies[(curIdx + 1) % enemies.length];
    }

    addFeedItem(text, cls = 'kill-blue') {
      const container = document.getElementById('feed-container');
      const isMob = Boolean(this.input && this.input.touchUIVisible);
      const div = document.createElement('div');
      div.className = `feed-item ${cls}`;
      div.textContent = text;
      container.prepend(div);
      const maxItems = isMob ? 2 : 6;
      while (container.children.length > maxItems) {
        container.removeChild(container.lastChild);
      }
      setTimeout(() => {
        if (div.parentNode === container) container.removeChild(div);
      }, isMob ? 2800 : 6500);
    }

    addFloatingPopup(text, color = '#00ff9d') {
      if (this.hud) this.hud.addPopup(text, color);
    }

    updateHighScore(forcePersist = false) {
      if (this.player && this.player.score > this.highScore) {
        this.highScore = this.player.score;
        this.highScoreDirty = true;
      }
      const now = performance.now();
      if (this.highScoreDirty && (forcePersist || !this.lastHighScoreSave || now - this.lastHighScoreSave > 4000)) {
        this.highScoreDirty = false;
        this.lastHighScoreSave = now;
        if (this.career && this.career.stats) {
          if (this.highScore > (this.career.stats.bestScore || 0)) {
            this.career.stats.bestScore = this.highScore;
            CareerManager.save(this.career);
          }
        }
        if (this.cg) {
          this.cg.setData('fighterjets3d_highscore', this.highScore);
        }
      }
    }

    handleAircraftDamage(victim, attacker, amount, weaponLabel, impactPos = null) {
      if (!victim.alive) return;

      const finalDamage = (attacker && attacker.stats && attacker.stats.cannonDamage)
        ? attacker.stats.cannonDamage
        : CONFIG.WEAPONS.CANNON.damage;
      victim.hp -= finalDamage;
      victim.timeSinceDamage = 0; // Resets the 3.0-second no-regen timer!
      if (attacker && attacker !== victim) {
        victim.lastAttacker = attacker;
      }

      victim.triggerBulletHitAnimation();

      if (victim === this.player) {
        this.camShakeTimer = 0.22;
        this.camShakeIntensity = 1.45;
        this.hud.triggerPlayerHitEffect(victim, attacker, finalDamage);
        this.audio.playBulletImpactOnHull();
      }

      if (attacker === this.player) {
        const willKill = victim.hp <= 0;
        attacker.comboCount = Math.min(8, attacker.comboCount + (willKill ? 1 : 0));
        attacker.addComboAction(15, willKill ? 35 : 6, this, null);
        this.hud.triggerHitmarker(willKill);
        this.audio.playHitmarker(willKill, attacker.comboCount);
        this.hud.addDamageNumber(
          impactPos || victim.mesh.position,
          willKill ? `💥 SPLASH! +${150 * attacker.comboCount}` : `-${finalDamage} HP`,
          willKill ? '#00ff9d' : (attacker.overdriveTimer > 0 ? '#fbbf24' : '#ffdd44'),
          willKill
        );
        this.updateHighScore(false);
      } else if (attacker) {
        attacker.score += 10;
      }

      if (victim.hp <= 0) {
        this.destroyAircraft(victim, attacker, weaponLabel);
      }
    }

    destroyAircraft(victim, attacker, causeLabel) {
      if (!victim.alive) return;
      const wasCarryingFlag = victim.carryingFlag;
      victim.alive = false;
      victim.hp = 0;
      victim.deaths++;
      victim.killStreak = 0;
      victim.comboCount = 1;
      victim.mesh.visible = false;
      victim.respawnTimer = (victim === this.player) ? 4.0 : 2.8;

      if (attacker && attacker !== victim && attacker.team && this.teamCommanders && this.teamCommanders[attacker.team]) {
        this.teamCommanders[attacker.team].recordKill();
      }
      if (victim && victim.team && this.teamCommanders && this.teamCommanders[victim.team]) {
        this.teamCommanders[victim.team].recordDeath();
      }
      if (victim === this.player) {
        this.killerAc = (attacker && attacker !== victim && attacker.alive) ? attacker : null;
        this.spectateTarget = this.killerAc;
        this.inRespawnWorkshop = false;
        this.respawnAwaitingDeploy = false;
        this.respawnPreviewJet = this.selectedAircraft || 'FALCON';

        const specBar = document.getElementById('spectate-bar');
        if (specBar) specBar.classList.remove('hidden');
        const specLabel = document.getElementById('spectate-label');
        const killerName = (this.killerAc && this.killerAc.callsign) ? this.killerAc.callsign : (causeLabel || 'OCEAN / TERRAIN IMPACT');
        if (specLabel) specLabel.textContent = `🎯 ELIMINATED BY: ${killerName} // CHASE CAM`;
        const specBtn = document.getElementById('btn-spec-respawn');
        if (specBtn) {
          specBtn.disabled = true;
          specBtn.classList.remove('active');
          specBtn.style.opacity = '0.4';
          specBtn.style.cursor = 'not-allowed';
          specBtn.textContent = 'SPAWN IN 4.0s';
        }

        // Center Respawn Tip Overlay
        const centerOverlay = document.getElementById('respawn-center-overlay');
        if (centerOverlay) centerOverlay.classList.remove('hidden');
        const killerLine = document.getElementById('respawn-killer-line');
        if (killerLine) killerLine.textContent = `ELIMINATED BY: ${killerName}`;
        const centerTip = document.getElementById('respawn-center-tip-text');
        if (centerTip) centerTip.textContent = this.getRandomTacticalTip();
        const centerTimer = document.getElementById('respawn-center-timer');
        if (centerTimer) centerTimer.textContent = 'RESPAWNING IN 4.0s';
        const centerDeployBtn = document.getElementById('btn-center-deploy');
        if (centerDeployBtn) {
          centerDeployBtn.classList.add('hidden');
          centerDeployBtn.disabled = true;
          centerDeployBtn.style.opacity = '0.4';
          centerDeployBtn.style.cursor = 'not-allowed';
          centerDeployBtn.textContent = 'DEPLOY IN 4.0s';
        }

        // Hide mid-respawn workshop screen until requested
        const hangarScreen = document.getElementById('respawn-hangar-screen');
        if (hangarScreen) hangarScreen.classList.add('hidden');
        if (this.studioVoid) this.studioVoid.visible = false;
        if (this.menuFighter) this.menuFighter.visible = false;
      }

      if (wasCarryingFlag) {
        this.world.dropFlag(wasCarryingFlag, this, false);
      }

      if (attacker && attacker !== victim) {
        attacker.kills++;
        attacker.killStreak++;
        const carrierBonus = wasCarryingFlag ? CONFIG.CTF.carrierKillBonus : 0;
        const streakBonus = attacker.killStreak >= 2 ? attacker.killStreak * 50 : 0;
        const totalAward = (150 + carrierBonus + streakBonus) * Math.max(1, attacker.comboCount);
        attacker.score += totalAward;
        attacker.boostEnergy = attacker.maxBoostEnergy || CONFIG.BOOST.maxEnergy;

        if (attacker === this.player) {
          this.updateHighScore(true);
          if (wasCarryingFlag) {
            this.addFloatingPopup(`🎯 FLAG CARRIER DOWN! +${totalAward} PTS`, '#fbbf24');
          } else if (attacker.killStreak >= 2) {
            this.addFloatingPopup(`🔥 ${attacker.killStreak}x KILL STREAK! +${totalAward} PTS`, '#00ff9d');
          } else {
            this.addFloatingPopup(`💥 ENEMY SPLASHED! +${totalAward} PTS`, '#00ff9d');
          }
        }
      }

      const distToCam = victim.mesh.position.distanceTo(this.camera.position);
      this.audio.playExplosion(distToCam);
      this.particles.spawnExplosion(victim.mesh.position, 1.4);
      this.particles.spawnFallingWreck(victim.mesh, victim.flight.velocity);

      if (attacker && attacker !== victim) {
        this.addFeedItem(
          `${attacker.callsign} splashed ${victim.callsign} [${causeLabel}]`,
          attacker.team === 'BLUE' ? 'kill-blue' : 'kill-red'
        );
      } else {
        this.addFeedItem(`${victim.callsign} crashed into ${causeLabel}`, 'warn');
      }

      if (this.player && this.player.target === victim) {
        this.cyclePlayerTarget();
      }
    }

    onFlagCaptured(scorerAc, capturedFlagTeam) {
      const scoringTeam = scorerAc.team;
      this.teamCaptures[scoringTeam] = (this.teamCaptures[scoringTeam] || 0) + 1;

      if (this.teamCommanders) {
        if (this.teamCommanders[scoringTeam]) this.teamCommanders[scoringTeam].recordCapture();
        if (this.teamCommanders[capturedFlagTeam]) this.teamCommanders[capturedFlagTeam].recordLoss();
      }

      if (this.player && scoringTeam === this.player.team) {
        this.audio.playFlagFanfare(true);
        this.addFloatingPopup(`🏆 ${scoringTeam} TEAM CAPTURED THE FLAG! (+${CONFIG.CTF.capturePoints})`, '#fbbf24');
        if (this.cg) this.cg.happytime();
      } else {
        this.audio.playFlagFanfare(false);
        this.addFloatingPopup(`⚠ ENEMY CAPTURED OUR FLAG!`, '#ff3b47');
      }

      this.addFeedItem(
        `🏆 ${scorerAc.callsign} CAPTURED the ${capturedFlagTeam} FLAG! (${this.teamCaptures.BLUE} - ${this.teamCaptures.RED})`,
        'radio'
      );

      this.updateHighScore(true);

      if (this.isSuddenDeath || this.teamCaptures[scoringTeam] >= CONFIG.CTF.capturesToWin) {
        this.endMatch(scoringTeam, false, this.isSuddenDeath ? 'SUDDEN DEATH: GOLDEN CAP' : '');
      }
    }

    handleTimeLimitReached() {
      const blueCaps = this.teamCaptures.BLUE || 0;
      const redCaps = this.teamCaptures.RED || 0;
      if (blueCaps > redCaps) {
        this.endMatch('BLUE', true, 'FLAG CAPTURES LEAD AT 10:00 TIME CAP');
      } else if (redCaps > blueCaps) {
        this.endMatch('RED', true, 'FLAG CAPTURES LEAD AT 10:00 TIME CAP');
      } else {
        // Tied at 10:00! SUDDEN DEATH GOLDEN CAP!
        if (!this.isSuddenDeath) {
          this.isSuddenDeath = true;
          this.audio.playFlagFanfare(true);
          this.addFloatingPopup('⚡ SUDDEN DEATH: GOLDEN CAP! NEXT CAPTURE WINS!', '#fbbf24');
          this.addFeedItem('⚡ SUDDEN DEATH ENGAGED! Next team to capture a flag wins immediately!', 'warn');
        }
      }
    }

    endMatch(winningTeam, isTimeLimit = false, timeReason = '') {
      this.state = 'ENDED';
      this.hud.clear();
      if (this.cg) {
        this.cg.setGameplay(false);
        if (this.player && winningTeam === this.player.team) this.cg.happytime();
      }
      this.audio.updateEngine(0, 0, false, false);
      this.updateHighScore(true);

      document.getElementById('pause-screen').classList.add('hidden');
      document.getElementById('spectate-bar').classList.add('hidden');
      document.getElementById('respawn-center-overlay').classList.add('hidden');
      document.getElementById('respawn-hangar-screen').classList.add('hidden');
      if (this.studioVoid) this.studioVoid.visible = false;
      document.getElementById('touch-controls').classList.add('hidden');
      this.inRespawnWorkshop = false;
      this.respawnAwaitingDeploy = false;
      if (this.tutorial) this.tutorial.stop();

      const resScreen = document.getElementById('results-screen');
      resScreen.classList.remove('hidden');

      const playerWon = this.player && this.player.team === winningTeam;

      if (winningTeam === 'DRAW') {
        document.getElementById('result-headline').textContent = 'ROUND DRAW';
        document.getElementById('result-subline').textContent = timeReason || '10:00 TIME LIMIT REACHED';
      } else {
        document.getElementById('result-headline').textContent = `${winningTeam} SQUADRON VICTORY!`;
        if (this.isSuddenDeath) {
          document.getElementById('result-subline').textContent = playerWon
            ? 'MISSION ACCOMPLISHED // SUDDEN DEATH GOLDEN CAPTURE SECURED!'
            : 'DEFEAT // ENEMY SECURED SUDDEN DEATH GOLDEN CAP';
        } else if (isTimeLimit) {
          document.getElementById('result-subline').textContent = `${playerWon ? 'VICTORY' : 'DEFEAT'} // ${timeReason}`;
        } else {
          document.getElementById('result-subline').textContent = playerWon
            ? 'MISSION ACCOMPLISHED // AIR SUPERIORITY & 3 FLAG CAPTURES SECURED'
            : 'DEFEAT // ENEMY SQUADRON CAPTURED 3 FLAGS FIRST';
        }
      }
      document.getElementById('result-team-standing').textContent =
        `BLUE ${this.teamCaptures.BLUE} — ${this.teamCaptures.RED} RED`;

      // Calculate Career Meta-Progression Combat Rewards
      const baseXP = 120;
      const baseCredits = 60;
      const winXP = playerWon ? 300 : 0;
      const winCredits = playerWon ? 200 : 0;
      const killsXP = (this.player ? this.player.kills : 0) * 45;
      const killsCredits = (this.player ? this.player.kills : 0) * 30;
      const capsXP = (this.player ? this.player.flagCaptures : 0) * 160;
      const capsCredits = (this.player ? this.player.flagCaptures : 0) * 120;
      const retXP = (this.player ? this.player.flagReturns : 0) * 60;
      const retCredits = (this.player ? this.player.flagReturns : 0) * 40;
      const scoreXP = Math.floor((this.player ? this.player.score : 0) * 0.1);

      const totalXpEarned = baseXP + winXP + killsXP + capsXP + retXP + scoreXP;
      const totalCreditsEarned = baseCredits + winCredits + killsCredits + capsCredits + retCredits;

      const prevRank = CareerManager.getRank(this.career.xp);

      // Commit to persistent career
      this.career.xp += totalXpEarned;
      this.career.credits += totalCreditsEarned;
      this.career.stats.sorties++;
      if (playerWon) this.career.stats.wins++;
      else this.career.stats.losses++;

      if (this.player) {
        this.career.stats.kills += this.player.kills;
        this.career.stats.deaths += this.player.deaths;
        this.career.stats.captures += this.player.flagCaptures;
        this.career.stats.returns += this.player.flagReturns;
        this.career.stats.shotsFired += this.player.shotsFired;
        this.career.stats.hits += this.player.cannonHits;
        if (this.player.score > (this.career.stats.bestScore || 0)) {
          this.career.stats.bestScore = this.player.score;
        }
      }
      CareerManager.save(this.career);

      const newRank = CareerManager.getRank(this.career.xp);
      if (newRank.idx > prevRank.idx) {
        this.audio.playTone(587.33, 0.12, 'triangle', 0.22);
        setTimeout(() => this.audio.playTone(880, 0.35, 'triangle', 0.28), 120);
        this.addFloatingPopup(`🎖 PROMOTED TO ${newRank.cur.name}!`, '#fbbf24');
      }

      // Populate Results Rewards UI
      const xpEarnedEl = document.getElementById('res-xp-earned');
      const credEarnedEl = document.getElementById('res-credits-earned');
      const rankNameEl = document.getElementById('res-rank-name');
      const rankXpEl = document.getElementById('res-rank-xp');
      const xpFillEl = document.getElementById('res-xp-fill');

      if (xpEarnedEl) xpEarnedEl.textContent = `+${totalXpEarned} XP`;
      if (credEarnedEl) credEarnedEl.textContent = `+${totalCreditsEarned} ₵`;
      if (rankNameEl) rankNameEl.textContent = `${newRank.cur.name} ${newRank.cur.badge}`;
      if (rankXpEl) rankXpEl.textContent = `${this.career.xp.toLocaleString()} / ${newRank.next ? newRank.next.minXp.toLocaleString() : 'MAX'} XP`;
      if (xpFillEl) xpFillEl.style.width = `${Math.round(newRank.progress * 100)}%`;

      if (this.player) {
        document.getElementById('res-score').textContent = this.player.score;
        document.getElementById('res-captures').textContent = this.player.flagCaptures;
        document.getElementById('res-returns').textContent = this.player.flagReturns;
        document.getElementById('res-kills').textContent = this.player.kills;
        const acc = this.player.shotsFired > 0
          ? Math.round((this.player.cannonHits / this.player.shotsFired) * 100)
          : 0;
        document.getElementById('res-accuracy').textContent = `${acc}%`;
        document.getElementById('res-best').textContent = this.career.stats.bestScore || this.player.score;
      }

      this.populateScoreboard('results-table-body');
      this.initHangarUI();
    }

    getRandomTacticalTip() {
      const tips = [
        '💡 DUAL-FLAG RULE: You can only capture when BOTH flags are at your home base (+1,000 PTS)!',
        '💡 RECOVER TO SCORE: If your flag is stolen, hunt down the enemy carrier and touch your dropped flag to return it!',
        '💡 CONVOY ESCORT: Stay close to your flag carrier and draw enemy fire away from them!',
        '💡 SPEED MATTERS: Use Afterburner Boost [SHIFT] to pull away from pursuers when carrying the flag!',
        '💡 HIGH-G DRIFT: Tap [S] to airbrake while rolling to pull rapid 180° snapshot turns on targets!',
        '💡 TEAM SUPPORT: Your wingmen automatically form an escort convoy around you when you carry the flag!'
      ];
      return tips[Math.floor(Math.random() * tips.length)];
    }

    cycleSpectateTarget() {
      const living = this.aircraftList.filter(a => a.alive && a !== this.player);
      if (living.length === 0) return;
      const curIdx = this.spectateTarget ? living.indexOf(this.spectateTarget) : -1;
      const nextIdx = (curIdx + 1) % living.length;
      this.spectateTarget = living[nextIdx];
      const specLabel = document.getElementById('spectate-label');
      if (specLabel) {
        const teamColor = this.spectateTarget.team === 'BLUE' ? '#38bdf8' : '#ff4757';
        specLabel.innerHTML = `SPECTATING: <span style="color:${teamColor};font-weight:700;">${this.spectateTarget.callsign}</span> (${this.spectateTarget.stats.name || this.spectateTarget.typeId})`;
      }
    }

    updateRespawns(dt) {
      for (const ac of this.aircraftList) {
        if (ac.alive) continue;
        ac.respawnTimer -= dt;
        if (ac === this.player) {
          const specLabel = document.getElementById('spectate-label');
          const specRespawnBtn = document.getElementById('btn-spec-respawn');
          const centerTimer = document.getElementById('respawn-center-timer');
          const centerDeployBtn = document.getElementById('btn-center-deploy');
          const respawnLaunchBtn = document.getElementById('btn-respawn-launch');
          const respawnLaunchSub = document.getElementById('respawn-launch-subtitle');
          const respawnScoreEl = document.getElementById('respawn-hangar-match-score');
          const respawnTimeEl = document.getElementById('respawn-hangar-time-badge');

          if (respawnScoreEl) {
            respawnScoreEl.textContent = `BLUE ${this.teamCaptures.BLUE} — ${this.teamCaptures.RED} RED`;
          }
          if (respawnTimeEl) {
            respawnTimeEl.textContent = `⏱ ${HUDRenderer.formatClock(this.remainingMatchSec)}`;
          }

          if (ac.respawnTimer > 0) {
            const tStr = Math.max(0, ac.respawnTimer).toFixed(1);
            const killerName = (this.killerAc && this.killerAc.alive)
              ? this.killerAc.callsign
              : (this.killerAc ? this.killerAc.callsign : 'TERRAIN / IMPACT');
            if (specLabel && (!this.spectateTarget || this.spectateTarget === this.killerAc)) {
              specLabel.textContent = `🎯 ELIMINATED BY: ${killerName} // CHASE CAM`;
            }
            if (specRespawnBtn) {
              specRespawnBtn.textContent = `SPAWN IN ${tStr}s`;
              specRespawnBtn.disabled = true;
              specRespawnBtn.style.opacity = '0.4';
              specRespawnBtn.style.cursor = 'not-allowed';
              specRespawnBtn.classList.remove('active');
            }
            if (centerTimer) {
              centerTimer.textContent = `RESPAWNING IN ${tStr}s`;
            }
            if (centerDeployBtn) {
              centerDeployBtn.disabled = true;
              centerDeployBtn.style.opacity = '0.4';
              centerDeployBtn.style.cursor = 'not-allowed';
              centerDeployBtn.textContent = `DEPLOY IN ${tStr}s`;
            }
            if (respawnLaunchBtn) {
              respawnLaunchBtn.disabled = true;
              respawnLaunchBtn.style.opacity = '0.4';
              respawnLaunchBtn.style.cursor = 'not-allowed';
              respawnLaunchBtn.textContent = `DEPLOY IN ${tStr}s`;
            }
            if (respawnLaunchSub) {
              respawnLaunchSub.textContent = `DEPLOY LOCK ENGAGED • WAIT ${tStr}s BEFORE COMBAT SORTIE`;
            }
          } else {
            // Timer has completed (<= 0)
            if (centerTimer) {
              centerTimer.textContent = `READY FOR DEPLOYMENT`;
            }
            if (specRespawnBtn) {
              specRespawnBtn.textContent = `▶ DEPLOY NOW`;
              specRespawnBtn.disabled = false;
              specRespawnBtn.style.opacity = '1.0';
              specRespawnBtn.style.cursor = 'pointer';
              specRespawnBtn.classList.add('active');
            }
            if (centerDeployBtn) {
              centerDeployBtn.classList.remove('hidden');
              centerDeployBtn.disabled = false;
              centerDeployBtn.style.opacity = '1.0';
              centerDeployBtn.style.cursor = 'pointer';
              centerDeployBtn.textContent = `▶ DEPLOY NOW`;
            }
            if (respawnLaunchBtn) {
              respawnLaunchBtn.disabled = false;
              respawnLaunchBtn.style.opacity = '1.0';
              respawnLaunchBtn.style.cursor = 'pointer';
              respawnLaunchBtn.textContent = `▶ DEPLOY TO BATTLE`;
            }
            if (respawnLaunchSub) {
              respawnLaunchSub.textContent = `RE-DEPLOYING INTO ONGOING CTF SQUADRON MATCH`;
            }

            // CRITICAL RULE:
            // "during this the plane shouldn't respawn until the player clicks deploy(make sure the original 4 seconds are over)"
            // If the player is in the workshop or awaiting manual deploy after opening workshop, wait for deploy click!
            if (!this.inRespawnWorkshop && !this.respawnAwaitingDeploy) {
              this.respawnPlayerWithSelectedAircraft();
            }
          }
        } else {
          if (ac.respawnTimer <= 0) {
            this.spawnAircraftNearTeamBase(ac);
          }
        }
      }
    }

    openRespawnWorkshop() {
      if (!this.player || this.player.alive) return;
      this.inRespawnWorkshop = true;
      this.respawnAwaitingDeploy = true;
      this.respawnPreviewJet = this.selectedAircraft || 'FALCON';

      // Hide center tactical tip overlay & bottom spectate bar
      const centerOverlay = document.getElementById('respawn-center-overlay');
      if (centerOverlay) centerOverlay.classList.add('hidden');
      const specBar = document.getElementById('spectate-bar');
      if (specBar) specBar.classList.add('hidden');

      // Show full-screen hangar workshop screen
      const hangarScreen = document.getElementById('respawn-hangar-screen');
      if (hangarScreen) hangarScreen.classList.remove('hidden');

      // 3D ISOLATION: Show ONLY the 3D plane illuminated in studio void (hide all other entities/hangar bay structure)
      if (this.studioVoid) this.studioVoid.visible = true;
      if (this.hangarBay) this.hangarBay.visible = true;
      if (this.hangarBayMeshes) this.hangarBayMeshes.forEach(m => m.visible = false);
      this.updateRespawnPreviewMesh();

      this.renderRespawnWorkshopUI();
    }

    closeRespawnWorkshop(toSpectate = true) {
      this.inRespawnWorkshop = false;
      if (this.studioVoid) this.studioVoid.visible = false;
      if (this.hangarBay) this.hangarBay.visible = false;
      if (this.menuFighter) this.menuFighter.visible = false;

      const hangarScreen = document.getElementById('respawn-hangar-screen');
      if (hangarScreen) hangarScreen.classList.add('hidden');

      if (toSpectate) {
        const centerOverlay = document.getElementById('respawn-center-overlay');
        if (centerOverlay) centerOverlay.classList.remove('hidden');
        const specBar = document.getElementById('spectate-bar');
        if (specBar) specBar.classList.remove('hidden');
      }
    }

    cycleRespawnAircraft(dir) {
      const keys = CONFIG.AIRCRAFT_KEYS;
      const curIdx = keys.indexOf(this.respawnPreviewJet || this.selectedAircraft || 'FALCON');
      const newIdx = (curIdx + dir + keys.length) % keys.length;
      this.respawnPreviewJet = keys[newIdx];
      this.updateRespawnPreviewMesh();
      this.renderRespawnWorkshopUI();
    }

    updateRespawnPreviewMesh() {
      if (this.menuFighter) {
        this.scene.remove(this.menuFighter);
        AircraftModelFactory.disposeObject3D(this.menuFighter);
      }
      const previewJet = this.respawnPreviewJet || this.selectedAircraft || 'FALCON';
      const team = this.player ? this.player.team : this.selectedTeam;
      this.menuFighter = AircraftModelFactory.createAircraftMesh(previewJet, this.selectedLivery, team);
      this.menuFighter.position.set(0, 750, 0);
      this.menuFighter.visible = true;
      this.scene.add(this.menuFighter);
    }

    renderRespawnWorkshopUI() {
      const targetJet = this.respawnPreviewJet || this.selectedAircraft || 'FALCON';
      const baseDef = CONFIG.AIRCRAFT[targetJet] || CONFIG.AIRCRAFT.FALCON;
      const eff = CareerManager.getEffectiveAircraftStats(targetJet, this.career);
      const isUnlocked = this.career.unlockedAircraft.includes(targetJet);
      const isEquipped = (this.selectedAircraft === targetJet);
      const unlockCost = baseDef.unlockCost !== undefined ? baseDef.unlockCost : (baseDef.cost || 0);
      const idx = CONFIG.AIRCRAFT_KEYS.indexOf(targetJet);

      // 1. Credits & Live Match Telemetry
      const credEl = document.getElementById('respawn-hangar-credits-val');
      if (credEl) credEl.textContent = (this.career.credits || 0).toLocaleString();
      const matchScoreEl = document.getElementById('respawn-hangar-match-score');
      if (matchScoreEl) matchScoreEl.textContent = `BLUE ${this.teamCaptures.BLUE} — ${this.teamCaptures.RED} RED`;
      const timeBadgeEl = document.getElementById('respawn-hangar-time-badge');
      if (timeBadgeEl) timeBadgeEl.textContent = `⏱ ${HUDRenderer.formatClock(this.remainingMatchSec)}`;

      // 2. Center Carousel Bar (Aircraft counter, name, role, action slot)
      const counterEl = document.getElementById('respawn-carousel-counter');
      if (counterEl) counterEl.textContent = `AIRCRAFT ${idx + 1} OF ${CONFIG.AIRCRAFT_KEYS.length}`;
      const nameEl = document.getElementById('respawn-carousel-name');
      if (nameEl) nameEl.textContent = baseDef.name;
      const roleEl = document.getElementById('respawn-carousel-role');
      if (roleEl) roleEl.textContent = (baseDef.tagline || baseDef.tag || 'MULTI-ROLE COMBAT FIGHTER').toUpperCase();
      const upJetName = document.getElementById('respawn-upgrade-jet-name');
      if (upJetName) upJetName.textContent = (baseDef.shortName || baseDef.name).toUpperCase();

      const actionSlot = document.getElementById('respawn-carousel-action-slot');
      if (actionSlot) {
        actionSlot.innerHTML = '';
        if (isEquipped) {
          actionSlot.innerHTML = `<span class="jet-status-badge equipped" style="background:rgba(0,255,157,0.15);border:1px solid #00ff9d;color:#00ff9d;padding:6px 16px;border-radius:4px;font-size:11px;font-weight:700;">✓ EQUIPPED FOR NEXT SPAWN</span>`;
        } else if (isUnlocked) {
          const btn = document.createElement('button');
          btn.className = 'primary-btn btn-equip-action';
          btn.style.cssText = 'font-size:12px;padding:7px 22px;background:#00ff9d;color:#040914;font-weight:800;border:none;border-radius:4px;cursor:pointer;';
          btn.textContent = '✈ SELECT FOR RESPAWN';
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectedAircraft = targetJet;
            this.career.selectedAircraft = targetJet;
            CareerManager.save(this.career);
            if (this.cg) this.cg.setData('fighterjets3d_aircraft', this.selectedAircraft);
            this.audio.playTone(587.33, 0.1, 'triangle', 0.22);
            this.addFloatingPopup(`✈ ${baseDef.name} SELECTED FOR RESPAWN!`, '#00ff9d');
            this.updateRespawnPreviewMesh();
            this.renderRespawnWorkshopUI();
          });
          actionSlot.appendChild(btn);
        } else {
          const btn = document.createElement('button');
          btn.className = 'primary-btn btn-unlock-action';
          btn.style.cssText = 'font-size:12px;padding:7px 22px;background:#fbbf24;color:#0f172a;font-weight:800;border:none;border-radius:4px;cursor:pointer;';
          btn.textContent = `🔓 UNLOCK AIRFRAME (₵${unlockCost.toLocaleString()})`;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.career.credits < unlockCost) {
              this.addFloatingPopup(`NEED ₵${(unlockCost - this.career.credits).toLocaleString()} MORE CREDITS!`, '#ff3b47');
              this.audio.playTone(220, 0.15, 'sawtooth', 0.2);
              return;
            }
            this.career.credits -= unlockCost;
            if (!this.career.unlockedAircraft.includes(targetJet)) {
              this.career.unlockedAircraft.push(targetJet);
            }
            this.selectedAircraft = targetJet;
            this.career.selectedAircraft = targetJet;
            CareerManager.save(this.career);
            if (this.cg) this.cg.setData('fighterjets3d_aircraft', this.selectedAircraft);

            this.audio.playTone(523.25, 0.1, 'triangle', 0.2);
            setTimeout(() => this.audio.playTone(659.25, 0.12, 'triangle', 0.22), 80);
            setTimeout(() => this.audio.playTone(783.99, 0.18, 'triangle', 0.25), 160);
            this.addFloatingPopup(`✈ ${baseDef.name} UNLOCKED & EQUIPPED!`, '#00ff9d');
            this.updateRespawnPreviewMesh();
            this.renderRespawnWorkshopUI();
          });
          actionSlot.appendChild(btn);
        }
      }

      // 3. Quick Jet Picker Pills
      const pillRow = document.getElementById('respawn-jet-pills');
      if (pillRow) {
        pillRow.innerHTML = '';
        CONFIG.AIRCRAFT_KEYS.forEach(key => {
          const def = CONFIG.AIRCRAFT[key];
          const unl = this.career.unlockedAircraft.includes(key);
          const eqp = (this.selectedAircraft === key);
          const act = (targetJet === key);
          const pill = document.createElement('div');
          pill.className = `jet-pill ${act ? 'active' : ''} ${eqp ? 'equipped-pill' : ''}`;
          const icon = eqp ? '✓ ' : (!unl ? '🔒 ' : '');
          pill.textContent = `${icon}${def.shortName || def.name}`;
          pill.style.cursor = 'pointer';
          pill.addEventListener('click', () => {
            this.respawnPreviewJet = key;
            this.updateRespawnPreviewMesh();
            this.renderRespawnWorkshopUI();
          });
          pillRow.appendChild(pill);
        });
      }

      // 4. Upgrades Compact List (Speed, Agility, Firepower, Armor, Boost)
      const upContainer = document.getElementById('respawn-upgrades-list');
      if (upContainer) {
        upContainer.innerHTML = '';
        const cats = ['speed', 'agility', 'firepower', 'armor', 'boost'];
        const catLabels = {
          speed: `Top Speed (${eff.maxSpeed} km/h)`,
          agility: `Agility & Turn Authority (${eff.pitchRate}°/s)`,
          firepower: `20mm Cannon Damage (${eff.cannonDamage} dmg)`,
          armor: `Hull Armor (${eff.maxHp} HP)`,
          boost: `Nitro Boost Capacity (${eff.boostMaxEnergy} fuel)`
        };
        if (!this.career.upgrades[targetJet]) {
          this.career.upgrades[targetJet] = { speed: 1, agility: 1, firepower: 1, armor: 1, boost: 1 };
        }
        const curUps = this.career.upgrades[targetJet];

        cats.forEach(cat => {
          const curLvl = curUps[cat] || 1;
          const nextCost = (curLvl < 5) ? CONFIG.UPGRADE_COSTS[curLvl] : 0;
          const upDescObj = CONFIG.UPGRADE_DESCS[cat];
          const desc = upDescObj ? `${upDescObj.name} • ${upDescObj.perk}` : '';

          let dotsHtml = '';
          for (let i = 1; i <= 5; i++) {
            dotsHtml += `<span class="lvl-dot ${i <= curLvl ? 'filled' : ''}"></span>`;
          }

          let btnHtml = '';
          if (curLvl < 5) {
            const canAfford = this.career.credits >= nextCost;
            btnHtml = `<button class="primary-btn btn-buy-upgrade" data-cat="${cat}" style="font-size:10px;padding:4px 10px;${canAfford ? 'background:#00ff9d;color:#040914;' : 'opacity:0.6;background:#64748b;color:#f8fafc;'}">UPGRADE (₵${nextCost})</button>`;
          } else {
            btnHtml = `<span style="font-size:10px;color:#00ff9d;font-weight:800;font-family:monospace;">MAX LEVEL</span>`;
          }

          const item = document.createElement('div');
          item.className = 'upgrade-row-item';
          item.innerHTML = `
            <div class="upgrade-row-header">
              <span class="upgrade-cat-name">${catLabels[cat]}</span>
              <span style="font-size:10px;color:#38bdf8;font-family:monospace;">Lvl ${curLvl} / 5</span>
            </div>
            <div class="upgrade-cat-perk">${desc}</div>
            <div class="upgrade-row-bottom">
              <div class="upgrade-level-dots" style="flex:1;max-width:140px;">${dotsHtml}</div>
              ${btnHtml}
            </div>
          `;

          const buyBtn = item.querySelector('.btn-buy-upgrade');
          if (buyBtn) {
            buyBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (curLvl >= 5) return;
              if (this.career.credits < nextCost) {
                this.addFloatingPopup(`NEED ₵${nextCost - this.career.credits} MORE CREDITS!`, '#ff3b47');
                this.audio.playTone(220, 0.15, 'sawtooth', 0.2);
                return;
              }
              this.career.credits -= nextCost;
              this.career.upgrades[targetJet][cat] = curLvl + 1;
              CareerManager.save(this.career);

              this.audio.playTone(440, 0.08, 'triangle', 0.18);
              setTimeout(() => this.audio.playTone(880, 0.15, 'triangle', 0.22), 70);
              this.addFloatingPopup(`UPGRADE APPLIED: LEVEL ${curLvl + 1}!`, '#00ff9d');
              this.renderRespawnWorkshopUI();
            });
          }

          upContainer.appendChild(item);
        });
      }

      // 5. Sync Livery & Tracer Swatches
      document.querySelectorAll('#respawn-livery-group .livery-swatch').forEach(sw => {
        const idx = parseInt(sw.dataset.livery, 10) || 0;
        sw.classList.toggle('active', idx === this.selectedLivery);
      });
      document.querySelectorAll('#respawn-tracer-group .livery-swatch').forEach(sw => {
        const idx = parseInt(sw.dataset.tracer, 10) || 0;
        sw.classList.toggle('active', idx === this.selectedTracer);
      });

      // 6. Update Bottom Deploy Button
      const deployBtn = document.getElementById('btn-respawn-launch');
      const deploySub = document.getElementById('respawn-launch-subtitle');
      if (this.player) {
        if (this.player.respawnTimer > 0) {
          const t = Math.max(0, this.player.respawnTimer).toFixed(1);
          if (deployBtn) {
            deployBtn.disabled = true;
            deployBtn.style.opacity = '0.4';
            deployBtn.style.cursor = 'not-allowed';
            deployBtn.textContent = `DEPLOY IN ${t}s`;
          }
          if (deploySub) deploySub.textContent = `DEPLOY LOCK ENGAGED • WAIT ${t}s BEFORE COMBAT SORTIE`;
        } else {
          if (deployBtn) {
            deployBtn.disabled = false;
            deployBtn.style.opacity = '1.0';
            deployBtn.style.cursor = 'pointer';
            deployBtn.textContent = `▶ DEPLOY TO BATTLE`;
          }
          if (deploySub) deploySub.textContent = `RE-DEPLOYING INTO ONGOING CTF SQUADRON MATCH`;
        }
      }
    }

    deployPlayerFromRespawn() {
      if (!this.player || this.player.alive) return;
      if (this.player.respawnTimer > 0) {
        this.addFloatingPopup(`CANNOT DEPLOY YET: WAIT ${this.player.respawnTimer.toFixed(1)}s`, '#ff3b47');
        this.audio.playTone(220, 0.15, 'sawtooth', 0.2);
        return;
      }
      // Auto-deploy previewed airframe if unlocked (per user preference A1)
      if (this.respawnPreviewJet && this.career.unlockedAircraft && this.career.unlockedAircraft.includes(this.respawnPreviewJet)) {
        this.selectedAircraft = this.respawnPreviewJet;
        this.career.selectedAircraft = this.respawnPreviewJet;
        CareerManager.save(this.career);
      }
      this.closeRespawnWorkshop(false);
      this.respawnAwaitingDeploy = false;
      this.respawnPlayerWithSelectedAircraft();
    }

    respawnPlayerWithSelectedAircraft() {
      if (!this.player) return;

      // Enforce that original 4 seconds countdown has fully elapsed
      if (this.player.respawnTimer > 0) return;

      // 1. Rebuild mesh if airframe type OR livery changed
      const needsMeshRebuild = (this.player.typeId !== this.selectedAircraft) || (this.player.liveryIndex !== this.selectedLivery);
      if (needsMeshRebuild) {
        if (this.player.mesh) {
          this.scene.remove(this.player.mesh);
          AircraftModelFactory.disposeObject3D(this.player.mesh);
        }
        this.player.typeId = this.selectedAircraft;
        this.player.liveryIndex = this.selectedLivery;
        this.player.mesh = AircraftModelFactory.createAircraftMesh(this.selectedAircraft, this.selectedLivery, this.player.team);
        this.player.mesh.scale.set(1.75, 1.75, 1.75);
        this.scene.add(this.player.mesh);
      }

      // 2. Refresh effective stats & flight model (incorporating any mid-respawn upgrades)
      const newStats = CareerManager.getEffectiveAircraftStats(this.selectedAircraft, this.career);
      this.player.stats = newStats;
      this.player.flight = new FlightModel(newStats);
      this.player.maxHp = newStats.playerMaxHp || newStats.maxHp || 100;
      this.player.hp = this.player.maxHp;
      this.player.maxBoostEnergy = newStats.boostMaxEnergy || CONFIG.BOOST.maxEnergy;
      this.player.boostEnergy = this.player.maxBoostEnergy;
      this.player.liveryIndex = this.selectedLivery;
      if (CONFIG.TRACERS && CONFIG.TRACERS[this.selectedTracer]) {
        this.weapons.setPlayerTracerColor(CONFIG.TRACERS[this.selectedTracer].hex);
      }

      // 3. Clear workshop flags and 3D studio void
      this.inRespawnWorkshop = false;
      this.respawnAwaitingDeploy = false;
      if (this.studioVoid) this.studioVoid.visible = false;
      if (this.hangarBay) this.hangarBay.visible = false;
      if (this.menuFighter) this.menuFighter.visible = false;

      // 4. Hide all respawn overlays
      const specBar = document.getElementById('spectate-bar');
      if (specBar) specBar.classList.add('hidden');
      const centerOverlay = document.getElementById('respawn-center-overlay');
      if (centerOverlay) centerOverlay.classList.add('hidden');
      const hangarScreen = document.getElementById('respawn-hangar-screen');
      if (hangarScreen) hangarScreen.classList.add('hidden');

      // 5. Spawn at base, reset target & camera
      this.spawnAircraftNearTeamBase(this.player);
      this.cyclePlayerTarget();
      this.input.clearJustPressed();
      if (this.state === 'PLAYING') this.updateCamera(1.0, this.player, true);

      // Audible deployment alert & feedback popup
      this.audio.playTone(523.25, 0.12, 'triangle', 0.25);
      this.addFloatingPopup('✈ SORTIE DEPLOYED! AIRFRAME ENGAGED!', '#00ff9d');
    }

    populateScoreboard(tbodyId) {
      const tbody = document.getElementById(tbodyId);
      if (!tbody) return;
      tbody.innerHTML = '';

      const banner = document.getElementById('team-score-banner');
      if (banner) {
        const clk = HUDRenderer.formatClock(this.remainingMatchSec);
        banner.textContent = this.isSuddenDeath
          ? `⚡ SUDDEN DEATH // BLUE ${this.teamCaptures.BLUE} — ${this.teamCaptures.RED} RED`
          : `⏱ ${clk} // BLUE ${this.teamCaptures.BLUE} — ${this.teamCaptures.RED} RED`;
      }

      const sorted = [...this.aircraftList].sort((a, b) => b.score - a.score);
      sorted.forEach((ac, idx) => {
        const tr = document.createElement('tr');
        tr.className = ac.isPlayer ? 'row-player' : (ac.team === 'BLUE' ? 'row-blue' : 'row-red');
        const statusText = ac.carryingFlag ? '🚩 CARRYING FLAG' : (ac.alive ? 'IN FLIGHT' : 'RE-DEPLOYING');
        const safeName = Game.escapeHtml(ac.callsign);
        tr.innerHTML = `
          <td>#${idx + 1}</td>
          <td>${safeName}${ac.isPlayer ? ' (YOU)' : ''}</td>
          <td style="font-weight:700;">${ac.team}</td>
          <td>${ac.stats.name || ac.stats.shortName}</td>
          <td style="color:#fbbf24;font-weight:700;">${ac.score}</td>
          <td style="color:#00ff9d;font-weight:700;">${ac.flagCaptures}</td>
          <td>${ac.flagReturns}</td>
          <td>${ac.kills} / ${ac.deaths}</td>
          <td class="${ac.alive ? 'status-alive' : 'status-down'}">${statusText}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    updateCamera(dt, focusAc, snapImmediate = false) {
      if (!focusAc) return;
      const pos = focusAc.mesh.position;
      const quat = focusAc.mesh.quaternion;

      for (const a of this.aircraftList) {
        a.hideMeshForCockpit = false;
      }

      if (this.cameraMode === 'COCKPIT') {
        focusAc.hideMeshForCockpit = true;
        if (focusAc.mesh.userData.hiDetail) focusAc.mesh.userData.hiDetail.visible = false;
        if (focusAc.mesh.userData.abGroup) focusAc.mesh.userData.abGroup.visible = false;

        _v1.set(0, 1.05 * 1.75, -2.5 * 1.75).applyQuaternion(quat);
        this.camera.position.copy(pos).add(_v1);
        this.camera.quaternion.copy(quat);
        this.smoothCamPos.copy(this.camera.position);
        _v2.set(0, 0, -1).applyQuaternion(quat);
        this.smoothCamLook.copy(pos).addScaledVector(_v2, 60);
        this.camera.fov = focusAc.flight.isBoosting ? 76 : 68;
        this.camera.updateProjectionMatrix();
      } else {
        if (focusAc.mesh.userData.hiDetail) focusAc.mesh.userData.hiDetail.visible = true;

        const speedRatio = Math.max(0, (focusAc.flight.speed - 120) / 280);
        const distBack = 21.5 + speedRatio * 4.5 + (focusAc.flight.isBoosting ? 3.0 : 0);
        const heightUp = 5.2;

        _euler1.set(focusAc.flight.elevation, focusAc.flight.heading, 0, 'YXZ');
        _q1.setFromEuler(_euler1);

        _v1.set(0, heightUp, distBack).applyQuaternion(_q1);
        _v2.copy(pos).add(_v1);
        _v3.set(0, 0, -1).applyQuaternion(_q1);
        _v4.copy(_v2).addScaledVector(_v3, 800);

        if (snapImmediate) {
          this.smoothCamPos.copy(_v2);
          this.smoothCamLook.copy(_v4);
        } else {
          const lerpFactor = Math.min(1.0, 15.0 * dt);
          this.smoothCamPos.lerp(_v2, lerpFactor);
          this.smoothCamLook.lerp(_v4, lerpFactor * 1.4);
        }

        this.camera.position.copy(this.smoothCamPos);

        if (this.camShakeTimer > 0) {
          this.camShakeTimer = Math.max(0, this.camShakeTimer - dt);
          const shakeMag = (this.camShakeTimer / 0.24) * this.camShakeIntensity;
          this.camera.position.x += (Math.random() - 0.5) * shakeMag;
          this.camera.position.y += (Math.random() - 0.5) * shakeMag;
          this.camera.position.z += (Math.random() - 0.5) * shakeMag;
        }

        _v1.set(-Math.sin(focusAc.flight.bank) * 0.12, 1.0, 0).normalize();
        this.camera.up.lerp(_v1, Math.min(1.0, 12.0 * dt)).normalize();
        this.camera.lookAt(this.smoothCamLook);

        const targetFov = 60 + speedRatio * 14 + (focusAc.flight.isBoosting ? 10 : 0);
        this.camera.fov += (targetFov - this.camera.fov) * Math.min(1.0, 8.0 * dt);
        this.camera.updateProjectionMatrix();
      }
    }

    handleResize() {
      if (window.__syncViewportSize) window.__syncViewportSize();
      const w = Math.max(1, window.innerWidth || document.documentElement.clientWidth);
      const h = Math.max(1, window.innerHeight || document.documentElement.clientHeight);
      const isPhone = Boolean(window.__detectPhone ? window.__detectPhone() : false);
      this.input.isTouchDevice = isPhone;

      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.hud.resize(w, h);
    }

    animate() {
      requestAnimationFrame(() => this.animate());

      const now = performance.now();
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      if (this.state === 'MENU') {
        if (this.input.consumePressed('Space') || this.input.consumePressed('Enter')) {
          this.audio.init();
          this.startMatch();
          return;
        }
        if (this.input.consumePressed('KeyA') || this.input.consumePressed('ArrowLeft')) {
          const curIdx = CONFIG.AIRCRAFT_KEYS.indexOf(this.previewAircraft || this.selectedAircraft);
          const newIdx = (curIdx - 1 + CONFIG.AIRCRAFT_KEYS.length) % CONFIG.AIRCRAFT_KEYS.length;
          this.selectAirframe(CONFIG.AIRCRAFT_KEYS[newIdx]);
        }
        if (this.input.consumePressed('KeyD') || this.input.consumePressed('ArrowRight')) {
          const curIdx = CONFIG.AIRCRAFT_KEYS.indexOf(this.previewAircraft || this.selectedAircraft);
          const newIdx = (curIdx + 1) % CONFIG.AIRCRAFT_KEYS.length;
          this.selectAirframe(CONFIG.AIRCRAFT_KEYS[newIdx]);
        }
        this.input.clearJustPressed();
        const t = now * 0.00045;
        // 3D Showroom Camera Orbit (Smooth Turntable + Mouse Drag)
        if (this.showroomOrbit) {
          if (!this.showroomOrbit.isDragging) {
            this.showroomOrbit.azimuth += dt * this.showroomOrbit.autoSpinSpeed;
          }
          const az = this.showroomOrbit.azimuth;
          const el = this.showroomOrbit.elevation;
          const dist = this.showroomOrbit.dist;

          if (this.menuFighter) {
            this.menuFighter.rotation.set(
              Math.sin(now * 0.0008) * 0.015,
              0,
              Math.sin(now * 0.0012) * 0.02
            );
          }

          const camX = Math.sin(az) * Math.cos(el) * dist;
          const camY = 750 + Math.sin(el) * dist + 1.2;
          const camZ = Math.cos(az) * Math.cos(el) * dist;

          this.camera.position.set(camX, camY, camZ);
          this.camera.up.set(0, 1, 0);
          this.camera.lookAt(0, 750.5, 0);
        }
        // Animate drifting tactical hangar dust specks
        if (this.hangarDust) {
          const posAttr = this.hangarDust.geometry.attributes.position;
          const arr = posAttr.array;
          for (let i = 0; i < arr.length; i += 3) {
            arr[i + 1] += Math.sin(t * 2.0 + arr[i]) * 0.008;
            arr[i] += Math.cos(t * 1.5 + arr[i + 2]) * 0.006;
          }
          posAttr.needsUpdate = true;
        }
        this.world.update(this.camera.position, dt);
        this.renderer.render(this.scene, this.camera);
        return;
      }

      if (this.input.consumePressed('KeyM')) this.toggleMute();
      if (this.input.consumePressed('KeyH')) {
        this.input.showPcControlsGuide = !this.input.showPcControlsGuide;
        const helpBtn = document.getElementById('btn-help-hud');
        if (helpBtn) helpBtn.classList.toggle('active', this.input.showPcControlsGuide);
      }
      if (this.input.consumePressed('KeyP')) {
        if (this.state === 'PLAYING' || this.state === 'PAUSED') {
          this.setPaused(this.state !== 'PAUSED');
        }
      }

      if (this.state === 'PAUSED') {
        if (this.input.consumePressed('Tab') || this.input.consumePressed('Escape')) {
          this.tabPressTime = 0;
          this.setPaused(false);
        } else if (this.tabPressTime && !this.input.keys['Tab']) {
          const heldMs = now - this.tabPressTime;
          this.tabPressTime = 0;
          if (heldMs > 260) this.setPaused(false);
        }
        this.renderer.render(this.scene, this.camera);
        return;
      }

      if (this.state === 'PLAYING' || this.state === 'SPECTATING') {
        this.elapsedSortieSec += dt;

        if (this.tutorial && this.tutorial.active) {
          this.tutorial.update(dt, this.input, this.player);
        }

        if (!this.isSuddenDeath) {
          this.remainingMatchSec = Math.max(0, this.remainingMatchSec - dt);

          // 10-Minute Round Clock Warnings & Expiration Check
          for (const warnSec of [300, 120, 60, 30]) {
            if (this.remainingMatchSec <= warnSec && !this.timeAlertsTriggered[warnSec]) {
              this.timeAlertsTriggered[warnSec] = true;
              const lbl = warnSec >= 60 ? `${warnSec / 60} MINUTE${warnSec > 60 ? 'S' : ''}` : '30 SECONDS';
              this.addFeedItem(`⏱ ${lbl} REMAINING IN CTF ROUND!`, 'warn');
              this.addFloatingPopup(`⏱ ${lbl} REMAINING!`, '#fbbf24');
            }
          }
          if (this.remainingMatchSec <= 0) {
            this.handleTimeLimitReached();
            if (this.state === 'ENDED') return;
          }
        }

        if (this.input.consumePressed('Tab')) {
          this.setPaused(true);
          this.tabPressTime = now;
          return;
        }

        this.updateRespawns(dt);

        const playerControls = this.input.getFlightControls(this.player, this.camera);
        if (playerControls.toggleCam) this.toggleCamera();

        if (this.state === 'PLAYING') {
          if (this.inRespawnWorkshop) {
            if (this.input.consumePressed('KeyA') || this.input.consumePressed('ArrowLeft')) {
              this.cycleRespawnAircraft(-1);
            }
            if (this.input.consumePressed('KeyD') || this.input.consumePressed('ArrowRight')) {
              this.cycleRespawnAircraft(1);
            }
            if (this.input.consumePressed('Space') || this.input.consumePressed('Enter')) {
              if (this.player && this.player.respawnTimer <= 0) {
                this.deployPlayerFromRespawn();
              }
            }
          }
          if (this.player && this.player.alive) {
            // G or X key drops the carried flag!
            if (playerControls.dropFlag && this.player.carryingFlag) {
              this.world.dropFlag(this.player.carryingFlag, this, true);
            }
            if (playerControls.cycleTarget || !this.player.target || !this.player.target.alive) {
              this.cyclePlayerTarget();
            }
            this.player.update(dt, playerControls, this.weapons, this.particles, this.camera.position, this.audio, this.aircraftList, this.world);
          } else if (playerControls.cycleTarget) {
            this.cycleSpectateTarget();
          }
        }

        // Update Adaptive Team Strategic Commanders
        if (this.teamCommanders) {
          this.teamCommanders.BLUE.update(dt, this.aircraftList, this.world, this);
          this.teamCommanders.RED.update(dt, this.aircraftList, this.world, this);
        }

        // Update AI Squadron Pilots
        for (const ac of this.aircraftList) {
          if (!ac.alive || ac.isPlayer) continue;
          const aiControls = ac.ai.update(dt, this.aircraftList, this.world, this);
          ac.update(dt, aiControls, this.weapons, this.particles, this.camera.position, null, this.aircraftList, this.world);
        }

        // Check Ground / Ocean Collisions (Instant Death on Ground Impact!)
        for (const ac of this.aircraftList) {
          if (!ac.alive || ac.isTakingOff) continue;
          const pos = ac.mesh.position;
          const rawTerrainH = this.world.getTerrainHeight(pos.x, pos.z);
          const groundY = Math.max(CONFIG.WORLD.seaLevel, rawTerrainH);
          if (pos.y <= groundY + 3.8) {
            const hitOcean = rawTerrainH <= CONFIG.WORLD.seaLevel + 1.0;
            this.destroyAircraft(ac, null, hitOcean ? 'the Ocean' : 'the Ground');
          }
        }

        // Update CTF Flags, Bullets & Particles
        this.world.updateFlagsAndRings(dt, this.aircraftList, this.particles, this.audio, this);
        if (this.state === 'ENDED') {
          this.renderer.render(this.scene, this.camera);
          return;
        }
        this.weapons.update(dt, this.aircraftList, this.world, (victim, attacker, dmg, label, impactPos) => {
          this.handleAircraftDamage(victim, attacker, dmg, label, impactPos);
        });
        this.particles.update(dt, this.world);

        const activeFocus = this.player;
        if (activeFocus) {
          if (this.inRespawnWorkshop) {
            // Mid-Respawn 3D Aircraft Showroom Camera (Smooth Turntable + Mouse Drag)
            if (this.showroomOrbit) {
              if (!this.showroomOrbit.isDragging) {
                this.showroomOrbit.azimuth += dt * this.showroomOrbit.autoSpinSpeed;
              }
              const az = this.showroomOrbit.azimuth;
              const el = this.showroomOrbit.elevation;
              const dist = this.showroomOrbit.dist;

              if (this.menuFighter) {
                this.menuFighter.rotation.set(
                  Math.sin(now * 0.0008) * 0.015,
                  0,
                  Math.sin(now * 0.0012) * 0.02
                );
              }

              const camX = Math.sin(az) * Math.cos(el) * dist;
              const camY = 750 + Math.sin(el) * dist + 1.2;
              const camZ = Math.cos(az) * Math.cos(el) * dist;

              this.camera.position.set(camX, camY, camZ);
              this.camera.up.set(0, 1, 0);
              this.camera.lookAt(0, 750.5, 0);
            }
            this.camera.updateMatrixWorld(true);
            this.hud.clear();
            this.audio.updateEngine(0, 0, false, false);
          } else {
            if (activeFocus.alive) {
              this.updateCamera(dt, activeFocus, false);
            } else {
              // Player is dead: Killer chase cam or chosen spectate target
              const spectateTarget = (this.spectateTarget && this.spectateTarget.alive)
                ? this.spectateTarget
                : (this.killerAc && this.killerAc.alive ? this.killerAc : null);
              if (spectateTarget) {
                this.updateCamera(dt, spectateTarget, false);
              }
            }
            this.camera.updateMatrixWorld(true);
            this.hud.render(
              dt,
              activeFocus,
              this.aircraftList,
              this.world,
              this.camera,
              this.state === 'SPECTATING',
              this.cameraMode,
              this.input,
              this.teamCaptures,
              this.highScore,
              this.remainingMatchSec,
              this.isSuddenDeath
            );
            if (activeFocus.alive) {
              const speedRatio = activeFocus.flight.speed / activeFocus.stats.maxSpeed;
              this.audio.updateEngine(activeFocus.flight.throttle, speedRatio, activeFocus.flight.isBoosting, true);
            } else {
              this.audio.updateEngine(0, 0, false, false);
            }
          }
        }

        this.world.update(this.camera.position, dt);
      }

      this.renderer.render(this.scene, this.camera);
    }
  }

  window.Game = Game;

  window.addEventListener('load', () => {
    try {
      window.airCombatSim = new Game();
    } catch (err) {
      console.error('Simulator initialization error:', err);
    }
  });