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
      if (window.__isPhoneDevice) {
        return;
      }
      this.canvas = document.getElementById('webgl-canvas');
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 1.5, 65000);

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

      // Apply audio volumes & HUD preferences from career settings
      this.audio.setMusicVolume(this.career.settings.musicVol);
      this.audio.setSfxVolume(this.career.settings.sfxVol);
      this.hud.hudColorTheme = this.career.settings.hudColor || 'GREEN';
      this.hud.showFps = Boolean(this.career.settings.showFps);

      // Hangar Bay Viewport & Systems Dry-Test State
      this.hangarTestAB = false;
      this.hangarTracerBullets = [];
      this.hangarTracerGeo = new THREE.BoxGeometry(0.16, 0.16, 2.8);
      this.hangarTracerCount = 0;
      this.hangarActivePreset = '3/4';
      this._resetArmedTimer = null;

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

      // Setup 3D Showroom Mouse Drag Orbit & Tab Camera Choreography
      this.hangarTab = 'fighter';
      this.respawnTab = 'fighter';
      this.showroomOrbit = {
        isDragging: false,
        prevX: 0,
        prevY: 0,
        azimuth: -0.34,
        elevation: 0.14,
        dist: 15.8,
        targetAzimuth: -0.34,
        targetElevation: 0.14,
        targetDist: 15.8,
        lookBiasX: -2.4,
        targetLookBiasX: -2.4,
        autoSpinSpeed: 0.08,
        userInteracted: false
      };

      const cvs = this.canvas;
      cvs.addEventListener('pointerdown', (e) => {
        if (this.state !== 'MENU' && !this.inRespawnWorkshop) return;
        this.showroomOrbit.isDragging = true;
        this.showroomOrbit.userInteracted = true;
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
        this.showroomOrbit.elevation = Math.max(-0.02, Math.min(0.95, this.showroomOrbit.elevation + dy * 0.0055));
        this.showroomOrbit.targetAzimuth = this.showroomOrbit.azimuth;
        this.showroomOrbit.targetElevation = this.showroomOrbit.elevation;
      });
      cvs.addEventListener('wheel', (e) => {
        if (this.state !== 'MENU' && !this.inRespawnWorkshop) return;
        e.preventDefault();
        this.showroomOrbit.targetDist = THREE.MathUtils.clamp(
          this.showroomOrbit.targetDist + e.deltaY * 0.012,
          9.5,
          28.0
        );
      }, { passive: false });
      const stopOrbitDrag = (e) => {
        if (this.showroomOrbit.isDragging) {
          this.showroomOrbit.isDragging = false;
          try { cvs.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      window.addEventListener('pointerup', stopOrbitDrag);
      window.addEventListener('pointercancel', stopOrbitDrag);

      // Setup 3D Airbase Maintenance Bay
      this.setupHangarBay();

      this.menuFighter = AircraftModelFactory.createAircraftMesh(this.selectedAircraft, this.selectedLivery, this.selectedTeam);
      this.menuFighter.position.set(0, 748.0, 0);
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

      // Always enter the Airbase Hangar Bay first (new pilots trigger Tutorial on first Deploy)
      this.state = 'MENU';
      this.world.setHangarLightingMode(true);
      this.switchHangarTab('fighter', false);
      const startScreen = document.getElementById('start-screen');
      if (startScreen) startScreen.classList.remove('hidden');
      const topControls = document.getElementById('top-controls');
      if (topControls) topControls.classList.add('hidden');
      this.updateMenuPreviewMesh();

      this.animate();
    }

    setupHangarBay() {
      if (this.hangarBay) return;
      this.hangarBay = new THREE.Group();
      this.hangarBay.position.set(0, 746, 0);
      this.hangarBayMeshes = [];
      this.hangarStandMeshes = [];

      const addBayMesh = (m, isStandPart = false) => {
        this.hangarBay.add(m);
        this.hangarBayMeshes.push(m);
        if (isStandPart) this.hangarStandMeshes.push(m);
        return m;
      };

      // 1. Matte Concrete Hangar Apron Texture (Clean seams, subtle wear, understated bay stencil)
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#1d1f22';
      ctx.fillRect(0, 0, 1024, 1024);

      // Subtle concrete patina blocks
      for (let gx = 0; gx < 1024; gx += 128) {
        for (let gy = 0; gy < 1024; gy += 128) {
          const shade = 27 + (((gx * 7 + gy * 13) % 5) - 2);
          ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 5})`;
          ctx.fillRect(gx + 2, gy + 2, 124, 124);
        }
      }

      // Expansion joints
      ctx.strokeStyle = '#111316';
      ctx.lineWidth = 4;
      for (let x = 0; x <= 1024; x += 256) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1024); ctx.stroke();
      }
      for (let y = 0; y <= 1024; y += 256) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
      }

      // Thin perimeter service line & corner bay index
      ctx.strokeStyle = 'rgba(184, 132, 40, 0.72)';
      ctx.lineWidth = 5;
      ctx.strokeRect(140, 140, 744, 744);

      ctx.strokeStyle = 'rgba(234, 231, 223, 0.20)';
      ctx.lineWidth = 2;
      ctx.setLineDash([18, 14]);
      ctx.strokeRect(160, 160, 704, 704);
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(234, 231, 223, 0.30)';
      ctx.font = '700 24px "Share Tech Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('BAY 01', 164, 198);

      const floorTex = new THREE.CanvasTexture(canvas);
      const floorGeo = new THREE.PlaneGeometry(120, 120);
      floorGeo.rotateX(-Math.PI * 0.5);
      const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: 0.84,
        metalness: 0.14
      }));
      addBayMesh(floorMesh);

      // 2. Enclosed Side/Front Walls, Ceiling Trusses & Semi-Open North Blast Doors (-Z)
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x1e2126, roughness: 0.85, metalness: 0.24 });
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.54, metalness: 0.58 });
      const trussMat = new THREE.MeshStandardMaterial({ color: 0x353b43, metalness: 0.65, roughness: 0.40 });
      const fixtureEmissiveMat = new THREE.MeshBasicMaterial({ color: 0xfff0d6 });
      const amberStrobeMat = new THREE.MeshBasicMaterial({ color: 0xd9822b });
      const redAccentMat = new THREE.MeshBasicMaterial({ color: 0xc9443e });

      const frontWall = new THREE.Mesh(new THREE.BoxGeometry(120, 42, 2), wallMat);
      frontWall.position.set(0, 21, 52);
      const leftWall = new THREE.Mesh(new THREE.BoxGeometry(2, 42, 108), wallMat);
      leftWall.position.set(-56, 21, 0);
      const rightWall = new THREE.Mesh(new THREE.BoxGeometry(2, 42, 108), wallMat);
      rightWall.position.set(56, 21, 0);
      const ceilingRoof = new THREE.Mesh(new THREE.BoxGeometry(120, 2, 108), wallMat);
      ceilingRoof.position.set(0, 41, 0);
      addBayMesh(frontWall);
      addBayMesh(leftWall);
      addBayMesh(rightWall);
      addBayMesh(ceilingRoof);

      // Semi-open North Blast Door Aperture (34m central daylight portal)
      const northLeftWing = new THREE.Mesh(new THREE.BoxGeometry(42, 42, 2.5), wallMat);
      northLeftWing.position.set(-39, 21, -52);
      const northRightWing = new THREE.Mesh(new THREE.BoxGeometry(42, 42, 2.5), wallMat);
      northRightWing.position.set(39, 21, -52);
      const northHeader = new THREE.Mesh(new THREE.BoxGeometry(38, 14, 3), wallMat);
      northHeader.position.set(0, 35, -52);
      addBayMesh(northLeftWing);
      addBayMesh(northRightWing);
      addBayMesh(northHeader);

      // Heavy sliding steel blast doors partly retracted to each side of the aperture
      for (const sx of [-1, 1]) {
        const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(16, 28, 1.4), doorMat);
        doorLeaf.position.set(sx * 24, 14, -50.2);
        addBayMesh(doorLeaf);

        // Door hazard edge stripe & lintel beacon
        const edgeWarn = new THREE.Mesh(new THREE.BoxGeometry(0.6, 27, 1.6), amberStrobeMat);
        edgeWarn.position.set(sx * 16.2, 14, -50.2);
        addBayMesh(edgeWarn);
      }
      for (const bx of [-16, 0, 16]) {
        const lintelBeacon = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.8), amberStrobeMat);
        lintelBeacon.position.set(bx, 28.2, -50.4);
        addBayMesh(lintelBeacon);
      }

      // Exterior runway apron visible through the semi-open blast doors
      const extApron = new THREE.Mesh(
        new THREE.PlaneGeometry(140, 260),
        new THREE.MeshLambertMaterial({ color: 0x26292e })
      );
      extApron.rotation.x = -Math.PI * 0.5;
      extApron.position.set(0, -0.05, -180);
      addBayMesh(extApron);

      for (let rz = -75; rz >= -250; rz -= 32) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 14), fixtureEmissiveMat);
        dash.position.set(0, 0.02, rz);
        addBayMesh(dash);
      }

      // Structural Columns, Ceiling Roof Trusses & Recessed Overhead Light Banks
      const colGeo = new THREE.BoxGeometry(2.2, 40, 2.8);
      for (const tx of [-42, -21, 21, 42]) {
        addBayMesh(new THREE.Mesh(colGeo, trussMat)).position.set(tx, 20, 50);
      }
      for (const bz of [-36, -12, 12, 36]) {
        addBayMesh(new THREE.Mesh(colGeo, trussMat)).position.set(-54, 20, bz);
        addBayMesh(new THREE.Mesh(colGeo, trussMat)).position.set(54, 20, bz);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(110, 2.2, 2.4), trussMat);
        beam.position.set(0, 39, bz);
        addBayMesh(beam);

        const lightBar = new THREE.Mesh(new THREE.BoxGeometry(22, 0.35, 1.1), fixtureEmissiveMat);
        lightBar.position.set(0, 37.8, bz);
        addBayMesh(lightBar);
      }

      // 3. Matte Steel Turntable Deck & Baked Ground Contact Shadow
      const turntableMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(13.5, 14.0, 0.32, 56),
        new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.62, metalness: 0.58 })
      );
      turntableMesh.position.set(0, 0.16, 0);
      addBayMesh(turntableMesh, true);

      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(13.35, 13.65, 64),
        new THREE.MeshBasicMaterial({ color: 0x4f555e, side: THREE.DoubleSide })
      );
      ringMesh.rotation.x = -Math.PI * 0.5;
      ringMesh.position.set(0, 0.33, 0);
      addBayMesh(ringMesh, true);

      // Soft baked ambient occlusion contact shadow directly under the jet
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = 256;
      shadowCanvas.height = 256;
      const sctx = shadowCanvas.getContext('2d');
      const sgrad = sctx.createRadialGradient(128, 128, 18, 128, 128, 122);
      sgrad.addColorStop(0.0, 'rgba(4, 5, 7, 0.88)');
      sgrad.addColorStop(0.55, 'rgba(6, 7, 9, 0.52)');
      sgrad.addColorStop(1.0, 'rgba(6, 7, 9, 0.0)');
      sctx.fillStyle = sgrad;
      sctx.fillRect(0, 0, 256, 256);

      const contactShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(14.5, 16.5),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(shadowCanvas),
          transparent: true,
          depthWrite: false
        })
      );
      contactShadow.rotation.x = -Math.PI * 0.5;
      contactShadow.position.set(0, 0.34, 0.4);
      addBayMesh(contactShadow, true);

      // 4. Low-Profile Maintenance Jacks & Side Service Gantry Cart
      const jackCoords = [
        [0, -4.4],
        [-2.2, 2.2],
        [2.2, 2.2]
      ];
      for (const [jx, jz] of jackCoords) {
        const jackBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.58, 0.25, 8), trussMat);
        jackBase.position.set(jx, 0.45, jz);
        const jackStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.05, 8), doorMat);
        jackStrut.position.set(jx, 1.02, jz);
        const jackPad = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.45), amberStrobeMat);
        jackPad.position.set(jx, 1.50, jz);
        addBayMesh(jackBase, true);
        addBayMesh(jackStrut, true);
        addBayMesh(jackPad, true);
      }

      // Service floodlight gantry & tool cart parked clear of orbital camera path
      const gantry = new THREE.Group();
      gantry.position.set(17.5, 0.32, -16.5);
      gantry.rotation.y = -0.82;
      const cartBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.3), trussMat);
      cartBody.position.y = 0.72;
      const cartStripe = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.18, 1.34), amberStrobeMat);
      cartStripe.position.y = 1.05;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 4.4, 8), doorMat);
      mast.position.set(-0.7, 2.5, 0);
      const lampHousing = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.36, 0.45), wallMat);
      lampHousing.position.set(-0.7, 4.7, 0);
      lampHousing.rotation.x = 0.35;
      const lampLens = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.22, 0.08), fixtureEmissiveMat);
      lampLens.position.set(-0.7, 4.65, -0.22);
      lampLens.rotation.x = 0.35;
      const safetyCone = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.75, 8), redAccentMat);
      safetyCone.position.set(1.8, 0.38, -0.5);
      gantry.add(cartBody, cartStripe, mast, lampHousing, lampLens, safetyCone);
      addBayMesh(gantry);

      // 5. Three Soft Additive Overhead Volumetric Light Cones (Replaces square point sprites)
      const coneCanvas = document.createElement('canvas');
      coneCanvas.width = 64;
      coneCanvas.height = 256;
      const cctx = coneCanvas.getContext('2d');
      const vGrad = cctx.createLinearGradient(0, 0, 0, 256);
      vGrad.addColorStop(0.0, 'rgba(255, 240, 214, 0.0)');
      vGrad.addColorStop(0.18, 'rgba(255, 240, 214, 0.28)');
      vGrad.addColorStop(0.70, 'rgba(214, 224, 236, 0.08)');
      vGrad.addColorStop(1.0, 'rgba(180, 198, 218, 0.0)');
      cctx.fillStyle = vGrad;
      cctx.fillRect(0, 0, 64, 256);

      const lightShaftMat = new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(coneCanvas),
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      for (const sx of [-18, 0, 18]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(7.2, 34, 24, 1, true), lightShaftMat);
        cone.position.set(sx, 20.5, sx === 0 ? -4 : -14);
        addBayMesh(cone);
      }

      // 6. Calibrated 3-Point Bay Lighting (Matte RAM finish contrast without white clipping)
      const bayHemiFill = new THREE.HemisphereLight(0x88a0b8, 0x16181c, 0.36);
      this.hangarBay.add(bayHemiFill);

      const overheadKey = new THREE.SpotLight(0xffe6c4, 0.90, 95, Math.PI * 0.34, 0.78, 1.1);
      overheadKey.position.set(8, 34, 14);
      overheadKey.target.position.set(0, 2.2, 0);
      this.hangarBay.add(overheadKey);
      this.hangarBay.add(overheadKey.target);

      const doorCoolFill = new THREE.DirectionalLight(0xa4bed8, 0.48);
      doorCoolFill.position.set(-10, 14, -46);
      this.hangarBay.add(doorCoolFill);

      const portalBounceLight = new THREE.PointLight(0x9fb8d4, 0.52, 72);
      portalBounceLight.position.set(0, 18, -32);
      this.hangarBay.add(portalBounceLight);

      const frontRimFill = new THREE.DirectionalLight(0xffebd0, 0.28);
      frontRimFill.position.set(14, 10, 28);
      this.hangarBay.add(frontRimFill);

      const bayAmberAccent = new THREE.PointLight(0xd9822b, 0.65, 42);
      bayAmberAccent.position.set(14, 4.5, -10);
      this.hangarBay.add(bayAmberAccent);

      this.hangarDust = null;
      this.scene.add(this.hangarBay);

      // Studio Dark Backdrop Sphere (mid-match respawn workshop isolation)
      const studioVoidGeo = new THREE.SphereGeometry(65, 32, 24);
      const studioVoidMat = new THREE.MeshBasicMaterial({
        color: 0x0c0d0f,
        side: THREE.BackSide
      });
      this.studioVoid = new THREE.Mesh(studioVoidGeo, studioVoidMat);
      this.studioVoid.position.set(0, 748, 0);
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

    setOrbitPresetForTab(tab) {
      if (!this.showroomOrbit) return;
      const presets = {
        fighter:  { az: -0.34, el: 0.14, dist: 15.8, biasX: -2.4, tag: '3/4' },
        upgrades: { az: 2.38,  el: 0.19, dist: 15.2, biasX: -2.2, tag: 'NOSE' },
        paint:    { az: -0.78, el: 0.34, dist: 15.8, biasX: -2.4, tag: '3/4' },
        pilot:    { az: -0.18, el: 0.22, dist: 21.5, biasX: -1.8, tag: '3/4' }
      };
      const p = presets[tab] || presets.fighter;
      this.showroomOrbit.targetAzimuth = p.az;
      this.showroomOrbit.targetElevation = p.el;
      this.showroomOrbit.targetDist = p.dist;
      this.showroomOrbit.targetLookBiasX = p.biasX;
      this.showroomOrbit.userInteracted = false;
      this.hangarActivePreset = p.tag;
      this.syncBayViewportButtons();
    }

    applyCameraPreset(preset) {
      if (!this.showroomOrbit) return;
      const map = {
        '3/4':  { az: -0.34, el: 0.14, dist: 15.8, biasX: -2.4 },
        'NOSE': { az: 2.38,  el: 0.19, dist: 15.2, biasX: -2.2 },
        'TOP':  { az: 0.02,  el: 0.90, dist: 17.5, biasX: -2.1 },
        'AFT':  { az: 0.34,  el: 0.12, dist: 14.8, biasX: -2.2 }
      };
      const p = map[preset] || map['3/4'];
      this.showroomOrbit.targetAzimuth = p.az;
      this.showroomOrbit.targetElevation = p.el;
      this.showroomOrbit.targetDist = p.dist;
      this.showroomOrbit.targetLookBiasX = p.biasX;
      this.hangarActivePreset = preset;
      this.syncBayViewportButtons();
    }

    syncBayViewportButtons() {
      document.querySelectorAll('.bay-tool-btn[data-cam-preset]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.camPreset === this.hangarActivePreset);
      });
      document.querySelectorAll('.bay-tool-btn[data-bay-test="ab"]').forEach(btn => {
        btn.classList.toggle('active', Boolean(this.hangarTestAB));
      });
    }

    toggleHangarAbTest() {
      this.hangarTestAB = !this.hangarTestAB;
      this.syncBayViewportButtons();
      if (this.audio) this.audio.playUiTick(this.hangarTestAB ? 'afterburner' : 'click');
    }

    triggerHangarTracerBurst() {
      if (!this.menuFighter) return;
      if (this.audio) {
        this.audio.init();
        this.audio.playUiTick('dryfire');
      }
      const hex = (CONFIG.TRACERS && CONFIG.TRACERS[this.selectedTracer])
        ? CONFIG.TRACERS[this.selectedTracer].hex
        : 0xf0d284;
      const mat = new THREE.MeshBasicMaterial({ color: hex });
      const activeJet = this.inRespawnWorkshop ? (this.respawnPreviewJet || this.selectedAircraft) : (this.previewAircraft || this.selectedAircraft);
      const isTitan = activeJet === 'TITAN';
      this.hangarTracerCount = (this.hangarTracerCount || 0) + 1;

      const xOffset = isTitan ? 0 : (this.hangarTracerCount % 2 === 0 ? 1.35 : -1.35);
      const yOffset = isTitan ? 747.55 : 748.0;
      const bolt = new THREE.Mesh(this.hangarTracerGeo, mat);
      bolt.position.set(xOffset, yOffset, -6.2);
      this.scene.add(bolt);
      this.hangarTracerBullets.push({ mesh: bolt, mat, age: 0, maxLife: 0.72 });
    }

    clearHangarTestEffects(turnOffAb = true) {
      if (this.hangarTracerBullets && this.hangarTracerBullets.length > 0) {
        for (const b of this.hangarTracerBullets) {
          this.scene.remove(b.mesh);
          if (b.mat && b.mat.dispose) b.mat.dispose();
        }
        this.hangarTracerBullets = [];
      }
      if (turnOffAb) {
        this.hangarTestAB = false;
        this.syncBayViewportButtons();
      }
    }

    switchHangarTab(tab, playTick = true) {
      this.hangarTab = tab || 'fighter';
      const views = ['fighter', 'upgrades', 'paint', 'pilot'];
      views.forEach(v => {
        const el = document.getElementById(`tab-view-${v}`);
        if (el) el.classList.toggle('hidden', v !== this.hangarTab);
      });
      const jetHdr = document.getElementById('dock-jet-header');
      if (jetHdr) jetHdr.classList.toggle('hidden', this.hangarTab === 'pilot');

      document.querySelectorAll('.hangar-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === this.hangarTab);
      });
      const startScreen = document.getElementById('start-screen');
      if (startScreen) {
        startScreen.classList.remove('tab-fighter-active', 'tab-upgrades-active', 'tab-paint-active', 'tab-pilot-active');
        startScreen.classList.add(`tab-${this.hangarTab}-active`);
      }

      if (this.hangarTab === 'pilot') {
        this.renderPilotStats();
      } else {
        this.renderWorkshopUI();
      }
      this.setOrbitPresetForTab(this.hangarTab);
      if (playTick && this.audio) this.audio.playUiTick('tab');
    }

    switchRespawnTab(tab, playTick = true) {
      this.respawnTab = tab || 'fighter';
      ['fighter', 'upgrades', 'paint'].forEach(v => {
        const el = document.getElementById(`respawn-tab-${v}`);
        if (el) el.classList.toggle('hidden', v !== this.respawnTab);
      });
      document.querySelectorAll('.respawn-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === this.respawnTab);
      });
      this.renderRespawnWorkshopUI();
      this.setOrbitPresetForTab(this.respawnTab);
      if (playTick && this.audio) this.audio.playUiTick('tab');
    }

    renderHangarProfile() {
      const rankInfo = CareerManager.getRank(this.career.xp);
      const iconEl = document.getElementById('hangar-rank-icon');
      const nameEl = document.getElementById('hangar-rank-name');
      const xpFillEl = document.getElementById('hangar-xp-fill');
      const creditsEl = document.getElementById('hangar-credits-val');
      const teamPill = document.getElementById('hangar-team-pill');

      if (iconEl) iconEl.textContent = rankInfo.cur.icon || rankInfo.cur.badge;
      if (nameEl) nameEl.textContent = rankInfo.cur.name;
      if (xpFillEl) xpFillEl.style.width = `${Math.round(rankInfo.progress * 100)}%`;
      if (creditsEl) creditsEl.textContent = this.career.credits.toLocaleString();
      if (teamPill) {
        const isBlue = this.selectedTeam !== 'RED';
        teamPill.textContent = isBlue ? 'BLUE SQUADRON' : 'RED SQUADRON';
        teamPill.classList.toggle('team-blue', isBlue);
        teamPill.classList.toggle('team-red', !isBlue);
      }

      const callsignInput = document.getElementById('input-callsign');
      if (callsignInput) callsignInput.value = this.career.callsign || 'NightHawk_IN';
    }

    renderActionSlot(slotId, targetJet, inRespawn) {
      const actionSlot = document.getElementById(slotId);
      if (!actionSlot) return;
      const baseDef = CONFIG.AIRCRAFT[targetJet] || CONFIG.AIRCRAFT.FALCON;
      const isUnlocked = this.career.unlockedAircraft.includes(targetJet);
      const isEquipped = (this.selectedAircraft === targetJet);
      const unlockCost = baseDef.unlockCost !== undefined ? baseDef.unlockCost : (baseDef.cost || 0);

      actionSlot.innerHTML = '';
      if (isEquipped) {
        actionSlot.innerHTML = `<span class="jet-status-tag">${inRespawn ? 'EQUIPPED' : 'IN SERVICE'}</span>`;
        return;
      }

      const btn = document.createElement('button');
      if (isUnlocked) {
        btn.className = 'action-inline-btn equip';
        btn.textContent = inRespawn ? 'SELECT JET' : 'EQUIP';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.equipAircraft(targetJet);
          if (inRespawn) {
            this.updateRespawnPreviewMesh();
            this.renderRespawnWorkshopUI();
          }
        });
      } else {
        btn.className = 'action-inline-btn unlock';
        btn.textContent = `UNLOCK ${unlockCost.toLocaleString()} PTS`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.unlockAircraft(targetJet, inRespawn);
        });
      }
      actionSlot.appendChild(btn);
    }

    renderTelemetryBars(containerId, specGridId, jetKey, eff, compareEff = null) {
      const container = document.getElementById(containerId);
      if (!container) return;
      const base = CONFIG.AIRCRAFT[jetKey] || CONFIG.AIRCRAFT.FALCON;
      const metrics = [
        { label: 'Top Speed',   base: base.maxSpeed,     cur: eff.maxSpeed,     cmp: compareEff ? compareEff.maxSpeed : null,     max: 560, unit: ' km/h', dec: 0 },
        { label: 'Turn Rate',   base: base.pitchRate,    cur: eff.pitchRate,    cmp: compareEff ? compareEff.pitchRate : null,    max: 4.4, unit: ' rad/s', dec: 1 },
        { label: 'Armament',    base: base.cannonDamage * base.cannonFireRate, cur: eff.cannonDamage * eff.cannonFireRate, cmp: compareEff ? (compareEff.cannonDamage * compareEff.cannonFireRate) : null, max: 230, unit: ' dps', dec: 0 },
        { label: 'Hull Armor',  base: base.maxHp,        cur: eff.maxHp,        cmp: compareEff ? compareEff.maxHp : null,        max: 200, unit: ' HP', dec: 0 },
        { label: 'Afterburner', base: 100,               cur: eff.boostMaxEnergy || 100, cmp: compareEff ? (compareEff.boostMaxEnergy || 100) : null, max: 165, unit: ' cap', dec: 0 }
      ];

      container.innerHTML = '';
      metrics.forEach(m => {
        const basePct = Math.min(100, Math.round((m.base / m.max) * 100));
        const curPct = Math.min(100, Math.round((m.cur / m.max) * 100));
        const deltaPct = Math.max(0, curPct - basePct);
        const valStr = m.dec === 0 ? `${Math.round(m.cur)}${m.unit}` : `${m.cur.toFixed(m.dec)}${m.unit}`;

        let cmpBadgeHtml = '';
        let cmpPosBar = '';
        let cmpNegBar = '';
        if (m.cmp !== null && Math.abs(m.cur - m.cmp) >= (m.dec === 0 ? 1 : 0.05)) {
          const diff = m.cur - m.cmp;
          const sign = diff > 0 ? '+' : '';
          const diffFmt = m.dec === 0 ? Math.round(diff) : diff.toFixed(m.dec);
          const cls = diff > 0 ? 'pos' : 'neg';
          cmpBadgeHtml = `<span class="telemetry-delta ${cls}">${sign}${diffFmt}</span>`;

          const cmpPct = Math.min(100, Math.round((m.cmp / m.max) * 100));
          if (curPct > cmpPct) {
            cmpPosBar = `<div class="telemetry-fill-cmp-pos" style="left:${cmpPct}%;width:${curPct - cmpPct}%;"></div>`;
          } else if (curPct < cmpPct) {
            cmpNegBar = `<div class="telemetry-fill-cmp-neg" style="left:${curPct}%;width:${cmpPct - curPct}%;"></div>`;
          }
        }

        const row = document.createElement('div');
        row.className = 'telemetry-row';
        row.innerHTML = `
          <div class="telemetry-top">
            <span class="telemetry-name">${m.label}</span>
            <div class="telemetry-val-group">
              ${cmpBadgeHtml}
              <span class="telemetry-val">${valStr}</span>
            </div>
          </div>
          <div class="telemetry-track">
            <div class="telemetry-fill-base" style="width:${Math.min(basePct, curPct)}%;"></div>
            <div class="telemetry-fill-bonus" style="left:${basePct}%;width:${deltaPct}%;"></div>
            ${cmpPosBar}${cmpNegBar}
          </div>
        `;
        container.appendChild(row);
      });

      const specGrid = specGridId ? document.getElementById(specGridId) : null;
      if (specGrid) {
        specGrid.innerHTML = `
          <div class="spec-cell"><div class="k">AFTERBURNER MAX</div><div class="v">${eff.boostMaxSpeed} KM/H</div></div>
          <div class="spec-cell"><div class="k">FIRE RATE</div><div class="v">${eff.cannonFireRate} RDS/S</div></div>
          <div class="spec-cell"><div class="k">MUZZLE VELOCITY</div><div class="v">${eff.cannonMuzzleSpeed} M/S</div></div>
          <div class="spec-cell"><div class="k">ROLL AUTHORITY</div><div class="v">${eff.rollRate.toFixed(1)} RAD/S</div></div>
        `;
      }
    }

    renderFleetStrip(containerId, targetJet, onSelect) {
      const strip = document.getElementById(containerId);
      if (!strip) return;
      strip.innerHTML = '';

      CONFIG.AIRCRAFT_KEYS.forEach((key, i) => {
        const def = CONFIG.AIRCRAFT[key];
        const unl = this.career.unlockedAircraft.includes(key);
        const eqp = (this.selectedAircraft === key);
        const act = (targetJet === key);
        const cost = def.unlockCost !== undefined ? def.unlockCost : (def.cost || 0);

        const stateLbl = eqp ? 'ACTIVE' : (unl ? 'READY' : `${cost.toLocaleString()}`);
        const stateCls = eqp ? 'in-service' : (unl ? 'owned' : 'locked');

        const card = document.createElement('button');
        card.type = 'button';
        card.className = `fleet-card ${act ? 'active' : ''} ${eqp ? 'equipped-card' : ''}`;
        card.innerHTML = `
          <div class="fleet-card-top">
            <span class="fleet-card-idx">0${i + 1}</span>
            <span class="fleet-card-state ${stateCls}">${stateLbl}</span>
          </div>
          <div class="fleet-card-name">${def.shortName || def.name}</div>
        `;
        card.addEventListener('click', () => {
          if (this.audio) this.audio.playUiTick('click');
          onSelect(key);
        });
        strip.appendChild(card);
      });
    }

    renderUpgradesTrack(containerId, targetJet, onAfterUpgrade, previewBannerId = null) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = '';

      const eff = CareerManager.getEffectiveAircraftStats(targetJet, this.career);
      const cats = ['speed', 'agility', 'firepower', 'armor', 'boost'];
      const catNames = {
        speed: `Engine Thrust (${eff.maxSpeed} km/h)`,
        agility: `Flight Surfaces (${eff.pitchRate} rad/s)`,
        firepower: `20mm Rotary (${eff.cannonDamage} dmg)`,
        armor: `Airframe Hull (${eff.maxHp} HP)`,
        boost: `Afterburner Tank (${eff.boostMaxEnergy} cap)`
      };

      if (!this.career.upgrades[targetJet]) {
        this.career.upgrades[targetJet] = { speed: 1, agility: 1, firepower: 1, armor: 1, boost: 1 };
      }
      const curUps = this.career.upgrades[targetJet];
      const allMaxed = cats.every(c => (curUps[c] || 1) >= 5);
      const previewEl = previewBannerId ? document.getElementById(previewBannerId) : null;
      const resetPreview = () => {
        if (!previewEl) return;
        previewEl.classList.remove('active');
        previewEl.innerHTML = allMaxed
          ? '<span>ALL AIRFRAME SYSTEMS MAXED</span><span class="sage-text">TIER 5/5</span>'
          : '<span>HOVER SYSTEM TO PREVIEW NEXT TIER</span>';
      };
      resetPreview();

      cats.forEach(cat => {
        const curLvl = curUps[cat] || 1;
        const nextCost = (curLvl < 5) ? CONFIG.UPGRADE_COSTS[curLvl] : 0;

        let pipsHtml = '';
        for (let i = 1; i <= 5; i++) {
          pipsHtml += `<span class="upgrade-pip ${i <= curLvl ? 'filled' : ''}"></span>`;
        }

        const actionHtml = (curLvl < 5)
          ? `<button type="button" class="upgrade-step-btn" data-cat="${cat}" ${this.career.credits < nextCost ? 'disabled' : ''}>+ UPGRADE (${nextCost})</button>`
          : `<span class="upgrade-max-tag">MAXED</span>`;

        const row = document.createElement('div');
        row.className = 'upgrade-slim-row';
        row.innerHTML = `
          <div class="upgrade-slim-head">
            <span class="upgrade-slim-title">${catNames[cat]}</span>
            <span class="upgrade-slim-meta">LVL ${curLvl}/5</span>
          </div>
          <div class="upgrade-slim-foot">
            <div class="upgrade-pips">${pipsHtml}</div>
            ${actionHtml}
          </div>
        `;

        row.addEventListener('mouseenter', () => {
          row.classList.add('is-previewed');
          if (!previewEl) return;
          if (curLvl >= 5) {
            previewEl.classList.add('active');
            previewEl.innerHTML = `<span>${cat.toUpperCase()}</span><span class="sage-text">MAX TIER REACHED</span>`;
            return;
          }
          const nextStats = CareerManager.getUpgradePreviewStats(targetJet, cat, this.career);
          const labels = {
            speed:     `TOP SPEED: ${eff.maxSpeed} -> ${nextStats.maxSpeed} KM/H`,
            agility:   `TURN RATE: ${eff.pitchRate.toFixed(2)} -> ${nextStats.pitchRate.toFixed(2)} RAD/S`,
            firepower: `CANNON: ${eff.cannonDamage * eff.cannonFireRate} -> ${nextStats.cannonDamage * nextStats.cannonFireRate} DPS`,
            armor:     `HULL ARMOR: ${eff.maxHp} -> ${nextStats.maxHp} HP`,
            boost:     `AFTERBURNER: ${eff.boostMaxEnergy} -> ${nextStats.boostMaxEnergy} CAP`
          };
          previewEl.classList.add('active');
          previewEl.innerHTML = `<span>NEXT TIER</span><span class="amber-text">${labels[cat]}</span>`;
        });
        row.addEventListener('mouseleave', () => {
          row.classList.remove('is-previewed');
          resetPreview();
        });

        const btn = row.querySelector('.upgrade-step-btn');
        if (btn) {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.purchaseUpgrade(cat, targetJet, onAfterUpgrade);
          });
        }
        container.appendChild(row);
      });
    }

    renderWorkshopUI() {
      const targetJet = this.previewAircraft || this.selectedAircraft || 'FALCON';
      const baseDef = CONFIG.AIRCRAFT[targetJet] || CONFIG.AIRCRAFT.FALCON;
      const eff = CareerManager.getEffectiveAircraftStats(targetJet, this.career);
      const compareEff = (targetJet !== this.selectedAircraft)
        ? CareerManager.getEffectiveAircraftStats(this.selectedAircraft, this.career)
        : null;
      const idx = CONFIG.AIRCRAFT_KEYS.indexOf(targetJet);

      const counterEl = document.getElementById('carousel-jet-counter');
      const nameEl = document.getElementById('carousel-jet-name');
      const roleEl = document.getElementById('carousel-jet-role');
      const upJetName = document.getElementById('upgrade-jet-name');

      if (counterEl) counterEl.textContent = `0${idx + 1} / 0${CONFIG.AIRCRAFT_KEYS.length}`;
      if (nameEl) nameEl.textContent = baseDef.name;
      if (roleEl) roleEl.textContent = (baseDef.tagline || baseDef.tag || 'MULTI-ROLE COMBAT FIGHTER').toUpperCase();
      if (upJetName) upJetName.textContent = (baseDef.shortName || baseDef.name).toUpperCase();

      this.renderActionSlot('carousel-jet-action-slot', targetJet, false);
      this.renderTelemetryBars('fighter-telemetry-bars', 'fighter-spec-grid', targetJet, eff, compareEff);
      this.renderFleetStrip('jet-pill-row', targetJet, (key) => this.selectAirframe(key));
      this.renderUpgradesTrack('upgrades-grid-container', targetJet, null, 'upgrade-hover-preview');
    }

    renderPilotStats() {
      const s = this.career.stats || {};
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
      setText('stat-best', (s.bestScore || this.highScore || 0).toLocaleString());
      const accPct = (s.shotsFired || 0) > 0 ? Math.round(((s.hits || 0) / s.shotsFired) * 100) : 0;
      setText('stat-acc', `${accPct}%`);

      const rInfo = CareerManager.getRank(this.career.xp || 0);
      setText('dossier-rank-badge', rInfo.cur.icon || rInfo.cur.badge);
      setText('dossier-rank-name', (rInfo.cur.name || 'CADET I').toUpperCase());
      setText('dossier-xp-cur', `${(this.career.xp || 0).toLocaleString()} XP TOTAL`);
      if (rInfo.next) {
        const rem = Math.max(0, rInfo.next.minXp - (this.career.xp || 0));
        setText('dossier-xp-next', `+${rem.toLocaleString()} XP TO NEXT`);
        setText('dossier-next-rank-name', (rInfo.next.name || '').toUpperCase());
      } else {
        setText('dossier-xp-next', 'MAX RANK ACHIEVED');
        setText('dossier-next-rank-name', 'TOP TIER');
      }
      const dFill = document.getElementById('dossier-xp-fill');
      if (dFill) dFill.style.width = `${Math.round(rInfo.progress * 100)}%`;
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
      const livNameEl = document.getElementById('livery-active-name');
      if (livNameEl && CONFIG.LIVERIES && CONFIG.LIVERIES[this.selectedLivery]) {
        livNameEl.textContent = CONFIG.LIVERIES[this.selectedLivery].name.toUpperCase();
      }
      const trNameEl = document.getElementById('tracer-active-name');
      if (trNameEl && CONFIG.TRACERS && CONFIG.TRACERS[this.selectedTracer]) {
        trNameEl.textContent = CONFIG.TRACERS[this.selectedTracer].name.toUpperCase();
      }
      const btnBlue = document.getElementById('opt-team-blue');
      const btnRed = document.getElementById('opt-team-red');
      if (btnBlue && btnRed) {
        btnBlue.classList.toggle('active-blue', this.selectedTeam === 'BLUE');
        btnRed.classList.toggle('active-red', this.selectedTeam === 'RED');
      }
      this.renderHangarProfile();
    }

    _updateSliderVisual(slider) {
      if (!slider) return;
      const min = parseFloat(slider.min || 0);
      const max = parseFloat(slider.max || 1);
      const val = parseFloat(slider.value || min);
      const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
      slider.style.setProperty('--pct', `${pct.toFixed(1)}%`);
    }

    syncSettingsUI() {
      const cfg = this.career.settings;
      const sensSlider = document.getElementById('set-mouse-sens');
      const sensLbl = document.getElementById('lbl-mouse-sens');
      if (sensSlider && sensLbl) {
        sensSlider.value = cfg.mouseSens || 1.0;
        sensLbl.textContent = `${Number(cfg.mouseSens).toFixed(1)}x`;
        this._updateSliderVisual(sensSlider);
      }
      const invertBtn = document.getElementById('set-invert-y');
      if (invertBtn) {
        const inv = Boolean(cfg.invertY);
        invertBtn.classList.toggle('active', inv);
        invertBtn.setAttribute('aria-pressed', inv ? 'true' : 'false');
        invertBtn.textContent = inv ? 'INVERTED' : 'OFF';
      }

      const musicSlider = document.getElementById('set-music-vol');
      const musicLbl = document.getElementById('lbl-music-vol');
      if (musicSlider && musicLbl) {
        musicSlider.value = cfg.musicVol !== undefined ? cfg.musicVol : 0.85;
        musicLbl.textContent = `${Math.round(musicSlider.value * 100)}%`;
        this._updateSliderVisual(musicSlider);
      }

      const sfxSlider = document.getElementById('set-sfx-vol');
      const sfxLbl = document.getElementById('lbl-sfx-vol');
      if (sfxSlider && sfxLbl) {
        sfxSlider.value = cfg.sfxVol !== undefined ? cfg.sfxVol : 0.85;
        sfxLbl.textContent = `${Math.round(sfxSlider.value * 100)}%`;
        this._updateSliderVisual(sfxSlider);
      }

      const curQ = cfg.graphics || 'HIGH';
      document.querySelectorAll('#set-graphics-group .seg-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.quality === curQ);
      });

      const hudTheme = cfg.hudColor || 'GREEN';
      document.querySelectorAll('#set-hud-color-group .seg-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.hudColor === hudTheme);
      });
      if (this.hud) {
        this.hud.hudColorTheme = hudTheme;
        this.hud.showFps = Boolean(cfg.showFps);
      }

      const fpsBtn = document.getElementById('set-show-fps');
      if (fpsBtn) {
        const showFps = Boolean(cfg.showFps);
        fpsBtn.classList.toggle('active', showFps);
        fpsBtn.setAttribute('aria-pressed', showFps ? 'true' : 'false');
        fpsBtn.textContent = showFps ? 'ON' : 'OFF';
      }
    }

    unlockAircraft(key, inRespawn = false) {
      const baseDef = CONFIG.AIRCRAFT[key];
      if (!baseDef) return;
      const cost = baseDef.unlockCost !== undefined ? baseDef.unlockCost : (baseDef.cost || 0);
      if (this.career.credits < cost) {
        this.addFloatingPopup(`NEED ${(cost - this.career.credits).toLocaleString()} MORE PTS`, '#c9443e');
        this.audio.playUiTick('error');
        return;
      }
      this.career.credits -= cost;
      if (!this.career.unlockedAircraft.includes(key)) {
        this.career.unlockedAircraft.push(key);
      }
      this.selectedAircraft = key;
      this.previewAircraft = key;
      this.respawnPreviewJet = key;
      this.career.selectedAircraft = key;
      CareerManager.save(this.career);
      if (this.cg) this.cg.setData('fighterjets3d_aircraft', this.selectedAircraft);

      this.audio.playTone(523.25, 0.1, 'triangle', 0.2);
      setTimeout(() => this.audio.playTone(659.25, 0.12, 'triangle', 0.22), 80);
      setTimeout(() => this.audio.playTone(783.99, 0.18, 'triangle', 0.25), 160);
      this.addFloatingPopup(`${baseDef.name} UNLOCKED`, '#52c468');

      this.renderHangarProfile();
      if (inRespawn) {
        this.updateRespawnPreviewMesh();
        this.renderRespawnWorkshopUI();
      } else {
        this.renderWorkshopUI();
        this.updateMenuPreviewMesh();
      }
    }

    purchaseUpgrade(category, explicitJet = null, onComplete = null) {
      const jet = explicitJet || this.previewAircraft || this.selectedAircraft;
      if (!this.career.upgrades[jet]) {
        this.career.upgrades[jet] = { speed: 1, agility: 1, firepower: 1, armor: 1, boost: 1 };
      }
      const curLvl = this.career.upgrades[jet][category] || 1;
      if (curLvl >= 5) return;
      const cost = CONFIG.UPGRADE_COSTS[curLvl];
      if (this.career.credits < cost) {
        this.addFloatingPopup(`NEED ${cost - this.career.credits} MORE PTS`, '#c9443e');
        this.audio.playUiTick('error');
        return;
      }
      this.career.credits -= cost;
      this.career.upgrades[jet][category] = curLvl + 1;
      CareerManager.save(this.career);

      this.audio.playTone(440, 0.08, 'triangle', 0.18);
      setTimeout(() => this.audio.playTone(880, 0.15, 'triangle', 0.22), 70);
      this.addFloatingPopup(`UPGRADE APPLIED — LVL ${curLvl + 1}`, '#52c468');

      this.renderHangarProfile();
      if (onComplete) {
        onComplete();
      } else {
        this.renderWorkshopUI();
      }
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
      this.addFloatingPopup(`${CONFIG.AIRCRAFT[acId].name} ACTIVE`, '#52c468');
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
      // Hardware micro-click & subtle hover feedback across UI interactive elements
      const rootEl = document.getElementById('game-container');
      if (rootEl) {
        rootEl.addEventListener('pointerenter', (e) => {
          const btn = e.target && e.target.closest ? e.target.closest('button, .fleet-card, .livery-swatch') : null;
          if (btn && !btn.disabled && this.audio) this.audio.playUiTick('hover');
        }, true);
        rootEl.addEventListener('click', (e) => {
          const b = e.target && e.target.closest ? e.target.closest('button') : null;
          if (b && e.detail > 0) b.blur();
        });
      }

      // Main Hangar Tab Switching
      document.querySelectorAll('.hangar-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.switchHangarTab(btn.dataset.tab);
        });
      });

      // Mid-Match Respawn Workshop Tab Switching
      document.querySelectorAll('.respawn-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.switchRespawnTab(btn.dataset.tab);
        });
      });

      // Top Header Quick Squadron Switcher
      const teamPill = document.getElementById('hangar-team-pill');
      if (teamPill) {
        teamPill.addEventListener('click', () => {
          if (this.audio) this.audio.playUiTick('click');
          this.selectTeam(this.selectedTeam === 'BLUE' ? 'RED' : 'BLUE');
        });
      }

      // Expandable [?] Briefing Drawer
      const briefingDrawer = document.getElementById('hangar-briefing-drawer');
      const toggleBriefing = document.getElementById('btn-toggle-briefing');
      const closeBriefing = document.getElementById('btn-close-briefing');
      if (toggleBriefing && briefingDrawer) {
        toggleBriefing.addEventListener('click', () => {
          if (this.audio) this.audio.playUiTick('click');
          const open = briefingDrawer.classList.toggle('hidden');
          toggleBriefing.classList.toggle('active', !open);
        });
      }
      if (closeBriefing && briefingDrawer) {
        closeBriefing.addEventListener('click', () => {
          if (this.audio) this.audio.playUiTick('click');
          briefingDrawer.classList.add('hidden');
          if (toggleBriefing) toggleBriefing.classList.remove('active');
        });
      }

      // Shared Bay Camera Presets & Systems Dry-Test Buttons (Main Hangar + Respawn Workshop)
      document.querySelectorAll('.bay-tool-btn[data-cam-preset]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.audio) this.audio.playUiTick('tab');
          this.applyCameraPreset(btn.dataset.camPreset);
        });
      });
      document.querySelectorAll('.bay-tool-btn[data-bay-test="ab"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleHangarAbTest();
        });
      });
      document.querySelectorAll('.bay-tool-btn[data-bay-test="tracer"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.triggerHangarTracerBurst();
        });
      });

      // Fleet Step Navigation Buttons
      const btnPrev = document.getElementById('btn-prev-jet');
      if (btnPrev) {
        btnPrev.addEventListener('click', () => {
          if (this.audio) this.audio.playUiTick('click');
          const curIdx = CONFIG.AIRCRAFT_KEYS.indexOf(this.previewAircraft || this.selectedAircraft);
          const newIdx = (curIdx - 1 + CONFIG.AIRCRAFT_KEYS.length) % CONFIG.AIRCRAFT_KEYS.length;
          this.selectAirframe(CONFIG.AIRCRAFT_KEYS[newIdx]);
        });
      }
      const btnNext = document.getElementById('btn-next-jet');
      if (btnNext) {
        btnNext.addEventListener('click', () => {
          if (this.audio) this.audio.playUiTick('click');
          const curIdx = CONFIG.AIRCRAFT_KEYS.indexOf(this.previewAircraft || this.selectedAircraft);
          const newIdx = (curIdx + 1) % CONFIG.AIRCRAFT_KEYS.length;
          this.selectAirframe(CONFIG.AIRCRAFT_KEYS[newIdx]);
        });
      }

      // Livery Swatches
      document.querySelectorAll('#livery-group .livery-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          if (this.audio) this.audio.playUiTick('click');
          this.selectLivery(parseInt(sw.dataset.livery, 10) || 0);
        });
      });

      // Tracer Swatches
      document.querySelectorAll('#tracer-group .livery-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
          if (this.audio) this.audio.playUiTick('click');
          this.selectTracer(parseInt(sw.dataset.tracer, 10) || 0);
        });
      });

      // Squadron selection
      const btnBlue = document.getElementById('opt-team-blue');
      if (btnBlue) btnBlue.addEventListener('click', () => { if (this.audio) this.audio.playUiTick('click'); this.selectTeam('BLUE'); });
      const btnRed = document.getElementById('opt-team-red');
      if (btnRed) btnRed.addEventListener('click', () => { if (this.audio) this.audio.playUiTick('click'); this.selectTeam('RED'); });

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
        if (this.audio) this.audio.playUiTick('click');
        this.syncSettingsUI();
        document.getElementById('settings-modal').classList.remove('hidden');
      };
      const closeSettings = () => {
        if (this.audio) this.audio.playUiTick('click');
        const resetBtn = document.getElementById('btn-reset-career');
        if (resetBtn) {
          resetBtn.classList.remove('confirm-armed');
          resetBtn.textContent = 'RESET CAREER';
        }
        if (this._resetArmedTimer) {
          clearTimeout(this._resetArmedTimer);
          this._resetArmedTimer = null;
        }
        document.getElementById('settings-modal').classList.add('hidden');
      };
      const btnOpenHangarSettings = document.getElementById('btn-open-settings');
      if (btnOpenHangarSettings) btnOpenHangarSettings.addEventListener('click', openSettings);
      const btnOpenPauseSettings = document.getElementById('btn-pause-settings');
      if (btnOpenPauseSettings) btnOpenPauseSettings.addEventListener('click', openSettings);
      const btnCloseSettings = document.getElementById('btn-close-settings');
      if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettings);

      const sensSlider = document.getElementById('set-mouse-sens');
      if (sensSlider) {
        sensSlider.addEventListener('input', () => {
          const v = parseFloat(sensSlider.value) || 1.0;
          this.career.settings.mouseSens = v;
          const lbl = document.getElementById('lbl-mouse-sens');
          if (lbl) lbl.textContent = `${v.toFixed(1)}x`;
          this._updateSliderVisual(sensSlider);
          CareerManager.save(this.career);
          if (this.player && this.player.stats) this.player.stats.mouseSens = v;
        });
      }
      const invertBtn = document.getElementById('set-invert-y');
      if (invertBtn) {
        invertBtn.addEventListener('click', () => {
          const next = !this.career.settings.invertY;
          this.career.settings.invertY = next;
          CareerManager.save(this.career);
          if (this.player && this.player.stats) this.player.stats.invertY = next;
          this.syncSettingsUI();
          if (this.audio) this.audio.playUiTick('click');
        });
      }
      const musicSlider = document.getElementById('set-music-vol');
      if (musicSlider) {
        musicSlider.addEventListener('input', () => {
          const v = parseFloat(musicSlider.value) || 0;
          this.career.settings.musicVol = v;
          const lbl = document.getElementById('lbl-music-vol');
          if (lbl) lbl.textContent = `${Math.round(v * 100)}%`;
          this._updateSliderVisual(musicSlider);
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
          this._updateSliderVisual(sfxSlider);
          this.audio.setSfxVolume(v);
          CareerManager.save(this.career);
        });
      }
      document.querySelectorAll('#set-graphics-group .seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const q = btn.dataset.quality || 'HIGH';
          this.career.settings.graphics = q;
          CareerManager.save(this.career);
          const dpr = q === 'LOW' ? 1.0 : (q === 'MEDIUM' ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2));
          this.renderer.setPixelRatio(dpr);
          this.syncSettingsUI();
          if (this.audio) this.audio.playUiTick('click');
        });
      });
      document.querySelectorAll('#set-hud-color-group .seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const c = btn.dataset.hudColor || 'GREEN';
          this.career.settings.hudColor = c;
          CareerManager.save(this.career);
          this.syncSettingsUI();
          if (this.audio) this.audio.playUiTick('click');
        });
      });
      const fpsBtn = document.getElementById('set-show-fps');
      if (fpsBtn) {
        fpsBtn.addEventListener('click', () => {
          this.career.settings.showFps = !this.career.settings.showFps;
          CareerManager.save(this.career);
          this.syncSettingsUI();
          if (this.audio) this.audio.playUiTick('click');
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
        const disarmReset = () => {
          if (this._resetArmedTimer) {
            clearTimeout(this._resetArmedTimer);
            this._resetArmedTimer = null;
          }
          btnResetCareer.classList.remove('confirm-armed');
          btnResetCareer.textContent = 'RESET CAREER';
        };
        btnResetCareer.addEventListener('click', () => {
          if (!btnResetCareer.classList.contains('confirm-armed')) {
            btnResetCareer.classList.add('confirm-armed');
            btnResetCareer.textContent = 'CONFIRM RESET?';
            if (this.audio) this.audio.playUiTick('error');
            this._resetArmedTimer = setTimeout(disarmReset, 4000);
            return;
          }
          disarmReset();
          localStorage.removeItem(CareerManager.STORAGE_KEY);
          this.career = CareerManager.getDefaultProfile();
          CareerManager.save(this.career);
          this.selectedAircraft = 'FALCON';
          this.previewAircraft = 'FALCON';
          this.selectedTeam = 'BLUE';
          this.selectedLivery = 0;
          this.selectedTracer = 0;
          this.highScore = 0;
          this.initHangarUI();
          this.updateMenuPreviewMesh();
          closeSettings();
          this.addFloatingPopup('CAREER PROGRESS RESET', '#c9443e');
        });
      }

      // HUD Mini-Buttons
      const btnCam = document.getElementById('btn-cam');
      if (btnCam) btnCam.addEventListener('click', () => this.toggleCamera());

      const helpBtn = document.getElementById('btn-help-hud');
      if (helpBtn) {
        helpBtn.addEventListener('click', () => {
          this.input.showPcControlsGuide = !this.input.showPcControlsGuide;
          helpBtn.classList.toggle('active', this.input.showPcControlsGuide);
        });
      }
      const btnMute = document.getElementById('btn-mute');
      if (btnMute) btnMute.addEventListener('click', () => this.toggleMute());
      const btnHangar = document.getElementById('btn-hangar');
      if (btnHangar) btnHangar.addEventListener('click', () => this.returnToMenu());
      const btnPause = document.getElementById('btn-pause');
      if (btnPause) btnPause.addEventListener('click', () => this.setPaused(this.state !== 'PAUSED'));

      const btnLaunch = document.getElementById('btn-launch');
      if (btnLaunch) {
        btnLaunch.addEventListener('click', () => {
          this.audio.init();
          this.audio.playUiTick('deploy');
          this.startMatch();
          this.handleResize();
        });
      }

      window.addEventListener('fullscreenchange', () => this.handleResize());
      window.addEventListener('webkitfullscreenchange', () => this.handleResize());
      window.addEventListener('orientationchange', () => this.handleResize());

      const btnResume = document.getElementById('btn-resume');
      if (btnResume) btnResume.addEventListener('click', () => this.setPaused(false));
      const btnRestart = document.getElementById('btn-restart');
      if (btnRestart) btnRestart.addEventListener('click', () => this.startMatch());
      const btnReturnMenu = document.getElementById('btn-return-menu');
      if (btnReturnMenu) btnReturnMenu.addEventListener('click', () => this.returnToMenu());
      const btnPlayAgain = document.getElementById('btn-play-again');
      if (btnPlayAgain) btnPlayAgain.addEventListener('click', () => this.startMatch());
      const btnResultsMenu = document.getElementById('btn-results-menu');
      if (btnResultsMenu) btnResultsMenu.addEventListener('click', () => this.returnToMenu());

      const btnSpecNext = document.getElementById('btn-spec-next');
      if (btnSpecNext) btnSpecNext.addEventListener('click', () => this.cycleSpectateTarget());
      const btnSpecPlane = document.getElementById('btn-spec-plane');
      if (btnSpecPlane) btnSpecPlane.addEventListener('click', () => this.openRespawnWorkshop());
      const btnSpecRespawn = document.getElementById('btn-spec-respawn');
      if (btnSpecRespawn) {
        btnSpecRespawn.addEventListener('click', () => {
          this.deployPlayerFromRespawn();
        });
      }
      const btnSpecEnd = document.getElementById('btn-spec-end');
      if (btnSpecEnd) btnSpecEnd.addEventListener('click', () => this.returnToMenu());

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

    _mountHangarAircraft(typeId, team) {
      if (this.menuFighter) {
        this.scene.remove(this.menuFighter);
        AircraftModelFactory.disposeObject3D(this.menuFighter);
      }
      this.menuFighter = AircraftModelFactory.createAircraftMesh(typeId, this.selectedLivery, team);
      this.menuFighter.position.set(0, 748.0, 0);
      this.menuFighter.rotation.set(0, 0, 0);
      if (this.menuFighter.userData && this.menuFighter.userData.abGroup) {
        this.menuFighter.userData.abGroup.visible = Boolean(this.hangarTestAB);
      }
      this.menuFighter.visible = true;
      this.scene.add(this.menuFighter);
    }

    updateMenuPreviewMesh() {
      const previewJet = this.previewAircraft || this.selectedAircraft;
      this._mountHangarAircraft(previewJet, this.selectedTeam);
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

      if (ac.isPlayer && this.career && !this.career.tutorialDone) {
        // Airborne spawn at safe altitude for tutorial so player is ready in mid-air
        ac.spawnAt(basePos.x, 340, isBlue ? basePos.z - 200 : basePos.z + 200, runwayHeading, false);
      } else {
        ac.spawnAt(x, y, z, runwayHeading, true);
      }

      if (ac.isPlayer) {
        this.input.resetPointerToCenter();
      }
    }

    startMatch(isTutorial = false) {
      this.clearHangarTestEffects(true);
      this.clearMatchEntities();
      this.world.resetFlags();
      this.world.setHangarLightingMode(false);
      if (this.menuFighter) this.menuFighter.visible = false;
      if (this.hangarBay) this.hangarBay.visible = false;
      if (this.audio) this.audio.stopHangarAmbience();

      const briefing = document.getElementById('hangar-briefing-drawer');
      if (briefing) briefing.classList.add('hidden');
      const briefingBtn = document.getElementById('btn-toggle-briefing');
      if (briefingBtn) briefingBtn.classList.remove('active');

      document.getElementById('start-screen').classList.add('hidden');
      document.getElementById('pause-screen').classList.add('hidden');
      document.getElementById('results-screen').classList.add('hidden');
      document.getElementById('spectate-bar').classList.add('hidden');
      document.getElementById('respawn-center-overlay').classList.add('hidden');
      document.getElementById('respawn-hangar-screen').classList.add('hidden');
      if (this.studioVoid) this.studioVoid.visible = false;
      document.getElementById('settings-modal').classList.add('hidden');
      document.getElementById('top-controls').classList.add('hidden');
      const feedEl = document.getElementById('feed-container');
      if (feedEl) {
        feedEl.classList.remove('hidden');
        feedEl.innerHTML = '';
      }

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
      this.world.update(this.camera.position, 0);
      if (this.cg) this.cg.setGameplay(true);

      // Start Adrenaline Synthwave BGM
      this.audio.startMusic();

      this.addFeedItem(`Sortie Engaged — First to ${CONFIG.CTF.capturesToWin} Captures`, 'radio');

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
      this.world.setHangarLightingMode(true);
      this.state = 'MENU';
      this.isSuddenDeath = false;
      this.hud.clear();
      if (this.cg) this.cg.setGameplay(false);
      this.audio.updateEngine(0, 0, false, false);
      this.audio.startMusic();
      if (this.tutorial) {
        this.tutorial.active = false;
        this.tutorial.isFrozen = false;
        if (this.tutorial.cardEl) this.tutorial.cardEl.classList.add('hidden');
      }
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
      document.getElementById('pause-screen').classList.add('hidden');
      document.getElementById('results-screen').classList.add('hidden');
      document.getElementById('spectate-bar').classList.add('hidden');
      document.getElementById('respawn-center-overlay').classList.add('hidden');
      document.getElementById('respawn-hangar-screen').classList.add('hidden');
      if (this.studioVoid) this.studioVoid.visible = false;
      document.getElementById('settings-modal').classList.add('hidden');
      const startScreen = document.getElementById('start-screen');
      if (startScreen) startScreen.classList.remove('hidden');

      this.clearHangarTestEffects(true);
      this.inRespawnWorkshop = false;
      this.respawnAwaitingDeploy = false;

      this.switchHangarTab('fighter', false);
      this.initHangarUI();
      this.updateMenuPreviewMesh();
    }

    toggleCamera() {
      this.cameraMode = this.cameraMode === 'CHASE' ? 'COCKPIT' : 'CHASE';
      if (this.audio) this.audio.playUiTick('tab');
      const btnCam = document.getElementById('btn-cam');
      if (btnCam) {
        btnCam.textContent = `CAM: ${this.cameraMode} [C]`;
      }
    }

    toggleMute() {
      this.audio.setMuted(!this.audio.muted);
      const btn = document.getElementById('btn-mute');
      if (btn) {
        btn.textContent = `AUDIO: ${this.audio.muted ? 'MUTED' : 'ON'} [M]`;
        btn.classList.toggle('active', !this.audio.muted);
      }
    }

    setPaused(pause) {
      if (this.state !== 'PLAYING' && this.state !== 'PAUSED') return;
      this.state = pause ? 'PAUSED' : 'PLAYING';
      const pauseEl = document.getElementById('pause-screen');
      if (!pause) this.tabPressTime = 0;
      if (pause) {
        this.updateHighScore(true);
        if (this.cg) this.cg.setGameplay(false);
        this.populateSplitScoreboard('scoreboard-blue-body', 'scoreboard-red-body', 'team-score-banner');
        pauseEl.classList.remove('hidden');
        this.audio.updateEngine(0, 0, false, false);
      } else {
        pauseEl.classList.add('hidden');
        this.input.clearJustPressed();
        if (this.cg && this.player && this.player.alive) this.cg.setGameplay(true);
      }
    }

    cyclePlayerTarget(manual = false) {
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
      if (manual && this.audio) {
        this.audio.playUiTick('lock');
      }
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

    addFloatingPopup(text, color = '#52c468') {
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
          willKill ? `SPLASH! +${150 * attacker.comboCount}` : `-${finalDamage} HP`,
          willKill ? '#52c468' : (attacker.overdriveTimer > 0 ? '#d9822b' : '#eae7df'),
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
        const killerName = (this.killerAc && this.killerAc.callsign) ? this.killerAc.callsign : (causeLabel || 'TERRAIN IMPACT');
        if (specLabel) specLabel.textContent = `${killerName} — CHASE CAM`;
        const specBtn = document.getElementById('btn-spec-respawn');
        if (specBtn) {
          specBtn.disabled = true;
          specBtn.classList.remove('active');
          specBtn.style.opacity = '0.4';
          specBtn.style.cursor = 'not-allowed';
          specBtn.textContent = 'SPAWN 4.0s';
        }

        // Center Respawn Tip Overlay
        const centerOverlay = document.getElementById('respawn-center-overlay');
        if (centerOverlay) centerOverlay.classList.remove('hidden');
        const killerLine = document.getElementById('respawn-killer-line');
        if (killerLine) killerLine.textContent = `ELIMINATED BY ${killerName}`;
        const centerTip = document.getElementById('respawn-center-tip-text');
        if (centerTip) centerTip.textContent = this.getRandomTacticalTip();
        const centerTimer = document.getElementById('respawn-center-timer');
        if (centerTimer) centerTimer.textContent = '4.0s';
        const centerDeployBtn = document.getElementById('btn-center-deploy');
        if (centerDeployBtn) {
          centerDeployBtn.classList.add('hidden');
          centerDeployBtn.disabled = true;
          centerDeployBtn.textContent = 'WAIT 4.0s';
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
            this.addFloatingPopup(`FLAG CARRIER DOWN! +${totalAward} PTS`, '#d9822b');
          } else if (attacker.killStreak >= 2) {
            this.addFloatingPopup(`${attacker.killStreak}x KILL STREAK! +${totalAward} PTS`, '#52c468');
          } else {
            this.addFloatingPopup(`ENEMY SPLASHED! +${totalAward} PTS`, '#52c468');
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
        this.addFloatingPopup(`${scoringTeam} TEAM CAPTURED THE FLAG (+${CONFIG.CTF.capturePoints} PTS)`, '#d9822b');
        if (this.cg) this.cg.happytime();
      } else {
        this.audio.playFlagFanfare(false);
        this.addFloatingPopup(`ALERT: ENEMY CAPTURED OUR FLAG`, '#c9443e');
      }

      this.addFeedItem(
        `[CAPTURE] ${scorerAc.callsign} CAPTURED ${capturedFlagTeam} FLAG (${this.teamCaptures.BLUE} - ${this.teamCaptures.RED})`,
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
          this.addFloatingPopup('SUDDEN DEATH: GOLDEN CAP // NEXT CAPTURE WINS', '#d9822b');
          this.addFeedItem('SUDDEN DEATH ENGAGED // Next team to capture a flag wins immediately!', 'warn');
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
      document.getElementById('feed-container').classList.add('hidden');
      if (this.studioVoid) this.studioVoid.visible = false;
      this.inRespawnWorkshop = false;
      this.respawnAwaitingDeploy = false;
      if (this.tutorial) {
        this.tutorial.active = false;
        this.tutorial.isFrozen = false;
        if (this.tutorial.cardEl) this.tutorial.cardEl.classList.add('hidden');
      }

      const resScreen = document.getElementById('results-screen');
      resScreen.classList.remove('hidden');

      const playerWon = this.player && this.player.team === winningTeam;

      if (winningTeam === 'DRAW') {
        document.getElementById('result-headline').textContent = 'ROUND DRAW';
        document.getElementById('result-subline').textContent = timeReason || 'TIME LIMIT REACHED';
      } else {
        document.getElementById('result-headline').textContent = `${winningTeam} SQUADRON VICTORY`;
        if (this.isSuddenDeath) {
          document.getElementById('result-subline').textContent = playerWon
            ? 'SUDDEN DEATH GOLDEN CAPTURE'
            : 'DEFEAT — ENEMY GOLDEN CAPTURE';
        } else if (isTimeLimit) {
          document.getElementById('result-subline').textContent = `${playerWon ? 'VICTORY' : 'DEFEAT'} — ${timeReason}`;
        } else {
          document.getElementById('result-subline').textContent = playerWon
            ? 'VICTORY — 3 FLAG CAPTURES SECURED'
            : 'DEFEAT — ENEMY REACHED 3 CAPTURES';
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
        this.addFloatingPopup(`PROMOTED // RANK: ${newRank.cur.name}`, '#d9822b');
      }

      // Populate Results Rewards UI
      const xpEarnedEl = document.getElementById('res-xp-earned');
      const credEarnedEl = document.getElementById('res-credits-earned');
      const rankNameEl = document.getElementById('res-rank-name');
      const rankXpEl = document.getElementById('res-rank-xp');
      const xpFillEl = document.getElementById('res-xp-fill');

      if (xpEarnedEl) xpEarnedEl.textContent = `+${totalXpEarned} XP`;
      if (credEarnedEl) credEarnedEl.textContent = `+${totalCreditsEarned} PTS`;
      if (rankNameEl) rankNameEl.textContent = `${newRank.cur.icon || newRank.cur.badge} ${newRank.cur.name}`;
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

      this.populateSplitScoreboard('results-blue-body', 'results-red-body', 'result-team-standing');
      this.initHangarUI();
    }

    getRandomTacticalTip() {
      const tips = [
        'DUAL-FLAG RULE: Both team flags must be secure at your home base to score a capture (+1,000 PTS).',
        'RECOVER TO SCORE: If your flag is stolen, intercept the enemy carrier and fly through the dropped flag.',
        'CONVOY ESCORT: Stay close to your flag carrier and draw hostile cannon fire away from them.',
        'SPEED ADVANTAGE: Engage Afterburner Boost [SHIFT] to break away from interceptors while carrying the flag.',
        'HIGH-G TURNS: Tap [S] to deploy airbrakes while rolling for rapid snapshot angles.',
        'TEAM ESCORT: Wingmen automatically form an escort formation around you when carrying the flag.'
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
        const teamColor = this.spectateTarget.team === 'BLUE' ? '#5e97d1' : '#c9443e';
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
            respawnTimeEl.textContent = HUDRenderer.formatClock(this.remainingMatchSec);
          }

          if (ac.respawnTimer > 0) {
            const tStr = Math.max(0, ac.respawnTimer).toFixed(1);
            const killerName = (this.killerAc && this.killerAc.alive)
              ? this.killerAc.callsign
              : (this.killerAc ? this.killerAc.callsign : 'TERRAIN IMPACT');
            if (specLabel && (!this.spectateTarget || this.spectateTarget === this.killerAc)) {
              specLabel.textContent = `${killerName} — CHASE CAM`;
            }
            if (specRespawnBtn) {
              specRespawnBtn.textContent = `SPAWN ${tStr}s`;
              specRespawnBtn.disabled = true;
              specRespawnBtn.style.opacity = '0.4';
              specRespawnBtn.style.cursor = 'not-allowed';
              specRespawnBtn.classList.remove('active');
            }
            if (centerTimer) {
              centerTimer.textContent = `${tStr}s`;
            }
            if (centerDeployBtn) {
              centerDeployBtn.disabled = true;
              centerDeployBtn.textContent = `WAIT ${tStr}s`;
            }
            if (respawnLaunchBtn) {
              respawnLaunchBtn.disabled = true;
              respawnLaunchBtn.textContent = `WAIT ${tStr}s`;
            }
            if (respawnLaunchSub) {
              respawnLaunchSub.textContent = `RE-DEPLOY LOCK — ${tStr}s`;
            }
          } else {
            if (centerTimer) {
              centerTimer.textContent = 'READY';
            }
            if (specRespawnBtn) {
              specRespawnBtn.textContent = 'DEPLOY';
              specRespawnBtn.disabled = false;
              specRespawnBtn.style.opacity = '1.0';
              specRespawnBtn.style.cursor = 'pointer';
              specRespawnBtn.classList.add('active');
            }
            if (centerDeployBtn) {
              centerDeployBtn.classList.remove('hidden');
              centerDeployBtn.disabled = false;
              centerDeployBtn.textContent = 'DEPLOY';
            }
            if (respawnLaunchBtn) {
              respawnLaunchBtn.disabled = false;
              respawnLaunchBtn.textContent = 'DEPLOY';
            }
            if (respawnLaunchSub) {
              respawnLaunchSub.textContent = 'READY TO RE-ENTER SORTIE';
            }

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

      const centerOverlay = document.getElementById('respawn-center-overlay');
      if (centerOverlay) centerOverlay.classList.add('hidden');
      const specBar = document.getElementById('spectate-bar');
      if (specBar) specBar.classList.add('hidden');
      const feedEl = document.getElementById('feed-container');
      if (feedEl) feedEl.classList.add('hidden');

      const hangarScreen = document.getElementById('respawn-hangar-screen');
      if (hangarScreen) hangarScreen.classList.remove('hidden');

      // 3D Isolation: show grounded stand + studio dark void inside respawn bay
      this.world.setHangarLightingMode(true);
      if (this.studioVoid) this.studioVoid.visible = true;
      if (this.hangarBay) this.hangarBay.visible = true;
      if (this.hangarBayMeshes) this.hangarBayMeshes.forEach(m => m.visible = false);
      if (this.hangarStandMeshes) this.hangarStandMeshes.forEach(m => m.visible = true);

      this.switchRespawnTab('fighter', false);
      this.updateRespawnPreviewMesh();
      this.renderRespawnWorkshopUI();
    }

    closeRespawnWorkshop(toSpectate = true) {
      this.clearHangarTestEffects(true);
      this.inRespawnWorkshop = false;
      this.world.setHangarLightingMode(false);
      if (this.studioVoid) this.studioVoid.visible = false;
      if (this.hangarBay) this.hangarBay.visible = false;
      if (this.menuFighter) this.menuFighter.visible = false;

      const hangarScreen = document.getElementById('respawn-hangar-screen');
      if (hangarScreen) hangarScreen.classList.add('hidden');

      const feedEl = document.getElementById('feed-container');
      if (feedEl) feedEl.classList.remove('hidden');

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
      const previewJet = this.respawnPreviewJet || this.selectedAircraft || 'FALCON';
      const team = this.player ? this.player.team : this.selectedTeam;
      this._mountHangarAircraft(previewJet, team);
    }

    renderRespawnWorkshopUI() {
      const targetJet = this.respawnPreviewJet || this.selectedAircraft || 'FALCON';
      const baseDef = CONFIG.AIRCRAFT[targetJet] || CONFIG.AIRCRAFT.FALCON;
      const eff = CareerManager.getEffectiveAircraftStats(targetJet, this.career);
      const compareEff = (targetJet !== this.selectedAircraft)
        ? CareerManager.getEffectiveAircraftStats(this.selectedAircraft, this.career)
        : null;
      const idx = CONFIG.AIRCRAFT_KEYS.indexOf(targetJet);

      const credEl = document.getElementById('respawn-hangar-credits-val');
      if (credEl) credEl.textContent = (this.career.credits || 0).toLocaleString();
      const matchScoreEl = document.getElementById('respawn-hangar-match-score');
      if (matchScoreEl) matchScoreEl.textContent = `BLUE ${this.teamCaptures.BLUE} — ${this.teamCaptures.RED} RED`;
      const timeBadgeEl = document.getElementById('respawn-hangar-time-badge');
      if (timeBadgeEl) timeBadgeEl.textContent = HUDRenderer.formatClock(this.remainingMatchSec);

      const counterEl = document.getElementById('respawn-carousel-counter');
      if (counterEl) counterEl.textContent = `0${idx + 1} / 0${CONFIG.AIRCRAFT_KEYS.length}`;
      const nameEl = document.getElementById('respawn-carousel-name');
      if (nameEl) nameEl.textContent = baseDef.name;
      const roleEl = document.getElementById('respawn-carousel-role');
      if (roleEl) roleEl.textContent = (baseDef.tagline || baseDef.tag || 'MULTI-ROLE COMBAT FIGHTER').toUpperCase();
      const upJetName = document.getElementById('respawn-upgrade-jet-name');
      if (upJetName) upJetName.textContent = (baseDef.shortName || baseDef.name).toUpperCase();

      this.renderActionSlot('respawn-carousel-action-slot', targetJet, true);
      this.renderTelemetryBars('respawn-telemetry-bars', null, targetJet, eff, compareEff);
      this.renderFleetStrip('respawn-jet-pills', targetJet, (key) => {
        this.respawnPreviewJet = key;
        this.updateRespawnPreviewMesh();
        this.renderRespawnWorkshopUI();
      });
      this.renderUpgradesTrack('respawn-upgrades-list', targetJet, () => this.renderRespawnWorkshopUI(), 'respawn-upgrade-preview');

      // Sync Livery & Tracer Swatches
      document.querySelectorAll('#respawn-livery-group .livery-swatch').forEach(sw => {
        const sIdx = parseInt(sw.dataset.livery, 10) || 0;
        sw.classList.toggle('active', sIdx === this.selectedLivery);
      });
      document.querySelectorAll('#respawn-tracer-group .livery-swatch').forEach(sw => {
        const sIdx = parseInt(sw.dataset.tracer, 10) || 0;
        sw.classList.toggle('active', sIdx === this.selectedTracer);
      });

      // Bottom Deploy Status
      const deployBtn = document.getElementById('btn-respawn-launch');
      const deploySub = document.getElementById('respawn-launch-subtitle');
      if (this.player) {
        if (this.player.respawnTimer > 0) {
          const t = Math.max(0, this.player.respawnTimer).toFixed(1);
          if (deployBtn) {
            deployBtn.disabled = true;
            deployBtn.textContent = `WAIT ${t}s`;
          }
          if (deploySub) deploySub.textContent = `RE-DEPLOY LOCK — ${t}s`;
        } else {
          if (deployBtn) {
            deployBtn.disabled = false;
            deployBtn.textContent = 'DEPLOY';
          }
          if (deploySub) deploySub.textContent = 'READY TO RE-ENTER SORTIE';
        }
      }
    }

    deployPlayerFromRespawn() {
      if (!this.player || this.player.alive) return;
      if (this.player.respawnTimer > 0) {
        this.addFloatingPopup(`CANNOT DEPLOY YET // WAIT ${this.player.respawnTimer.toFixed(1)}s`, '#c9443e');
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

      // 3. Clear workshop flags and restore outdoor flight lighting
      this.clearHangarTestEffects(true);
      this.inRespawnWorkshop = false;
      this.respawnAwaitingDeploy = false;
      const feedEl = document.getElementById('feed-container');
      if (feedEl) feedEl.classList.remove('hidden');
      this.world.setHangarLightingMode(false);
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
      this.addFloatingPopup('SORTIE DEPLOYED // AIRFRAME ENGAGED', '#52c468');
    }

    populateSplitScoreboard(blueTbodyId, redTbodyId, bannerId) {
      const banner = document.getElementById(bannerId);
      if (banner) {
        const clk = HUDRenderer.formatClock(this.remainingMatchSec);
        banner.textContent = this.isSuddenDeath
          ? `SUDDEN DEATH  •  BLUE ${this.teamCaptures.BLUE} — ${this.teamCaptures.RED} RED`
          : `BLUE ${this.teamCaptures.BLUE} — ${this.teamCaptures.RED} RED  •  ${clk}`;
      }

      const renderTeamRows = (team, tbodyId) => {
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        tbody.innerHTML = '';
        const list = this.aircraftList
          .filter(a => a.team === team)
          .sort((a, b) => b.score - a.score);

        list.forEach((ac, idx) => {
          const tr = document.createElement('tr');
          tr.className = ac.isPlayer ? 'row-player' : (team === 'BLUE' ? 'row-blue' : 'row-red');
          const statusText = ac.carryingFlag ? 'CARRIER' : (ac.alive ? 'AIRBORNE' : 'DOWN');
          const safeName = Game.escapeHtml(ac.callsign);
          tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${safeName}${ac.isPlayer ? ' (YOU)' : ''}</td>
            <td>${ac.stats.shortName || ac.stats.name}</td>
            <td class="amber-text mono-strong">${ac.score}</td>
            <td class="sage-text mono-strong">${ac.flagCaptures}/${ac.flagReturns}</td>
            <td class="mono-dim">${ac.kills}/${ac.deaths}</td>
            <td class="${ac.alive ? 'status-alive' : 'status-down'}">${statusText}</td>
          `;
          tbody.appendChild(tr);
        });
      };

      renderTeamRows('BLUE', blueTbodyId);
      renderTeamRows('RED', redTbodyId);
    }

    updateShowroomCamera(dt) {
      const orb = this.showroomOrbit;
      if (!orb) return;

      const lerpAlpha = Math.min(1.0, 4.8 * dt);
      if (!orb.isDragging) {
        orb.targetAzimuth += dt * orb.autoSpinSpeed;
        orb.azimuth += (orb.targetAzimuth - orb.azimuth) * lerpAlpha;
        orb.elevation += (orb.targetElevation - orb.elevation) * lerpAlpha;
      }
      orb.dist += (orb.targetDist - orb.dist) * lerpAlpha;
      orb.lookBiasX += (orb.targetLookBiasX - orb.lookBiasX) * lerpAlpha;

      if (this.menuFighter) {
        this.menuFighter.position.set(0, 748.0, 0);
        this.menuFighter.rotation.set(0, 0, 0);
        const ud = this.menuFighter.userData;
        if (ud && ud.abGroup) {
          if (this.hangarTestAB) {
            ud.abGroup.visible = true;
            const pulse = 1.85 + Math.sin(performance.now() * 0.045) * 0.22;
            const scaleXY = 1.08 + Math.sin(performance.now() * 0.06) * 0.06;
            if (Math.abs(ud.abGroup.position.z) > 0.1) {
              ud.abGroup.scale.set(scaleXY, scaleXY, pulse);
            } else {
              for (let i = 0; i < ud.abGroup.children.length; i++) {
                ud.abGroup.children[i].scale.set(scaleXY, scaleXY, pulse);
              }
            }
          } else {
            ud.abGroup.visible = false;
          }
        }
      }

      if (this.hangarTracerBullets && this.hangarTracerBullets.length > 0) {
        for (let i = this.hangarTracerBullets.length - 1; i >= 0; i--) {
          const b = this.hangarTracerBullets[i];
          b.age += dt;
          b.mesh.position.z -= 115 * dt;
          if (b.age >= b.maxLife) {
            this.scene.remove(b.mesh);
            if (b.mat && b.mat.dispose) b.mat.dispose();
            this.hangarTracerBullets.splice(i, 1);
          }
        }
      }

      const az = orb.azimuth;
      const el = orb.elevation;
      const dist = orb.dist;

      const targetX = Math.cos(az) * orb.lookBiasX;
      const targetY = 748.2;
      const targetZ = -Math.sin(az) * orb.lookBiasX;

      const camX = targetX + Math.sin(az) * Math.cos(el) * dist;
      const camY = targetY + Math.sin(el) * dist + 1.1;
      const camZ = targetZ + Math.cos(az) * Math.cos(el) * dist;

      this.camera.position.set(camX, camY, camZ);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(targetX, targetY, targetZ);

      if (Math.abs(this.camera.fov - 48) > 0.1) {
        this.camera.fov += (48 - this.camera.fov) * lerpAlpha;
        this.camera.updateProjectionMatrix();
      }
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
      this.input.isTouchDevice = false;

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
        const typingInput = document.activeElement && document.activeElement.tagName === 'INPUT';
        const settingsModal = document.getElementById('settings-modal');
        const settingsOpen = settingsModal && !settingsModal.classList.contains('hidden');

        if (!typingInput && !settingsOpen) {
          if (this.input.consumePressed('Space') || this.input.consumePressed('Enter')) {
            this.audio.init();
            this.audio.playUiTick('deploy');
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
        }
        if (this.input.consumePressed('Escape')) {
          if (settingsOpen) settingsModal.classList.add('hidden');
          const briefing = document.getElementById('hangar-briefing-drawer');
          if (briefing) briefing.classList.add('hidden');
          const bBtn = document.getElementById('btn-toggle-briefing');
          if (bBtn) bBtn.classList.remove('active');
        }
        this.input.clearJustPressed();

        this.updateShowroomCamera(dt);
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
          if (this.tutorial.isFrozen) {
            if (this.player && this.audio) {
              this.audio.updateEngine(0.2, 0.2, false, true);
            }
            if (this.player) {
              this.updateCamera(dt, this.player, false);
            }
            this.camera.updateMatrixWorld(true);
            this.world.update(this.camera.position, 0);
            this.hud.render(
              0,
              this.player,
              this.aircraftList,
              this.world,
              this.camera,
              false,
              this.cameraMode,
              this.input,
              this.teamCaptures,
              this.highScore,
              this.remainingMatchSec,
              this.isSuddenDeath
            );
            this.renderer.render(this.scene, this.camera);
            return;
          }
        }

        if (!this.isSuddenDeath) {
          this.remainingMatchSec = Math.max(0, this.remainingMatchSec - dt);

          // 10-Minute Round Clock Warnings & Expiration Check
          for (const warnSec of [300, 120, 60, 30]) {
            if (this.remainingMatchSec <= warnSec && !this.timeAlertsTriggered[warnSec]) {
              this.timeAlertsTriggered[warnSec] = true;
              const lbl = warnSec >= 60 ? `${warnSec / 60} MINUTE${warnSec > 60 ? 'S' : ''}` : '30 SECONDS';
              this.addFeedItem(`${lbl} REMAINING IN ROUND`, 'warn');
              this.addFloatingPopup(`${lbl} REMAINING`, '#d9822b');
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
              this.cyclePlayerTarget(playerControls.cycleTarget);
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
            this.updateShowroomCamera(dt);
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