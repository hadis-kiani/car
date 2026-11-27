import * as THREE from "three";

/**
 * Procedurally modelled coupe: side-profile extrusion with real wheel-arch
 * cut-outs, glass canopy, detailed wheels, lighting units and head beams.
 * Units are metres (length ≈ 4.8, width ≈ 1.7, height ≈ 1.5).
 */

const BODY_DEPTH = 1.24;
const BEVEL_THICK = 0.2;
const BEVEL_SIZE = 0.08;
const HALF_WIDTH = (BODY_DEPTH + BEVEL_THICK * 2) / 2; // 0.82

const WHEELS = [
  { x: 1.42, z: 0.62 },
  { x: 1.42, z: -0.62 },
  { x: -1.46, z: 0.62 },
  { x: -1.46, z: -0.62 },
];

const WHEEL_ARCHES = [{ x: -1.46 }, { x: 1.42 }];
const WHEEL_R = 0.37;
const ARCH_R = 0.44;
const ARCH_RISE = 0.56;

export class Car {
  constructor(renderer) {
    this.renderer = renderer;
    this.root = new THREE.Group();
    this.root.name = "car";
    this.wheels = [];
    this._beamStrength = 0;

    this.paint = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#c11f2b"),
      metalness: 0.5,
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.3,
    });

    this.glass = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#0a0f16"),
      metalness: 0.9,
      roughness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.8,
    });

    this.trim = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#10141a"),
      metalness: 0.55,
      roughness: 0.5,
    });

    this.chrome = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#dfe4ea"),
      metalness: 1,
      roughness: 0.18,
      envMapIntensity: 1.6,
    });

    this.headlightMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#ffffff"),
      emissive: new THREE.Color("#eaf2ff"),
      emissiveIntensity: 0.25,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.tailMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#4a070d"),
      emissive: new THREE.Color("#ff2233"),
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.2,
    });

    this._buildBody();
    this._buildCabin();
    this._buildDetails();
    this._buildLights();
    this._buildWheels();
    this._buildContactShadow();
  }

  /* ------------------------------------------------------------------ */
  /* body shell with wheel arches                                        */
  /* ------------------------------------------------------------------ */

  _buildBody() {
    // Side profile, counter-clockwise. Wheel arches are cut as elliptical
    // notches in the bottom edge so the wheels sit in real fender openings.
    const s = new THREE.Shape();
    s.moveTo(-1.96, 0.2);

    for (const { x } of WHEEL_ARCHES) {
      s.lineTo(x - ARCH_R, 0.2);
      s.absellipse(x, 0.2, ARCH_R, ARCH_RISE, Math.PI, 0, true);
    }

    s.lineTo(1.94, 0.2);
    s.quadraticCurveTo(2.1, 0.2, 2.18, 0.3);
    s.lineTo(2.32, 0.62);
    s.quadraticCurveTo(2.36, 0.82, 2.24, 0.9);
    s.quadraticCurveTo(1.86, 0.98, 1.24, 1.02);
    s.lineTo(0.3, 1.06);
    s.lineTo(-1.74, 1.02);
    s.lineTo(-2.16, 0.95);
    s.quadraticCurveTo(-2.36, 0.78, -2.3, 0.5);
    s.lineTo(-2.16, 0.2);
    s.closePath();

    const geo = new THREE.ExtrudeGeometry(s, {
      depth: BODY_DEPTH,
      bevelEnabled: true,
      bevelThickness: BEVEL_THICK,
      bevelSize: BEVEL_SIZE,
      bevelOffset: 0,
      bevelSegments: 8,
      curveSegments: 120,
    });
    geo.translate(0, 0, -BODY_DEPTH / 2);
    geo.computeVertexNormals();

    const body = new THREE.Mesh(geo, this.paint);
    body.castShadow = true;
    body.receiveShadow = true;
    this.root.add(body);
    this.body = body;

    // floor pan: closes the tunnel between the two arches
    const floor = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.1, 1.2), this.trim);
    floor.position.set(-0.02, 0.23, 0);
    this.root.add(floor);

    // dark arch mouldings: hide the extruded bevel seam around each opening
    const mouldGeo = new THREE.TorusGeometry(1, 0.03, 8, 64, Math.PI);
    for (const { x } of WHEEL_ARCHES) {
      for (const z of [-1, 1]) {
        const mould = new THREE.Mesh(mouldGeo, this.trim);
        mould.scale.set(ARCH_R * 1.035, ARCH_RISE * 1.035, 1);
        mould.position.set(x, 0.2, z * (HALF_WIDTH + 0.005));
        this.root.add(mould);
      }
    }

    // side skirts between the wheels, hugging the lower flank
    for (const z of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.075, 0.04), this.trim);
      skirt.position.set(-0.02, 0.24, z * (HALF_WIDTH - 0.022));
      skirt.receiveShadow = true;
      this.root.add(skirt);
    }
  }

  /* ------------------------------------------------------------------ */

  _buildCabin() {
    // Greenhouse: a lofted stack of half-ovals (windshield -> roof -> rear glass)
    // gives the coupe a rounded canopy instead of a flat extruded slab.
    const sections = [
      // x,      halfWidth, yTop,  yBottom, overshoot
      [1.06, 0.46, 0.98, 0.0],
      [0.92, 0.63, 1.06, 0.0],
      [0.62, 0.705, 1.31, 0.02],
      [0.2, 0.715, 1.45, 0.03],
      [-0.5, 0.715, 1.47, 0.03],
      [-0.95, 0.69, 1.35, 0.02],
      [-1.35, 0.62, 1.1, 0.0],
      [-1.62, 0.5, 0.99, 0.0],
    ];
    const across = 30;

    const positions = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i < sections.length; i++) {
      const [x, hw, yTop, yBase] = sections[i];
      for (let j = 0; j <= across; j++) {
        const t = j / across;            // 0..1 across the half-oval
        const a = Math.PI * t;           // 0..PI, from one side of the roof to the other
        positions.push(x, yBase + (yTop - yBase) * Math.sin(a), hw * Math.cos(a));
        uvs.push(t, i / (sections.length - 1));
      }
    }
    for (let i = 0; i < sections.length - 1; i++) {
      for (let j = 0; j < across; j++) {
        const a = i * (across + 1) + j;
        const b = a + 1;
        const c = a + across + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const canopy = new THREE.Mesh(geo, this.glass);
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    this.root.add(canopy);
    this.cabin = canopy;

    // painted pillars tracing the canopy edges, and the roof band on top
    for (const z of [-1, 1]) {
      // A-pillar: windshield edge
      this._beam(this.paint, 1.03, 0.99, 0.24, 1.44, 0.075, 0.055, z * 0.63);
      // B-pillar
      this._beam(this.paint, 0.2, 1.44, -0.62, 1.45, 0.06, 0.05, z * 0.7);
      // C-pillar: rear glass edge
      this._beam(this.paint, -0.62, 1.45, -1.6, 0.99, 0.08, 0.055, z * 0.64);
      // sill of the greenhouse
      this._beam(this.paint, 1.06, 0.985, -1.63, 0.99, 0.05, 0.05, z * 0.72);
    }

    // roof band along the top of the canopy
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.04, 1.34), this.paint);
    roof.position.set(-0.2, 1.462, 0);
    roof.castShadow = true;
    this.root.add(roof);
  }

  /** thin box stretched between two points in the XY plane */
  _beam(mat, x1, y1, x2, y2, w, d, z) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), mat);
    mesh.position.set((x1 + x2) / 2, (y1 + y2) / 2, z);
    mesh.rotation.z = Math.atan2(-dx, dy);
    mesh.castShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  /* ------------------------------------------------------------------ */

  _buildDetails() {
    // front grille + splitter
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 1.1), this.trim);
    grille.position.set(2.36, 0.6, 0);
    this.root.add(grille);

    const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.055, 1.5), this.trim);
    splitter.position.set(2.2, 0.235, 0);
    splitter.castShadow = true;
    this.root.add(splitter);

    // rear diffuser + spoiler
    const diff = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 1.34), this.trim);
    diff.position.set(-2.34, 0.28, 0);
    this.root.add(diff);

    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.04, 1.34), this.paint);
    spoiler.position.set(-2.14, 1.03, 0);
    spoiler.rotation.z = 0.12;
    spoiler.castShadow = true;
    this.root.add(spoiler);

    // side mirrors
    for (const z of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.045, 0.14), this.trim);
      arm.position.set(0.84, 1.02, z * 0.84);
      this.root.add(arm);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.115, 0.22), this.paint);
      head.position.set(0.84, 1.05, z * 0.95);
      head.castShadow = true;
      this.root.add(head);
    }

    // shark fin + door handles
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 12), this.trim);
    fin.position.set(-1.22, 1.435, 0);
    fin.rotation.z = 0.55;
    this.root.add(fin);

    for (const z of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.028, 0.03), this.chrome);
      h.position.set(-0.3, 0.9, z * 0.835);
      this.root.add(h);
    }

    // beltline trim
    const belt = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.03, HALF_WIDTH * 2 + 0.015), this.chrome);
    belt.position.set(-0.32, 1.03, 0);
    this.root.add(belt);

    // exhaust tips
    for (const z of [-0.42, 0.42]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 16), this.chrome);
      p.rotation.z = Math.PI / 2;
      p.position.set(-2.41, 0.34, z);
      this.root.add(p);
    }
  }

  _buildLights() {
    for (const z of [-0.58, 0.58]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.44), this.headlightMat);
      hl.position.set(2.33, 0.85, z);
      this.root.add(hl);
    }

    const drl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.022, 1.0), this.headlightMat);
    drl.position.set(2.37, 0.74, 0);
    this.root.add(drl);

    // full-width tail bar, proud of the rear face
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 1.36), this.tailMat);
    tail.position.set(-2.4, 0.92, 0);
    this.root.add(tail);

    for (const z of [-0.68, 0.68]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.26), this.tailMat);
      t.position.set(-2.4, 0.83, z);
      this.root.add(t);
    }

    // headlight beams, intensity driven by the environment
    this.beams = [];
    for (const z of [-0.58, 0.58]) {
      const beam = new THREE.SpotLight("#dfe9ff", 0, 30, 0.45, 0.6, 1.3);
      beam.position.set(2.3, 0.82, z);
      beam.target.position.set(11, 0, z * 1.5);
      this.root.add(beam);
      this.root.add(beam.target);
      this.beams.push(beam);
    }
  }

  /* ------------------------------------------------------------------ */

  _buildWheels() {
    const tyreMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#0b0c0e"),
      roughness: 0.93,
      metalness: 0.02,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#d3dae2"),
      metalness: 1,
      roughness: 0.18,
      envMapIntensity: 1.8,
    });
    const barrelMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#191e25"),
      metalness: 0.8,
      roughness: 0.45,
    });
    const caliperMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#c11f2b"),
      metalness: 0.5,
      roughness: 0.4,
    });

    const TYRE_W = 0.3;
    const FACE = TYRE_W / 2; // 0.15, outer face of the wheel

    // torus tyre: rounded shoulders, hollow centre so the rim shows through
    const tyreGeo = new THREE.TorusGeometry(WHEEL_R - 0.075, 0.075, 14, 48);
    tyreGeo.scale(1, 1, 1.85);

    // rim barrel: an open tube lining the inside of the tyre
    const barrelGeo = new THREE.CylinderGeometry(0.285, 0.285, TYRE_W - 0.02, 40, 1, true);
    barrelGeo.rotateX(Math.PI / 2);
    const lipGeo = new THREE.TorusGeometry(0.283, 0.018, 8, 44);
    const spokeGeo = new THREE.BoxGeometry(0.058, 0.25, 0.055);
    const hubGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 22);
    hubGeo.rotateX(Math.PI / 2);
    const discGeo = new THREE.CylinderGeometry(0.205, 0.205, 0.04, 34);
    discGeo.rotateX(Math.PI / 2);
    // back plate with a hole in the middle so the brake shows through
    const backPlateGeo = new THREE.RingGeometry(0.105, 0.286, 44, 1);

    // upper half tube for the wheel-well, squashed to the arch's ellipse
    const linerGeo = new THREE.CylinderGeometry(
      ARCH_R - 0.01,
      ARCH_R - 0.01,
      1.24,
      26,
      1,
      true,
      Math.PI / 2,
      Math.PI
    );
    linerGeo.rotateX(Math.PI / 2);
    linerGeo.scale(1, ARCH_RISE / ARCH_R, 1);
    linerGeo.translate(0, WHEEL_R, 0);
    const linerMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c10,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });

    for (const { x, z } of WHEELS) {
      // dark wheel-well so you never see straight through the body
      const liner = new THREE.Mesh(linerGeo, linerMat);
      liner.position.set(x, 0, 0);
      this.root.add(liner);

      const group = new THREE.Group();

      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.castShadow = true;
      tyre.receiveShadow = true;
      group.add(tyre);

      // dark barrel lining the tyre + back plate behind the spokes
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      group.add(barrel);

      const backPlate = new THREE.Mesh(backPlateGeo, barrelMat);
      backPlate.position.z = FACE - 0.105;
      group.add(backPlate);

      // brake disc + caliper, seen through the middle of the wheel
      const disc = new THREE.Mesh(discGeo, barrelMat);
      disc.position.z = FACE - 0.14;
      group.add(disc);

      const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.06), caliperMat);
      caliper.position.set(0.11, -0.03, FACE - 0.15);
      group.add(caliper);

      // five twin spokes laid on the outer face
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        for (const off of [-0.085, 0.085]) {
          const spoke = new THREE.Mesh(spokeGeo, rimMat);
          const rMid = 0.185;
          spoke.position.set(
            Math.cos(angle) * rMid + off * Math.sin(angle),
            Math.sin(angle) * rMid - off * Math.cos(angle),
            FACE - 0.045
          );
          spoke.rotation.z = angle - Math.PI / 2;
          group.add(spoke);
        }
      }

      // outer lip ring + centre cap
      const lip = new THREE.Mesh(lipGeo, rimMat);
      lip.position.z = FACE - 0.03;
      group.add(lip);

      const hub = new THREE.Mesh(hubGeo, rimMat);
      hub.position.z = FACE - 0.03;
      group.add(hub);

      group.position.set(x, WHEEL_R, z);
      group.rotation.y = z > 0 ? 0 : Math.PI;
      this.root.add(group);
      this.wheels.push(group);
    }
  }

  _buildContactShadow() {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.5);
    grad.addColorStop(0, "rgba(0,0,0,0.9)");
    grad.addColorStop(0.45, "rgba(0,0,0,0.42)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 3.8),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0.6,
        color: 0x000000,
      })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.008;
    plane.renderOrder = 1;
    this.root.add(plane);
    this.contactShadow = plane;
  }

  /* ------------------------------------------------------------------ */

  /** React to the current environment: headlight beams + light emissives. */
  setEnvironment(key) {
    this.headlightTarget =
      { sunny: 0, rainy: 0.6, sunset: 0.35, night: 1, snowy: 0.25 }[key] ?? 0;
    this.tailMat.emissiveIntensity = 0.35 + this.headlightTarget * 0.85;
  }

  update(dt) {
    const target = this.headlightTarget ?? 0;
    this._beamStrength += (target - this._beamStrength) * (1 - Math.pow(0.02, dt));

    for (const beam of this.beams) beam.intensity = this._beamStrength * 95;
    this.headlightMat.emissiveIntensity = 0.25 + this._beamStrength * 2.8;
  }
}
