"use strict";

  /* ============================================================================
   * 5. PROCEDURAL AIRCRAFT MODELS (High-Fidelity Military Airframes by Gemini 4)
   * ============================================================================
   */

/**
 * Builds a procedural 5th-Gen F-22 Stealth Air Superiority Fighter airframe.
 *
 * Coordinate Convention:
 * - Nose: -Z (Z = -7.5) | Tail: +Z (Nozzle exit Z = +5.5, Taileron tips Z = +6.85)
 * - Left Wing: -X       | Right Wing: +X (Wingspan ≈ 11.5 units)
 * - Dorsal: +Y          | Ventral: -Y
 *
 * @param {THREE.Object3D} hiDetail - Target parent group for the high-detail airframe.
 * @param {THREE.Material} bodyMat - Primary stealth airframe skin material.
 * @param {THREE.Material} darkMat - Radar-absorbent edge/bay/intake interior material.
 * @param {THREE.Material} teamMat - Squadron/team accent stripe material.
 * @param {THREE.Material} nozzleMat - Titanium thrust-vectoring petal material.
 * @returns {{ leftElev: THREE.Group, rightElev: THREE.Group, abGroup: THREE.Group }}
 */
function buildFalconAirframe(hiDetail, bodyMat, darkMat, teamMat, nozzleMat) {
  // ---------------------------------------------------------------------------
  // 1. INTERNAL SPECIALIZED MATERIALS
  // ---------------------------------------------------------------------------
  const canopyGlassMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    emissive: 0x332400,
    emissiveIntensity: 0.2,
    metalness: 0.72,
    roughness: 0.12,
    transparent: true,
    opacity: 0.46,
    depthWrite: false
  });

  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xffc800,
    metalness: 0.92,
    roughness: 0.08
  });

  const hudMat = new THREE.MeshStandardMaterial({
    color: 0x00ff9d,
    emissive: 0x00ff9d,
    emissiveIntensity: 1.6,
    transparent: true,
    opacity: 0.68,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const ceramicTileMat = new THREE.MeshStandardMaterial({
    color: 0x262320,
    roughness: 0.85,
    metalness: 0.22
  });

  const missileBodyMat = new THREE.MeshStandardMaterial({
    color: 0xd5dce3,
    roughness: 0.35,
    metalness: 0.3
  });

  const seekerGlassMat = new THREE.MeshStandardMaterial({
    color: 0x101824,
    roughness: 0.06,
    metalness: 0.88
  });

  const abOuterMat = new THREE.MeshBasicMaterial({
    color: 0xff5e00,
    transparent: true,
    opacity: 0.62,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const abCoreMat = new THREE.MeshBasicMaterial({
    color: 0xfff3b0,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const abShockMat = new THREE.MeshBasicMaterial({
    color: 0x68d8ff,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  // ---------------------------------------------------------------------------
  // 2. GEOMETRY HELPERS (LOFTED FACETED SURFACES & BICONVEX AIRFOILS)
  // ---------------------------------------------------------------------------

  /**
   * Builds a faceted lofted BufferGeometry from ordered Z-stations.
   * Each station is an array of [x, y, z] vertices arranged clockwise when
   * looking from +Z toward -Z.
   */
  function buildLoftedGeometry(stations, closeFront = false, closeBack = false, flatShaded = true) {
    const indices = [];
    const positions = [];
    const ringSize = stations[0].length;

    for (let s = 0; s < stations.length; s++) {
      for (let p = 0; p < ringSize; p++) {
        const pt = stations[s][p];
        positions.push(pt[0], pt[1], pt[2]);
      }
    }

    for (let s = 0; s < stations.length - 1; s++) {
      const currOff = s * ringSize;
      const nextOff = (s + 1) * ringSize;
      for (let p = 0; p < ringSize; p++) {
        const pNext = (p + 1) % ringSize;
        const a = currOff + p;
        const b = nextOff + p;
        const c = nextOff + pNext;
        const d = currOff + pNext;
        indices.push(a, b, c);
        indices.push(a, c, d);
      }
    }

    if (closeFront) {
      const center = [0, 0, 0];
      for (let p = 0; p < ringSize; p++) {
        center[0] += stations[0][p][0];
        center[1] += stations[0][p][1];
        center[2] += stations[0][p][2];
      }
      center[0] /= ringSize;
      center[1] /= ringSize;
      center[2] /= ringSize;
      const cIdx = positions.length / 3;
      positions.push(center[0], center[1], center[2]);
      for (let p = 0; p < ringSize; p++) {
        indices.push(cIdx, (p + 1) % ringSize, p);
      }
    }

    if (closeBack) {
      const lastS = stations.length - 1;
      const baseOff = lastS * ringSize;
      const center = [0, 0, 0];
      for (let p = 0; p < ringSize; p++) {
        center[0] += stations[lastS][p][0];
        center[1] += stations[lastS][p][1];
        center[2] += stations[lastS][p][2];
      }
      center[0] /= ringSize;
      center[1] /= ringSize;
      center[2] /= ringSize;
      const cIdx = positions.length / 3;
      positions.push(center[0], center[1], center[2]);
      for (let p = 0; p < ringSize; p++) {
        indices.push(cIdx, baseOff + p, baseOff + ((p + 1) % ringSize));
      }
    }

    let geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setIndex(indices);
    if (flatShaded) {
      geom = geom.toNonIndexed();
    }
    geom.computeVertexNormals();
    return geom;
  }

  /**
   * Generates a 6-vertex biconvex stealth airfoil rib at a given spanwise station.
   */
  function makeAirfoilRib(x, yCenter, zLE, zTE, halfThick, sideSign = 1) {
    const chord = zTE - zLE;
    const zFwd = zLE + chord * 0.32;
    const zAft = zLE + chord * 0.72;
    const pts = [
      [x, yCenter, zLE],
      [x, yCenter + halfThick, zFwd],
      [x, yCenter + halfThick * 0.72, zAft],
      [x, yCenter, zTE],
      [x, yCenter - halfThick * 0.72, zAft],
      [x, yCenter - halfThick, zFwd]
    ];
    return sideSign < 0 ? pts.reverse() : pts;
  }

  // ---------------------------------------------------------------------------
  // 3. FACETED FUSELAGE & CONTINUOUS RAZOR CHINES (-7.5 to +4.75)
  // ---------------------------------------------------------------------------
  function makeFuselageRing(z, yTop, xDeck, yDeck, xChine, yChine, xBelly, yBelly, yBot) {
    return [
      [0, yTop, z],
      [xDeck, yDeck, z],
      [xChine, yChine, z],
      [xBelly, yBelly, z],
      [0, yBot, z],
      [-xBelly, yBelly, z],
      [-xChine, yChine, z],
      [-xDeck, yDeck, z]
    ];
  }

  // Dielectric dark radome tip (-7.50 to -6.75)
  const noseTipStations = [
    makeFuselageRing(-7.50, -0.14, 0.005, -0.14, 0.01, -0.14, 0.005, -0.145, -0.145),
    makeFuselageRing(-6.75,  0.02, 0.16,  -0.01, 0.36, -0.13, 0.20,  -0.25,  -0.28)
  ];
  const noseTipMesh = new THREE.Mesh(
    buildLoftedGeometry(noseTipStations, true, false, true),
    darkMat
  );
  hiDetail.add(noseTipMesh);

  // Main faceted stealth fuselage (-6.75 to +4.75)
  const fuselageStations = [
    makeFuselageRing(-6.75, 0.02, 0.16, -0.01, 0.36, -0.13, 0.20, -0.25, -0.28),
    makeFuselageRing(-5.60, 0.20, 0.34,  0.14, 0.68, -0.09, 0.42, -0.39, -0.43),
    makeFuselageRing(-4.45, 0.38, 0.50,  0.30, 0.98, -0.03, 0.64, -0.50, -0.54),
    makeFuselageRing(-2.55, 0.48, 0.62,  0.40, 1.32,  0.04, 0.96, -0.58, -0.62),
    makeFuselageRing(-0.90, 0.56, 0.88,  0.47, 1.56,  0.08, 1.28, -0.64, -0.68),
    makeFuselageRing( 1.65, 0.54, 1.12,  0.45, 1.64,  0.10, 1.36, -0.62, -0.65),
    makeFuselageRing( 3.55, 0.44, 1.06,  0.36, 1.46,  0.07, 1.20, -0.48, -0.50),
    makeFuselageRing( 4.75, 0.32, 0.96,  0.26, 1.18,  0.03, 1.02, -0.34, -0.36)
  ];
  const fuselageMesh = new THREE.Mesh(
    buildLoftedGeometry(fuselageStations, false, true, true),
    bodyMat
  );
  hiDetail.add(fuselageMesh);

  // Centerline tail boom stinger extending between nozzles to Z = +5.55
  const tailBoomStations = [
    makeFuselageRing(4.65, 0.24, 0.14, 0.20, 0.22, 0.02, 0.14, -0.18, -0.22),
    makeFuselageRing(5.55, 0.04, 0.04, 0.03, 0.09, 0.00, 0.04, -0.04, -0.05)
  ];
  const tailBoomMesh = new THREE.Mesh(
    buildLoftedGeometry(tailBoomStations, false, true, true),
    bodyMat
  );
  hiDetail.add(tailBoomMesh);

  // Dorsal spine electronics fairing & ventral weapons bay seam details
  const dorsalSpineGeo = new THREE.BoxGeometry(0.68, 0.12, 3.8);
  const dorsalSpine = new THREE.Mesh(dorsalSpineGeo, bodyMat);
  dorsalSpine.position.set(0, 0.53, 1.15);
  hiDetail.add(dorsalSpine);

  const dorsalRamPanel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 2.2), darkMat);
  dorsalRamPanel.position.set(0, 0.595, 1.35);
  hiDetail.add(dorsalRamPanel);

  // Ventral main internal weapons bay doors (sawtooth stealth seam lines)
  for (let side of [-1, 1]) {
    const baySeam = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 3.1), darkMat);
    baySeam.position.set(side * 0.52, -0.66, 0.65);
    hiDetail.add(baySeam);
  }
  const centerBaySeam = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.02, 3.1), darkMat);
  centerBaySeam.position.set(0, -0.67, 0.65);
  hiDetail.add(centerBaySeam);

  // ---------------------------------------------------------------------------
  // 4. DUAL CARET SUPERSONIC STEALTH AIR INTAKES (Y-DUCTS)
  // ---------------------------------------------------------------------------
  for (let side of [-1, 1]) {
    const intakeGroup = new THREE.Group();

    // Boundary-layer diverter splitter plate (stands off from forward fuselage)
    const diverterPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.52, 1.35),
      darkMat
    );
    diverterPlate.position.set(side * 0.94, -0.26, -1.75);
    intakeGroup.add(diverterPlate);

    // Caret outer & lower nacelle duct loft (-2.25 to +2.85)
    const caretStations = [
      // Angled caret leading lip at Z = -2.25
      [
        [side * 0.98,  0.04, -2.35],
        [side * 1.62,  0.02, -1.95],
        [side * 1.48, -0.58, -1.65],
        [side * 0.95, -0.58, -1.75]
      ],
      // Mid intake cheek (houses side AIM-9 bay)
      [
        [side * 1.05,  0.06, -0.45],
        [side * 1.72,  0.04, -0.45],
        [side * 1.56, -0.62, -0.45],
        [side * 1.02, -0.62, -0.45]
      ],
      // Aft nacelle blend into engine bay
      [
        [side * 1.02,  0.05,  2.85],
        [side * 1.48,  0.05,  2.85],
        [side * 1.30, -0.52,  2.85],
        [side * 0.98, -0.52,  2.85]
      ]
    ];
    if (side < 0) {
      for (let s = 0; s < caretStations.length; s++) {
        caretStations[s].reverse();
      }
    }
    const caretNacelle = new THREE.Mesh(
      buildLoftedGeometry(caretStations, false, true, true),
      bodyMat
    );
    intakeGroup.add(caretNacelle);

    // Deep shadowed dark intake interior cavity + angled Y-duct blocker ramp
    const intakeThroat = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.52, 1.45),
      darkMat
    );
    intakeThroat.position.set(side * 1.28, -0.27, -1.32);
    intakeThroat.rotation.y = side * -0.14;
    intakeGroup.add(intakeThroat);

    // Sharp caret lip stealth RAM trim
    const lipTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.04, 0.45),
      darkMat
    );
    lipTrim.position.set(side * 1.30, 0.03, -2.12);
    lipTrim.rotation.y = side * -0.52;
    intakeGroup.add(lipTrim);

    hiDetail.add(intakeGroup);
  }

  // ---------------------------------------------------------------------------
  // 5. COCKPIT TUB, HUD, MARTIN-BAKER EJECTION SEAT, PILOT & GOLD CANOPY
  // ---------------------------------------------------------------------------
  const cockpitGroup = new THREE.Group();

  // Recessed cockpit tub & glare-shield coaming
  const cockpitTub = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.34, 2.75),
    darkMat
  );
  cockpitTub.position.set(0, 0.42, -2.85);
  cockpitGroup.add(cockpitTub);

  const forwardCoaming = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 0.22, 0.85),
    darkMat
  );
  forwardCoaming.position.set(0, 0.52, -3.95);
  forwardCoaming.rotation.x = 0.22;
  cockpitGroup.add(forwardCoaming);

  // Glowing green HUD combiner plate (emissive: 0x00ff9d) & frame rails
  const hudCombiner = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.28),
    hudMat
  );
  hudCombiner.position.set(0, 0.74, -3.68);
  hudCombiner.rotation.x = -0.46;
  cockpitGroup.add(hudCombiner);

  for (let side of [-1, 1]) {
    const hudStrut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.30, 6),
      darkMat
    );
    hudStrut.position.set(side * 0.18, 0.73, -3.68);
    hudStrut.rotation.x = -0.46;
    cockpitGroup.add(hudStrut);
  }

  // Martin-Baker ACES II Ejection Seat
  const seatGroup = new THREE.Group();
  seatGroup.position.set(0, 0.44, -2.72);
  seatGroup.rotation.x = -0.28; // Reclined high-G posture

  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.78, 0.12), darkMat);
  seatBack.position.set(0, 0.28, 0.12);
  seatGroup.add(seatBack);

  const seatPan = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.46), darkMat);
  seatPan.position.set(0, -0.08, -0.12);
  seatGroup.add(seatPan);

  // Twin ejection guide rails & parachute headbox
  const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.18), darkMat);
  headBox.position.set(0, 0.74, 0.10);
  seatGroup.add(headBox);

  for (let side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.92, 0.08), nozzleMat);
    rail.position.set(side * 0.21, 0.38, 0.15);
    seatGroup.add(rail);

    const headWing = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.16), teamMat);
    headWing.position.set(side * 0.19, 0.74, 0.06);
    seatGroup.add(headWing);
  }
  cockpitGroup.add(seatGroup);

  // Pilot Torso, HGU-55/P Helmet & Gold Visor
  const pilotTorso = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.46, 0.28),
    darkMat
  );
  pilotTorso.position.set(0, 0.56, -2.78);
  pilotTorso.rotation.x = -0.22;
  cockpitGroup.add(pilotTorso);

  const helmetGroup = new THREE.Group();
  helmetGroup.position.set(0, 0.88, -2.74);

  const helmetShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.165, 16, 14),
    bodyMat
  );
  helmetShell.scale.set(0.92, 1.0, 1.08);
  helmetGroup.add(helmetShell);

  const goldVisor = new THREE.Mesh(
    new THREE.SphereGeometry(0.158, 16, 12, 0, Math.PI * 2, 0.35, 1.15),
    visorMat
  );
  goldVisor.position.set(0, 0.01, -0.035);
  goldVisor.rotation.x = -1.25;
  helmetGroup.add(goldVisor);

  const oxygenMask = new THREE.Mesh(
    new THREE.ConeGeometry(0.085, 0.16, 8),
    darkMat
  );
  oxygenMask.position.set(0, -0.06, -0.14);
  oxygenMask.rotation.x = -Math.PI * 0.42;
  helmetGroup.add(oxygenMask);

  cockpitGroup.add(helmetGroup);

  // Frameless Teardrop Bubble Canopy (Indium-Gold Tinted)
  function makeCanopyRing(z, width, height, yBase) {
    return [
      [0, yBase + height, z],
      [width * 0.68, yBase + height * 0.76, z],
      [width, yBase + height * 0.22, z],
      [width * 0.92, yBase, z],
      [-width * 0.92, yBase, z],
      [-width, yBase + height * 0.22, z],
      [-width * 0.68, yBase + height * 0.76, z]
    ];
  }

  const canopyStations = [
    makeCanopyRing(-4.72, 0.04, 0.02, 0.36),
    makeCanopyRing(-4.05, 0.38, 0.34, 0.42),
    makeCanopyRing(-3.10, 0.54, 0.58, 0.46),
    makeCanopyRing(-2.15, 0.50, 0.50, 0.50),
    makeCanopyRing(-1.25, 0.32, 0.24, 0.53),
    makeCanopyRing(-0.65, 0.08, 0.03, 0.55)
  ];
  const canopyMesh = new THREE.Mesh(
    buildLoftedGeometry(canopyStations, true, true, false),
    canopyGlassMat
  );
  cockpitGroup.add(canopyMesh);

  // Canopy base sill frame
  const canopyFrameStations = [
    makeCanopyRing(-4.74, 0.06, 0.03, 0.35),
    makeCanopyRing(-4.05, 0.41, 0.09, 0.40),
    makeCanopyRing(-3.10, 0.57, 0.10, 0.44),
    makeCanopyRing(-2.15, 0.53, 0.10, 0.48),
    makeCanopyRing(-1.25, 0.35, 0.08, 0.51),
    makeCanopyRing(-0.62, 0.10, 0.04, 0.54)
  ];
  const canopyFrameMesh = new THREE.Mesh(
    buildLoftedGeometry(canopyFrameStations, true, true, true),
    bodyMat
  );
  cockpitGroup.add(canopyFrameMesh);

  hiDetail.add(cockpitGroup);

  // ---------------------------------------------------------------------------
  // 6. DIAMOND-DELTA MAIN WINGS & TEAM IDENTITY STRIPES (SPAN ≈ 11.5 UNITS)
  // ---------------------------------------------------------------------------
  for (let side of [-1, 1]) {
    // Three-station lofted biconvex airfoil capturing the F-22 diamond planform
    const wingRibs = [
      // Root rib blended into upper fuselage chine
      makeAirfoilRib(side * 1.36, 0.08, -1.45, 3.65, 0.14, side),
      // Mid-span trailing-edge forward sweep kink
      makeAirfoilRib(side * 3.15, 0.06,  0.15, 3.88, 0.09, side),
      // Clipped supersonic wingtip at X = ±5.62
      makeAirfoilRib(side * 5.62, 0.04,  2.25, 3.38, 0.032, side)
    ];
    const wingMesh = new THREE.Mesh(
      buildLoftedGeometry(wingRibs, false, true, true),
      bodyMat
    );
    hiDetail.add(wingMesh);

    // Distinct Team Identity Stripe across outer wing panel (using teamMat)
    const stripeRibs = [
      makeAirfoilRib(side * 4.35, 0.05, 1.18, 3.58, 0.058, side),
      makeAirfoilRib(side * 5.15, 0.044, 1.85, 3.45, 0.044, side)
    ];
    const wingStripeMesh = new THREE.Mesh(
      buildLoftedGeometry(stripeRibs, true, true, true),
      teamMat
    );
    hiDetail.add(wingStripeMesh);

    // Flaperon & aileron actuator seam lines
    const flaperonSeam = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.09, 0.03),
      darkMat
    );
    flaperonSeam.position.set(side * 2.55, 0.06, 3.42);
    flaperonSeam.rotation.y = side * -0.12;
    hiDetail.add(flaperonSeam);
  }

  // ---------------------------------------------------------------------------
  // 7. TWIN CANTED VERTICAL STABILIZERS (28° OUTWARD CANT)
  // ---------------------------------------------------------------------------
  const cantAngle = (28 * Math.PI) / 180; // 28 degrees outward cant

  for (let side of [-1, 1]) {
    const tailFinGroup = new THREE.Group();
    tailFinGroup.position.set(side * 1.04, 0.28, 3.85);
    tailFinGroup.rotation.z = -side * cantAngle;

    // Build vertical fin using spanwise airfoil ribs along local +Y
    function makeFinRib(yLocal, zLE, zTE, halfThick) {
      const chord = zTE - zLE;
      const zFwd = zLE + chord * 0.34;
      const zAft = zLE + chord * 0.72;
      return [
        [0, yLocal, zLE],
        [ halfThick, yLocal, zFwd],
        [ halfThick * 0.72, yLocal, zAft],
        [0, yLocal, zTE],
        [-halfThick * 0.72, yLocal, zAft],
        [-halfThick, yLocal, zFwd]
      ];
    }

    const finStations = [
      makeFinRib(0.00, -1.25, 1.25, 0.085),
      makeFinRib(1.58,  0.15, 1.42, 0.042),
      makeFinRib(1.98,  0.52, 1.48, 0.026)
    ];
    const finMesh = new THREE.Mesh(
      buildLoftedGeometry(finStations, true, true, true),
      bodyMat
    );
    tailFinGroup.add(finMesh);

    // Prominent Team Identity Tail Flash Band near top of vertical stabilizer
    const tailStripeStations = [
      makeFinRib(1.56, 0.13, 1.41, 0.046),
      makeFinRib(1.84, 0.39, 1.46, 0.035)
    ];
    const tailStripeMesh = new THREE.Mesh(
      buildLoftedGeometry(tailStripeStations, true, true, true),
      teamMat
    );
    tailFinGroup.add(tailStripeMesh);

    // Dielectric dark tip cap at top of stabilizer
    const tipCapStations = [
      makeFinRib(1.85, 0.40, 1.46, 0.034),
      makeFinRib(2.02, 0.56, 1.48, 0.024)
    ];
    const tipCapMesh = new THREE.Mesh(
      buildLoftedGeometry(tipCapStations, true, true, true),
      darkMat
    );
    tailFinGroup.add(tipCapMesh);

    // Trailing-edge rudder hinge seam & actuator fairing
    const rudderSeam = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.48, 0.025),
      darkMat
    );
    rudderSeam.position.set(0, 0.88, 1.05);
    rudderSeam.rotation.x = 0.14;
    tailFinGroup.add(rudderSeam);

    hiDetail.add(tailFinGroup);
  }

  // ---------------------------------------------------------------------------
  // 8. ALL-MOVING TAILERON STABILATORS (leftElev & rightElev)
  // ---------------------------------------------------------------------------
  function createTaileron(side) {
    const elevGroup = new THREE.Group();
    // Positioned at the physical titanium pivot shaft so .rotation.x pitches cleanly
    elevGroup.position.set(side * 1.22, 0.04, 4.85);

    // Pivot spindle barrel
    const pivotShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.32, 8),
      nozzleMat
    );
    pivotShaft.rotation.z = Math.PI / 2;
    elevGroup.add(pivotShaft);

    // Local coordinates relative to pivot (X = 0 at root, Z = 0 at pivot axis)
    const rootRib = makeAirfoilRib(0.0, 0, -1.05, 1.35, 0.065, side);
    const tipRib = makeAirfoilRib(side * 2.38, 0, 0.55, 1.95, 0.022, side);

    const elevMesh = new THREE.Mesh(
      buildLoftedGeometry([rootRib, tipRib], true, true, true),
      bodyMat
    );
    elevGroup.add(elevMesh);

    // Team accent trim along clipped taileron outer edge
    const tipTrimRibInner = makeAirfoilRib(side * 2.12, 0, 0.38, 1.88, 0.028, side);
    const tipTrimRibOuter = makeAirfoilRib(side * 2.40, 0, 0.56, 1.96, 0.024, side);
    const elevTrimMesh = new THREE.Mesh(
      buildLoftedGeometry([tipTrimRibInner, tipTrimRibOuter], true, true, true),
      teamMat
    );
    elevGroup.add(elevTrimMesh);

    return elevGroup;
  }

  const leftElev = createTaileron(-1);
  const rightElev = createTaileron(1);
  hiDetail.add(leftElev);
  hiDetail.add(rightElev);

  // ---------------------------------------------------------------------------
  // 9. 2D RECTANGULAR VECTORING NOZZLES & AFTERBURNER GROUP (abGroup)
  // ---------------------------------------------------------------------------
  const abGroup = new THREE.Group();
  hiDetail.add(abGroup);

  for (let side of [-1, 1]) {
    const engineX = side * 0.56;
    const engineY = -0.03;
    const nozzleGroup = new THREE.Group();
    nozzleGroup.position.set(engineX, engineY, 4.72);

    // Outer stealth caret fairing housing
    const shroudTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.08, 0.62),
      bodyMat
    );
    shroudTop.position.set(0, 0.25, 0.22);
    shroudTop.rotation.x = 0.12;
    nozzleGroup.add(shroudTop);

    const shroudBot = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.08, 0.62),
      bodyMat
    );
    shroudBot.position.set(0, -0.25, 0.22);
    shroudBot.rotation.x = -0.12;
    nozzleGroup.add(shroudBot);

    // Upper & lower 2D titanium vectoring expansion petals (nozzleMat)
    for (let vSign of [-1, 1]) {
      const petal = new THREE.Mesh(
        new THREE.BoxGeometry(0.76, 0.055, 0.78),
        nozzleMat
      );
      petal.position.set(0, vSign * 0.19, 0.39);
      petal.rotation.x = vSign * 0.14;
      nozzleGroup.add(petal);

      // Inner segmented ceramic thermal heat tiles
      const tileLiner = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.03, 0.74),
        ceramicTileMat
      );
      tileLiner.position.set(0, vSign * 0.155, 0.38);
      tileLiner.rotation.x = vSign * 0.14;
      nozzleGroup.add(tileLiner);

      // External titanium reinforcement ribs + ceramic tile striations
      for (let r = -3; r <= 3; r++) {
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.04, 0.74),
          darkMat
        );
        rib.position.set(r * 0.105, vSign * 0.215, 0.39);
        rib.rotation.x = vSign * 0.14;
        nozzleGroup.add(rib);
      }
    }

    // Side containment walls of the 2D rectangular nozzle
    for (let hSign of [-1, 1]) {
      const sideWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.44, 0.76),
        nozzleMat
      );
      sideWall.position.set(hSign * 0.38, 0, 0.38);
      nozzleGroup.add(sideWall);
    }

    // Internal turbine flameholder face
    const flameholder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.12, 16),
      darkMat
    );
    flameholder.rotation.x = Math.PI / 2;
    flameholder.position.set(0, 0, 0.05);
    nozzleGroup.add(flameholder);

    hiDetail.add(nozzleGroup);

    // --- AFTERBURNER FLAME CONES & MACH SHOCK DIAMONDS (Added to abGroup) ---
    const plumeUnit = new THREE.Group();
    plumeUnit.position.set(engineX, engineY, 5.10);

    // Outer turbulent plasma cone extending along +Z
    const outerConeGeo = new THREE.ConeGeometry(0.30, 1.95, 16, 1, true);
    outerConeGeo.rotateX(Math.PI / 2);
    outerConeGeo.translate(0, 0, 0.975);
    const outerCone = new THREE.Mesh(outerConeGeo, abOuterMat);
    outerCone.scale.set(1.18, 0.65, 1.0); // Match 2D rectangular nozzle aspect ratio
    plumeUnit.add(outerCone);

    // Inner white-hot supersonic core cone
    const coreConeGeo = new THREE.ConeGeometry(0.20, 1.35, 12, 1, false);
    coreConeGeo.rotateX(Math.PI / 2);
    coreConeGeo.translate(0, 0, 0.675);
    const coreCone = new THREE.Mesh(coreConeGeo, abCoreMat);
    coreCone.scale.set(1.15, 0.62, 1.0);
    plumeUnit.add(coreCone);

    // Glowing Mach shock diamond rings
    for (let d = 0; d < 4; d++) {
      const shockRing = new THREE.Mesh(
        new THREE.RingGeometry(0.05, 0.18 * (1 - d * 0.18), 12),
        abShockMat
      );
      shockRing.position.set(0, 0, 0.28 + d * 0.36);
      shockRing.scale.set(1.2, 0.68, 1.0);
      plumeUnit.add(shockRing);
    }

    abGroup.add(plumeUnit);
  }

  // ---------------------------------------------------------------------------
  // 10. WINGTIP LAU-128 LAUNCH RAILS & AIM-9X SIDEWINDER MISSILES
  // ---------------------------------------------------------------------------
  for (let side of [-1, 1]) {
    const stationGroup = new THREE.Group();
    stationGroup.position.set(side * 5.66, 0.04, 2.75);

    // LAU-128 Low-Observable Wingtip Launch Rail
    const lauRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.12, 1.68),
      darkMat
    );
    lauRail.position.set(0, 0, 0);
    stationGroup.add(lauRail);

    const lauFairing = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.08, 1.32),
      bodyMat
    );
    lauFairing.position.set(-side * 0.03, 0, 0.05);
    stationGroup.add(lauFairing);

    // AIM-9X Sidewinder Air-to-Air Missile
    const missileGroup = new THREE.Group();
    missileGroup.position.set(side * 0.08, -0.01, -0.12);

    // Slender cylindrical fuselage (length = 2.15 units, pointing -Z)
    const bodyTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 2.05, 12),
      missileBodyMat
    );
    bodyTube.rotation.x = Math.PI / 2;
    missileGroup.add(bodyTube);

    // Infrared hemispherical seeker dome & dark guidance collar at nose (-Z)
    const seekerCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.052, 0.16, 12),
      darkMat
    );
    seekerCollar.rotation.x = Math.PI / 2;
    seekerCollar.position.set(0, 0, -1.10);
    missileGroup.add(seekerCollar);

    const seekerDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.046, 12, 10),
      seekerGlassMat
    );
    seekerDome.position.set(0, 0, -1.18);
    missileGroup.add(seekerDome);

    // Tactical warhead/motor band markings
    const warheadBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.054, 0.054, 0.09, 12),
      teamMat
    );
    warheadBand.rotation.x = Math.PI / 2;
    warheadBand.position.set(0, 0, -0.45);
    missileGroup.add(warheadBand);

    // Mid-body wiring harness strake
    const midStrake = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.02, 1.15),
      darkMat
    );
    midStrake.position.set(0, 0.052, 0.12);
    missileGroup.add(midStrake);

    // Cruciform (X-configuration) forward steerable canards & rear stabilizer fins
    const canardShape = new THREE.BufferGeometry();
    canardShape.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        0, 0, -0.12,
        0.16, 0, 0.06,
        0, 0, 0.08,
        0, 0, -0.12,
        0, 0, 0.08,
        0.16, 0, 0.06
      ], 3)
    );
    canardShape.computeVertexNormals();

    const rearFinShape = new THREE.BufferGeometry();
    rearFinShape.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([
        0, 0, -0.22,
        0.21, 0, -0.04,
        0.21, 0, 0.14,
        0, 0, -0.22,
        0.21, 0, 0.14,
        0, 0, 0.14
      ], 3)
    );
    rearFinShape.computeVertexNormals();

    for (let f = 0; f < 4; f++) {
      const angle = Math.PI / 4 + (f * Math.PI) / 2;

      const canard = new THREE.Mesh(canardShape, darkMat);
      canard.position.set(0, 0, -0.78);
      canard.rotation.z = angle;
      missileGroup.add(canard);

      const canardBack = new THREE.Mesh(canardShape, darkMat);
      canardBack.position.set(0, 0, -0.78);
      canardBack.rotation.z = angle;
      canardBack.scale.y = -1;
      missileGroup.add(canardBack);

      const rearFin = new THREE.Mesh(rearFinShape, darkMat);
      rearFin.position.set(0, 0, 0.86);
      rearFin.rotation.z = angle;
      missileGroup.add(rearFin);
    }

    // Solid rocket motor exhaust nozzle
    const missileNozzle = new THREE.Mesh(
      new THREE.ConeGeometry(0.046, 0.10, 10, 1, true),
      nozzleMat
    );
    missileNozzle.rotation.x = -Math.PI / 2;
    missileNozzle.position.set(0, 0, 1.06);
    missileGroup.add(missileNozzle);

    stationGroup.add(missileGroup);
    hiDetail.add(stationGroup);
  }

  return { leftElev, rightElev, abGroup };
}

