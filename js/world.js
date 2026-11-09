"use strict";

  /* ============================================================================
   * 4. UPGRADED 48KM MULTI-BIOME WORLD (Hydro Dam, Fortress Airbases, Flanking Viaducts & CTF Flags)
   * ============================================================================
   */
  class World {
    constructor(scene) {
      this.scene = scene;
      this.clouds = [];
      this.boostRings = []; // Boost rings removed per user request
      this.radarDishes = [];
      this.beaconLights = [];
      this.oceanMesh = null;
      this.waterAnimPhase = 0;
      this.flags = {
        BLUE: null,
        RED: null
      };
      this.buildLightingAndSky();
      this.buildTerrainAndOcean();
      this.buildFortifiedCtfBases();
      this.buildHighAltitudeLandmarks();
      this.buildVolumetricClouds();
      this.initFlags();
    }

    getTerrainHeight(x, z) {
      // 1. Flat, elevated airfield plateaus around Blue Base & Red Base
      const dBlue = Math.hypot(x - CONFIG.WORLD.blueBasePos.x, z - CONFIG.WORLD.blueBasePos.z);
      if (dBlue < 1250) {
        const blend = Math.max(0, Math.min(1, (dBlue - 720) / 530));
        const baseFlat = 180;
        const natural = this._rawTerrainHeight(x, z);
        return baseFlat * (1 - blend) + natural * blend;
      }
      const dRed = Math.hypot(x - CONFIG.WORLD.redBasePos.x, z - CONFIG.WORLD.redBasePos.z);
      if (dRed < 1250) {
        const blend = Math.max(0, Math.min(1, (dRed - 720) / 530));
        const baseFlat = 180;
        const natural = this._rawTerrainHeight(x, z);
        return baseFlat * (1 - blend) + natural * blend;
      }
      return this._rawTerrainHeight(x, z);
    }

    _rawTerrainHeight(x, z) {
      const distFromCenter = Math.sqrt(x * x + z * z);
      const worldFalloff = Math.max(0, 1.0 - distFromCenter / 22500);

      // Multi-layered 48km archipelago mountain ranges + terraced mesas + wide low-altitude canyon trench
      const n1 = Math.sin(x * 0.00032 + 0.3) * Math.cos(z * 0.00032 - 0.2);
      const n2 = Math.sin(x * 0.00078 - z * 0.00062 + 1.4) * 0.58;
      const n3 = Math.cos(x * 0.00185 + z * 0.00165) * 0.24;
      const n4 = Math.sin(x * 0.0037 - z * 0.0031) * 0.09;
      const ridge = Math.pow(Math.abs(n1 + n2 * 0.78), 1.32);

      // Flanking East/West mountain ranges & scenic peripheral peaks
      const flankPeaks = Math.exp(-((Math.abs(x) - 3800) * (Math.abs(x) - 3800)) / (1800 * 1800)) *
                         Math.exp(-(z * z) / (7500 * 7500)) * 0.55;
      const centerMassif = Math.exp(-(x * x) / (5200 * 5200)) * Math.exp(-(z * z) / (9200 * 9200)) * 0.45;

      let h = (ridge * 680 + (n3 + n4) * 90 + centerMassif * 360 + flankPeaks * 390) * worldFalloff - 40;

      // Central canyon river trench: carved cleanly along x=0 between the two bases so there is a wide, open corridor
      const canyonCorridor = Math.exp(-(x * x) / (1250 * 1250)) * Math.exp(-(z * z) / (8500 * 8500));
      h = h * (1.0 - canyonCorridor * 0.82) - canyonCorridor * 170;

      // East & West sneaky flanking valleys at x = ±2600m for stealth flag runs
      const sneakValleys = Math.exp(-((Math.abs(x) - 2600) * (Math.abs(x) - 2600)) / (700 * 700)) *
                           Math.exp(-(z * z) / (7500 * 7500));
      h = h * (1.0 - sneakValleys * 0.55) - sneakValleys * 130;

      return Math.max(-28, h);
    }

    buildLightingAndSky() {
      this.scene.fog = new THREE.FogExp2(0x07152c, 0.000028);

      const hemiLight = new THREE.HemisphereLight(0x628fd4, 0x0c192e, 0.94);
      this.scene.add(hemiLight);

      const sunLight = new THREE.DirectionalLight(0xdbeafe, 1.22);
      sunLight.position.set(9200, 13500, -8200);
      this.scene.add(sunLight);

      const skyGeo = new THREE.SphereGeometry(44000, 32, 20);
      const skyMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color(0x020612) },
          midColor: { value: new THREE.Color(0x0b224a) },
          horizonColor: { value: new THREE.Color(0x1f4b85) },
          sunDir: { value: sunLight.position.clone().normalize() }
        },
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform vec3 topColor;
          uniform vec3 midColor;
          uniform vec3 horizonColor;
          uniform vec3 sunDir;
          varying vec3 vWorldPos;
          float hash(vec3 p) {
            p = fract(p * 0.3183099 + 0.1);
            p *= 17.0;
            return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
          }
          void main() {
            vec3 dir = normalize(vWorldPos);
            float h = clamp(dir.y, 0.0, 1.0);
            vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.25, h));
            col = mix(col, topColor, smoothstep(0.25, 0.86, h));
            // Subtle aurora / atmospheric horizon glow
            float aurora = sin(dir.x * 6.0 + dir.z * 4.0) * 0.5 + 0.5;
            col += vec3(0.02, 0.14, 0.18) * aurora * smoothstep(0.02, 0.18, h) * (1.0 - smoothstep(0.18, 0.42, h));
            if (h > 0.08) {
              float s = hash(floor(dir * 420.0));
              if (s > 0.9962) {
                col += vec3(0.80, 0.92, 1.0) * ((s - 0.9962) / 0.0038) * smoothstep(0.08, 0.3, h);
              }
            }
            float moonAmt = max(dot(dir, sunDir), 0.0);
            col += vec3(0.32, 0.64, 1.0) * pow(moonAmt, 22.0) * 0.52;
            col += vec3(0.96, 0.99, 1.0) * smoothstep(0.9980, 0.9995, moonAmt);
            gl_FragColor = vec4(col, 1.0);
          }
        `
      });
      this.skyDome = new THREE.Mesh(skyGeo, skyMat);
      this.scene.add(this.skyDome);
    }

    buildTerrainAndOcean() {
      const segs = 232;
      const size = CONFIG.WORLD.size;
      const terrainGeo = new THREE.PlaneGeometry(size, size, segs, segs);
      terrainGeo.rotateX(-Math.PI / 2);

      const posAttr = terrainGeo.attributes.position;
      const colors = new Float32Array(posAttr.count * 3);

      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        const h = this.getTerrainHeight(x, z);
        posAttr.setY(i, h);

        let r, g, b;
        const dBlue = Math.hypot(x - CONFIG.WORLD.blueBasePos.x, z - CONFIG.WORLD.blueBasePos.z);
        const dRed = Math.hypot(x - CONFIG.WORLD.redBasePos.x, z - CONFIG.WORLD.redBasePos.z);
        const inCanyonCorridor = Math.abs(x) < 1350 && Math.abs(z) < 5800;

        if (dBlue < 650) {
          // Blue Fortress Airfield Plateau
          r = 0.11; g = 0.25; b = 0.40;
        } else if (dRed < 650) {
          // Red Citadel Airfield Plateau
          r = 0.38; g = 0.14; b = 0.21;
        } else if (h < 4) {
          // Shallow Turquoise Lagoon Reefs
          r = 0.06; g = 0.24; b = 0.36;
        } else if (h < 26) {
          // Warm Coastal Sand & Riverbanks
          r = 0.34; g = 0.32; b = 0.26;
        } else if (inCanyonCorridor && h < 240) {
          // Terracotta & Golden Sandstone Canyon Walls
          const band = (Math.sin(h * 0.09) * 0.5 + 0.5) * 0.08;
          r = 0.36 + band; g = 0.22 + band * 0.6; b = 0.18;
        } else if (h < 195) {
          // Lush Emerald Pine Forest & Highland Meadows
          r = 0.08; g = 0.28; b = 0.20;
        } else if (h < 410) {
          // Dark Slate Granite Cliffs
          r = 0.20; g = 0.25; b = 0.34;
        } else {
          // Snow-Capped Alpine Peaks
          r = 0.66; g = 0.80; b = 0.96;
        }
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      }

      terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const flatTerrainGeo = terrainGeo.toNonIndexed();
      terrainGeo.dispose();
      flatTerrainGeo.computeVertexNormals();

      const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      this.terrainMesh = new THREE.Mesh(flatTerrainGeo, terrainMat);
      this.scene.add(this.terrainMesh);

      const oceanGeo = new THREE.PlaneGeometry(size * 1.4, size * 1.4, 56, 56);
      oceanGeo.rotateX(-Math.PI / 2);
      const oceanMat = new THREE.MeshPhongMaterial({
        color: 0x052040,
        emissive: 0x020c1d,
        specular: 0x56ccf2,
        shininess: 95,
        transparent: true,
        opacity: 0.94
      });
      this.oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
      this.oceanMesh.position.y = CONFIG.WORLD.seaLevel;
      this.scene.add(this.oceanMesh);
    }

    buildFortifiedCtfBases() {
      const buildBase = (pos, colorHex, isBlue) => {
        const baseGroup = new THREE.Group();
        baseGroup.position.set(pos.x, 180, pos.z);

        const asphaltMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
        const concreteMat = new THREE.MeshLambertMaterial({ color: 0x283548 });
        const trimMat = new THREE.MeshBasicMaterial({ color: colorHex });
        const amberMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });

        // 1. Extended 1,100m Main Military Runway + Parallel Taxiway Apron
        const runway = new THREE.Mesh(new THREE.BoxGeometry(160, 2.2, 1100), asphaltMat);
        baseGroup.add(runway);

        const apron = new THREE.Mesh(new THREE.BoxGeometry(420, 1.8, 680), asphaltMat);
        apron.position.set(0, -0.2, 0);
        baseGroup.add(apron);

        // Glowing Edge Strips & Centerline Strobe Dashes
        const stripGeo = new THREE.BoxGeometry(6, 2.6, 1060);
        const leftStrip = new THREE.Mesh(stripGeo, trimMat);
        leftStrip.position.set(-72, 0.2, 0);
        const rightStrip = new THREE.Mesh(stripGeo, trimMat);
        rightStrip.position.set(72, 0.2, 0);
        baseGroup.add(leftStrip, rightStrip);

        const dashGeo = new THREE.BoxGeometry(4, 2.6, 36);
        for (let dz = -460; dz <= 460; dz += 92) {
          if (Math.abs(dz) < 110) continue; // Leave center flag stadium clear
          const dash = new THREE.Mesh(dashGeo, amberMat);
          dash.position.set(0, 0.25, dz);
          baseGroup.add(dash);
        }

        // 2. Four Reinforced Aircraft Hangars on outer apron (wide-spaced at x = ±320 so center runway is 100% open!)
        const hangarGeo = new THREE.CylinderGeometry(42, 42, 110, 10, 1, false, 0, Math.PI);
        hangarGeo.rotateZ(Math.PI / 2);
        hangarGeo.scale(1.2, 0.75, 1.0);
        for (const hx of [-320, 320]) {
          for (const hz of [-190, 190]) {
            const hangar = new THREE.Mesh(hangarGeo, concreteMat);
            hangar.position.set(hx, 2, hz);
            baseGroup.add(hangar);

            const archTrim = new THREE.Mesh(new THREE.BoxGeometry(86, 4, 6), trimMat);
            archTrim.position.set(hx, 30, hz + (isBlue ? -55 : 55));
            baseGroup.add(archTrim);
          }
        }

        // 3. Air-Traffic Control Tower & Rotating Radar Dish (at x = 360, z = 0)
        const atcTower = new THREE.Group();
        atcTower.position.set(360, 0, 0);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(36, 190, 36), concreteMat);
        shaft.position.y = 95;
        const cab = new THREE.Mesh(new THREE.CylinderGeometry(32, 24, 28, 8), asphaltMat);
        cab.position.y = 200;
        const cabGlass = new THREE.Mesh(new THREE.CylinderGeometry(30, 23, 14, 8), trimMat);
        cabGlass.position.y = 202;
        const dishSpin = new THREE.Group();
        dishSpin.position.y = 226;
        const radarBar = new THREE.Mesh(new THREE.BoxGeometry(42, 6, 6), trimMat);
        dishSpin.add(radarBar);
        this.radarDishes.push(dishSpin);
        atcTower.add(shaft, cab, cabGlass, dishSpin);
        baseGroup.add(atcTower);

        // 4. Wide-spaced Fortress Pylons (at ±260, ±260)
        const towerGeo = new THREE.BoxGeometry(32, 175, 32);
        const crownGeo = new THREE.OctahedronGeometry(16, 0);
        const offsets = [[-260, -260], [260, -260], [-260, 260], [260, 260]];
        for (const [ox, oz] of offsets) {
          const tMesh = new THREE.Mesh(towerGeo, concreteMat);
          tMesh.position.set(ox, 87, oz);
          baseGroup.add(tMesh);

          const cMesh = new THREE.Mesh(crownGeo, trimMat);
          cMesh.position.set(ox, 190, oz);
          this.beaconLights.push(cMesh);
          baseGroup.add(cMesh);
        }

        // 5. Holographic CTF Flag Capture Stadium Rings
        const ringGeo = new THREE.TorusGeometry(85, 5.0, 10, 36);
        ringGeo.rotateX(Math.PI / 2);
        const ringMesh = new THREE.Mesh(ringGeo, trimMat);
        ringMesh.position.y = 4;
        baseGroup.add(ringMesh);

        const innerRingGeo = new THREE.TorusGeometry(48, 3.0, 8, 28);
        innerRingGeo.rotateX(Math.PI / 2);
        const innerRing = new THREE.Mesh(innerRingGeo, amberMat);
        innerRing.position.y = 4.5;
        baseGroup.add(innerRing);

        const beamGeo = new THREE.CylinderGeometry(14, 36, 3600, 12, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.y = 1800;
        baseGroup.add(beam);

        this.scene.add(baseGroup);
      };

      buildBase(CONFIG.WORLD.blueBasePos, 0x38bdf8, true);
      buildBase(CONFIG.WORLD.redBasePos, 0xff3b47, false);
    }

    buildHighAltitudeLandmarks() {
      // All bridges, arches, and viaducts maintain massive low-altitude clearance (460m–620m+)
      // so players can skim effortlessly through the lower canyon and water, while adding major visual landmarks!
      const archMat = new THREE.MeshLambertMaterial({ color: 0x2d3a4b });
      const steelMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
      const concreteMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
      const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const neonGoldMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
      const neonGreenMat = new THREE.MeshBasicMaterial({ color: 0x00ff9d });
      const neonRedMat = new THREE.MeshBasicMaterial({ color: 0xff3b47 });

      // 1. High-Altitude Giant Canyon Arches (Spans at ~460m–580m altitude, 880m wide gap underneath!)
      const archPositions = [
        { x: 0, z: -4200, y: 460, rotY: 0, trim: neonRedMat },
        { x: 0, z: -2100, y: 490, rotY: 0, trim: neonCyanMat },
        { x: 0, z: 2100,  y: 490, rotY: 0, trim: neonCyanMat },
        { x: 0, z: 4200,  y: 460, rotY: 0, trim: neonGreenMat },
        { x: -2800, z: -2400, y: 560, rotY: 0.45, trim: neonGoldMat },
        { x: 2800,  z: 2400,  y: 560, rotY: -0.45, trim: neonGoldMat },
        { x: -2800, z: 2400,  y: 560, rotY: -0.45, trim: neonCyanMat },
        { x: 2800,  z: -2400, y: 560, rotY: 0.45, trim: neonCyanMat }
      ];

      for (const ap of archPositions) {
        const archGroup = new THREE.Group();
        archGroup.position.set(ap.x, ap.y, ap.z);
        archGroup.rotation.y = ap.rotY;

        const pillarGeo = new THREE.BoxGeometry(95, 780, 110);
        const leftP = new THREE.Mesh(pillarGeo, archMat);
        leftP.position.set(-440, -140, 0);
        const rightP = new THREE.Mesh(pillarGeo, archMat);
        rightP.position.set(440, -140, 0);

        const spanGeo = new THREE.BoxGeometry(980, 78, 120);
        const span = new THREE.Mesh(spanGeo, archMat);
        span.position.set(0, 220, 0);

        const trimBar = new THREE.Mesh(new THREE.BoxGeometry(880, 8, 126), ap.trim);
        trimBar.position.set(0, 182, 0);

        archGroup.add(leftP, rightP, span, trimBar);
        this.scene.add(archGroup);
      }

      // 2. CENTRAL HIGH-ALTITUDE MEGA-SUSPENSION SKY-BRIDGE at (0, 0)
      // Deck elevated at y = 540m with 960m wide tower spacing + catenary cables so lower canyon skimming is 100% open!
      const bridgeGroup = new THREE.Group();
      bridgeGroup.position.set(0, 0, 0);

      const towerGeo = new THREE.BoxGeometry(58, 900, 58);
      for (const tx of [-480, 480]) {
        const tower = new THREE.Mesh(towerGeo, steelMat);
        tower.position.set(tx, 450, 0);
        bridgeGroup.add(tower);

        const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(64, 18, 96), concreteMat);
        crossBeam.position.set(tx, 760, 0);
        bridgeGroup.add(crossBeam);

        const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(24, 0), neonGoldMat);
        beacon.position.set(tx, 920, 0);
        this.beaconLights.push(beacon);
        bridgeGroup.add(beacon);
      }

      const deckGeo = new THREE.BoxGeometry(1280, 22, 92);
      const mainDeck = new THREE.Mesh(deckGeo, steelMat);
      mainDeck.position.set(0, 540, 0);
      bridgeGroup.add(mainDeck);

      // Suspension cables above the 540m deck (never hanging below the deck!)
      const suspenderGeo = new THREE.CylinderGeometry(2.2, 2.2, 1, 6);
      for (let sx = -420; sx <= 420; sx += 105) {
        const normX = sx / 480;
        const cableTopY = 560 + normX * normX * 290;
        const hLen = cableTopY - 545;
        for (const sz of [-38, 38]) {
          const vCable = new THREE.Mesh(suspenderGeo, concreteMat);
          vCable.scale.set(1, hLen, 1);
          vCable.position.set(sx, 545 + hLen * 0.5, sz);
          bridgeGroup.add(vCable);
        }
      }

      const deckLightGeo = new THREE.BoxGeometry(1260, 6, 6);
      const dl1 = new THREE.Mesh(deckLightGeo, neonCyanMat);
      dl1.position.set(0, 553, 44);
      const dl2 = new THREE.Mesh(deckLightGeo, neonCyanMat);
      dl2.position.set(0, 553, -44);
      bridgeGroup.add(dl1, dl2);
      this.scene.add(bridgeGroup);

      // 3. NORTHERN MEGA HYDROELECTRIC DAM & SPILLWAY CITADEL at (0, 0, -9600)
      // Positioned far north of Red Base (-6600) as a monumental backdrop & flanking turnaround landmark
      const damGroup = new THREE.Group();
      damGroup.position.set(0, 0, -9600);
      const damWall = new THREE.Mesh(new THREE.BoxGeometry(2200, 680, 190), concreteMat);
      damWall.position.set(0, 340, 0);
      damGroup.add(damWall);

      const spillwayMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 });
      for (const sx of [-550, -180, 180, 550]) {
        const chute = new THREE.Mesh(new THREE.BoxGeometry(140, 520, 205), spillwayMat);
        chute.position.set(sx, 260, 0);
        damGroup.add(chute);

        const pylon = new THREE.Mesh(new THREE.BoxGeometry(48, 820, 220), steelMat);
        pylon.position.set(sx + 180, 410, 0);
        damGroup.add(pylon);
      }
      const damCrestStrip = new THREE.Mesh(new THREE.BoxGeometry(2180, 10, 200), neonGoldMat);
      damCrestStrip.position.set(0, 682, 0);
      damGroup.add(damCrestStrip);
      this.scene.add(damGroup);

      // 4. WESTERN GEOTHERMAL CALDERA & STEALTH REFINERY TOWERS at (-3900, 0) & EASTERN OBSERVATORY VIADUCT at (+3900, 0)
      // Gives the Sneaky/Coward AI [SHENANIGANS] and flanking players rich side-corridor landmarks!
      for (const side of [-1, 1]) {
        const ox = side * 3600;
        const oz = 0;
        const oy = Math.max(380, this.getTerrainHeight(ox, oz) + 220);
        const outpost = new THREE.Group();
        outpost.position.set(ox, oy, oz);

        const basePed = new THREE.Mesh(new THREE.CylinderGeometry(75, 110, 320, 12), steelMat);
        basePed.position.y = -40;
        outpost.add(basePed);

        const haloRing = new THREE.Mesh(
          new THREE.TorusGeometry(95, 5, 8, 24),
          side < 0 ? neonGreenMat : neonCyanMat
        );
        haloRing.rotation.x = Math.PI / 2;
        haloRing.position.y = 95;
        outpost.add(haloRing);

        const dishGroup = new THREE.Group();
        dishGroup.position.y = 140;
        const dishMesh = new THREE.Mesh(
          new THREE.ConeGeometry(65, 30, 12, 1, true),
          new THREE.MeshBasicMaterial({ color: side < 0 ? 0x00ff9d : 0x38bdf8, wireframe: true })
        );
        dishMesh.rotation.x = Math.PI * 0.35;
        dishGroup.add(dishMesh);
        outpost.add(dishGroup);
        this.radarDishes.push(dishGroup);
        this.scene.add(outpost);
      }
    }

    buildVolumetricClouds() {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 128;
      const ctx = c.getContext('2d');
      const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
      grad.addColorStop(0.0, 'rgba(95, 145, 210, 0.40)');
      grad.addColorStop(0.45, 'rgba(48, 85, 148, 0.22)');
      grad.addColorStop(1.0, 'rgba(15, 30, 60, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);

      const cloudTex = new THREE.CanvasTexture(c);
      const cloudMat = new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.56
      });

      this.cloudGroup = new THREE.Group();
      for (let i = 0; i < CONFIG.WORLD.cloudCount; i++) {
        const cluster = new THREE.Group();
        const cx = (Math.random() - 0.5) * 40000;
        const cy = 980 + Math.random() * 2200;
        const cz = (Math.random() - 0.5) * 40000;
        cluster.position.set(cx, cy, cz);

        const puffs = 3 + Math.floor(Math.random() * 3);
        for (let p = 0; p < puffs; p++) {
          const sp = new THREE.Sprite(cloudMat);
          const scale = 380 + Math.random() * 380;
          sp.scale.set(scale * 1.4, scale * 0.85, 1);
          sp.position.set(
            (Math.random() - 0.5) * 340,
            (Math.random() - 0.5) * 85,
            (Math.random() - 0.5) * 340
          );
          cluster.add(sp);
        }
        this.cloudGroup.add(cluster);
        this.clouds.push(cluster);
      }
      this.scene.add(this.cloudGroup);
    }

    initFlags() {
      const createFlagObject = (team, homeVec, colorHex) => {
        const group = new THREE.Group();
        group.position.copy(homeVec);

        const poleGeo = new THREE.CylinderGeometry(1.2, 1.2, 46, 8);
        const poleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 23;
        group.add(pole);

        const bannerGeo = new THREE.BoxGeometry(28, 16, 1.5);
        const bannerMat = new THREE.MeshBasicMaterial({ color: colorHex });
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.set(14, 36, 0);
        group.add(banner);

        const crystalGeo = new THREE.OctahedronGeometry(14, 0);
        const crystalMat = new THREE.MeshBasicMaterial({ color: colorHex, wireframe: true });
        const crystal = new THREE.Mesh(crystalGeo, crystalMat);
        crystal.position.y = 62;
        group.add(crystal);

        this.scene.add(group);
        return {
          team,
          homePos: homeVec.clone(),
          pos: homeVec.clone(),
          group,
          crystal,
          banner,
          state: 'AT_BASE',
          carrier: null,
          lastDropper: null,
          dropTimer: 0
        };
      };

      this.flags.BLUE = createFlagObject('BLUE', CONFIG.WORLD.blueBasePos, 0x38bdf8);
      this.flags.RED  = createFlagObject('RED',  CONFIG.WORLD.redBasePos,  0xff3b47);
    }

    resetFlags() {
      for (const key of ['BLUE', 'RED']) {
        const f = this.flags[key];
        if (!f) continue;
        if (f.carrier) f.carrier.carryingFlag = null;
        f.carrier = null;
        f.lastDropper = null;
        f.state = 'AT_BASE';
        f.dropTimer = 0;
        f.pos.copy(f.homePos);
        f.group.position.copy(f.homePos);
        f.group.scale.setScalar(1.0);
        f.group.visible = true;
      }
    }

    updateFlagsAndRings(dt, aircraftList, particles, audio, game) {
      if (this.radarDishes) {
        for (const d of this.radarDishes) d.rotation.y += dt * 1.4;
      }
      if (this.beaconLights) {
        for (const b of this.beaconLights) b.rotation.y += dt * 2.0;
      }

      const pickupSq = CONFIG.CTF.pickupRadius * CONFIG.CTF.pickupRadius;
      const returnSq = CONFIG.CTF.returnRadius * CONFIG.CTF.returnRadius;

      for (const teamKey of ['BLUE', 'RED']) {
        const flag = this.flags[teamKey];
        if (!flag) continue;

        flag.crystal.rotation.y += dt * 2.6;
        flag.crystal.rotation.x += dt * 1.3;

        if (flag.state === 'CARRIED' && flag.carrier && flag.carrier.alive) {
          flag.pos.copy(flag.carrier.mesh.position);
          flag.group.position.copy(flag.pos);

          if (flag.carrier.isPlayer) {
            // Keep player's forward/rear camera 100% unobstructed when carrying the flag!
            flag.group.visible = false;
            if (Math.random() < 0.75) {
              const col = teamKey === 'BLUE' ? 0x38bdf8 : 0xff3b47;
              for (const wx of [-7.0, 7.0]) {
                _v1.set(wx, 0, 3.2).applyQuaternion(flag.carrier.mesh.quaternion).add(flag.carrier.mesh.position);
                particles.spawnParticle(_v1, _v2.set(0, 0, 0), col, 1.1, 2.2, 0.30, true);
              }
            }
          } else {
            flag.group.visible = true;
            _v1.set(0, 6.0, 10.0).applyQuaternion(flag.carrier.mesh.quaternion);
            flag.group.position.copy(flag.carrier.mesh.position).add(_v1);
            flag.group.scale.setScalar(0.42);
          }
        } else {
          flag.group.visible = true;
          flag.group.scale.setScalar(1.0);
          if (flag.state === 'CARRIED' && (!flag.carrier || !flag.carrier.alive)) {
            this.dropFlag(flag, game, false);
          }
        }

        if (flag.state === 'DROPPED') {
          // Smooth parachute descent toward terrain/water if dropped at high altitude so teammates can catch it mid-air or on the ground!
          const groundY = Math.max(CONFIG.WORLD.seaLevel + 25, this.getTerrainHeight(flag.pos.x, flag.pos.z) + 22);
          if (flag.pos.y > groundY) {
            flag.pos.y = Math.max(groundY, flag.pos.y - 48.0 * dt);
            flag.group.position.copy(flag.pos);
          }
          flag.dropTimer -= dt;
          if (flag.dropTimer <= 0) {
            flag.state = 'AT_BASE';
            flag.carrier = null;
            flag.lastDropper = null;
            flag.pos.copy(flag.homePos);
            flag.group.position.copy(flag.homePos);
            flag.group.visible = true;
            game.addFeedItem(`🚩 ${teamKey} FLAG auto-returned to base!`, 'warn');
          }
        }

        // Check aircraft interactions with this flag
        if (flag.state !== 'CARRIED') {
          for (const ac of aircraftList) {
            if (!ac.alive) continue;
            // Respect drop pickup cooldown so pressing G or X to drop the flag doesn't immediately re-grab it!
            if (ac.flagPickupCooldown > 0 && flag.lastDropper === ac) continue;

            const dSq = ac.mesh.position.distanceToSquared(flag.pos);

            if (ac.team !== flag.team && dSq <= pickupSq) {
              flag.state = 'CARRIED';
              flag.carrier = ac;
              flag.lastDropper = null;
              ac.carryingFlag = flag;
              ac.boostEnergy = CONFIG.BOOST.maxEnergy;
              ac.addComboAction(CONFIG.CTF.stealPoints, 45, game, `🚩 ENEMY FLAG STOLEN! +${CONFIG.CTF.stealPoints}`);
              if (ac.isPlayer) {
                flag.group.visible = false;
                audio.playFlagFanfare(true);
              } else if (game.player && game.player.team === flag.team) {
                audio.playFlagFanfare(false);
              }
              game.addFeedItem(`🚩 ${ac.callsign} STOLE the ${flag.team} FLAG!`, ac.team === 'BLUE' ? 'kill-blue' : 'kill-red');
              break;
            } else if (ac.team === flag.team && flag.state === 'DROPPED' && dSq <= returnSq) {
              flag.state = 'AT_BASE';
              flag.carrier = null;
              flag.lastDropper = null;
              flag.pos.copy(flag.homePos);
              flag.group.position.copy(flag.homePos);
              flag.group.visible = true;
              ac.flagReturns++;
              ac.addComboAction(CONFIG.CTF.returnPoints, 40, game, `🛡️ FLAG RETURNED! +${CONFIG.CTF.returnPoints}`);
              if (ac.isPlayer) {
                audio.playFlagFanfare(true);
              }
              game.addFeedItem(`🛡️ ${ac.callsign} returned the ${flag.team} FLAG!`, ac.team === 'BLUE' ? 'kill-blue' : 'kill-red');
              break;
            }
          }
        }
      }

      // Check if a Flag Carrier reached their Home Base to score a CAPTURE!
      for (const ac of aircraftList) {
        if (!ac.alive || !ac.carryingFlag) continue;
        const ownFlag = this.flags[ac.team];
        if (!ownFlag) continue;
        const distToHomeSq = ac.mesh.position.distanceToSquared(ownFlag.homePos);
        if (distToHomeSq <= pickupSq * 1.35) {
          if (ownFlag.state === 'AT_BASE') {
            const capturedFlag = ac.carryingFlag;
            ac.carryingFlag = null;
            capturedFlag.carrier = null;
            capturedFlag.lastDropper = null;
            capturedFlag.state = 'AT_BASE';
            capturedFlag.pos.copy(capturedFlag.homePos);
            capturedFlag.group.position.copy(capturedFlag.homePos);
            capturedFlag.group.scale.setScalar(1.0);
            capturedFlag.group.visible = true;

            ac.flagCaptures++;
            ac.addComboAction(CONFIG.CTF.capturePoints, 100, game, `🏆 FLAG CAPTURED! +${CONFIG.CTF.capturePoints}`);
            game.onFlagCaptured(ac, capturedFlag.team);
          } else if (ac.isPlayer) {
            const now = Date.now();
            if (!ac.lastMissingFlagAlert || now - ac.lastMissingFlagAlert > 2800) {
              ac.lastMissingFlagAlert = now;
              game.addFloatingPopup('⚠️ CANNOT CAPTURE: YOUR TEAM FLAG IS NOT AT BASE! RECOVER IT FIRST!', '#ff3b47');
              if (game.audio) game.audio.playTone(220, 0.22, 'sawtooth', 0.28);
            }
          }
        }
      }
    }

    dropFlag(flag, game, isManualDrop = false) {
      if (!flag) return;
      const dropper = flag.carrier;
      if (dropper) {
        flag.pos.copy(dropper.mesh.position);
        dropper.carryingFlag = null;
        dropper.flagPickupCooldown = CONFIG.CTF.dropPickupCooldown || 3.5;
        flag.lastDropper = dropper;
      }
      const groundY = Math.max(CONFIG.WORLD.seaLevel + 25, this.getTerrainHeight(flag.pos.x, flag.pos.z) + 22);
      flag.pos.y = Math.max(flag.pos.y, groundY);
      flag.group.position.copy(flag.pos);
      flag.group.scale.setScalar(1.0);
      flag.group.visible = true;
      flag.state = 'DROPPED';
      flag.carrier = null;
      flag.dropTimer = CONFIG.CTF.autoReturnTime;
      if (game) {
        if (isManualDrop && dropper) {
          game.addFeedItem(`🏳️ ${dropper.callsign} dropped the ${flag.team} FLAG!`, 'warn');
          if (dropper.isPlayer) {
            game.addFloatingPopup('🏳️ FLAG DROPPED! (3.5s PICKUP COOLDOWN)', '#fbbf24');
            if (game.audio) game.audio.playTone(392.0, 0.14, 'triangle', 0.20);
          }
        } else {
          game.addFeedItem(`🚩 ${flag.team} FLAG was dropped!`, 'warn');
        }
      }
    }

    update(cameraPos, dt = 0.016) {
      if (this.skyDome && cameraPos) {
        this.skyDome.position.copy(cameraPos);
      }
      // Subtle specular water wave shimmer
      if (this.oceanMesh && this.oceanMesh.material) {
        this.waterAnimPhase += dt * 1.8;
        this.oceanMesh.position.y = CONFIG.WORLD.seaLevel + Math.sin(this.waterAnimPhase) * 0.65;
      }
      if (cameraPos) {
        for (let i = 0; i < this.clouds.length; i++) {
          const cl = this.clouds[i];
          const dx = cl.position.x - cameraPos.x;
          const dz = cl.position.z - cameraPos.z;
          cl.visible = (dx * dx + dz * dz) < 18500 * 18500;
        }
      }
    }
  }

window.World = World;