/**
 * Builds the "Viper" Lightweight Apex Interceptor (F-16V / Gripen E Hybrid)
 * Orientation: Nose -Z (Z = -7.8, Pitot to -8.8), Tail +Z (Z = +5.2), Left -X, Right +X, Dorsal +Y
 *
 * @param {THREE.Group} hiDetail - Target group to populate with airframe meshes
 * @param {THREE.Material} bodyMat - Primary airframe paint material
 * @param {THREE.Material} darkMat - Dark composite/radome/cockpit tub material
 * @param {THREE.Material} teamMat - Squadron livery accent material
 * @param {THREE.Material} nozzleMat - Metallic titanium/exhaust material
 * @returns {Object} { leftElev, rightElev, abGroup }
 */
function buildViperAirframe(hiDetail, bodyMat, darkMat, teamMat, nozzleMat) {
  // --- INTERNAL SPECIALIZED MATERIALS ---
  const canopyGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a2838,
    emissive: 0x050a10,
    roughness: 0.08,
    metalness: 0.15,
    transmission: 0.72,
    transparent: true,
    opacity: 0.65,
    ior: 1.5,
    reflectivity: 0.9,
    side: THREE.DoubleSide
  });

  const hudGlassMat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });

  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x050508,
    roughness: 0.05,
    metalness: 0.92
  });

  const cavityMat = new THREE.MeshBasicMaterial({
    color: 0x030406
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xd8e0e8,
    roughness: 0.2,
    metalness: 0.95
  });

  const abCoreMat = new THREE.MeshBasicMaterial({
    color: 0xff7722,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const abInnerBlueMat = new THREE.MeshBasicMaterial({
    color: 0x44aaff,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const extrudeWingOpts = (depth, bevel = 0.025) => ({
    depth: depth,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel
  });

  // Helper to enable shadows cleanly
  const addMesh = (parent, geo, mat, pos, rot, scale) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ============================================================================
  // 1. CONICAL NEEDLE RADOME, CHINES & TITANIUM PITOT BOOM (Z = -8.8 to -4.8)
  // ============================================================================
  const noseGroup = new THREE.Group();
  hiDetail.add(noseGroup);

  // Main ogive radome (Z = -7.8 to -5.1)
  const radomeLen = 2.7;
  const radomeGeo = new THREE.ConeGeometry(0.58, radomeLen, 28, 8);
  radomeGeo.rotateX(-Math.PI / 2);
  // Flatten cross-section slightly for viper chine shark-nose look
  const rPos = radomeGeo.attributes.position;
  for (let i = 0; i < rPos.count; i++) {
    let x = rPos.getX(i);
    let y = rPos.getY(i);
    let z = rPos.getZ(i);
    const t = (z + radomeLen / 2) / radomeLen; // 0 at tip, 1 at base
    if (Math.abs(x) > 0.15) {
      y *= 0.82; // Sharpen horizontal side chines
      x *= 1.12;
    }
    // Slight droop on the nose tip
    y -= Math.pow(1 - t, 2) * 0.08;
    rPos.setXYZ(i, x, y, z);
  }
  radomeGeo.computeVertexNormals();
  addMesh(noseGroup, radomeGeo, darkMat, [0, -0.02, -6.45]);

  // Radome lightning diverter strips & metallic ring seal
  const ringSealGeo = new THREE.TorusGeometry(0.57, 0.015, 8, 28);
  addMesh(noseGroup, ringSealGeo, chromeMat, [0, -0.02, -5.1], [0, 0, 0], [1.12, 0.82, 1]);

  // Forward fuselage transition barrel (Z = -5.1 to -2.2)
  const fwdBarrelGeo = new THREE.CylinderGeometry(0.68, 0.58, 2.9, 28, 4);
  fwdBarrelGeo.rotateX(Math.PI / 2);
  addMesh(noseGroup, fwdBarrelGeo, bodyMat, [0, 0.04, -3.65], null, [1.14, 0.9, 1]);

  // Titanium Pitot Boom protruding from Z = -7.75 out to Z = -8.80
  const pitotBaseGeo = new THREE.ConeGeometry(0.032, 0.35, 12);
  pitotBaseGeo.rotateX(-Math.PI / 2);
  addMesh(noseGroup, pitotBaseGeo, chromeMat, [0, -0.1, -7.85]);

  const pitotNeedleGeo = new THREE.CylinderGeometry(0.006, 0.016, 0.95, 10);
  pitotNeedleGeo.rotateX(Math.PI / 2);
  addMesh(noseGroup, pitotNeedleGeo, chromeMat, [0, -0.1, -8.325]);

  // Alpha/Beta AoA vanes on pitot boom & nose sides
  const vaneGeo = new THREE.BoxGeometry(0.08, 0.008, 0.03);
  addMesh(noseGroup, vaneGeo, chromeMat, [0, -0.1, -8.45]);
  addMesh(noseGroup, vaneGeo, chromeMat, [0.58, -0.02, -4.6], [0, 0.2, 0]);
  addMesh(noseGroup, vaneGeo, chromeMat, [-0.58, -0.02, -4.6], [0, -0.2, 0]);

  // ============================================================================
  // 2. UNDERSLUNG OVAL CHIN AIR INTAKE & SPLITTER PLATE (Z = -4.2 to +1.5)
  // ============================================================================
  const intakeGroup = new THREE.Group();
  hiDetail.add(intakeGroup);

  // Boundary-layer splitter plate & standoff struts under the nose/cockpit
  const splitterShape = new THREE.Shape();
  splitterShape.moveTo(-0.48, 0);
  splitterShape.lineTo(0.48, 0);
  splitterShape.lineTo(0.56, 1.8);
  splitterShape.lineTo(-0.56, 1.8);
  splitterShape.closePath();
  const splitterGeo = new THREE.ExtrudeGeometry(splitterShape, extrudeWingOpts(0.025, 0.008));
  splitterGeo.rotateX(Math.PI / 2);
  addMesh(intakeGroup, splitterGeo, bodyMat, [0, -0.42, -4.35]);

  // Standoff wedge between fuselage bottom and splitter plate
  const wedgeGeo = new THREE.BoxGeometry(0.65, 0.14, 1.9);
  addMesh(intakeGroup, wedgeGeo, darkMat, [0, -0.35, -3.4]);

  // Outer Oval Intake Cowl Lip (raked forward at the bottom like F-16 DSI / MCID)
  const intakeCowlGeo = new THREE.CylinderGeometry(0.58, 0.65, 4.8, 28, 4, true);
  intakeCowlGeo.rotateX(Math.PI / 2);
  const cPos = intakeCowlGeo.attributes.position;
  for (let i = 0; i < cPos.count; i++) {
    let x = cPos.getX(i);
    let y = cPos.getY(i);
    let z = cPos.getZ(i);
    // Flatten into wide smiling oval
    x *= 1.25;
    y *= 0.62;
    // Rake lip forward at Z = -2.4
    if (z < -1.5 && y < 0) {
      z -= (0 - y) * 0.55;
    }
    cPos.setXYZ(i, x, y, z);
  }
  intakeCowlGeo.computeVertexNormals();
  const cowlMat = bodyMat.clone ? bodyMat.clone() : bodyMat;
  cowlMat.side = THREE.DoubleSide;
  addMesh(intakeGroup, intakeCowlGeo, cowlMat, [0, -0.72, -1.65]);

  // Sharp Intake Lip Accent Rim
  const lipRimGeo = new THREE.TorusGeometry(0.58, 0.032, 12, 32);
  addMesh(intakeGroup, lipRimGeo, teamMat, [0, -0.72, -4.02], [0.22, 0, 0], [1.22, 0.62, 1]);

  // Deep Shadowed Turbine Cavity & Compressor Face
  const ductPlugGeo = new THREE.CylinderGeometry(0.52, 0.48, 2.6, 24);
  ductPlugGeo.rotateX(Math.PI / 2);
  addMesh(intakeGroup, ductPlugGeo, cavityMat, [0, -0.72, -2.75], null, [1.18, 0.58, 1]);

  // Deep recessed Inlet Guide Vanes (IGV) / Compressor Fan spinner
  const fanDiskGeo = new THREE.CircleGeometry(0.45, 20);
  fanDiskGeo.rotateY(Math.PI);
  addMesh(intakeGroup, fanDiskGeo, nozzleMat, [0, -0.68, -1.42], null, [1.1, 0.65, 1]);
  const spinnerGeo = new THREE.ConeGeometry(0.14, 0.35, 16);
  spinnerGeo.rotateX(-Math.PI / 2);
  addMesh(intakeGroup, spinnerGeo, chromeMat, [0, -0.68, -1.55]);

  // ============================================================================
  // 3. CENTRAL FUSELAGE, DORSAL SPINE & MUSCULAR CFTs
  // ============================================================================
  const fuselageGroup = new THREE.Group();
  hiDetail.add(fuselageGroup);

  // Main Center/Aft Fuselage Core (Z = -2.2 to +3.6)
  const coreGeo = new THREE.CylinderGeometry(0.76, 0.72, 5.8, 32, 8);
  coreGeo.rotateX(Math.PI / 2);
  addMesh(fuselageGroup, coreGeo, bodyMat, [0, 0.0, 0.7], null, [1.18, 0.88, 1]);

  // Lower Belly Fairing bridging intake duct to tail nozzle (Z = +0.5 to +3.6)
  const bellyGeo = new THREE.CylinderGeometry(0.64, 0.52, 3.4, 24);
  bellyGeo.rotateX(Math.PI / 2);
  addMesh(fuselageGroup, bellyGeo, bodyMat, [0, -0.32, 2.0], null, [1.15, 0.72, 1]);

  // Dorsal Avionics Spine Fairing (Block 70 / Viper V-spine from canopy aft to tail)
  const spineGeo = new THREE.CylinderGeometry(0.32, 0.44, 5.2, 20, 6);
  spineGeo.rotateX(Math.PI / 2);
  const sPos = spineGeo.attributes.position;
  for (let i = 0; i < sPos.count; i++) {
    let x = sPos.getX(i);
    let y = sPos.getY(i);
    let z = sPos.getZ(i);
    // Taper down smoothly towards the rear nozzle
    const aftFactor = Math.max(0, (z + 2.6) / 5.2);
    y *= 1.0 - aftFactor * 0.35;
    x *= 1.0 - aftFactor * 0.25;
    sPos.setXYZ(i, x, y, z);
  }
  spineGeo.computeVertexNormals();
  addMesh(fuselageGroup, spineGeo, bodyMat, [0, 0.56, 1.05]);

  // Dorsal UHF/Tacan Blade Antennas & ECM bumps
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, 0);
  bladeShape.lineTo(0.28, 0);
  bladeShape.lineTo(0.18, 0.18);
  bladeShape.lineTo(0.06, 0.18);
  bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, extrudeWingOpts(0.018, 0.004));
  bladeGeo.rotateY(Math.PI / 2);
  addMesh(fuselageGroup, bladeGeo, teamMat, [-0.009, 0.86, 0.2]);
  addMesh(fuselageGroup, bladeGeo, darkMat, [-0.009, 0.42, -5.0], null, [0.7, 0.7, 0.7]);

  // 4. MUSCULAR CONFORMAL FUEL TANKS (CFTs) sculpted along upper fuselage shoulders
  [-1, 1].forEach((side) => {
    const cftLen = 5.4;
    const cftGeo = new THREE.CylinderGeometry(0.42, 0.36, cftLen, 20, 12);
    cftGeo.rotateX(Math.PI / 2);
    const pos = cftGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const normZ = z / (cftLen / 2); // -1 (front) to +1 (back)

      // Longitudinal aerodynamic pinch at nose and tail of CFT
      const pinch = Math.cos(normZ * Math.PI * 0.48);
      x *= pinch * 1.15;
      y *= pinch * 0.95;

      // Chiseled outer facet for aggressive stealthy F-16V shoulder profile
      if (x * side > 0.12 && y > 0.05) {
        y *= 0.85;
        x += side * 0.08 * pinch;
      }
      // Tuck inner side into fuselage spine
      if (x * side < 0) {
        x *= 0.5;
      }
      pos.setXYZ(i, x, y, z);
    }
    cftGeo.computeVertexNormals();
    addMesh(fuselageGroup, cftGeo, bodyMat, [side * 0.68, 0.38, 0.55], [0, side * -0.03, side * -0.18]);

    // CFT Team Accent Stripe along upper shoulder chine
    const stripeGeo = new THREE.BoxGeometry(0.08, 0.03, 3.6);
    addMesh(fuselageGroup, stripeGeo, teamMat, [side * 0.84, 0.58, 0.45], [0, side * -0.03, side * -0.25]);
  });

  // ============================================================================
  // 3. 360° TEARDROP BLOWN BUBBLE CANOPY, PILOT, HELMET & HUD (Z = -4.6 to -1.1)
  // ============================================================================
  const cockpitGroup = new THREE.Group();
  hiDetail.add(cockpitGroup);

  // Dark Cockpit Sill / Tub
  const tubGeo = new THREE.CylinderGeometry(0.52, 0.56, 3.2, 20);
  tubGeo.rotateX(Math.PI / 2);
  addMesh(cockpitGroup, tubGeo, darkMat, [0, 0.38, -2.9], null, [0.95, 0.45, 1]);

  // Coaming / Glare Shield & HUD Projector Base
  const coamingGeo = new THREE.BoxGeometry(0.56, 0.24, 0.75);
  addMesh(cockpitGroup, coamingGeo, darkMat, [0, 0.56, -4.05], [0.22, 0, 0]);

  // Dual-Combiner Wide-Angle Diffractive HUD Glass
  const hudFrameGeo = new THREE.BoxGeometry(0.26, 0.02, 0.24);
  addMesh(cockpitGroup, hudFrameGeo, darkMat, [0, 0.70, -3.92]);

  const hudPaneGeo = new THREE.PlaneGeometry(0.24, 0.26);
  addMesh(cockpitGroup, hudPaneGeo, hudGlassMat, [0, 0.82, -3.96], [0.68, 0, 0]);
  addMesh(cockpitGroup, hudPaneGeo, hudGlassMat, [0, 0.85, -3.86], [0.68, 0, 0], [0.92, 0.85, 1]);

  // ACES II Reclined Ejection Seat (30-degree F-16 tiltback)
  const seatGroup = new THREE.Group();
  seatGroup.position.set(0, 0.38, -2.95);
  seatGroup.rotation.x = -0.46; // 26.5° high-G recline
  cockpitGroup.add(seatGroup);

  addMesh(seatGroup, new THREE.BoxGeometry(0.42, 0.82, 0.12), darkMat, [0, 0.28, 0.15]); // Backrest
  addMesh(seatGroup, new THREE.BoxGeometry(0.28, 0.26, 0.18), darkMat, [0, 0.76, 0.14]); // Headbox / Parachute pack
  addMesh(seatGroup, new THREE.BoxGeometry(0.44, 0.12, 0.42), darkMat, [0, -0.08, -0.06]); // Seat pan

  // Pilot Torso & Shoulders
  const torsoGeo = new THREE.CylinderGeometry(0.18, 0.21, 0.52, 14);
  addMesh(seatGroup, torsoGeo, darkMat, [0, 0.22, -0.02], [0.15, 0, 0], [1.25, 1, 0.78]);

  // Detailed Pilot Helmet (JHMCS / Striker II style) & Dark Sun Visor
  const helmetGroup = new THREE.Group();
  helmetGroup.position.set(0, 0.62, -0.04);
  helmetGroup.rotation.x = 0.42; // Level head looking forward into HUD
  seatGroup.add(helmetGroup);

  const shellGeo = new THREE.SphereGeometry(0.145, 20, 16);
  addMesh(helmetGroup, shellGeo, teamMat, [0, 0, 0], null, [0.95, 1.05, 1.12]);

  // Sculpted Dark Sun Visor
  const visorGeo = new THREE.SphereGeometry(0.149, 20, 14, 0, Math.PI * 2, 0.35, 1.15);
  addMesh(helmetGroup, visorGeo, visorMat, [0, 0.01, -0.02], [-0.45, 0, 0], [0.96, 0.95, 1.08]);

  // Oxygen Mask & Hose
  const maskGeo = new THREE.ConeGeometry(0.075, 0.14, 10);
  maskGeo.rotateX(-Math.PI / 2);
  addMesh(helmetGroup, maskGeo, darkMat, [0, -0.06, -0.14], [0.35, 0, 0]);

  // 360° Unobstructed Teardrop Blown Bubble Canopy (Frameless forward view)
  const canopyLen = 3.55;
  const canopyGeo = new THREE.SphereGeometry(0.56, 32, 24, 0, Math.PI, 0, Math.PI);
  // Orient hemisphere so dome is +Y and length is along Z
  canopyGeo.rotateX(Math.PI / 2);
  const canPos = canopyGeo.attributes.position;
  for (let i = 0; i < canPos.count; i++) {
    let x = canPos.getX(i);
    let y = canPos.getY(i);
    let z = canPos.getZ(i);
    // Map unit sphere Z (-0.56 to +0.56) to teardrop length
    const normZ = z / 0.56; // -1 (front windshield) to +1 (aft tail of canopy)
    z = normZ * (canopyLen * 0.5);

    // Teardrop profile: bulbous over pilot head (normZ ~ -0.25), tapering aft
    const archFactor = normZ < -0.15
      ? Math.cos(((normZ + 0.15) / 0.85) * (Math.PI * 0.5))
      : Math.cos(((normZ + 0.15) / 1.15) * (Math.PI * 0.5));

    y = Math.max(0, y) * (0.98 * Math.pow(Math.max(0.01, archFactor), 0.72));
    // Pinch width slightly at waist for genuine "blown bubble" omega cross-section
    const bubbleBulge = y > 0.08 && y < 0.35 ? 1.08 : 0.96;
    x *= bubbleBulge * Math.pow(Math.max(0.02, archFactor), 0.58);

    canPos.setXYZ(i, x, y, z);
  }
  canopyGeo.computeVertexNormals();
  addMesh(cockpitGroup, canopyGeo, canopyGlassMat, [0, 0.51, -2.85]);

  // Aft Canopy Structural Arch Frame (Behind pilot's seat, like F-16 two-piece junction)
  const archGeo = new THREE.TorusGeometry(0.52, 0.022, 10, 24, Math.PI);
  addMesh(cockpitGroup, archGeo, bodyMat, [0, 0.51, -2.05], [0, 0, 0], [0.95, 0.92, 1.0]);

  // ============================================================================
  // 5. BLENDED LERX, 40° SWEPT WINGS, TIP RAILS & FLAPERONS
  // ============================================================================
  const wingGroup = new THREE.Group();
  hiDetail.add(wingGroup);

  // Prominent Blended Leading-Edge Root Extensions (LERX) / Forebody Strakes
  [-1, 1].forEach((side) => {
    const lerxShape = new THREE.Shape();
    lerxShape.moveTo(0, -4.7); // Joins nose chine forward of cockpit
    lerxShape.quadraticCurveTo(side * 0.72, -3.4, side * 1.48, -1.3); // Vortex-generating curved strake
    lerxShape.lineTo(side * 1.48, 0.4);
    lerxShape.lineTo(0, 0.4);
    lerxShape.closePath();

    const lerxGeo = new THREE.ExtrudeGeometry(lerxShape, extrudeWingOpts(0.06, 0.035));
    lerxGeo.rotateX(Math.PI / 2);
    addMesh(wingGroup, lerxGeo, bodyMat, [0, 0.14, 0], [0, 0, side * -0.04]);

    // Port-side M61A2 20mm rotary cannon fairing & gun port built into Left LERX
    if (side === -1) {
      const gunBlisterGeo = new THREE.ConeGeometry(0.11, 0.95, 14);
      gunBlisterGeo.rotateX(-Math.PI / 2);
      addMesh(wingGroup, gunBlisterGeo, darkMat, [-0.68, 0.24, -2.85], [0, 0.08, 0], [1.2, 0.7, 1]);
      const muzzleGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.25, 10);
      muzzleGeo.rotateX(Math.PI / 2);
      addMesh(wingGroup, muzzleGeo, cavityMat, [-0.66, 0.24, -3.28]);
    }
  });

  // Main Cropped-Delta 40° Swept Wings (Span = 9.8 units -> X = ±4.9)
  [-1, 1].forEach((side) => {
    const wingShape = new THREE.Shape();
    // Shape X = world X, Shape Y = world Z (since rotateX(PI/2) maps +Y to +Z)
    wingShape.moveTo(side * 0.65, -1.45); // Root leading edge junction with LERX
    wingShape.lineTo(side * 4.72, 1.96);  // 40° swept leading edge out to wingtip
    wingShape.lineTo(side * 4.72, 2.86);  // Cropped wingtip chord (0.90 units)
    wingShape.lineTo(side * 0.65, 2.55);  // Slightly forward-swept trailing edge
    wingShape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, extrudeWingOpts(0.045, 0.022));
    wingGeo.rotateX(Math.PI / 2);
    // Taper thickness toward wingtip
    const wPos = wingGeo.attributes.position;
    for (let i = 0; i < wPos.count; i++) {
      const wx = Math.abs(wPos.getX(i));
      const spanRatio = Math.min(1, Math.max(0, (wx - 0.65) / 4.07));
      wPos.setY(i, wPos.getY(i) * (1.0 - spanRatio * 0.58));
    }
    wingGeo.computeVertexNormals();
    addMesh(wingGroup, wingGeo, bodyMat, [0, 0.08, 0]);

    // Trailing-Edge Flaperon Control Surface Accent
    const flapShape = new THREE.Shape();
    flapShape.moveTo(side * 1.05, 2.15);
    flapShape.lineTo(side * 4.45, 2.48);
    flapShape.lineTo(side * 4.45, 2.84);
    flapShape.lineTo(side * 1.05, 2.58);
    flapShape.closePath();
    const flapGeo = new THREE.ExtrudeGeometry(flapShape, extrudeWingOpts(0.025, 0.008));
    flapGeo.rotateX(Math.PI / 2);
    addMesh(wingGroup, flapGeo, teamMat, [0, 0.068, 0.02]);

    // Wingtip LAU-129 Missile Launch Rails (Total span reaches X = ±4.9)
    const railGroup = new THREE.Group();
    railGroup.position.set(side * 4.82, 0.06, 2.35);
    wingGroup.add(railGroup);

    const railBeamGeo = new THREE.BoxGeometry(0.14, 0.13, 2.65);
    addMesh(railGroup, railBeamGeo, bodyMat, [0, 0, 0]);

    // Forward Wedge Nose of Missile Rail
    const railNoseGeo = new THREE.ConeGeometry(0.085, 0.38, 8);
    railNoseGeo.rotateX(-Math.PI / 2);
    addMesh(railGroup, railNoseGeo, darkMat, [0, 0, -1.51]);

    // Wingtip Navigation Strobe Lights (Red Left -X, Green Right +X)
    const navMat = new THREE.MeshBasicMaterial({ color: side === -1 ? 0xff2222 : 0x22ff44 });
    const navGeo = new THREE.BoxGeometry(0.03, 0.04, 0.28);
    addMesh(railGroup, navGeo, navMat, [side * 0.075, 0, -0.6]);
  });

  // ============================================================================
  // 7. UNDERWING SUPERSONIC DROP TANKS, PYLONS & TWIN VENTRAL FINS
  // ============================================================================
  const ordnanceGroup = new THREE.Group();
  hiDetail.add(ordnanceGroup);

  [-1, 1].forEach((side) => {
    // Inner Heavy Wet Pylon (Station 4 / 6 at X = ±1.95)
    const pylonGroup = new THREE.Group();
    pylonGroup.position.set(side * 1.95, -0.14, 0.65);
    ordnanceGroup.add(pylonGroup);

    const pylonShape = new THREE.Shape();
    pylonShape.moveTo(-0.95, 0.22);
    pylonShape.lineTo(0.85, 0.22);
    pylonShape.lineTo(0.65, -0.18);
    pylonShape.lineTo(-0.55, -0.18);
    pylonShape.closePath();
    const pylonGeo = new THREE.ExtrudeGeometry(pylonShape, extrudeWingOpts(0.07, 0.01));
    pylonGeo.rotateY(Math.PI / 2);
    addMesh(pylonGroup, pylonGeo, darkMat, [-0.035, 0, 0]);

    // 370-Gallon Supersonic External Drop Tank (Sears-Haack ogive spindle)
    const tankLen = 3.85;
    const tankGeo = new THREE.CylinderGeometry(0.28, 0.28, tankLen, 24, 16);
    tankGeo.rotateX(Math.PI / 2);
    const tPos = tankGeo.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
      let x = tPos.getX(i);
      let y = tPos.getY(i);
      let z = tPos.getZ(i);
      const u = z / (tankLen / 2); // -1 to +1
      // Sears-Haack area distribution radius profile
      const profile = Math.pow(Math.max(0.0, 1.0 - u * u), 0.68);
      tPos.setXYZ(i, x * profile, y * profile, z);
    }
    tankGeo.computeVertexNormals();
    addMesh(pylonGroup, tankGeo, bodyMat, [0, -0.42, 0.05]);

    // Drop tank nose cap & dual stabilizing tail fins
    const tankCapGeo = new THREE.SphereGeometry(0.11, 14, 12);
    addMesh(pylonGroup, tankCapGeo, teamMat, [0, -0.42, -1.72], null, [0.9, 0.9, 1.8]);

    [-0.65, 0.65].forEach((finAngle) => {
      const finGeo = new THREE.BoxGeometry(0.36, 0.018, 0.48);
      addMesh(pylonGroup, finGeo, teamMat, [Math.cos(finAngle) * 0.16, -0.42 + Math.sin(finAngle) * 0.16, 1.55], [0, 0, finAngle]);
    });

    // Outer Weapon Pylon (Station 3 / 7 at X = ±3.15)
    const outerPylonGeo = new THREE.BoxGeometry(0.06, 0.24, 1.25);
    addMesh(ordnanceGroup, outerPylonGeo, darkMat, [side * 3.15, -0.08, 1.35]);

    // Twin Canted Ventral Stabilizer Fins beneath the aft fuselage
    const vFinShape = new THREE.Shape();
    vFinShape.moveTo(0, -0.9);
    vFinShape.lineTo(0.42, -0.35);
    vFinShape.lineTo(0.42, 0.85);
    vFinShape.lineTo(0, 1.15);
    vFinShape.closePath();
    const vFinGeo = new THREE.ExtrudeGeometry(vFinShape, extrudeWingOpts(0.022, 0.006));
    vFinGeo.rotateZ(-Math.PI / 2);
    vFinGeo.rotateY(Math.PI / 2);
    // Canted outward at 15 degrees
    addMesh(ordnanceGroup, vFinGeo, bodyMat, [side * 0.44, -0.48, 2.25], [0, 0, side * 0.28]);
  });

  // ============================================================================
  // EMPENNAGE: TALL SWEPT VERTICAL TAIL FIN, RUDDER & RWR POD
  // ============================================================================
  const tailGroup = new THREE.Group();
  hiDetail.add(tailGroup);

  // Parachute / ECM Tail Root Housing extending aft over the nozzle
  const tailBaseGeo = new THREE.BoxGeometry(0.32, 0.34, 2.45);
  addMesh(tailGroup, tailBaseGeo, bodyMat, [0, 0.64, 3.35]);
  addMesh(tailGroup, new THREE.CylinderGeometry(0.14, 0.16, 0.3, 14), darkMat, [0, 0.64, 4.62], [Math.PI / 2, 0, 0]);

  // Tall Swept Vertical Stabilizer Fin
  const vTailShape = new THREE.Shape();
  vTailShape.moveTo(-1.1, 0);     // Forward root at dorsal spine (Z = 2.0)
  vTailShape.lineTo(-2.65, 2.38); // 42° swept leading edge up to fin tip
  vTailShape.lineTo(-3.45, 2.38); // Fin tip chord
  vTailShape.lineTo(-2.85, 0);    // Trailing edge down to tail base
  vTailShape.closePath();

  const vTailGeo = new THREE.ExtrudeGeometry(vTailShape, extrudeWingOpts(0.05, 0.022));
  vTailGeo.rotateY(Math.PI / 2);
  addMesh(tailGroup, vTailGeo, bodyMat, [-0.025, 0.72, 1.4]);

  // Team Livery Accent Band & Rudder Actuator Surface on Vertical Tail
  const rudderShape = new THREE.Shape();
  rudderShape.moveTo(-2.35, 0.15);
  rudderShape.lineTo(-3.05, 2.15);
  rudderShape.lineTo(-3.42, 2.15);
  rudderShape.lineTo(-2.82, 0.15);
  rudderShape.closePath();
  const rudderGeo = new THREE.ExtrudeGeometry(rudderShape, extrudeWingOpts(0.056, 0.008));
  rudderGeo.rotateY(Math.PI / 2);
  addMesh(tailGroup, rudderGeo, teamMat, [-0.028, 0.72, 1.42]);

  // Fin-Tip cylindrical RWR / EW Sensor Pod (Gripen E / F-16V signature top pod)
  const rwrPodGeo = new THREE.CylinderGeometry(0.065, 0.065, 1.18, 16);
  rwrPodGeo.rotateX(Math.PI / 2);
  addMesh(tailGroup, rwrPodGeo, darkMat, [0, 3.12, 4.42]);
  const rwrNoseGeo = new THREE.SphereGeometry(0.065, 12, 12);
  addMesh(tailGroup, rwrNoseGeo, teamMat, [0, 3.12, 3.83]);

  // ============================================================================
  // 8. HORIZONTAL ALL-MOVING TAILERONS (`leftElev` & `rightElev`)
  // ============================================================================
  const buildTaileron = (side) => {
    const pivot = new THREE.Group();
    // Placed on the aft fuselage chine/strake with pivot axis along X for pitch/roll actuation
    pivot.position.set(side * 0.76, -0.05, 3.85);
    // Slight negative anhedral (-4 degrees) characteristic of F-16 tailplanes
    pivot.rotation.z = side * -0.07;

    const elevShape = new THREE.Shape();
    elevShape.moveTo(0, -0.82);             // Root leading edge
    elevShape.lineTo(side * 1.82, 0.45);    // 40° swept leading edge
    elevShape.lineTo(side * 1.82, 1.18);    // Cropped outer tip extending to Z = +5.03
    elevShape.lineTo(side * 0.18, 1.05);    // Trailing edge notched for nozzle clearance
    elevShape.lineTo(0, 0.65);
    elevShape.closePath();

    const elevGeo = new THREE.ExtrudeGeometry(elevShape, extrudeWingOpts(0.032, 0.015));
    elevGeo.rotateX(Math.PI / 2);
    // Taper thickness toward tip
    const ePos = elevGeo.attributes.position;
    for (let i = 0; i < ePos.count; i++) {
      const ex = Math.abs(ePos.getX(i));
      ePos.setY(i, ePos.getY(i) * (1.0 - (ex / 1.85) * 0.55));
    }
    elevGeo.computeVertexNormals();
    addMesh(pivot, elevGeo, bodyMat, [0, 0.016, 0]);

    // Titanium pivot spindle fairing
    const spindleGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.35, 10);
    spindleGeo.rotateZ(Math.PI / 2);
    addMesh(pivot, spindleGeo, nozzleMat, [side * 0.1, 0, 0]);

    // Squadron accent tip stripe
    const tipStripeGeo = new THREE.BoxGeometry(0.18, 0.025, 0.68);
    addMesh(pivot, tipStripeGeo, teamMat, [side * 1.72, 0, 0.81]);

    hiDetail.add(pivot);
    return pivot;
  };

  const leftElev = buildTaileron(-1);
  const rightElev = buildTaileron(1);

  // ============================================================================
  // 6. PRATT & WHITNEY F100-PW-229 CONVERGENT-DIVERGENT TITANIUM NOZZLE & `abGroup`
  // ============================================================================
  const nozzleAssembly = new THREE.Group();
  nozzleAssembly.position.set(0, 0.02, 3.6);
  hiDetail.add(nozzleAssembly);

  // Carbon-fibre / Titanium Actuator Shroud Collar (Z = 3.6 to 4.35)
  const shroudGeo = new THREE.CylinderGeometry(0.62, 0.68, 0.78, 28, 1, true);
  shroudGeo.rotateX(Math.PI / 2);
  const sMat = darkMat.clone ? darkMat.clone() : darkMat;
  sMat.side = THREE.DoubleSide;
  addMesh(nozzleAssembly, shroudGeo, sMat, [0, 0, 0.38]);

  // Expose 18 Articulated Convergent-Divergent Titanium Turkey-Feather Petals (Z = 4.35 to 5.20)
  const numPetals = 18;
  const petalLength = 0.86;
  for (let i = 0; i < numPetals; i++) {
    const angle = (i / numPetals) * Math.PI * 2;
    const petalPivot = new THREE.Group();
    petalPivot.position.set(Math.cos(angle) * 0.61, Math.sin(angle) * 0.61, 0.75);
    petalPivot.rotation.z = angle - Math.PI / 2;
    // Converge inward at -12 degrees
    petalPivot.rotation.x = -0.21;
    nozzleAssembly.add(petalPivot);

    // Outer overlapping titanium seal & textured rib
    const petalPlateGeo = new THREE.BoxGeometry(0.22, 0.028, petalLength);
    addMesh(petalPivot, petalPlateGeo, nozzleMat, [0, 0, petalLength / 2]);

    const actuatorRibGeo = new THREE.BoxGeometry(0.055, 0.048, petalLength * 0.88);
    addMesh(petalPivot, actuatorRibGeo, chromeMat, [0, 0.022, petalLength * 0.46]);
  }

  // Internal Divergent Ceramic Liner Cone
  const innerLinerGeo = new THREE.CylinderGeometry(0.48, 0.57, 0.9, 24, 1, true);
  innerLinerGeo.rotateX(Math.PI / 2);
  const linerMat = nozzleMat.clone ? nozzleMat.clone() : nozzleMat;
  linerMat.side = THREE.BackSide;
  addMesh(nozzleAssembly, innerLinerGeo, linerMat, [0, 0, 1.15]);

  // Deep Dark Exhaust Core Backing Plate
  const corePlugGeo = new THREE.CircleGeometry(0.56, 24);
  addMesh(nozzleAssembly, corePlugGeo, cavityMat, [0, 0, 0.15]);

  // --- AFTERBURNER & FLAME-HOLDER ASSEMBLY (`abGroup`) ---
  const abGroup = new THREE.Group();
  abGroup.position.set(0, 0.02, 4.2); // Centered inside the tailpipe
  hiDetail.add(abGroup);

  // Concentric Annular Flame-Holder Rings & Radial Fuel Spray Bars
  [0.18, 0.31, 0.43].forEach((radius, idx) => {
    const ringGeo = new THREE.TorusGeometry(radius, 0.018, 8, 24);
    addMesh(abGroup, ringGeo, nozzleMat, [0, 0, -0.35 + idx * 0.04]);
  });

  for (let i = 0; i < 8; i++) {
    const spokeGeo = new THREE.BoxGeometry(0.92, 0.02, 0.025);
    addMesh(abGroup, spokeGeo, nozzleMat, [0, 0, -0.32], [0, 0, (i / 8) * Math.PI]);
  }

  // Glowing Turbine Exhaust Cone & Igniter Core
  const hotTurbineGeo = new THREE.ConeGeometry(0.18, 0.45, 16);
  hotTurbineGeo.rotateX(Math.PI / 2);
  addMesh(abGroup, hotTurbineGeo, abCoreMat, [0, 0, -0.42]);

  // Inner Incandescent Afterburner Liner Glow
  const abCanGlowGeo = new THREE.CylinderGeometry(0.46, 0.52, 0.92, 24, 1, true);
  abCanGlowGeo.rotateX(Math.PI / 2);
  addMesh(abGroup, abCanGlowGeo, abCoreMat, [0, 0, 0.42]);

  // Supersonic Mach Shock Diamonds & Plume Cone extending aft of Z = +5.2
  const outerPlumeGeo = new THREE.ConeGeometry(0.45, 2.6, 24, 1, true);
  outerPlumeGeo.rotateX(Math.PI / 2);
  addMesh(abGroup, outerPlumeGeo, abCoreMat, [0, 0, 2.05]);

  const innerPlumeGeo = new THREE.ConeGeometry(0.32, 1.85, 20, 1, true);
  innerPlumeGeo.rotateX(Math.PI / 2);
  addMesh(abGroup, innerPlumeGeo, abInnerBlueMat, [0, 0, 1.65]);

  // 3 Distinct Shock Diamonds along the exhaust axis
  [0.95, 1.55, 2.15].forEach((zOff, idx) => {
    const scale = 1.0 - idx * 0.25;
    const diamondGeo = new THREE.OctahedronGeometry(0.22 * scale, 1);
    addMesh(abGroup, diamondGeo, abInnerBlueMat, [0, 0, zOff], null, [1, 1, 1.85]);
  });

  return { leftElev, rightElev, abGroup };
}

/**
 * Builds the TITAN Heavy Armored Close-Air-Support Gunship (A-10 / Su-25 hybrid)
 * Orientation: Nose -Z (Z = -7.2, Cannon tip Z = -8.2), Tail +Z (Z = +5.8), Wings -X/+X, Dorsal +Y
 * Dimensions: Length ~14.2u, Wingspan ~14.5u
 *
 * @param {THREE.Group} hiDetail - Target group for the high-detail airframe meshes
 * @param {THREE.Material} bodyMat - Primary airframe armor material
 * @param {THREE.Material} darkMat - Dark mechanical/gunmetal material
 * @param {THREE.Material} teamMat - Squadron/accent trim material
 * @param {THREE.Material} nozzleMat - Engine nozzle/exhaust metal material
 * @returns {{ leftElev: THREE.Group, rightElev: THREE.Group, abGroup: THREE.Group }}
 */
function buildTitanAirframe(hiDetail, bodyMat, darkMat, teamMat, nozzleMat) {
  // Auxiliary internal materials (self-contained, no external textures)
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x182c36,
    metalness: 0.15,
    roughness: 0.1,
    transparent: true,
    opacity: 0.68,
    reflectivity: 0.9
  });

  const hudMat = new THREE.MeshBasicMaterial({
    color: 0x00ff66,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide
  });

  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    metalness: 0.9,
    roughness: 0.1
  });

  const ordMat = new THREE.MeshStandardMaterial({
    color: 0xd8dcd6,
    metalness: 0.3,
    roughness: 0.5
  });

  const seekerMat = new THREE.MeshStandardMaterial({
    color: 0x996600,
    metalness: 0.8,
    roughness: 0.15
  });

  const abCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffaa33,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const abPlumeMat = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  // Helper to attach shadows cleanly
  function addMesh(parent, geo, mat, pos, rot, scale) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // ============================================================================
  // 1. HEAVY ARMORED "BATHTUB" FUSELAGE & NOSE CONE
  // ============================================================================
  const fuselageGroup = new THREE.Group();
  hiDetail.add(fuselageGroup);

  // Main central armored hull (Z = -4.2 to Z = +2.8)
  const mainHullGeo = new THREE.BoxGeometry(1.5, 1.35, 7.0);
  addMesh(fuselageGroup, mainHullGeo, bodyMat, [0, 0.05, -0.7]);

  // Forward sloped nose upper deck (Z = -7.2 to Z = -4.2)
  const noseUpperGeo = new THREE.CylinderGeometry(0.42, 0.78, 3.0, 6);
  noseUpperGeo.rotateX(Math.PI / 2);
  addMesh(fuselageGroup, noseUpperGeo, bodyMat, [0, -0.08, -5.65], [0.08, 0, 0], [1.15, 0.9, 1.0]);

  // Extreme Nose Cone & Radar/Laser Spotter Tip (Z = -7.2)
  const noseCapGeo = new THREE.SphereGeometry(0.45, 12, 10);
  addMesh(fuselageGroup, noseCapGeo, darkMat, [0, -0.16, -7.05], null, [0.95, 0.82, 1.25]);

  // Pave Penny Laser Tracker Pod under nose (Starboard offset)
  const pavePylonGeo = new THREE.BoxGeometry(0.12, 0.25, 0.5);
  addMesh(fuselageGroup, pavePylonGeo, bodyMat, [0.46, -0.48, -5.8], [0, 0, -0.35]);
  const pavePodGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.95, 10);
  pavePodGeo.rotateX(Math.PI / 2);
  addMesh(fuselageGroup, pavePodGeo, darkMat, [0.52, -0.58, -5.85]);
  const paveLensGeo = new THREE.SphereGeometry(0.125, 10, 10);
  addMesh(fuselageGroup, paveLensGeo, seekerMat, [0.52, -0.58, -6.32]);

  // Titanium "Bathtub" External Armor Slabs (Bolted side plates around cockpit)
  const armorPlateGeo = new THREE.BoxGeometry(0.12, 0.88, 3.4);
  for (let side of [-1, 1]) {
    addMesh(fuselageGroup, armorPlateGeo, bodyMat, [side * 0.78, 0.18, -3.1], [0, 0, side * -0.08]);

    // Raised armor seam straps & rivet blisters
    for (let zOff of [-4.4, -3.5, -2.6, -1.7]) {
      const strapGeo = new THREE.BoxGeometry(0.16, 0.92, 0.08);
      addMesh(fuselageGroup, strapGeo, darkMat, [side * 0.79, 0.18, zOff], [0, 0, side * -0.08]);
    }
  }

  // Ventral Belly Armor Skid Plate
  const bellySlabGeo = new THREE.BoxGeometry(1.38, 0.18, 6.4);
  addMesh(fuselageGroup, bellySlabGeo, darkMat, [0, -0.66, -1.2]);

  // Dorsal Avionics Spine (Hump behind canopy running to tail)
  const spineGeo = new THREE.CylinderGeometry(0.38, 0.58, 6.2, 6);
  spineGeo.rotateX(Math.PI / 2);
  addMesh(fuselageGroup, spineGeo, bodyMat, [0, 0.78, 1.35], [-0.04, 0, 0], [1.1, 0.75, 1.0]);

  // Squadron Team Accent Stripe along dorsal spine & nose
  const noseStripeGeo = new THREE.BoxGeometry(0.65, 0.06, 2.2);
  addMesh(fuselageGroup, noseStripeGeo, teamMat, [0, 0.36, -5.4], [0.16, 0, 0]);
  const spineStripeGeo = new THREE.BoxGeometry(0.55, 0.08, 4.5);
  addMesh(fuselageGroup, spineStripeGeo, teamMat, [0, 1.06, 1.1], [-0.04, 0, 0]);

  // Aft Fuselage Taper (Z = +2.8 to Z = +5.8)
  const aftHullGeo = new THREE.CylinderGeometry(0.45, 0.75, 3.2, 8);
  aftHullGeo.rotateX(Math.PI / 2);
  addMesh(fuselageGroup, aftHullGeo, bodyMat, [0, 0.15, 4.3], [0.03, 0, 0], [1.05, 0.85, 1.0]);

  // Tail APU Exhaust Cap at Z = +5.85
  const apuGeo = new THREE.CylinderGeometry(0.22, 0.32, 0.3, 10);
  apuGeo.rotateX(Math.PI / 2);
  addMesh(fuselageGroup, apuGeo, nozzleMat, [0, 0.2, 5.85]);

  // Chaff / Flare Dispenser Boxes on aft fuselage cheeks
  const chaffGeo = new THREE.BoxGeometry(0.18, 0.32, 1.1);
  addMesh(fuselageGroup, chaffGeo, darkMat, [-0.68, 0.08, 3.8]);
  addMesh(fuselageGroup, chaffGeo, darkMat, [0.68, 0.08, 3.8]);

  // ============================================================================
  // 2. GAU-8 AVENGER 30MM 7-BARREL ROTARY GATLING CANNON (CENTERED LOWER CHIN)
  // ============================================================================
  const gauGroup = new THREE.Group();
  // Centered dead-center on lower nose chin (X = 0, Y = -0.48, Z = -6.95)
  gauGroup.position.set(0, -0.48, -6.95);
  hiDetail.add(gauGroup);

  // Titanium Recessed Blast Deflector Shield Plate (protects nose underside from hot muzzle blast)
  const blastPlateGeo = new THREE.BoxGeometry(0.72, 0.08, 1.7);
  addMesh(gauGroup, blastPlateGeo, darkMat, [0, 0.32, 0.42]);

  // Armored Gun Housing Fairing / Chin Trough blending into lower hull
  const shroudGeo = new THREE.CylinderGeometry(0.32, 0.38, 1.5, 14);
  shroudGeo.rotateX(Math.PI / 2);
  addMesh(gauGroup, shroudGeo, darkMat, [0, 0, 0.45]);

  // Gun gas ventilation louvers on fairing flanks
  for (let i = 0; i < 4; i++) {
    const louverGeo = new THREE.BoxGeometry(0.68, 0.05, 0.09);
    addMesh(gauGroup, louverGeo, bodyMat, [0, 0.14, 0.12 + i * 0.24]);
  }

  // Central Rotary Drive Shaft & Rotor Core
  const shaftGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.85, 8);
  shaftGeo.rotateX(Math.PI / 2);
  addMesh(gauGroup, shaftGeo, nozzleMat, [0, 0, -0.48]);

  // 7 Individual 30mm Barrels arranged radially around centerline
  const barrelGeo = new THREE.CylinderGeometry(0.028, 0.028, 1.85, 8);
  barrelGeo.rotateX(Math.PI / 2);
  const barrelRadius = 0.125;
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2;
    const bx = Math.cos(angle) * barrelRadius;
    const by = Math.sin(angle) * barrelRadius;
    addMesh(gauGroup, barrelGeo, nozzleMat, [bx, by, -0.48]);
  }

  // Mid-barrel stabilization clamp ring (Z = -7.75)
  const clampGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.14, 16);
  clampGeo.rotateX(Math.PI / 2);
  addMesh(gauGroup, clampGeo, darkMat, [0, 0, -0.8]);

  // Heavy Perforated Muzzle Brake Collar (Z = -8.28)
  const muzzleCollarGeo = new THREE.CylinderGeometry(0.19, 0.18, 0.26, 16);
  muzzleCollarGeo.rotateX(Math.PI / 2);
  addMesh(gauGroup, muzzleCollarGeo, darkMat, [0, 0, -1.33]);

  // Circular Muzzle Face Plate with central bore
  const muzzleFaceGeo = new THREE.RingGeometry(0.03, 0.185, 16);
  addMesh(gauGroup, muzzleFaceGeo, darkMat, [0, 0, -1.46]);

  // Exposed barrel muzzles protruding forward to Z ≈ -8.42 (1.37m ahead of nose tip)
  const tipRingGeo = new THREE.TorusGeometry(0.125, 0.022, 6, 16);
  addMesh(gauGroup, tipRingGeo, nozzleMat, [0, 0, -1.45]);

  // ============================================================================
  // 3. REINFORCED ARMORED COCKPIT, FLAT BULLETPROOF WINDSCREEN & PILOT
  // ============================================================================
  const cockpitGroup = new THREE.Group();
  cockpitGroup.position.set(0, 0.68, -3.1);
  hiDetail.add(cockpitGroup);

  // Armored Cockpit Tub Coaming
  const coamingGeo = new THREE.BoxGeometry(1.18, 0.28, 2.5);
  addMesh(cockpitGroup, coamingGeo, darkMat, [0, 0.05, 0]);

  // ACES II Ejection Seat Headrest & Twin Parachute Risers
  const seatBackGeo = new THREE.BoxGeometry(0.54, 0.78, 0.16);
  addMesh(cockpitGroup, seatBackGeo, darkMat, [0, 0.42, 0.48], [-0.15, 0, 0]);
  const headPadGeo = new THREE.BoxGeometry(0.36, 0.24, 0.18);
  addMesh(cockpitGroup, headPadGeo, teamMat, [0, 0.72, 0.44], [-0.15, 0, 0]);

  // Helmeted Pilot
  const torsoGeo = new THREE.BoxGeometry(0.48, 0.45, 0.32);
  addMesh(cockpitGroup, torsoGeo, darkMat, [0, 0.32, 0.22], [0.1, 0, 0]);
  const helmetGeo = new THREE.SphereGeometry(0.21, 12, 12);
  addMesh(cockpitGroup, helmetGeo, bodyMat, [0, 0.68, 0.18], null, [0.92, 1.0, 1.08]);
  // Dark Flight Visor
  const visorGeo = new THREE.SphereGeometry(0.215, 10, 10, 0, Math.PI, 0.2, 1.2);
  addMesh(cockpitGroup, visorGeo, visorMat, [0, 0.7, 0.16], [-1.3, 0, 0]);
  // Oxygen Mask & Hose
  const maskGeo = new THREE.ConeGeometry(0.1, 0.18, 6);
  addMesh(cockpitGroup, maskGeo, darkMat, [0, 0.59, 0.02], [-1.2, 0, 0]);

  // Angled Reflective HUD Glass
  const hudFrameGeo = new THREE.BoxGeometry(0.38, 0.06, 0.32);
  addMesh(cockpitGroup, hudFrameGeo, darkMat, [0, 0.36, -0.65]);
  const hudGlassGeo = new THREE.PlaneGeometry(0.3, 0.26);
  addMesh(cockpitGroup, hudGlassGeo, hudMat, [0, 0.52, -0.68], [0.55, 0, 0]);

  // 3-Piece Reinforced Flat Bulletproof Windscreen (Su-25 / A-10 Armored Glass)
  // Center Flat Armored Glass Pane
  const centerPaneGeo = new THREE.BoxGeometry(0.46, 0.62, 0.06);
  addMesh(cockpitGroup, centerPaneGeo, glassMat, [0, 0.48, -0.98], [0.68, 0, 0]);
  // Heavy Steel Windscreen Pillars
  const pillarGeo = new THREE.BoxGeometry(0.08, 0.68, 0.09);
  addMesh(cockpitGroup, pillarGeo, darkMat, [-0.24, 0.48, -0.97], [0.68, 0, -0.18]);
  addMesh(cockpitGroup, pillarGeo, darkMat, [0.24, 0.48, -0.97], [0.68, 0, 0.18]);
  // Side Quarter Windscreen Panes
  const sidePaneGeo = new THREE.BoxGeometry(0.34, 0.58, 0.05);
  addMesh(cockpitGroup, sidePaneGeo, glassMat, [-0.42, 0.44, -0.82], [0.55, 0.52, -0.25]);
  addMesh(cockpitGroup, sidePaneGeo, glassMat, [0.42, 0.44, -0.82], [0.55, -0.52, 0.25]);

  // Teardrop Armored Canopy Bubble & Heavy Frame Arch
  const canopyArchGeo = new THREE.TorusGeometry(0.55, 0.055, 8, 16, Math.PI);
  addMesh(cockpitGroup, canopyArchGeo, bodyMat, [0, 0.22, -0.45], [-0.15, 0, 0]);
  addMesh(cockpitGroup, canopyArchGeo, darkMat, [0, 0.20, 0.45], [-0.25, 0, 0], [0.92, 0.92, 1.0]);

  // Canopy Glass Shell
  const canopyGlassGeo = new THREE.CylinderGeometry(0.42, 0.54, 1.75, 12, 1, false, 0, Math.PI);
  canopyGlassGeo.rotateZ(-Math.PI / 2);
  canopyGlassGeo.rotateY(Math.PI / 2);
  addMesh(cockpitGroup, canopyGlassGeo, glassMat, [0, 0.22, 0.22], [-0.14, 0, 0], [1.0, 1.15, 1.0]);

  // Dorsal Canopy Spine Frame Strap
  const canopyStrapGeo = new THREE.BoxGeometry(0.09, 0.06, 1.78);
  addMesh(cockpitGroup, canopyStrapGeo, bodyMat, [0, 0.78, 0.2], [-0.14, 0, 0]);

  // ============================================================================
  // 4. BROAD STRAIGHT ARMOR WINGS, FLAPS, SPONSONS & 4 HARDPOINT PYLONS
  // ============================================================================
  const wingGroup = new THREE.Group();
  wingGroup.position.set(0, -0.15, -0.65);
  hiDetail.add(wingGroup);

  // Extruded high-lift thick airfoil section (Clark-Y / NACA 6716 inspired)
  const airfoilShape = new THREE.Shape();
  airfoilShape.moveTo(0, 0);
  airfoilShape.quadraticCurveTo(0.15, 0.36, 0.8, 0.38);   // Thick high-lift upper camber
  airfoilShape.quadraticCurveTo(1.75, 0.34, 2.65, 0.06); // Trailing edge upper slope
  airfoilShape.lineTo(2.65, -0.04);                      // Blunt trailing edge
  airfoilShape.quadraticCurveTo(1.4, -0.12, 0.3, -0.14); // Flat armored lower surface
  airfoilShape.quadraticCurveTo(0.02, -0.12, 0, 0);

  const halfSpan = 6.55; // Total wingspan with drooped tips = 14.5 units
  const wingExtrudeSettings = {
    steps: 1,
    depth: halfSpan,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 3
  };

  const baseWingGeo = new THREE.ExtrudeGeometry(airfoilShape, wingExtrudeSettings);
  // Orient airfoil so chord runs along +Z (0 = leading edge, 2.65 = trailing edge)
  // Extrude depth runs along +Z initially; rotateY(+PI/2) maps extrude +Z to +X (Right Wing)
  baseWingGeo.rotateY(Math.PI / 2);

  for (let side of [-1, 1]) {
    const sideWingGroup = new THREE.Group();
    wingGroup.add(sideWingGroup);

    const wMesh = new THREE.Mesh(baseWingGeo, bodyMat);
    wMesh.castShadow = true;
    wMesh.receiveShadow = true;
    if (side === -1) {
      wMesh.scale.set(-1, 1, 1); // Mirror cleanly to -X for Port Wing
    }
    wMesh.position.set(side * 0.65, -0.12, -1.25);
    // Slight 3-degree dihedral for stability
    wMesh.rotation.z = side * 0.045;
    sideWingGroup.add(wMesh);

    // Leading-Edge Armor Slat Strip
    const slatGeo = new THREE.BoxGeometry(halfSpan - 0.2, 0.16, 0.22);
    addMesh(
      sideWingGroup,
      slatGeo,
      darkMat,
      [side * (0.65 + halfSpan * 0.5), 0.08, -1.22],
      [0, 0, side * 0.045]
    );

    // Squadron Wing Marking Panel
    const wingPatchGeo = new THREE.BoxGeometry(1.4, 0.04, 1.6);
    addMesh(
      sideWingGroup,
      wingPatchGeo,
      teamMat,
      [side * 5.2, 0.42, 0.0],
      [0.06, 0, side * 0.045]
    );

    // Articulated Trailing-Edge Slotted Flaps (Inboard & Outboard)
    const flapInGeo = new THREE.BoxGeometry(2.4, 0.1, 0.48);
    addMesh(
      sideWingGroup,
      flapInGeo,
      darkMat,
      [side * 2.2, 0.02, 1.55],
      [0.18, 0, side * 0.045]
    );

    // Split Deceleron / Aileron at outboard trailing edge
    const aileronGeo = new THREE.BoxGeometry(2.2, 0.1, 0.45);
    addMesh(
      sideWingGroup,
      aileronGeo,
      bodyMat,
      [side * 5.1, 0.14, 1.52],
      [0.05, 0, side * 0.045]
    );

    // Drooped Hoerner Wingtip Fairing (A-10 signature curved low-drag tip, reaches X = ±7.25)
    const tipGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.75, 8);
    tipGeo.rotateX(Math.PI / 2);
    addMesh(
      sideWingGroup,
      tipGeo,
      teamMat,
      [side * 7.22, 0.12, 0.1],
      [0, 0, side * -0.35],
      [0.65, 1.1, 1.0]
    );

    // Wingtip Nav Strobe Housing
    const navMat = new THREE.MeshBasicMaterial({ color: side === -1 ? 0xff1111 : 0x11ff22 });
    const navGeo = new THREE.SphereGeometry(0.08, 8, 8);
    addMesh(sideWingGroup, navGeo, navMat, [side * 7.3, 0.15, -0.95]);

    // Forward-protruding Main Landing Gear Sponson Pod (Iconic A-10 underwing fairing)
    const sponsonGeo = new THREE.CylinderGeometry(0.28, 0.34, 3.2, 10);
    sponsonGeo.rotateX(Math.PI / 2);
    addMesh(sideWingGroup, sponsonGeo, bodyMat, [side * 2.05, -0.32, -0.35]);
    const sponsonConeGeo = new THREE.ConeGeometry(0.28, 0.75, 10);
    sponsonConeGeo.rotateX(-Math.PI / 2);
    addMesh(sideWingGroup, sponsonConeGeo, darkMat, [side * 2.05, -0.32, -2.32]);

    // ==========================================================================
    // UNDERWING ORDNANCE HARDPOINTS (2 per wing = 4 primary weapon stations)
    // Inboard Station (X = ±3.35): AGM-65 Maverick Air-to-Ground Missile on LAU-117
    // Outboard Station (X = ±4.85): LAU-61 19-Tube 70mm Hydra Rocket Pod
    // ==========================================================================

    // --- INBOARD PYLON & AGM-65 MAVERICK MISSILE ---
    const inPylonX = side * 3.35;
    const pylonGeo = new THREE.BoxGeometry(0.16, 0.52, 1.65);
    addMesh(sideWingGroup, pylonGeo, bodyMat, [inPylonX, -0.38, -0.15]);
    const rackGeo = new THREE.BoxGeometry(0.24, 0.14, 1.85);
    addMesh(sideWingGroup, rackGeo, darkMat, [inPylonX, -0.68, -0.2]);

    const maverickGroup = new THREE.Group();
    maverickGroup.position.set(inPylonX, -0.92, -0.25);
    sideWingGroup.add(maverickGroup);

    // Missile Body (300mm diameter tactical white/grey body)
    const mavBodyGeo = new THREE.CylinderGeometry(0.16, 0.16, 2.35, 12);
    mavBodyGeo.rotateX(Math.PI / 2);
    addMesh(maverickGroup, mavBodyGeo, ordMat, [0, 0, 0]);

    // Electro-Optical / IR Glass Seeker Dome
    const mavNoseGeo = new THREE.SphereGeometry(0.158, 12, 12);
    addMesh(maverickGroup, mavNoseGeo, seekerMat, [0, 0, -1.18], null, [1, 1, 1.3]);

    // Warhead yellow tactical band
    const bandGeo = new THREE.CylinderGeometry(0.164, 0.164, 0.14, 12);
    bandGeo.rotateX(Math.PI / 2);
    addMesh(maverickGroup, bandGeo, teamMat, [0, 0, -0.75]);

    // 4 Long-Chord Delta Cruciform Wings + 4 Tail Control Fins
    const deltaFinGeo = new THREE.BoxGeometry(0.76, 0.03, 0.85);
    const tailFinGeo = new THREE.BoxGeometry(0.82, 0.03, 0.22);
    for (let rAngle of [Math.PI / 4, -Math.PI / 4]) {
      addMesh(maverickGroup, deltaFinGeo, ordMat, [0, 0, 0.15], [0, 0, rAngle]);
      addMesh(maverickGroup, tailFinGeo, darkMat, [0, 0, 1.02], [0, 0, rAngle]);
    }

    // --- OUTBOARD PYLON & 19-TUBE HYDRA 70 ROCKET POD ---
    const outPylonX = side * 4.85;
    addMesh(sideWingGroup, pylonGeo, bodyMat, [outPylonX, -0.32, -0.15]);

    const podGroup = new THREE.Group();
    podGroup.position.set(outPylonX, -0.72, -0.2);
    sideWingGroup.add(podGroup);

    // Outer Thermal-Coated Rocket Launcher Cylinder
    const podCylGeo = new THREE.CylinderGeometry(0.24, 0.24, 2.1, 14);
    podCylGeo.rotateX(Math.PI / 2);
    addMesh(podGroup, podCylGeo, bodyMat, [0, 0, 0]);

    // Metallic Retention Bands
    for (let zBand of [-0.65, 0.65]) {
      const pBandGeo = new THREE.CylinderGeometry(0.246, 0.246, 0.1, 14);
      pBandGeo.rotateX(Math.PI / 2);
      addMesh(podGroup, pBandGeo, darkMat, [0, 0, zBand]);
    }

    // Flat Perforated Faceplate & 19 Individual Rocket Launch Tubes
    const faceGeo = new THREE.CylinderGeometry(0.235, 0.24, 0.08, 14);
    faceGeo.rotateX(Math.PI / 2);
    addMesh(podGroup, faceGeo, darkMat, [0, 0, -1.06]);
    addMesh(podGroup, faceGeo, nozzleMat, [0, 0, 1.06]);

    const tubeGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.14, 6);
    tubeGeo.rotateX(Math.PI / 2);
    // 1 center tube + 6 inner ring + 12 outer ring = 19 tubes
    addMesh(podGroup, tubeGeo, nozzleMat, [0, 0, -1.08]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      addMesh(podGroup, tubeGeo, nozzleMat, [Math.cos(a) * 0.085, Math.sin(a) * 0.085, -1.08]);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      addMesh(podGroup, tubeGeo, nozzleMat, [Math.cos(a) * 0.168, Math.sin(a) * 0.168, -1.08]);
    }
  }

  // ============================================================================
  // 5. TWIN HIGH-MOUNTED TURBOFAN NACELLES & SPINNING FAN / EXHAUST CORES
  // ============================================================================
  const enginesGroup = new THREE.Group();
  // Positioned high above aft fuselage (+Y = 1.25) and forward of H-tail (Z = 2.05)
  enginesGroup.position.set(0, 1.25, 2.05);
  hiDetail.add(enginesGroup);

  const abGroup = new THREE.Group();
  abGroup.name = 'abGroup';
  enginesGroup.add(abGroup);

  for (let side of [-1, 1]) {
    const nacX = side * 1.38;
    const nacelle = new THREE.Group();
    nacelle.position.set(nacX, 0, 0);
    // Slight upward pitch of A-10 TF34 nacelles to align thrust line with center of mass
    nacelle.rotation.x = -0.05;
    enginesGroup.add(nacelle);

    // Swept Aerodynamic Pylon Strut connecting nacelle to upper aft fuselage
    const strutGeo = new THREE.BoxGeometry(0.95, 0.24, 2.3);
    addMesh(
      enginesGroup,
      strutGeo,
      bodyMat,
      [side * 0.78, -0.42, 0.1],
      [0, 0, side * 0.52]
    );

    // Outer High-Bypass Turbofan Cowl Barrel
    const cowlGeo = new THREE.CylinderGeometry(0.76, 0.68, 3.35, 20);
    cowlGeo.rotateX(Math.PI / 2);
    addMesh(nacelle, cowlGeo, bodyMat, [0, 0, 0]);

    // Squadron Accent Ring around forward cowling
    const cowlStripeGeo = new THREE.CylinderGeometry(0.766, 0.758, 0.35, 20);
    cowlStripeGeo.rotateX(Math.PI / 2);
    addMesh(nacelle, cowlStripeGeo, teamMat, [0, 0, -1.15]);

    // Thick Rounded Acoustic Intake Lip Ring
    const lipGeo = new THREE.TorusGeometry(0.68, 0.085, 12, 24);
    addMesh(nacelle, lipGeo, darkMat, [0, 0, -1.68]);

    // Dark Intake Throat Tunnel
    const throatGeo = new THREE.CylinderGeometry(0.64, 0.64, 0.6, 16);
    throatGeo.rotateX(Math.PI / 2);
    addMesh(nacelle, throatGeo, darkMat, [0, 0, -1.42]);

    // High-Bypass Front Fan Face (16 individual angled compressor blades + spinner cone)
    const fanAssembly = new THREE.Group();
    fanAssembly.position.set(0, 0, -1.32);
    nacelle.add(fanAssembly);

    const spinnerGeo = new THREE.ConeGeometry(0.22, 0.48, 12);
    spinnerGeo.rotateX(-Math.PI / 2);
    addMesh(fanAssembly, spinnerGeo, darkMat, [0, 0, -0.15]);

    const bladeGeo = new THREE.BoxGeometry(0.08, 0.58, 0.02);
    for (let b = 0; b < 16; b++) {
      const bAngle = (b / 16) * Math.PI * 2;
      const blade = new THREE.Mesh(bladeGeo, nozzleMat);
      blade.position.set(Math.cos(bAngle) * 0.34, Math.sin(bAngle) * 0.34, 0);
      blade.rotation.z = bAngle;
      blade.rotation.y = 0.45; // Blade pitch
      fanAssembly.add(blade);
    }

    // Aft Bypass Fan Shroud & Core Exhaust Nozzle
    const bypassShroudGeo = new THREE.CylinderGeometry(0.66, 0.56, 0.75, 18, 1, true);
    bypassShroudGeo.rotateX(Math.PI / 2);
    addMesh(nacelle, bypassShroudGeo, nozzleMat, [0, 0, 1.88]);

    // Hot Core Exhaust Cone protruding inside nozzle
    const coreConeGeo = new THREE.ConeGeometry(0.32, 0.95, 14);
    coreConeGeo.rotateX(Math.PI / 2);
    addMesh(nacelle, coreConeGeo, nozzleMat, [0, 0, 2.05]);

    // Turbine Rear Stator Vanes inside exhaust
    for (let v = 0; v < 8; v++) {
      const vAngle = (v / 8) * Math.PI * 2;
      const vaneGeo = new THREE.BoxGeometry(0.03, 0.54, 0.25);
      addMesh(
        nacelle,
        vaneGeo,
        darkMat,
        [Math.cos(vAngle) * 0.36, Math.sin(vAngle) * 0.36, 1.82],
        [0, 0, vAngle]
      );
    }

    // ==========================================================================
    // AFTERBURNER / THRUST GROUP INSIDE `abGroup`
    // ==========================================================================
    const enginePlumeGroup = new THREE.Group();
    enginePlumeGroup.position.set(nacX, -0.1, 2.0);
    enginePlumeGroup.rotation.x = -0.05;
    abGroup.add(enginePlumeGroup);

    // Glowing Annular Turbine Ring
    const glowRingGeo = new THREE.RingGeometry(0.22, 0.52, 16);
    addMesh(enginePlumeGroup, glowRingGeo, abCoreMat, [0, 0, 0.15]);

    // Inner White-Hot Thrust Core Cone
    const innerPlumeGeo = new THREE.ConeGeometry(0.42, 1.8, 14, 1, true);
    innerPlumeGeo.rotateX(Math.PI / 2);
    addMesh(enginePlumeGroup, innerPlumeGeo, abCoreMat, [0, 0, 1.05]);

    // Outer Translucent Thermal Plume Envelope
    const outerPlumeGeo = new THREE.ConeGeometry(0.54, 3.1, 14, 1, true);
    outerPlumeGeo.rotateX(Math.PI / 2);
    addMesh(enginePlumeGroup, outerPlumeGeo, abPlumeMat, [0, 0, 1.65]);

    // Mach Shock Diamonds inside plume
    const diamondGeo = new THREE.OctahedronGeometry(0.24, 0);
    addMesh(enginePlumeGroup, diamondGeo, abCoreMat, [0, 0, 0.85], null, [1.0, 1.0, 1.8]);
    addMesh(enginePlumeGroup, diamondGeo, abCoreMat, [0, 0, 1.65], null, [0.7, 0.7, 1.5]);
  }

  // ============================================================================
  // 6. WIDE H-TAIL CONFIGURATION & ARTICULATED ELEVATORS (`leftElev`, `rightElev`)
  // ============================================================================
  const tailGroup = new THREE.Group();
  // Positioned at aft fuselage (Z = +4.65) directly behind engine propwash
  tailGroup.position.set(0, 0.38, 4.65);
  hiDetail.add(tailGroup);

  // Fixed Horizontal Stabilizer Box Spanning Between Dual Vertical Fins (Span = 5.1u)
  const hStabSpan = 5.1;
  const hStabGeo = new THREE.BoxGeometry(hStabSpan, 0.14, 1.15);
  addMesh(tailGroup, hStabGeo, bodyMat, [0, 0, -0.15]);

  // Leading edge armor strip on horizontal stabilizer
  const hStabLeadGeo = new THREE.BoxGeometry(hStabSpan, 0.1, 0.16);
  addMesh(tailGroup, hStabLeadGeo, darkMat, [0, 0, -0.74]);

  // Left & Right Articulated Elevators (Pivoting cleanly on X-axis at trailing edge Z = +0.45)
  const leftElev = new THREE.Group();
  leftElev.name = 'leftElev';
  leftElev.position.set(-1.25, 0, 0.42);
  tailGroup.add(leftElev);

  const rightElev = new THREE.Group();
  rightElev.name = 'rightElev';
  rightElev.position.set(1.25, 0, 0.42);
  tailGroup.add(rightElev);

  // Elevator airfoil meshes offset +Z from their hinge pivot line
  const elevGeo = new THREE.BoxGeometry(2.15, 0.1, 0.52);
  addMesh(leftElev, elevGeo, darkMat, [0, 0, 0.26]);
  addMesh(rightElev, elevGeo, darkMat, [0, 0, 0.26]);

  // Elevator Trim Tabs
  const trimGeo = new THREE.BoxGeometry(0.85, 0.06, 0.14);
  addMesh(leftElev, trimGeo, teamMat, [0, 0, 0.54]);
  addMesh(rightElev, trimGeo, teamMat, [0, 0, 0.54]);

  // Dual Vertical Fins / Rudders mounted at outer tips of H-tail (X = ±2.55)
  // Positioned to shield hot engine exhausts from side-aspect IR seekers
  const vFinShape = new THREE.Shape();
  vFinShape.moveTo(0, 0);
  vFinShape.lineTo(0.45, 2.25);  // Swept leading edge
  vFinShape.lineTo(1.55, 2.25);  // Flat upper fin cap
  vFinShape.lineTo(1.75, 0.0);   // Nearly vertical trailing rudder edge
  vFinShape.lineTo(0, 0);        // Bottom chord

  const vFinExtrude = {
    steps: 1,
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2
  };
  const vFinGeo = new THREE.ExtrudeGeometry(vFinShape, vFinExtrude);
  vFinGeo.rotateY(Math.PI / 2); // Map chord to +Z, thickness to +X

  for (let side of [-1, 1]) {
    const finX = side * 2.55;
    const finWrapper = new THREE.Group();
    finWrapper.position.set(finX, -0.45, -0.95);
    tailGroup.add(finWrapper);

    // Main Vertical Stabilizer Fin
    addMesh(finWrapper, vFinGeo, bodyMat, [-0.06, 0, 0]);

    // Squadron Top Fin Flash Band
    const finBandGeo = new THREE.BoxGeometry(0.19, 0.26, 1.12);
    addMesh(finWrapper, finBandGeo, teamMat, [0, 2.08, 0.98]);

    // RWR (Radar Warning Receiver) Antenna Bullet Pods on Fin Tips
    const rwrPodGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.35, 10);
    rwrPodGeo.rotateX(Math.PI / 2);
    addMesh(finWrapper, rwrPodGeo, darkMat, [0, 2.28, 0.98]);

    // Articulated Rudder Flap Seam
    const rudderGeo = new THREE.BoxGeometry(0.14, 1.95, 0.42);
    addMesh(finWrapper, rudderGeo, darkMat, [0, 1.02, 1.52], [-0.08, 0, 0]);

    // Lower Ventral Strake under each vertical fin
    const strakeGeo = new THREE.BoxGeometry(0.12, 0.38, 1.45);
    addMesh(finWrapper, strakeGeo, darkMat, [0, -0.15, 0.85], [0.12, 0, 0]);
  }

  return { leftElev, rightElev, abGroup };
}

/**
 * Builds the procedural PHANTOM airframe (Su-47 Berkut / VF-9 inspired experimental dogfighter).
 *
 * Coordinate System & Dimensions:
 * - Nose: -Z (Airframe radome tip at Z = -7.6, pitot needle to Z = -8.4)
 * - Tail: +Z (Central ECM stinger at Z = +5.6, afterburner plumes to Z = +6.4)
 * - Overall Length: ~14.8 units | Wingspan: 12.0 units (X = -6.0 to +6.0)
 * - Left Wing: -X | Right Wing: +X | Dorsal: +Y
 *
 * @param {THREE.Group} hiDetail  - Target parent group to populate.
 * @param {THREE.Material} bodyMat   - Primary airframe composite material.
 * @param {THREE.Material} darkMat   - RAM edges, intakes, cockpit tub, and actuator trim.
 * @param {THREE.Material} teamMat   - Squadron livery markings and high-vis accents.
 * @param {THREE.Material} nozzleMat - Titanium thrust-vectoring exhaust petal material.
 * @returns {{ leftElev: THREE.Group, rightElev: THREE.Group, abGroup: THREE.Group }}
 */
function buildPhantomAirframe(hiDetail, bodyMat, darkMat, teamMat, nozzleMat) {
  const abGroup = new THREE.Group();
  abGroup.name = 'phantom_afterburner_group';

  const leftElev = new THREE.Group();
  leftElev.name = 'phantom_left_elevon';

  const rightElev = new THREE.Group();
  rightElev.name = 'phantom_right_elevon';

  // ---------------------------------------------------------------------------
  // INTERNAL PROCEDURAL MATERIALS (Self-contained optical & plasma shaders)
  // ---------------------------------------------------------------------------
  const canopyGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x162632,
    emissive: 0x040a10,
    metalness: 0.35,
    roughness: 0.08,
    transparent: true,
    opacity: 0.76,
    reflectivity: 0.95
  });

  const hudMat = new THREE.MeshBasicMaterial({
    color: 0x00ffaa,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const nvgGlowMat = new THREE.MeshBasicMaterial({
    color: 0x33ff88
  });

  const flameHolderGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff6611,
    side: THREE.DoubleSide
  });

  const abCoreMat = new THREE.MeshBasicMaterial({
    color: 0xaaddff,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const abPlumeMat = new THREE.MeshBasicMaterial({
    color: 0x2266ff,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const shockDiamondMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  // ---------------------------------------------------------------------------
  // GEOMETRY HELPERS (Outward-winding guaranteed faceted lofts & airfoils)
  // ---------------------------------------------------------------------------
  function pushOutwardTriangle(positions, a, b, c, refCenter) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    const mx = (a[0] + b[0] + c[0]) / 3 - refCenter[0];
    const my = (a[1] + b[1] + c[1]) / 3 - refCenter[1];
    const mz = (a[2] + b[2] + c[2]) / 3 - refCenter[2];

    if (nx * mx + ny * my + nz * mz < 0) {
      positions.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]);
    } else {
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    }
  }

  function getCentroid(pts) {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < pts.length; i++) {
      cx += pts[i][0];
      cy += pts[i][1];
      cz += pts[i][2];
    }
    const n = pts.length || 1;
    return [cx / n, cy / n, cz / n];
  }

  /**
   * Lofts a faceted 3D mesh through an ordered array of cross-sections.
   * All cross-sections must have the same number of perimeter points.
   */
  function createLoftGeometry(sections, capFront = true, capBack = true) {
    const positions = [];
    const numSections = sections.length;
    const ringCount = sections[0].length;

    for (let s = 0; s < numSections - 1; s++) {
      const ringA = sections[s];
      const ringB = sections[s + 1];
      const cA = getCentroid(ringA);
      const cB = getCentroid(ringB);
      const midCenter = [
        (cA[0] + cB[0]) * 0.5,
        (cA[1] + cB[1]) * 0.5,
        (cA[2] + cB[2]) * 0.5
      ];

      for (let i = 0; i < ringCount; i++) {
        const next = (i + 1) % ringCount;
        const a0 = ringA[i];
        const a1 = ringA[next];
        const b0 = ringB[i];
        const b1 = ringB[next];

        pushOutwardTriangle(positions, a0, a1, b1, midCenter);
        pushOutwardTriangle(positions, a0, b1, b0, midCenter);
      }
    }

    if (capFront) {
      const frontRing = sections[0];
      const frontCenter = getCentroid(frontRing);
      const innerRef = getCentroid(sections[1]);
      for (let i = 0; i < ringCount; i++) {
        const next = (i + 1) % ringCount;
        pushOutwardTriangle(positions, frontCenter, frontRing[i], frontRing[next], innerRef);
      }
    }

    if (capBack) {
      const backRing = sections[numSections - 1];
      const backCenter = getCentroid(backRing);
      const innerRef = getCentroid(sections[numSections - 2]);
      for (let i = 0; i < ringCount; i++) {
        const next = (i + 1) % ringCount;
        pushOutwardTriangle(positions, backCenter, backRing[next], backRing[i], innerRef);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Builds a 6-point hexagonal biconvex stealth airfoil section in 3D space.
   */
  function makeAirfoilRing(x, y, zLead, zTrail, thickness, camberY = 0) {
    const chord = zTrail - zLead;
    const zPeak1 = zLead + chord * 0.28;
    const zPeak2 = zLead + chord * 0.68;
    const halfT = thickness * 0.5;
    return [
      [x, y, zLead],                                 // Leading edge razor
      [x, y + halfT + camberY, zPeak1],              // Forward upper ridge
      [x, y + halfT * 0.72 + camberY * 0.6, zPeak2], // Aft upper ridge
      [x, y, zTrail],                                // Trailing edge razor
      [x, y - halfT * 0.65, zPeak2],                 // Aft lower ridge
      [x, y - halfT * 0.85, zPeak1]                  // Forward lower ridge
    ];
  }

  // ===========================================================================
  // 1. FOREBODY, CHISELED RADOME & DORSAL SPINE
  // ===========================================================================
  const fuselageGroup = new THREE.Group();

  // 8-point chiseled stealth cross-section generator:
  // [topCenter, rightUpper, rightChine, rightLower, bottomCenter, leftLower, leftChine, leftUpper]
  function makeFuselageSection(z, halfW, chineY, topY, botY, shoulderW, bellyW) {
    return [
      [0, topY, z],
      [shoulderW, topY * 0.72 + chineY * 0.28, z],
      [halfW, chineY, z],
      [bellyW, botY * 0.85, z],
      [0, botY, z],
      [-bellyW, botY * 0.85, z],
      [-halfW, chineY, z],
      [-shoulderW, topY * 0.72 + chineY * 0.28, z]
    ];
  }

  const forebodySections = [
    makeFuselageSection(-7.60, 0.02, -0.06, -0.04, -0.08, 0.01, 0.01), // Radome apex
    makeFuselageSection(-6.50, 0.38, -0.04,  0.14, -0.19, 0.22, 0.24), // Radome mid
    makeFuselageSection(-5.10, 0.74,  0.00,  0.30, -0.32, 0.45, 0.48), // Forward cockpit bulkhead
    makeFuselageSection(-3.60, 1.05,  0.04,  0.34, -0.38, 0.56, 0.65), // Mid cockpit / chine flare
    makeFuselageSection(-2.10, 1.38,  0.06,  0.42, -0.34, 0.68, 0.85), // Canard mount chine root
    makeFuselageSection(-0.60, 1.44,  0.05,  0.48, -0.18, 0.78, 0.90), // LERX blend into tunnel ceiling
    makeFuselageSection( 1.40, 1.40,  0.04,  0.46, -0.14, 0.76, 0.85), // Mid spine over weapon tunnel
    makeFuselageSection( 3.50, 1.25,  0.02,  0.36, -0.12, 0.62, 0.75)  // Aft deck transition
  ];

  const forebodyMesh = new THREE.Mesh(createLoftGeometry(forebodySections, true, true), bodyMat);
  fuselageGroup.add(forebodyMesh);

  // Dark dielectric radome nose cap & sawtooth lightning diverter band
  const radomeCapSections = [
    makeFuselageSection(-7.62, 0.015, -0.06, -0.045, -0.075, 0.01, 0.01),
    makeFuselageSection(-6.85, 0.27,  -0.045, 0.09,  -0.15,  0.16, 0.17)
  ];
  fuselageGroup.add(new THREE.Mesh(createLoftGeometry(radomeCapSections, true, false), darkMat));

  // Supersonic pitot probe (-7.6 to -8.4)
  const pitotGeo = new THREE.ConeGeometry(0.022, 0.85, 6);
  pitotGeo.rotateX(-Math.PI / 2);
  const pitotMesh = new THREE.Mesh(pitotGeo, nozzleMat);
  pitotMesh.position.set(0, -0.06, -8.0);
  fuselageGroup.add(pitotMesh);

  // Dorsal anti-glare shield ahead of canopy
  const glareShieldSections = [
    [[-0.08, 0.14, -6.5], [0.08, 0.14, -6.5], [0.16, 0.11, -6.5], [-0.16, 0.11, -6.5]],
    [[-0.22, 0.31, -5.0], [0.22, 0.31, -5.0], [0.36, 0.24, -5.0], [-0.36, 0.24, -5.0]]
  ];
  fuselageGroup.add(new THREE.Mesh(createLoftGeometry(glareShieldSections, true, true), darkMat));

  // ===========================================================================
  // 2. WIDE-SPACED TWIN ENGINE NACELLES & VENTRAL WEAPON TUNNEL
  // ===========================================================================
  for (const side of [-1, 1]) {
    // Caret-style stealth supersonic intake lip & duct (Z = -2.75 to -1.6)
    const intakeOuterX = side * 1.38;
    const intakeInnerX = side * 0.52;

    // Swept caret intake cowl (bodyMat exterior)
    const nacelleSections = [
      // Section 0: Forward caret intake lip (Z = -2.75 outer, -2.35 inner)
      [
        [intakeInnerX,  0.08, -2.35],
        [intakeOuterX,  0.06, -2.75],
        [intakeOuterX * 1.03, -0.44, -2.40],
        [side * 0.95,  -0.52, -2.25],
        [intakeInnerX, -0.46, -2.20]
      ],
      // Section 1: Forward nacelle body (Z = -0.8)
      [
        [side * 0.50,  0.16, -0.80],
        [side * 1.42,  0.14, -0.80],
        [side * 1.38, -0.46, -0.80],
        [side * 0.94, -0.56, -0.80],
        [side * 0.54, -0.48, -0.80]
      ],
      // Section 2: Mid nacelle at main wing box (Z = 1.6)
      [
        [side * 0.50,  0.26, 1.60],
        [side * 1.40,  0.22, 1.60],
        [side * 1.36, -0.44, 1.60],
        [side * 0.92, -0.54, 1.60],
        [side * 0.54, -0.46, 1.60]
      ],
      // Section 3: Aft nacelle approaching nozzle shroud (Z = 3.6)
      [
        [side * 0.52,  0.28, 3.60],
        [side * 1.32,  0.24, 3.60],
        [side * 1.28, -0.36, 3.60],
        [side * 0.92, -0.46, 3.60],
        [side * 0.56, -0.38, 3.60]
      ],
      // Section 4: Nozzle mounting bulkhead ring (Z = 4.45)
      [
        [side * 0.56,  0.22, 4.45],
        [side * 1.24,  0.20, 4.45],
        [side * 1.22, -0.28, 4.45],
        [side * 0.92, -0.38, 4.45],
        [side * 0.58, -0.30, 4.45]
      ]
    ];

    const nacelleMesh = new THREE.Mesh(createLoftGeometry(nacelleSections, false, true), bodyMat);
    fuselageGroup.add(nacelleMesh);

    // Recessed dark intake throat & splitter plate
    const throatSections = [
      [
        [intakeInnerX * 1.03,  0.03, -2.32],
        [intakeOuterX * 0.96,  0.01, -2.68],
        [intakeOuterX * 0.98, -0.40, -2.36],
        [intakeInnerX * 1.03, -0.42, -2.18]
      ],
      [
        [side * 0.65, -0.02, -1.50],
        [side * 1.20, -0.02, -1.50],
        [side * 1.18, -0.36, -1.50],
        [side * 0.65, -0.36, -1.50]
      ]
    ];
    fuselageGroup.add(new THREE.Mesh(createLoftGeometry(throatSections, true, true), darkMat));

    // Ventral aerodynamic strake under each nacelle (canted outward 15 deg)
    const vStrakeSections = [
      makeAirfoilRing(side * 1.05, -0.48, 1.80, 4.20, 0.06),
      makeAirfoilRing(side * 1.24, -0.86, 2.50, 4.05, 0.03)
    ];
    fuselageGroup.add(new THREE.Mesh(createLoftGeometry(vStrakeSections, true, true), darkMat));
  }

  // Ventral Weapon Groove / Lifting Tunnel Detailing (Centerline between X = -0.52 and +0.52)
  const tunnelCeilingGeo = new THREE.BoxGeometry(1.02, 0.06, 5.4);
  const tunnelCeiling = new THREE.Mesh(tunnelCeilingGeo, darkMat);
  tunnelCeiling.position.set(0, -0.16, 0.85);
  fuselageGroup.add(tunnelCeiling);

  // Centerline weapon bay divider rib & longitudinal missile ejector rails
  for (const rx of [-0.26, 0.0, 0.26]) {
    const railGeo = new THREE.BoxGeometry(rx === 0 ? 0.05 : 0.035, 0.08, 4.6);
    const railMesh = new THREE.Mesh(railGeo, rx === 0 ? bodyMat : darkMat);
    railMesh.position.set(rx, -0.21, 0.8);
    fuselageGroup.add(railMesh);
  }

  // Semi-recessed centerline radar-guided BVR missiles tucked inside the ventral lifting tunnel
  for (const side of [-1, 1]) {
    const bvrGroup = new THREE.Group();
    const mBodyGeo = new THREE.CylinderGeometry(0.075, 0.075, 2.6, 8);
    mBodyGeo.rotateX(Math.PI / 2);
    bvrGroup.add(new THREE.Mesh(mBodyGeo, darkMat));

    const mNoseGeo = new THREE.ConeGeometry(0.075, 0.55, 8);
    mNoseGeo.rotateX(-Math.PI / 2);
    const mNose = new THREE.Mesh(mNoseGeo, bodyMat);
    mNose.position.z = -1.575;
    bvrGroup.add(mNose);

    const mBandGeo = new THREE.CylinderGeometry(0.078, 0.078, 0.18, 8);
    mBandGeo.rotateX(Math.PI / 2);
    const mBand = new THREE.Mesh(mBandGeo, teamMat);
    mBand.position.z = -0.75;
    bvrGroup.add(mBand);

    bvrGroup.position.set(side * 0.26, -0.26, 0.65);
    fuselageGroup.add(bvrGroup);
  }

  hiDetail.add(fuselageGroup);

  // ===========================================================================
  // 3. TAIL STINGER (Rear-Facing Radar & ECM Jammer Between Engines)
  // ===========================================================================
  const stingerSections = [
    makeFuselageSection(2.60, 0.52,  0.06, 0.34, -0.14, 0.36, 0.38),
    makeFuselageSection(3.80, 0.44,  0.04, 0.26, -0.12, 0.30, 0.30),
    makeFuselageSection(4.85, 0.28,  0.02, 0.15, -0.09, 0.18, 0.18),
    makeFuselageSection(5.35, 0.14,  0.00, 0.08, -0.05, 0.09, 0.09)
  ];
  const stingerMesh = new THREE.Mesh(createLoftGeometry(stingerSections, false, true), bodyMat);
  hiDetail.add(stingerMesh);

  // Dielectric ECM / Rear-Warning Radar Dome Tip (Z = 5.35 to 5.60)
  const ecmDomeSections = [
    makeFuselageSection(5.35, 0.14, 0.00, 0.08, -0.05, 0.09, 0.09),
    makeFuselageSection(5.52, 0.08, 0.00, 0.04, -0.03, 0.05, 0.05),
    makeFuselageSection(5.60, 0.02, 0.00, 0.01, -0.01, 0.01, 0.01)
  ];
  hiDetail.add(new THREE.Mesh(createLoftGeometry(ecmDomeSections, false, true), darkMat));

  // Dorsal Chaff/Flare Countermeasure Dispenser Matrices on the Stinger Spine
  for (let i = 0; i < 3; i++) {
    const cmGeo = new THREE.BoxGeometry(0.32, 0.04, 0.28);
    const cmMesh = new THREE.Mesh(cmGeo, darkMat);
    cmMesh.position.set(0, 0.28 - i * 0.035, 3.3 + i * 0.42);
    cmMesh.rotation.x = 0.08;
    hiDetail.add(cmMesh);
  }

  // ===========================================================================
  // 4. CHISELED STEALTH CANOPY, PILOT WITH NVG HELMET & HOLOGRAPHIC HUD
  // ===========================================================================
  const cockpitGroup = new THREE.Group();

  // Recessed dark cockpit tub
  const tubGeo = new THREE.BoxGeometry(0.76, 0.32, 2.75);
  const tubMesh = new THREE.Mesh(tubGeo, darkMat);
  tubMesh.position.set(0, 0.24, -3.45);
  cockpitGroup.add(tubMesh);

  // Forward instrument coaming shroud
  const coamingGeo = new THREE.BoxGeometry(0.68, 0.22, 0.65);
  const coamingMesh = new THREE.Mesh(coamingGeo, darkMat);
  coamingMesh.position.set(0, 0.42, -4.45);
  coamingMesh.rotation.x = 0.25;
  cockpitGroup.add(coamingMesh);

  // Wide-Angle Holographic HUD Combiner Glass & Glowing Reticle
  const hudFrameGeo = new THREE.BoxGeometry(0.46, 0.04, 0.26);
  const hudFrame = new THREE.Mesh(hudFrameGeo, darkMat);
  hudFrame.position.set(0, 0.53, -4.32);
  cockpitGroup.add(hudFrame);

  const hudGlassGeo = new THREE.PlaneGeometry(0.42, 0.28);
  const hudGlass = new THREE.Mesh(hudGlassGeo, hudMat);
  hudGlass.position.set(0, 0.64, -4.28);
  hudGlass.rotation.x = -0.52;
  cockpitGroup.add(hudGlass);

  // Inner HUD targeting ring
  const reticleGeo = new THREE.RingGeometry(0.045, 0.058, 16);
  const reticleMesh = new THREE.Mesh(reticleGeo, hudMat);
  reticleMesh.position.set(0, 0.645, -4.275);
  reticleMesh.rotation.x = -0.52;
  cockpitGroup.add(reticleMesh);

  // Inclined Zero-Zero Ejection Seat
  const seatGroup = new THREE.Group();
  seatGroup.position.set(0, 0.32, -3.25);
  seatGroup.rotation.x = -0.28; // Reclined high-G posture

  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.68, 0.12), darkMat);
  seatBack.position.set(0, 0.28, 0.12);
  seatGroup.add(seatBack);

  const seatPan = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.10, 0.42), darkMat);
  seatPan.position.set(0, -0.02, -0.08);
  seatGroup.add(seatPan);

  const headRest = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.16), teamMat);
  headRest.position.set(0, 0.66, 0.10);
  seatGroup.add(headRest);

  // Pilot Figure (Torso, Flight Suit Shoulders, Helmet, Quad-Tube Night-Vision Goggles)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.24), darkMat);
  torso.position.set(0, 0.24, -0.02);
  seatGroup.add(torso);

  const harness = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.40, 0.25), teamMat);
  harness.position.set(0, 0.25, -0.02);
  seatGroup.add(harness);

  const helmetGeo = new THREE.IcosahedronGeometry(0.165, 1);
  const helmet = new THREE.Mesh(helmetGeo, bodyMat);
  helmet.scale.set(0.92, 1.05, 1.12);
  helmet.position.set(0, 0.60, -0.05);
  seatGroup.add(helmet);

  const visorGeo = new THREE.SphereGeometry(0.158, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  visorGeo.rotateX(-Math.PI * 0.6);
  const visor = new THREE.Mesh(visorGeo, darkMat);
  visor.position.set(0, 0.61, -0.07);
  seatGroup.add(visor);

  // Quad-eye Panoramic Night-Vision Goggle (PNVG) rack on helmet brow
  const nvgMount = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.055, 0.08), darkMat);
  nvgMount.position.set(0, 0.64, -0.21);
  seatGroup.add(nvgMount);

  for (const nx of [-0.085, -0.03, 0.03, 0.085]) {
    const tubeGeo = new THREE.CylinderGeometry(0.018, 0.022, 0.09, 8);
    tubeGeo.rotateX(Math.PI / 2);
    const tube = new THREE.Mesh(tubeGeo, darkMat);
    tube.position.set(nx, 0.635, -0.24);
    seatGroup.add(tube);

    const lensGeo = new THREE.CircleGeometry(0.016, 8);
    const lens = new THREE.Mesh(lensGeo, nvgGlowMat);
    lens.position.set(nx, 0.635, -0.286);
     lens.rotation.y = Math.PI;
    seatGroup.add(lens);
  }

  cockpitGroup.add(seatGroup);

  // Chiseled Faceted Stealth Canopy Glass (5-section hexagonal loft)
  function makeCanopySection(z, halfW, baseY, shoulderY, peakY) {
    return [
      [0, peakY, z],
      [halfW * 0.62, shoulderY, z],
      [halfW, baseY, z],
      [-halfW, baseY, z],
      [-halfW * 0.62, shoulderY, z]
    ];
  }

  const canopySections = [
    makeCanopySection(-5.05, 0.18, 0.30, 0.33, 0.34), // Front windscreen apex
    makeCanopySection(-4.15, 0.42, 0.35, 0.72, 0.80), // Forward HUD arch
    makeCanopySection(-3.25, 0.46, 0.38, 0.82, 0.92), // Main pilot bubble peak
    makeCanopySection(-2.15, 0.38, 0.42, 0.68, 0.74), // Aft deck taper
    makeCanopySection(-1.20, 0.20, 0.46, 0.50, 0.51)  // Spine fairing blend
  ];
  const canopyMesh = new THREE.Mesh(createLoftGeometry(canopySections, true, true), canopyGlassMat);
  cockpitGroup.add(canopyMesh);

  // Chiseled Canopy Frame Bow Struts (bodyMat / darkMat)
  for (const fz of [-4.15, -3.25, -2.15]) {
    const archGeo = new THREE.BoxGeometry(0.88, 0.035, 0.045);
    const arch = new THREE.Mesh(archGeo, bodyMat);
    arch.position.set(0, fz === -3.25 ? 0.65 : 0.58, fz);
    cockpitGroup.add(arch);
  }

  hiDetail.add(cockpitGroup);

  // ===========================================================================
  // 5. RADICAL FORWARD-SWEPT MAIN WINGS (-25° SWEEP), FENCES & MISSILE RAILS
  // ===========================================================================
  // Wing geometry parameters:
  // Root X = ±1.35 (Z_lead = 0.25, Z_trail = 3.35)
  // Mid kink X = ±3.20 (Z_lead = -0.62, Z_trail = 1.95)
  // Tip X = ±5.88 (Z_lead = -1.86, Z_trail = -0.32) -> exact -25° forward sweep
  for (const side of [-1, 1]) {
    // Inboard structural wing box (ahead of the elevon bay)
    const inboardSections = [
      makeAirfoilRing(side * 1.32, 0.04,  0.25, 3.35, 0.22, 0.01),
      makeAirfoilRing(side * 2.15, 0.02, -0.14, 2.20, 0.17, 0.01),
      makeAirfoilRing(side * 4.20, -0.01, -1.08, 1.35, 0.12, 0.005),
      makeAirfoilRing(side * 5.88, -0.03, -1.86, -0.32, 0.07, 0.0)
    ];
    const mainWingMesh = new THREE.Mesh(createLoftGeometry(inboardSections, true, true), bodyMat);
    hiDetail.add(mainWingMesh);

    // Sharp Dark RAM Leading-Edge Cuff along full forward-swept span
    const leCuffSections = [
      makeAirfoilRing(side * 1.34, 0.04,  0.18,  0.55, 0.10),
      makeAirfoilRing(side * 3.60, 0.00, -0.86, -0.52, 0.08),
      makeAirfoilRing(side * 5.88, -0.03, -1.92, -1.58, 0.055)
    ];
    hiDetail.add(new THREE.Mesh(createLoftGeometry(leCuffSections, true, true), darkMat));

    // High-Vis Squadron Livery Chevron Stripe on Upper & Lower Outer Wing Panels
    const stripeSections = [
      makeAirfoilRing(side * 3.85, 0.00, -0.65,  0.65, 0.132, 0.005),
      makeAirfoilRing(side * 4.55, -0.01, -0.98,  0.20, 0.116, 0.004)
    ];
    hiDetail.add(new THREE.Mesh(createLoftGeometry(stripeSections, true, true), teamMat));

    // Upper-Surface Chordwise Aerodynamic Vortex Fences (Su-47 Berkut signature feature)
    for (const fenceCfg of [
      { x: 2.35, zStart: -0.22, zEnd: 1.95, h: 0.18 },
      { x: 4.10, zStart: -1.02, zEnd: 0.85, h: 0.14 }
    ]) {
      const fx = side * fenceCfg.x;
      const fenceSections = [
        [
          [fx - 0.018, 0.04, fenceCfg.zStart],
          [fx - 0.018, 0.04 + fenceCfg.h, fenceCfg.zStart + 0.18],
          [fx - 0.018, 0.04 + fenceCfg.h * 0.65, fenceCfg.zEnd - 0.12],
          [fx - 0.018, 0.03, fenceCfg.zEnd]
        ],
        [
          [fx + 0.018, 0.04, fenceCfg.zStart],
          [fx + 0.018, 0.04 + fenceCfg.h, fenceCfg.zStart + 0.18],
          [fx + 0.018, 0.04 + fenceCfg.h * 0.65, fenceCfg.zEnd - 0.12],
          [fx + 0.018, 0.03, fenceCfg.zEnd]
        ]
      ];
      hiDetail.add(new THREE.Mesh(createLoftGeometry(fenceSections, true, true), darkMat));
    }

    // Wingtip Launch Rail (Positioned at X = ±5.92, outer missile fin reaches X = ±6.00 -> 12.0 span)
    const railGroup = new THREE.Group();
    railGroup.position.set(side * 5.92, -0.03, -1.15);

    const railBeam = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 2.35), darkMat);
    railGroup.add(railBeam);

    const railNose = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.35, 6), darkMat);
    railNose.rotation.x = -Math.PI / 2;
    railNose.position.z = -1.35;
    railGroup.add(railNose);

    // Wingtip Agile Dogfight Missile (AIM-9X / R-73 class)
    const tipMissile = new THREE.Group();
    tipMissile.position.set(side * 0.08, -0.04, -0.15);

    const mTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 2.15, 8).rotateX(Math.PI / 2),
      bodyMat
    );
    tipMissile.add(mTube);

    const mSeeker = new THREE.Mesh(
      new THREE.ConeGeometry(0.052, 0.28, 8).rotateX(-Math.PI / 2),
      darkMat
    );
    mSeeker.position.z = -1.215;
    tipMissile.add(mSeeker);

    // Missile forward steering fins & aft delta fins
    const canardFin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.015, 0.12), darkMat);
    canardFin.position.z = -0.82;
    tipMissile.add(canardFin);

    const canardFinV = canardFin.clone();
    canardFinV.rotation.z = Math.PI / 2;
    tipMissile.add(canardFinV);

    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.018, 0.28), teamMat);
    tailFin.position.z = 0.88;
    tipMissile.add(tailFin);

    const tailFinV = tailFin.clone();
    tailFinV.rotation.z = Math.PI / 2;
    tipMissile.add(tailFinV);

    railGroup.add(tipMissile);
    hiDetail.add(railGroup);
  }

  // ===========================================================================
  // 6. CONTROL ELEVONS (leftElev & rightElev)
  // ===========================================================================
  // Positioned at the trailing-edge hinge line so .rotation.x pitches/rolls cleanly
  function populateElevon(elevGroup, side) {
    elevGroup.position.set(side * 3.15, 0.01, 1.85);

    // Local coordinates relative to hinge line at (side * 3.15, 0.01, 1.85)
    const innerX = side * (2.15 - 3.15); // ±1.00 inboard
    const outerX = side * (4.20 - 3.15); // ±1.05 outboard

    const elevSections = [
      makeAirfoilRing(innerX, 0.0,  0.25, 1.15, 0.11),
      makeAirfoilRing(outerX, -0.02, -0.52, 0.22, 0.08)
    ];

    const elevMesh = new THREE.Mesh(createLoftGeometry(elevSections, true, true), bodyMat);
    elevGroup.add(elevMesh);

    // Trailing-edge RAM sawtooth trim
    const trimSections = [
      makeAirfoilRing(innerX, 0.0,  0.92, 1.18, 0.045),
      makeAirfoilRing(outerX, -0.02, 0.02, 0.25, 0.035)
    ];
    elevGroup.add(new THREE.Mesh(createLoftGeometry(trimSections, true, true), darkMat));

    // Under-wing aerodynamic flap track fairing
    const fairingGeo = new THREE.ConeGeometry(0.055, 0.75, 6);
    fairingGeo.rotateX(Math.PI / 2);
    const fairing = new THREE.Mesh(fairingGeo, darkMat);
    fairing.position.set(0, -0.08, 0.35);
    elevGroup.add(fairing);
  }

  populateElevon(leftElev, -1);
  populateElevon(rightElev, 1);
  hiDetail.add(leftElev);
  hiDetail.add(rightElev);

  // ===========================================================================
  // 7. ACTIVE ALL-MOVING FORWARD CANARDS (Mounted on Fuselage Chines)
  // ===========================================================================
  for (const side of [-1, 1]) {
    const canardGroup = new THREE.Group();
    canardGroup.position.set(side * 1.35, 0.07, -2.05);
    canardGroup.rotation.z = side * 0.11; // Slight positive dihedral for vortex interaction

    // Titanium pivot spindle
    const spindleGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.24, 8);
    spindleGeo.rotateZ(Math.PI / 2);
    canardGroup.add(new THREE.Mesh(spindleGeo, nozzleMat));

    // All-moving stealth canard airfoil surface
    const canardSections = [
      makeAirfoilRing(0.0,          0.0, -0.68, 0.72, 0.095),
      makeAirfoilRing(side * 1.15,  0.0, -0.18, 0.58, 0.065),
      makeAirfoilRing(side * 1.62,  0.0,  0.12, 0.48, 0.035)
    ];
    canardGroup.add(new THREE.Mesh(createLoftGeometry(canardSections, true, true), bodyMat));

    // Dark composite leading edge & team-colored tip cap
    const canardLESections = [
      makeAirfoilRing(side * 0.02, 0.0, -0.71, -0.45, 0.05),
      makeAirfoilRing(side * 1.60, 0.0,  0.09,  0.24, 0.028)
    ];
    canardGroup.add(new THREE.Mesh(createLoftGeometry(canardLESections, true, true), darkMat));

    const canardTipSections = [
      makeAirfoilRing(side * 1.40, 0.0, -0.02, 0.52, 0.048),
      makeAirfoilRing(side * 1.63, 0.0,  0.12, 0.48, 0.036)
    ];
    canardGroup.add(new THREE.Mesh(createLoftGeometry(canardTipSections, true, true), teamMat));

    hiDetail.add(canardGroup);
  }

  // ===========================================================================
  // 8. TWIN CANTED VERTICAL STABILIZERS (20° Outward Cant + Full-Span Rudders)
  // ===========================================================================
  const cantAngle = (20 * Math.PI) / 180;

  for (const side of [-1, 1]) {
    const tailFinGroup = new THREE.Group();
    tailFinGroup.position.set(side * 1.08, 0.24, 3.15);
    tailFinGroup.rotation.z = -side * cantAngle; // Canted outward at 20°

    // Dorsal cooling air scoop at vertical stabilizer root
    const rootScoop = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 1.85), darkMat);
    rootScoop.position.set(0, 0.06, -0.15);
    tailFinGroup.add(rootScoop);

    // Main vertical fin structural box (Lofted along local Y from 0 to 1.95)
    function makeVertFinRing(localY, zLead, zTrail, thickness) {
      const chord = zTrail - zLead;
      const zPeak1 = zLead + chord * 0.30;
      const zPeak2 = zLead + chord * 0.72;
      const halfT = thickness * 0.5;
      return [
        [0, localY, zLead],
        [halfT, localY, zPeak1],
        [halfT * 0.7, localY, zPeak2],
        [0, localY, zTrail],
        [-halfT * 0.7, localY, zPeak2],
        [-halfT, localY, zPeak1]
      ];
    }

    const finSections = [
      makeVertFinRing(0.0,  -0.95, 1.20, 0.16),
      makeVertFinRing(1.10, -0.20, 1.35, 0.11),
      makeVertFinRing(1.92,  0.42, 1.45, 0.065)
    ];
    tailFinGroup.add(new THREE.Mesh(createLoftGeometry(finSections, true, true), bodyMat));

    // Leading-edge RAM strip on vertical stabilizer
    const finLESections = [
      makeVertFinRing(0.02, -1.00, -0.68, 0.08),
      makeVertFinRing(1.90,  0.38,  0.58, 0.045)
    ];
    tailFinGroup.add(new THREE.Mesh(createLoftGeometry(finLESections, true, true), darkMat));

    // Full-Span Rudder Assembly along the trailing edge
    const rudderSections = [
      makeVertFinRing(0.06, 1.18, 1.68, 0.085),
      makeVertFinRing(1.86, 1.42, 1.78, 0.048)
    ];
    tailFinGroup.add(new THREE.Mesh(createLoftGeometry(rudderSections, true, true), darkMat));

    // Squadron Team Flash Banner near top of tail fin
    const flashSections = [
      makeVertFinRing(1.42, 0.12, 1.40, 0.092),
      makeVertFinRing(1.78, 0.34, 1.44, 0.074)
    ];
    tailFinGroup.add(new THREE.Mesh(createLoftGeometry(flashSections, true, true), teamMat));

    // Fin-tip RWR / Electronic Warfare Pod
    const tipPodGeo = new THREE.CylinderGeometry(0.042, 0.042, 1.25, 8);
    tipPodGeo.rotateX(Math.PI / 2);
    const tipPod = new THREE.Mesh(tipPodGeo, darkMat);
    tipPod.position.set(0, 1.95, 1.02);
    tailFinGroup.add(tipPod);

    hiDetail.add(tailFinGroup);
  }

  // ===========================================================================
  // 9. TWIN THRUST-VECTORING TITANIUM PETAL NOZZLES & AFTERBURNER (abGroup)
  // ===========================================================================
  const numPetals = 14;

  for (const side of [-1, 1]) {
    const engineX = side * 0.92;
    const engineY = -0.05;
    const nozzleStartZ = 4.42;

    const nozzleAssembly = new THREE.Group();
    nozzleAssembly.position.set(engineX, engineY, nozzleStartZ);

    // Base actuator collar shroud
    const collarGeo = new THREE.CylinderGeometry(0.42, 0.44, 0.32, 14, 1, true);
    collarGeo.rotateX(Math.PI / 2);
    const collarMesh = new THREE.Mesh(collarGeo, darkMat);
    collarMesh.position.z = 0.14;
    nozzleAssembly.add(collarMesh);

    // Inner dark exhaust duct wall
    const linerGeo = new THREE.CylinderGeometry(0.32, 0.37, 0.82, 14, 1, true);
    linerGeo.rotateX(Math.PI / 2);
    const linerMesh = new THREE.Mesh(linerGeo, darkMat);
    linerMesh.position.z = 0.38;
    nozzleAssembly.add(linerMesh);

    // Ring of 14 overlapping titanium thrust-vectoring divergent petals (nozzleMat)
    for (let p = 0; p < numPetals; p++) {
      const angle = (p / numPetals) * Math.PI * 2;
      const petalPivot = new THREE.Group();
      petalPivot.rotation.z = angle;

      // Outer titanium turkey-feather petal
      const petalGeo = new THREE.BoxGeometry(0.165, 0.028, 0.62);
      const petalMesh = new THREE.Mesh(petalGeo, nozzleMat);
      petalMesh.position.set(0, 0.385, 0.52);
      petalMesh.rotation.x = -0.14; // Convergent-divergent taper
      petalPivot.add(petalMesh);

      // External vectoring hinge strut
      const strutGeo = new THREE.BoxGeometry(0.045, 0.045, 0.36);
      const strutMesh = new THREE.Mesh(strutGeo, darkMat);
      strutMesh.position.set(0, 0.42, 0.32);
      strutMesh.rotation.x = -0.08;
      petalPivot.add(strutMesh);

      nozzleAssembly.add(petalPivot);
    }

    hiDetail.add(nozzleAssembly);

    // -------------------------------------------------------------------------
    // AFTERBURNER & REHEAT FLAME HOLDERS (Added to abGroup)
    // -------------------------------------------------------------------------
    const engineAbGroup = new THREE.Group();
    engineAbGroup.position.set(engineX, engineY, nozzleStartZ);

    // Turbine tail-cone hub deep inside exhaust cavity
    const hubConeGeo = new THREE.ConeGeometry(0.16, 0.42, 12);
    hubConeGeo.rotateX(Math.PI / 2);
    const hubCone = new THREE.Mesh(hubConeGeo, nozzleMat);
    hubCone.position.z = 0.12;
    engineAbGroup.add(hubCone);

    // Concentric circular reheat flame-holder rings
    for (const r of [0.14, 0.23, 0.30]) {
      const ringGeo = new THREE.RingGeometry(r - 0.018, r, 16);
      const ringMesh = new THREE.Mesh(ringGeo, flameHolderGlowMat);
      ringMesh.position.z = 0.22;
      engineAbGroup.add(ringMesh);
    }

    // Radial V-gutter flame-holder struts
    for (let s = 0; s < 8; s++) {
      const sAngle = (s / 8) * Math.PI;
      const gutterGeo = new THREE.BoxGeometry(0.62, 0.022, 0.03);
      const gutter = new THREE.Mesh(gutterGeo, flameHolderGlowMat);
      gutter.position.z = 0.23;
      gutter.rotation.z = sAngle;
      engineAbGroup.add(gutter);
    }

    // Inner white-hot plasma core cone
    const coreConeGeo = new THREE.ConeGeometry(0.28, 1.35, 12, 1, true);
    coreConeGeo.rotateX(Math.PI / 2);
    const coreCone = new THREE.Mesh(coreConeGeo, abCoreMat);
    coreCone.position.z = 0.92;
    engineAbGroup.add(coreCone);

    // Outer ultraviolet/cerulean supersonic reheat plume extending to Z = +6.4
    const outerPlumeGeo = new THREE.ConeGeometry(0.34, 1.85, 14, 1, true);
    outerPlumeGeo.rotateX(Math.PI / 2);
    const outerPlume = new THREE.Mesh(outerPlumeGeo, abPlumeMat);
    outerPlume.position.z = 1.18;
    engineAbGroup.add(outerPlume);

    // 4-Stage Mach Shock Diamonds inside the supersonic exhaust stream
    for (let d = 0; d < 4; d++) {
      const scale = 1.0 - d * 0.21;
      const diamondGeo = new THREE.OctahedronGeometry(0.14 * scale, 0);
      diamondGeo.scale(1.0, 1.0, 1.85);
      const diamondMesh = new THREE.Mesh(diamondGeo, shockDiamondMat);
      diamondMesh.position.z = 0.68 + d * 0.32;
      engineAbGroup.add(diamondMesh);
    }

    abGroup.add(engineAbGroup);
  }

  hiDetail.add(abGroup);

  return {
    leftElev,
    rightElev,
    abGroup
  };
}

/**
 * Builds the SPECTRE Hypersonic Tailless Stealth Flying Wing (B-21 / Darkstar hybrid).
 * Orientation: Nose -Z (-6.8), Center Tail +Z (+5.2), Wingtips -X/+X (±8.0), Dorsal +Y.
 * Overall Length: ~12.8 units | Wingspan: 16.0 units.
 *
 * @param {THREE.Group|THREE.Object3D} hiDetail - Target parent group for high-detail geometry.
 * @param {THREE.Material} bodyMat - Primary radar-absorbent airframe material.
 * @param {THREE.Material} darkMat - Dark RAM chine/recess/lining material.
 * @param {THREE.Material} teamMat - Squadron / low-observable accent trim material.
 * @param {THREE.Material} nozzleMat - High-temp metallic/ceramic exhaust & turbine material.
 * @returns {{ leftElev: THREE.Group, rightElev: THREE.Group, abGroup: THREE.Group }}
 */
function buildSpectreAirframe(hiDetail, bodyMat, darkMat, teamMat, nozzleMat) {
  // Defensive fallback materials if any parameter is omitted
  const matBody = bodyMat || new THREE.MeshStandardMaterial({
    color: 0x26292e,
    roughness: 0.42,
    metalness: 0.35
  });
  const matDark = darkMat || new THREE.MeshStandardMaterial({
    color: 0x111317,
    roughness: 0.65,
    metalness: 0.25
  });
  const matTeam = teamMat || new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    roughness: 0.35,
    metalness: 0.4
  });
  const matNozzle = nozzleMat || new THREE.MeshStandardMaterial({
    color: 0x1c1a17,
    roughness: 0.3,
    metalness: 0.85
  });

  // Specialized internal materials (no external textures)
  const canopyGoldMat = new THREE.MeshStandardMaterial({
    color: 0xd89e28,
    emissive: 0x2a1b04,
    emissiveIntensity: 0.45,
    roughness: 0.14,
    metalness: 0.82,
    transparent: true,
    opacity: 0.84
  });

  const hudGlassMat = new THREE.MeshBasicMaterial({
    color: 0x00ffcc,
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const abCoreMat = new THREE.MeshBasicMaterial({
    color: 0xfff3c4,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const abRingMat = new THREE.MeshBasicMaterial({
    color: 0xff6b1a,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const abPlumeMat = new THREE.MeshBasicMaterial({
    color: 0xff3b00,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const sensorGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    emissive: 0x442200,
    roughness: 0.1,
    metalness: 0.9
  });

  // Helper: smooth hermite interpolation
  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  // Helper: piecewise linear interpolation over sorted control points [[x0, val0], [x1, val1], ...]
  function sampleCurve(pts, xAbs) {
    if (xAbs <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (xAbs <= b[0]) {
        const t = (xAbs - a[0]) / (b[0] - a[0]);
        return a[1] + t * (b[1] - a[1]);
      }
    }
    return pts[pts.length - 1][1];
  }

  // ============================================================================
  // 1. CONTINUOUS SWEPT FLYING WING & DOUBLE-W SERRATED PLANFORM DEFINITION
  // ============================================================================
  // Nose at Z = -6.8, Centerline tail at Z = +5.2, Wingtips at X = ±8.0, Max Aft Tip Z = +6.0 (12.8 total length)
  const leProfile = [
    [0.00, -6.80], // Sharp needle/duckbill stealth nose apex
    [0.35, -6.58], // Forward nose chine blend
    [0.85, -6.02], // Cockpit side chine
    [1.65, -5.22], // Inboard leading edge root
    [3.10, -3.95], // 35°-38° continuous swept leading edge
    [4.65, -2.62], // Mid-wing leading edge
    [7.40, -0.25], // Forward wingtip corner
    [8.00,  4.55]  // Raked supersonic stealth wingtip edge
  ];

  // Serrated Double-W trailing edge with inner/outer sawtooth notches & elevon recess
  const teProfile = [
    [0.00,  5.20], // Centerline beaver-tail stinger apex (Z = +5.2)
    [0.45,  4.82], // Center stinger flank
    [1.65,  3.52], // Inner W-valley (exhaust trough exit)
    [3.10,  4.92], // Intermediate W-peak (sawtooth point)
    [4.65,  3.35], // Outer W-valley (inboard of split elevons)
    [4.72,  3.12], // Recessed hinge cutout start for split elevons
    [7.28,  4.98], // Recessed hinge cutout end for split elevons
    [7.40,  6.00], // Trailing wingtip apex (overall length = 6.0 - (-6.8) = 12.8u)
    [8.00,  4.55]  // Meets raked wingtip apex
  ];

  // True trailing edge (without the elevon cutout) used to align the control surfaces
  const teTrueProfile = [
    [0.00,  5.20],
    [0.45,  4.82],
    [1.65,  3.52],
    [3.10,  4.92],
    [4.65,  3.35],
    [7.40,  6.00],
    [8.00,  4.55]
  ];

  // Evaluates dorsal, ventral, and chine heights at any (x, z) coordinate
  function evaluateAirframeSection(x, z, zLE, zTE) {
    const xAbs = Math.abs(x);
    const chord = Math.max(0.001, zTE - zLE);
    const u = Math.max(0, Math.min(1, (z - zLE) / chord));

    // Subtle gull-wing chine camber with razor nose droop and slight outer anhedral
    const noseDroop = -0.09 * Math.exp(-Math.pow(xAbs / 1.1, 2)) * Math.pow(1 - u, 2.2);
    const innerLift = 0.08 * Math.sin(Math.min(1, xAbs / 3.2) * Math.PI * 0.5);
    const outerAnhedral = -0.22 * Math.pow(Math.max(0, (xAbs - 3.2) / 4.8), 1.45);
    const yChine = noseDroop + innerLift + outerAnhedral;

    // Sharp radar-scattering airfoil envelope (peaks around 34% chord, zero at LE/TE chines)
    const leTaper = Math.pow(u, 0.68);
    const teTaper = Math.pow(1 - u, 1.18);
    const arch = leTaper * teTaper * 2.65;

    // Spanwise blended lifting body thickness distribution
    const centerBody = 0.78 * Math.exp(-Math.pow(xAbs / 1.95, 1.65));
    const midWing = 0.34 * Math.exp(-Math.pow(xAbs / 4.8, 1.8));
    const outerWing = 0.06 * Math.max(0, 1 - xAbs / 8.05);

    let dorsalAmp = centerBody + midWing + outerWing;
    let ventralAmp = (0.38 * Math.exp(-Math.pow(xAbs / 2.2, 1.6))) +
                     (0.16 * Math.exp(-Math.pow(xAbs / 5.0, 1.8))) +
                     (0.035 * Math.max(0, 1 - xAbs / 8.05));

    // Faceted center spine & low-profile cockpit blister
    if (xAbs < 1.15 && z > -5.5 && z < 1.8) {
      const latFactor = Math.cos((xAbs / 1.15) * Math.PI * 0.5);
      const longFactor = smoothstep(-5.5, -3.2, z) * (1 - smoothstep(-1.2, 1.8, z));
      dorsalAmp += 0.24 * latFactor * latFactor * longFactor;
    }

    let yDorsal = yChine + arch * dorsalAmp;
    let yVentral = yChine - arch * ventralAmp;

    // Carve flush dorsal S-duct intake ramp depressions (X ≈ ±1.22, Z ∈ [-3.65, -0.75])
    if (xAbs > 0.62 && xAbs < 1.82 && z > -3.65 && z < -0.75) {
      const intakeLat = Math.sin(((xAbs - 0.62) / 1.20) * Math.PI);
      const intakeLong = smoothstep(-3.65, -1.75, z) * (1 - smoothstep(-1.25, -0.75, z));
      yDorsal -= 0.32 * Math.pow(intakeLat, 1.4) * intakeLong;
    }

    // Carve over-wing stealth exhaust cooling troughs (X ≈ ±1.18, Z ∈ [+1.25, +3.60])
    if (xAbs > 0.68 && xAbs < 1.68 && z > 1.25) {
      const troughLat = Math.sin(((xAbs - 0.68) / 1.00) * Math.PI);
      const troughLong = smoothstep(1.25, 1.55, z);
      const targetFloor = yChine + 0.045;
      const blend = Math.pow(troughLat, 0.75) * troughLong;
      yDorsal = yDorsal * (1 - blend) + Math.min(yDorsal, targetFloor) * blend;
    }

    // Flatten ventral center weapon bay belly slightly for realistic stealth hull geometry
    if (xAbs < 1.55 && z > -2.8 && z < 2.6) {
      const flatBlend = smoothstep(1.55, 0.85, xAbs) * smoothstep(-2.8, -1.8, z) * (1 - smoothstep(1.6, 2.6, z));
      yVentral = yVentral * (1 - 0.35 * flatBlend) + (-0.42) * (0.35 * flatBlend);
    }

    return { yDorsal, yVentral, yChine };
  }

  // Build spanwise station list (dense around fuselage chines, intakes, troughs, and W-notches)
  const halfStations = [
    0.00, 0.18, 0.38, 0.62, 0.78, 0.98, 1.18, 1.38, 1.58, 1.65,
    1.82, 2.15, 2.60, 3.10, 3.60, 4.15, 4.65, 4.72, 5.35, 6.00,
    6.65, 7.28, 7.40, 7.72, 8.00
  ];
  const xStations = [];
  for (let i = halfStations.length - 1; i > 0; i--) {
    xStations.push(-halfStations[i]);
  }
  for (let i = 0; i < halfStations.length; i++) {
    xStations.push(halfStations[i]);
  }

  const chordSteps = 28;
  const numX = xStations.length;
  const numU = chordSteps + 1;

  const dorsalPositions = [];
  const ventralPositions = [];
  const dorsalIndices = [];
  const ventralIndices = [];

  for (let i = 0; i < numX; i++) {
    const x = xStations[i];
    const xAbs = Math.abs(x);
    const zLE = sampleCurve(leProfile, xAbs);
    const zTE = sampleCurve(teProfile, xAbs);

    for (let j = 0; j < numU; j++) {
      // Cosine-clustered chord distribution near LE and TE for crisp chine edges
      const rawT = j / chordSteps;
      const u = 0.5 * (1 - Math.cos(rawT * Math.PI));
      const z = zLE + u * (zTE - zLE);
      const { yDorsal, yVentral } = evaluateAirframeSection(x, z, zLE, zTE);

      dorsalPositions.push(x, yDorsal, z);
      ventralPositions.push(x, yVentral, z);
    }
  }

  for (let i = 0; i < numX - 1; i++) {
    for (let j = 0; j < numU - 1; j++) {
      const a = i * numU + j;
      const b = (i + 1) * numU + j;
      const c = i * numU + (j + 1);
      const d = (i + 1) * numU + (j + 1);

      // Dorsal surface (+Y outward normal: CCW when viewed from +Y)
      dorsalIndices.push(a, c, b);
      dorsalIndices.push(b, c, d);

      // Ventral surface (-Y outward normal: CCW when viewed from -Y)
      ventralIndices.push(a, b, c);
      ventralIndices.push(b, d, c);
    }
  }

  const dorsalGeom = new THREE.BufferGeometry();
  dorsalGeom.setAttribute('position', new THREE.Float32BufferAttribute(dorsalPositions, 3));
  dorsalGeom.setIndex(dorsalIndices);
  dorsalGeom.computeVertexNormals();

  const ventralGeom = new THREE.BufferGeometry();
  ventralGeom.setAttribute('position', new THREE.Float32BufferAttribute(ventralPositions, 3));
  ventralGeom.setIndex(ventralIndices);
  ventralGeom.computeVertexNormals();

  const dorsalMesh = new THREE.Mesh(dorsalGeom, matBody);
  const ventralMesh = new THREE.Mesh(ventralGeom, matBody);
  hiDetail.add(dorsalMesh, ventralMesh);

  // ============================================================================
  // 2. RADAR-ABSORBENT LEADING-EDGE CHINE STRIPS & SERRATED RAM SEAMS
  // ============================================================================
  function buildChineStrip(side) {
    const stripPos = [];
    const stripIdx = [];
    const pts = [0.0, 0.35, 0.85, 1.65, 3.10, 4.65, 6.20, 7.40, 8.00];

    for (let i = 0; i < pts.length; i++) {
      const xAbs = pts[i];
      const x = side * xAbs;
      const zLE = sampleCurve(leProfile, xAbs);
      const zTE = sampleCurve(teProfile, xAbs);
      const zAft = Math.min(zTE, zLE + 0.38);

      const p0 = evaluateAirframeSection(x, zLE, zLE, zTE);
      const p1 = evaluateAirframeSection(x, zAft, zLE, zTE);

      stripPos.push(x, p0.yChine + 0.004, zLE - 0.01);
      stripPos.push(x, p1.yDorsal + 0.005, zAft);
      stripPos.push(x, p1.yVentral - 0.005, zAft);
    }

    for (let i = 0; i < pts.length - 1; i++) {
      const base = i * 3;
      const next = (i + 1) * 3;
      if (side > 0) {
        stripIdx.push(base, base + 1, next);
        stripIdx.push(next, base + 1, next + 1);
        stripIdx.push(base, next, base + 2);
        stripIdx.push(base + 2, next, next + 2);
      } else {
        stripIdx.push(base, next, base + 1);
        stripIdx.push(next, next + 1, base + 1);
        stripIdx.push(base, base + 2, next);
        stripIdx.push(base + 2, next + 2, next);
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(stripPos, 3));
    geom.setIndex(stripIdx);
    geom.computeVertexNormals();
    return new THREE.Mesh(geom, matDark);
  }

  hiDetail.add(buildChineStrip(-1), buildChineStrip(1));

  // Dorsal spine sawtooth stealth seam & sensor blisters
  const spineShape = new THREE.Shape();
  spineShape.moveTo(0, -1.65);
  spineShape.lineTo(0.28, -1.25);
  spineShape.lineTo(0.16, -0.85);
  spineShape.lineTo(0.32, -0.35);
  spineShape.lineTo(0.22, 1.45);
  spineShape.lineTo(0.38, 2.25);
  spineShape.lineTo(0.0, 4.65);
  spineShape.lineTo(-0.38, 2.25);
  spineShape.lineTo(-0.22, 1.45);
  spineShape.lineTo(-0.32, -0.35);
  spineShape.lineTo(-0.16, -0.85);
  spineShape.lineTo(-0.28, -1.25);
  spineShape.closePath();

  const spinePlateGeom = new THREE.ShapeGeometry(spineShape);
  spinePlateGeom.rotateX(-Math.PI * 0.5);
  // Conform dorsal spine vertices to upper hull height + 0.008 offset
  const spinePos = spinePlateGeom.attributes.position;
  for (let i = 0; i < spinePos.count; i++) {
    const sx = spinePos.getX(i);
    const sz = spinePos.getZ(i);
    const zLE = sampleCurve(leProfile, Math.abs(sx));
    const zTE = sampleCurve(teProfile, Math.abs(sx));
    const { yDorsal } = evaluateAirframeSection(sx, sz, zLE, zTE);
    spinePos.setY(i, yDorsal + 0.008);
  }
  spinePlateGeom.computeVertexNormals();
  hiDetail.add(new THREE.Mesh(spinePlateGeom, matDark));

  // ============================================================================
  // 3. FLUSH DORSAL S-DUCT AIR INTAKES & BURIED COMPRESSOR FACES
  // ============================================================================
  function buildDorsalSDuctIntake(side) {
    const intakeGroup = new THREE.Group();
    const xCenter = side * 1.22;

    // 1. Sculpted faceted stealth intake hood / cowl over the throat (Z = -1.95 to +0.85)
    const hoodVerts = new Float32Array([
      // Forward serrated W-lip vertices (0..3)
      xCenter - side * 0.54, 0.42, -1.55, // 0: Inner lip corner
      xCenter - side * 0.14, 0.74, -2.05, // 1: Forward apex of W-lip
      xCenter + side * 0.22, 0.68, -1.78, // 2: Notch of W-lip
      xCenter + side * 0.54, 0.36, -1.25, // 3: Outer lip corner

      // Mid hood ridge vertices (4..7)
      xCenter - side * 0.56, 0.48, -0.45, // 4: Inner mid base
      xCenter - side * 0.16, 0.80, -0.55, // 5: Inner mid crest
      xCenter + side * 0.20, 0.72, -0.45, // 6: Outer mid crest
      xCenter + side * 0.56, 0.38, -0.25, // 7: Outer mid base

      // Aft fairing blend into exhaust nacelle (8..10)
      xCenter - side * 0.50, 0.46,  1.25, // 8: Inner aft base
      xCenter,               0.62,  1.35, // 9: Aft crest
      xCenter + side * 0.48, 0.34,  1.25  // 10: Outer aft base
    ]);

    const hoodIdx = side > 0 ? [
      0, 4, 1,  1, 4, 5,
      1, 5, 2,  2, 5, 6,
      2, 6, 3,  3, 6, 7,
      4, 8, 5,  5, 8, 9,
      5, 9, 6,  6, 9, 10,
      6, 10, 7
    ] : [
      0, 1, 4,  1, 5, 4,
      1, 2, 5,  2, 6, 5,
      2, 3, 6,  3, 7, 6,
      4, 5, 8,  5, 9, 8,
      5, 6, 9,  6, 10, 9,
      6, 7, 10
    ];

    const hoodGeom = new THREE.BufferGeometry();
    hoodGeom.setAttribute('position', new THREE.BufferAttribute(hoodVerts, 3));
    hoodGeom.setIndex(hoodIdx);
    hoodGeom.computeVertexNormals();

    const hoodMat = matBody.clone();
    hoodMat.side = THREE.DoubleSide;
    intakeGroup.add(new THREE.Mesh(hoodGeom, hoodMat));

    // 2. Dark radar-absorbing lip liner along the forward serrated edge
    const lipVerts = new Float32Array([
      xCenter - side * 0.54, 0.42, -1.55,
      xCenter - side * 0.14, 0.74, -2.05,
      xCenter + side * 0.22, 0.68, -1.78,
      xCenter + side * 0.54, 0.36, -1.25,

      xCenter - side * 0.48, 0.38, -1.35,
      xCenter - side * 0.12, 0.67, -1.82,
      xCenter + side * 0.20, 0.62, -1.58,
      xCenter + side * 0.48, 0.33, -1.08
    ]);
    const lipIdx = [
      0, 1, 4,  1, 5, 4,
      1, 2, 5,  2, 6, 5,
      2, 3, 6,  3, 7, 6
    ];
    const lipGeom = new THREE.BufferGeometry();
    lipGeom.setAttribute('position', new THREE.BufferAttribute(lipVerts, 3));
    lipGeom.setIndex(lipIdx);
    lipGeom.computeVertexNormals();
    const darkDouble = matDark.clone();
    darkDouble.side = THREE.DoubleSide;
    intakeGroup.add(new THREE.Mesh(lipGeom, darkDouble));

    // 3. Recessed S-duct ramp liner & acoustic splitter vane
    const rampShape = new THREE.Shape();
    rampShape.moveTo(-0.42, -3.35);
    rampShape.lineTo(0.42, -3.05);
    rampShape.lineTo(0.46, -0.65);
    rampShape.lineTo(-0.46, -0.65);
    rampShape.closePath();

    const rampGeom = new THREE.ShapeGeometry(rampShape, 8);
    rampGeom.rotateX(-Math.PI * 0.5);
    const rPos = rampGeom.attributes.position;
    for (let i = 0; i < rPos.count; i++) {
      const rx = rPos.getX(i) + xCenter;
      const rz = rPos.getZ(i);
      const zLE = sampleCurve(leProfile, Math.abs(rx));
      const zTE = sampleCurve(teProfile, Math.abs(rx));
      const { yDorsal } = evaluateAirframeSection(rx, rz, zLE, zTE);
      rPos.setX(i, rx);
      rPos.setY(i, yDorsal + 0.006);
    }
    rampGeom.computeVertexNormals();
    intakeGroup.add(new THREE.Mesh(rampGeom, matDark));

    // Internal acoustic splitter vane inside the throat
    const vaneGeom = new THREE.BoxGeometry(0.035, 0.34, 0.95);
    const vane = new THREE.Mesh(vaneGeom, matDark);
    vane.position.set(xCenter - side * 0.05, 0.42, -1.35);
    vane.rotation.y = side * 0.08;
    intakeGroup.add(vane);

    // 4. Deeply recessed compressor face (buried behind S-duct curvature at Z = -0.55)
    const compGroup = new THREE.Group();
    compGroup.position.set(xCenter, 0.34, -0.55);
    compGroup.rotation.x = 0.22; // Cant downward into the S-duct

    const ductBack = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.25, 20), matDark);
    ductBack.rotation.x = Math.PI * 0.5;
    compGroup.add(ductBack);

    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 16), matNozzle);
    spinner.rotation.x = -Math.PI * 0.5;
    spinner.position.z = -0.12;
    compGroup.add(spinner);

    // Stator/rotor fan blades
    const bladeGeom = new THREE.BoxGeometry(0.03, 0.33, 0.012);
    for (let b = 0; b < 14; b++) {
      const blade = new THREE.Mesh(bladeGeom, matNozzle);
      blade.rotation.z = (b / 14) * Math.PI * 2;
      blade.rotation.y = 0.35;
      blade.position.z = -0.05;
      compGroup.add(blade);
    }

    intakeGroup.add(compGroup);
    return intakeGroup;
  }

  hiDetail.add(buildDorsalSDuctIntake(-1), buildDorsalSDuctIntake(1));

  // ============================================================================
  // 4. LOW-PROFILE FLUSH STEALTH COCKPIT CANOPY & RECESSED PILOT STATION
  // ============================================================================
  const cockpitGroup = new THREE.Group();

  // Recessed cockpit tub interior (dark stealth composite)
  const tubGeom = new THREE.BoxGeometry(0.92, 0.32, 2.35);
  const tub = new THREE.Mesh(tubGeom, matDark);
  tub.position.set(0, 0.58, -3.35);
  cockpitGroup.add(tub);

  // Angled stealth ejection seat
  const seatGroup = new THREE.Group();
  seatGroup.position.set(0, 0.65, -3.18);
  seatGroup.rotation.x = -0.28; // Reclined high-G hypersonic seating posture

  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.09), matDark);
  seatBack.position.set(0, 0.18, 0.12);
  seatGroup.add(seatBack);

  const seatPan = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.38), matDark);
  seatPan.position.set(0, -0.04, -0.05);
  seatGroup.add(seatPan);

  // Twin stealth headrest bolsters
  const headRest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.14), matNozzle);
  headRest.position.set(0, 0.46, 0.10);
  seatGroup.add(headRest);

  // Pilot helmet & gold anti-flash visor silhouette
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), matDark);
  helmet.position.set(0, 0.44, -0.03);
  seatGroup.add(helmet);

  const visor = new THREE.Mesh(
    new THREE.SphereGeometry(0.128, 12, 10, 0, Math.PI, 0.2, Math.PI * 0.45),
    canopyGoldMat
  );
  visor.rotation.x = -Math.PI * 0.5;
  visor.position.set(0, 0.45, -0.04);
  seatGroup.add(visor);
  cockpitGroup.add(seatGroup);

  // Forward instrument coaming & dual-pane holographic HUD
  const coamingGeom = new THREE.CylinderGeometry(0.28, 0.46, 0.68, 6);
  coamingGeom.rotateX(Math.PI * 0.5);
  const coaming = new THREE.Mesh(coamingGeom, matDark);
  coaming.scale.set(1.0, 0.45, 1.0);
  coaming.position.set(0, 0.78, -4.15);
  cockpitGroup.add(coaming);

  const hudPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.18), hudGlassMat);
  hudPlane.position.set(0, 0.94, -3.88);
  hudPlane.rotation.x = -0.58;
  cockpitGroup.add(hudPlane);

  // Faceted flush stealth canopy glazing with anti-flash golden iridescent coating
  // Vertices carefully aligned to wrap smoothly over the cockpit spine
  const cVerts = new Float32Array([
    // 0: Forward nose apex of canopy
     0.00, 0.74, -4.95,
    // 1, 2: Forward side chines
    -0.44, 0.68, -4.05,
     0.44, 0.68, -4.05,
    // 3: Forward upper crown
     0.00, 1.07, -3.65,
    // 4, 5: Mid widest side chines
    -0.58, 0.74, -2.95,
     0.58, 0.74, -2.95,
    // 6: Aft upper crown
     0.00, 1.05, -2.55,
    // 7, 8: Aft serrated frame corners
    -0.38, 0.82, -1.95,
     0.38, 0.82, -1.95,
    // 9: Aft centerline sawtooth point
     0.00, 0.90, -1.62
  ]);

  const cIdx = [
    0, 1, 3,   0, 3, 2,  // Forward angled windscreen panes
    1, 4, 3,   3, 4, 6,  // Left mid glazing
    2, 3, 5,   3, 6, 5,  // Right mid glazing
    4, 7, 6,   6, 7, 9,  // Left aft fairing glass
    5, 6, 8,   6, 9, 8   // Right aft fairing glass
  ];

  const canopyGeom = new THREE.BufferGeometry();
  canopyGeom.setAttribute('position', new THREE.BufferAttribute(cVerts, 3));
  canopyGeom.setIndex(cIdx);
  canopyGeom.computeVertexNormals();
  cockpitGroup.add(new THREE.Mesh(canopyGeom, canopyGoldMat));

  // Flush radar-scattering canopy frame ribs (centerline & transverse V-arch)
  function buildCanopyRib(pA, pB, width) {
    const dir = new THREE.Vector3().subVectors(pB, pA);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
    const rib = new THREE.Mesh(new THREE.BoxGeometry(width, 0.022, len), matBody);
    rib.position.copy(mid);
    rib.lookAt(pB);
    return rib;
  }

  cockpitGroup.add(
    buildCanopyRib(new THREE.Vector3(0, 0.745, -4.95), new THREE.Vector3(0, 1.075, -3.65), 0.045),
    buildCanopyRib(new THREE.Vector3(0, 1.075, -3.65), new THREE.Vector3(0, 1.055, -2.55), 0.045),
    buildCanopyRib(new THREE.Vector3(-0.44, 0.685, -4.05), new THREE.Vector3(0, 1.075, -3.65), 0.04),
    buildCanopyRib(new THREE.Vector3(0.44, 0.685, -4.05), new THREE.Vector3(0, 1.075, -3.65), 0.04),
    buildCanopyRib(new THREE.Vector3(-0.58, 0.745, -2.95), new THREE.Vector3(0, 1.055, -2.55), 0.04),
    buildCanopyRib(new THREE.Vector3(0.58, 0.745, -2.95), new THREE.Vector3(0, 1.055, -2.55), 0.04)
  );

  hiDetail.add(cockpitGroup);

  // ============================================================================
  // 5. OVER-WING STEALTH EXHAUST TROUGHS & SHIELDED 2D RECTANGULAR NOZZLES
  // ============================================================================
  function buildExhaustTrough(side) {
    const troughGroup = new THREE.Group();
    const xCenter = side * 1.18;

    // 1. Heat-dissipating ceramic tile floor liner (Z = +1.35 to +3.52)
    const floorGeom = new THREE.PlaneGeometry(0.84, 2.15, 4, 12);
    floorGeom.rotateX(-Math.PI * 0.5);
    const fPos = floorGeom.attributes.position;
    for (let i = 0; i < fPos.count; i++) {
      const fx = fPos.getX(i) + xCenter;
      const fz = fPos.getZ(i) + 2.42;
      fPos.setX(i, fx);
      fPos.setZ(i, fz);
      fPos.setY(i, 0.105 - (fz - 1.35) * 0.018);
    }
    floorGeom.computeVertexNormals();
    troughGroup.add(new THREE.Mesh(floorGeom, matNozzle));

    // Transverse infrared-diffusing cooling louvers along the trough deck
    const louverGeom = new THREE.BoxGeometry(0.78, 0.018, 0.045);
    for (let k = 0; k < 9; k++) {
      const lz = 1.62 + k * 0.21;
      const louver = new THREE.Mesh(louverGeom, matDark);
      louver.position.set(xCenter, 0.112 - (lz - 1.35) * 0.018, lz);
      louver.rotation.x = 0.15;
      troughGroup.add(louver);
    }

    // 2. Angled infrared-shielding trough sidewalls (canting inward for low RCS)
    for (let wallSide of [-1, 1]) {
      const wx = xCenter + wallSide * 0.44;
      const wallVerts = new Float32Array([
        wx,                   0.09, 1.25,
        wx,                   0.05, 3.48,
        wx + wallSide * 0.14, 0.46, 1.25,
        wx + wallSide * 0.10, 0.14, 3.48
      ]);
      const wallIdx = [0, 1, 2, 2, 1, 3];
      const wallGeom = new THREE.BufferGeometry();
      wallGeom.setAttribute('position', new THREE.BufferAttribute(wallVerts, 3));
      wallGeom.setIndex(wallIdx);
      wallGeom.computeVertexNormals();

      const wallMat = matDark.clone();
      wallMat.side = THREE.DoubleSide;
      troughGroup.add(new THREE.Mesh(wallGeom, wallMat));
    }

    // 3. Shielded flat rectangular 2D nozzle shroud & serrated upper lip (at Z = +1.42)
    const shroudGroup = new THREE.Group();
    shroudGroup.position.set(xCenter, 0.24, 1.35);

    // Upper variable turkey-feather flap with serrated V-trailing edge
    const upperFlapShape = new THREE.Shape();
    upperFlapShape.moveTo(-0.43, -0.25);
    upperFlapShape.lineTo(0.43, -0.25);
    upperFlapShape.lineTo(0.40, 0.22);
    upperFlapShape.lineTo(0.20, 0.34);
    upperFlapShape.lineTo(0.00, 0.20);
    upperFlapShape.lineTo(-0.20, 0.34);
    upperFlapShape.lineTo(-0.40, 0.22);
    upperFlapShape.closePath();

    const upperFlapGeom = new THREE.ExtrudeGeometry(upperFlapShape, {
      depth: 0.028,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
      bevelSegments: 1
    });
    upperFlapGeom.rotateX(Math.PI * 0.5);
    const upperFlap = new THREE.Mesh(upperFlapGeom, matNozzle);
    upperFlap.position.set(0, 0.14, 0);
    upperFlap.rotation.x = 0.08;
    shroudGroup.add(upperFlap);

    // Lower 2D convergent-divergent nozzle ramp
    const lowerFlap = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.025, 0.45), matNozzle);
    lowerFlap.position.set(0, -0.11, 0.02);
    shroudGroup.add(lowerFlap);

    // Center splitter strut dividing the twin-cell 2D nozzle aperture
    const centerStrut = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.25, 0.42), matNozzle);
    centerStrut.position.set(0, 0.01, -0.02);
    shroudGroup.add(centerStrut);

    // Side nozzle cheek plates
    for (let s of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 0.46), matNozzle);
      cheek.position.set(s * 0.41, 0.01, 0.0);
      shroudGroup.add(cheek);
    }

    troughGroup.add(shroudGroup);
    return troughGroup;
  }

  hiDetail.add(buildExhaustTrough(-1), buildExhaustTrough(1));

  // ============================================================================
  // 6. TRAILING-EDGE SPLIT ELEVONS / DRAG RUDDERS (leftElev & rightElev)
  // ============================================================================
  function buildSplitElevonAssembly(side) {
    const elevGroup = new THREE.Group();

    // Spanwise bounds: X_in = 4.72 to X_out = 7.28
    const xIn = 4.72;
    const xOut = 7.28;
    const zHingeIn = sampleCurve(teProfile, xIn);
    const zHingeOut = sampleCurve(teProfile, xOut);
    const zTrailIn = sampleCurve(teTrueProfile, xIn);
    const zTrailOut = sampleCurve(teTrueProfile, xOut);

    // Set group pivot at the midpoint of the swept hinge line so rotation.x pitches cleanly
    const xPivot = side * 0.5 * (xIn + xOut);
    const zPivot = 0.5 * (zHingeIn + zHingeOut);
    const pMid = evaluateAirframeSection(
      xPivot,
      zPivot,
      sampleCurve(leProfile, Math.abs(xPivot)),
      zPivot
    );
    const yPivot = pMid.yChine;

    elevGroup.position.set(xPivot, yPivot, zPivot);

    // Build upper and lower split clam-shell surfaces in local coordinates relative to pivot
    function createClamShellHalf(isUpper) {
      const signY = isUpper ? 1 : -1;
      const x0 = side * xIn - xPivot;
      const z0H = zHingeIn - zPivot;
      const z0T = zTrailIn - zPivot;

      const x1 = side * xOut - xPivot;
      const z1H = zHingeOut - zPivot;
      const z1T = zTrailOut - zPivot;

      const xMid = 0.5 * (x0 + x1);
      const zMidH = 0.5 * (z0H + z1H);
      const zMidT = 0.5 * (z0T + z1T) + 0.08;

      const hThick = 0.042 * signY;
      const tThick = 0.005 * signY;

      const verts = new Float32Array([
        // Hinge leading edge (0, 1, 2)
        x0,   hThick, z0H,
        xMid, hThick, zMidH,
        x1,   hThick * 0.7, z1H,

        // Sharp trailing edge (3, 4, 5)
        x0,   tThick, z0T,
        xMid, tThick, zMidT,
        x1,   tThick, z1T,

        // Inner mating face at y = 0 (6, 7, 8)
        x0,   0, z0H,
        xMid, 0, zMidH,
        x1,   0, z1H
      ]);

      const idx = (side > 0) === isUpper ? [
        0, 3, 1,  1, 3, 4,
        1, 4, 2,  2, 4, 5,
        6, 7, 3,  7, 4, 3,
        7, 8, 4,  8, 5, 4,
        0, 1, 6,  1, 7, 6,
        1, 2, 7,  2, 8, 7
      ] : [
        0, 1, 3,  1, 4, 3,
        1, 2, 4,  2, 5, 4,
        6, 3, 7,  7, 3, 4,
        7, 4, 8,  8, 4, 5,
        0, 6, 1,  1, 6, 7,
        1, 7, 2,  2, 7, 8
      ];

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geom.setIndex(idx);
      geom.computeVertexNormals();

      const mesh = new THREE.Mesh(geom, matBody);
      // Slight pre-split gap for distinct drag-rudder visual detail
      mesh.rotation.x = signY * 0.015;
      return mesh;
    }

    elevGroup.add(createClamShellHalf(true), createClamShellHalf(false));

    // Dark RAM trailing-edge accent trim along the elevon tip
    const trimPts = [
      new THREE.Vector3(side * xIn - xPivot, 0, zTrailIn - zPivot),
      new THREE.Vector3(side * xOut - xPivot, 0, zTrailOut - zPivot)
    ];
    const trimDir = new THREE.Vector3().subVectors(trimPts[1], trimPts[0]);
    const trimMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.025, trimDir.length()),
      matDark
    );
    trimMesh.position.addVectors(trimPts[0], trimPts[1]).multiplyScalar(0.5);
    trimMesh.lookAt(
      elevGroup.position.x + trimPts[1].x,
      elevGroup.position.y + trimPts[1].y,
      elevGroup.position.z + trimPts[1].z
    );
    elevGroup.add(trimMesh);

    return elevGroup;
  }

  const leftElev = buildSplitElevonAssembly(-1);
  const rightElev = buildSplitElevonAssembly(1);
  hiDetail.add(leftElev, rightElev);

  // ============================================================================
  // 7. DUAL INTERNAL AFTERBURNER GLOW RINGS & PLUMES (abGroup)
  // ============================================================================
  const abGroup = new THREE.Group();

  function buildAfterburnerUnit(side) {
    const unit = new THREE.Group();
    const xCenter = side * 1.18;
    unit.position.set(xCenter, 0.23, 1.18);

    // 1. Deep circular flameholder & fuel-injector glow rings inside the nozzle throat
    const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.14, 24), abCoreMat);
    innerRing.position.z = -0.08;
    unit.add(innerRing);

    const midRing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.25, 24), abRingMat);
    midRing.position.z = 0.02;
    unit.add(midRing);

    // Twin side-by-side burner cells matching the wide 2D rectangular nozzle
    for (let cellSide of [-0.21, 0.21]) {
      const cellCore = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.13, 20), abCoreMat);
      cellCore.position.set(cellSide, 0, 0.08);
      unit.add(cellCore);

      const cellHalo = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), abRingMat);
      cellHalo.position.set(cellSide, 0, 0.04);
      unit.add(cellHalo);
    }

    // 2. Rectangular 2D nozzle exit plasma ring
    const rectFrameShape = new THREE.Shape();
    rectFrameShape.moveTo(-0.37, -0.09);
    rectFrameShape.lineTo(0.37, -0.09);
    rectFrameShape.lineTo(0.37, 0.09);
    rectFrameShape.lineTo(-0.37, 0.09);
    rectFrameShape.closePath();

    const holePath = new THREE.Path();
    holePath.moveTo(-0.30, -0.045);
    holePath.lineTo(0.30, -0.045);
    holePath.lineTo(0.30, 0.045);
    holePath.lineTo(-0.30, 0.045);
    holePath.closePath();
    rectFrameShape.holes.push(holePath);

    const rectRingGeom = new THREE.ShapeGeometry(rectFrameShape);
    const rectRing1 = new THREE.Mesh(rectRingGeom, abCoreMat);
    rectRing1.position.z = 0.18;
    unit.add(rectRing1);

    const rectRing2 = new THREE.Mesh(rectRingGeom, abRingMat);
    rectRing2.scale.set(1.06, 1.15, 1);
    rectRing2.position.z = 0.28;
    unit.add(rectRing2);

    // 3. Horizontal infrared-cooled plasma plume hugging the exhaust trough floor
    const plumeSheetH = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.85), abPlumeMat);
    plumeSheetH.rotation.x = -Math.PI * 0.5 + 0.03;
    plumeSheetH.position.set(0, -0.06, 1.05);
    unit.add(plumeSheetH);

    const plumeCoreH = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 1.15), abCoreMat);
    plumeCoreH.rotation.x = -Math.PI * 0.5 + 0.03;
    plumeCoreH.position.set(0, -0.04, 0.68);
    unit.add(plumeCoreH);

    // Shock diamonds along the recessed trough
    for (let d = 0; d < 4; d++) {
      const diamond = new THREE.Mesh(
        new THREE.PlaneGeometry(0.56 - d * 0.09, 0.22),
        d === 0 ? abCoreMat : abRingMat
      );
      diamond.rotation.x = -Math.PI * 0.5 + 0.03;
      diamond.position.set(0, -0.035 - d * 0.006, 0.42 + d * 0.36);
      unit.add(diamond);
    }

    return unit;
  }

  abGroup.add(buildAfterburnerUnit(-1), buildAfterburnerUnit(1));
  hiDetail.add(abGroup);

  // ============================================================================
  // 8. VENTRAL ROTARY WEAPONS BAY DOORS, EOTS SENSOR & TEAM MARKINGS
  // ============================================================================
  // Ventral sawtooth twin weapons bay seams (X ∈ [-1.25, +1.25], Z ∈ [-2.4, +2.2])
  const bayGroup = new THREE.Group();
  for (let side of [-1, 1]) {
    const seamLine = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.015, 4.4), matDark);
    seamLine.position.set(side * 0.62, -0.42, -0.1);
    bayGroup.add(seamLine);

    const outerSeam = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.015, 4.2), matDark);
    outerSeam.position.set(side * 1.18, -0.37, -0.1);
    bayGroup.add(outerSeam);
  }
  const centerBaySeam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.016, 4.5), matDark);
  centerBaySeam.position.set(0, -0.43, -0.1);
  bayGroup.add(centerBaySeam);
  hiDetail.add(bayGroup);

  // Under-nose faceted EOTS (Electro-Optical Targeting System) sapphire window
  const eotsGeom = new THREE.OctahedronGeometry(0.14, 0);
  eotsGeom.scale(0.85, 0.45, 1.85);
  const eots = new THREE.Mesh(eotsGeom, sensorGlassMat);
  eots.position.set(0, -0.20, -5.25);
  hiDetail.add(eots);

  // Low-observable squadron chevrons & intake hazard triangles in `teamMat`
  for (let side of [-1, 1]) {
    // Upper outer wing stealth chevron stripe
    const chevShape = new THREE.Shape();
    chevShape.moveTo(0, 0);
    chevShape.lineTo(side * 1.45, 1.15);
    chevShape.lineTo(side * 1.25, 1.48);
    chevShape.lineTo(0, 0.48);
    chevShape.closePath();

    const chevGeom = new THREE.ShapeGeometry(chevShape, 4);
    chevGeom.rotateX(-Math.PI * 0.5);
    const cPos = chevGeom.attributes.position;
    for (let i = 0; i < cPos.count; i++) {
      const cx = cPos.getX(i) + side * 4.85;
      const cz = cPos.getZ(i) - 0.55;
      const zLE = sampleCurve(leProfile, Math.abs(cx));
      const zTE = sampleCurve(teProfile, Math.abs(cx));
      const { yDorsal } = evaluateAirframeSection(cx, cz, zLE, zTE);
      cPos.setX(i, cx);
      cPos.setZ(i, cz);
      cPos.setY(i, yDorsal + 0.007);
    }
    chevGeom.computeVertexNormals();
    hiDetail.add(new THREE.Mesh(chevGeom, matTeam));

    // Dorsal intake warning diamond ahead of the S-duct ramp
    const warnShape = new THREE.Shape();
    warnShape.moveTo(0, -0.35);
    warnShape.lineTo(0.24, 0);
    warnShape.lineTo(0, 0.18);
    warnShape.lineTo(-0.24, 0);
    warnShape.closePath();

    const warnGeom = new THREE.ShapeGeometry(warnShape);
    warnGeom.rotateX(-Math.PI * 0.5);
    const wPos = warnGeom.attributes.position;
    for (let i = 0; i < wPos.count; i++) {
      const wx = wPos.getX(i) + side * 1.22;
      const wz = wPos.getZ(i) - 3.65;
      const zLE = sampleCurve(leProfile, Math.abs(wx));
      const zTE = sampleCurve(teProfile, Math.abs(wx));
      const { yDorsal } = evaluateAirframeSection(wx, wz, zLE, zTE);
      wPos.setX(i, wx);
      wPos.setZ(i, wz);
      wPos.setY(i, yDorsal + 0.008);
    }
    warnGeom.computeVertexNormals();
    hiDetail.add(new THREE.Mesh(warnGeom, matTeam));

    // Wingtip conformal ECM / formation light strip along the raked tip
    const tipLight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.018, 1.45), matTeam);
    tipLight.position.set(side * 7.68, -0.12, 2.15);
    tipLight.rotation.y = -side * 0.125;
    tipLight.rotation.z = -side * 0.06;
    hiDetail.add(tipLight);
  }

  return { leftElev, rightElev, abGroup };
}


  class AircraftModelFactory {
    static disposeObject3D(obj) {
      if (!obj) return;
      obj.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m && m.dispose && m.dispose());
          else if (child.material.dispose) child.material.dispose();
        }
      });
    }

    static createPoly(vertices, indices, material) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, material);
    }

    static createAircraftMesh(typeId, liveryIndex = 0, team = 'BLUE') {
      const root = new THREE.Group();
      const hiDetail = new THREE.Group();
      const loDetail = new THREE.Group();
      root.add(hiDetail);
      root.add(loDetail);

      const frameId = (typeId === 'F22' || typeId === 'FALCON') ? 'FALCON' : (typeId === 'SU57' ? 'PHANTOM' : typeId);
      const liv = CONFIG.LIVERIES[liveryIndex % CONFIG.LIVERIES.length] || CONFIG.LIVERIES[0];

      // Signature Livery Neon Trim Material (Cyber Emerald: 0x00ff9d, Solar Gold: 0xfbbf24, Crimson Nova: 0xff3b47, etc.)
      const liveryTrimMat = new THREE.MeshBasicMaterial({ color: liv.trim });

      // Subtle Squadron Team IFF Color (Blue or Red) for wingtip navigation lights and team alignment
      const teamColor = team === 'BLUE' ? 0x38bdf8 : (team === 'RED' ? 0xff3b47 : liv.trim);
      const teamNavMat = new THREE.MeshBasicMaterial({ color: teamColor });

      const bodyMat = new THREE.MeshStandardMaterial({
        color: liv.body,
        emissive: 0x000000,
        roughness: 0.38,
        metalness: 0.52
      });
      const darkMat = new THREE.MeshStandardMaterial({
        color: liv.dark,
        emissive: 0x000000,
        roughness: 0.48,
        metalness: 0.42
      });
      const nozzleMat = new THREE.MeshStandardMaterial({
        color: 0x222a36,
        roughness: 0.28,
        metalness: 0.88
      });

      let res = null;
      try {
        if (frameId === 'FALCON') {
          res = buildFalconAirframe(hiDetail, bodyMat, darkMat, liveryTrimMat, nozzleMat);
        } else if (frameId === 'VIPER') {
          res = buildViperAirframe(hiDetail, bodyMat, darkMat, liveryTrimMat, nozzleMat);
        } else if (frameId === 'TITAN') {
          res = buildTitanAirframe(hiDetail, bodyMat, darkMat, liveryTrimMat, nozzleMat);
        } else if (frameId === 'PHANTOM') {
          res = buildPhantomAirframe(hiDetail, bodyMat, darkMat, liveryTrimMat, nozzleMat);
        } else if (frameId === 'SPECTRE') {
          res = buildSpectreAirframe(hiDetail, bodyMat, darkMat, liveryTrimMat, nozzleMat);
        } else {
          res = buildFalconAirframe(hiDetail, bodyMat, darkMat, liveryTrimMat, nozzleMat);
        }
      } catch (err) {
        console.error('Error generating airframe for ' + frameId + ':', err);
      }

      // Hybrid Livery & Team Accents: Subtle Blue/Red squadron navigation lights/stripes on wingtips for team alignment
      const wingtipSpans = {
        FALCON:  { x: 6.45, y: 0.22, z: 1.45 },
        VIPER:   { x: 4.92, y: 0.12, z: 0.82 },
        TITAN:   { x: 8.25, y: 0.42, z: 0.52 },
        PHANTOM: { x: 6.85, y: 0.22, z: 1.35 },
        SPECTRE: { x: 7.25, y: 0.14, z: 1.05 }
      };
      const wt = wingtipSpans[frameId] || wingtipSpans.FALCON;
      const navLightGeo = new THREE.BoxGeometry(0.12, 0.10, 0.55);
      const leftNav = new THREE.Mesh(navLightGeo, teamNavMat);
      leftNav.position.set(-wt.x, wt.y, wt.z);
      const rightNav = new THREE.Mesh(navLightGeo, teamNavMat);
      rightNav.position.set(wt.x, wt.y, wt.z);
      hiDetail.add(leftNav, rightNav);

      const leftElev = res && res.leftElev ? res.leftElev : null;
      const rightElev = res && res.rightElev ? res.rightElev : null;
      const abGroup = res && res.abGroup ? res.abGroup : new THREE.Group();

      // 3D Bullet-Hit Energy Shield / Hull Ripple Overlay Shell
      const hitShellGeo = new THREE.OctahedronGeometry(1.0, 1);
      hitShellGeo.scale(7.6, 1.8, 6.8);
      const hitShellMat = new THREE.MeshBasicMaterial({
        color: 0xff3b47,
        wireframe: true,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const hitShell = new THREE.Mesh(hitShellGeo, hitShellMat);
      hitShell.position.set(0, 0.2, 0.4);
      hitShell.visible = false;
      hiDetail.add(hitShell);

      // Low-poly LOD Mesh for distant radar/visual contacts (> lodDistance)
      const lodBody = new THREE.Mesh(new THREE.BoxGeometry(12, 0.8, 9), bodyMat);
      const lodMark = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 3), teamNavMat);
      loDetail.add(lodBody, lodMark);
      loDetail.visible = false;

      root.userData = {
        hiDetail,
        loDetail,
        abGroup,
        leftElev,
        rightElev,
        bodyMat,
        darkMat,
        liveryTrimMat,
        teamNavMat,
        hitShell,
        hitShellMat
      };

      return root;
    }
  }

window.AircraftModelFactory = AircraftModelFactory;
