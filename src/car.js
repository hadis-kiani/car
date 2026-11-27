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
  { x: 1.42, z: 0.78 },
  { x: 1.42, z: -0.78 },
  { x: -1.46, z: 0.78 },
  { x: -1.46, z: -0.78 },
];
const WHEEL_R = 0.37;
const ARCH_R = 0.47;

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
    const s = new THREE.Shape();
    s.moveTo(-2.16, 0.2);
    s.lineTo(-2.3, 0.5);
    s.quadraticCurveTo(-2.36, 0.78, -2.16, 0.95);
    s.lineTo(-1.74, 1.02);
    s.lineTo(0.3, 1.06);
    s.lineTo(1.24, 1.02);
    s.quadraticCurveTo(1.86, 0.98, 2.24, 0.9);
    s.quadraticCurveTo(2.36, 0.82, 2.32, 0.62);
    s.lineTo(2.18, 0.3);
    s.quadraticCurveTo(2.1, 0.2, 1.94, 0.2);
    s.lineTo(-1.96, 0.2);
    s.closePath();

    // wheel arch cut-outs in the side profile
    for (const { x } of [WHEELS[0], WHEELS[2]]) {
      const yTop = 0.28;
      const dy = yTop - WHEEL_R;
      const dx = Math.sqrt(ARCH_R * ARCH_R - dy * dy);
      const a = Math.atan2(dy, -dx);
      const b = Math.atan2(dy, dx);
      const hole = new THREE.Path();
      hole.moveTo(x - dx, yTop);
      hole.absarc(x, WHEEL_R, ARCH_R, a, b, false);
      hole.lineTo(x - dx, yTop);
      s.holes.push(hole);
    }

    const geo = new THREE.ExtrudeGeometry(s, {
      depth: BODY_DEPTH,
      bevelEnabled: true,
      bevelThickness: BEVEL_THICK,
      bevelSize: BEVEL_SIZE,
      bevelOffset: 0,
      bevelSegments: 8,
      curveSegments: 26,
    });
    geo.translate(0, 0, -BODY_DEPTH / 2);
    geo.computeVertexNormals();

    const body = new THREE.Mesh(geo, this.paint);
    body.castShadow = true;
    body.receiveShadow = true;
    this.root.add(body);
    this.body = body;

    // floor pan: closes the tunnel between the two arches
    const floor = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.16, 1.28), this.trim);
    floor.position.set(-0.02, 0.26, 0);
    this.root.add(floor);

    // side skirts between the wheels
    for (const z of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.085, 0.1), this.trim);
      skirt.position.set(-0.02, 0.2, z * (HALF_WIDTH + 0.01));
      skirt.receiveShadow = true;
      this.root.add(skirt);
    }
  }

  /* ------------------------------------------------------------------ */

  _buildCabin() {
    const s = new THREE.Shape();
    s.moveTo(1.04, 0.96);
    s.quadraticCurveTo(0.62, 1.12, 0.2, 1.4);
    s.lineTo(-0.62, 1.44);
    s.quadraticCurveTo(-1.2, 1.38, -1.66, 1.02);
    s.closePath();

    const geo = new THREE.ExtrudeGeometry(s, {
      depth: 0.98,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.1,
      bevelSegments: 6,
      curveSegments: 22,
    });
    geo.translate(0, 0, -0.49);

    const cabin = new THREE.Mesh(geo, this.glass);
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    this.root.add(cabin);
    this.cabin = cabin;

    // pillars follow the canopy line
    for (const z of [-0.6, 0.6]) {
      this._beam(this.paint, 1.02, 1.0, 0.24, 1.38, 0.09, 0.06, z);
      this._beam(this.paint, -0.8, 1.42, -1.68, 1.06, 0.09, 0.06, z);
      this._beam(this.paint, -0.05, 1.42, -0.05, 1.5, 0.06, 0.06, z);
    }

    // roof panel so the canopy reads as a hardtop
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, 1.16), this.paint);
    roof.position.set(-0.2, 1.48, 0);
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
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 1.12), this.trim);
    grille.position.set(2.33, 0.62, 0);
    this.root.add(grille);

    const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 1.62), this.trim);
    splitter.position.set(2.24, 0.24, 0);
    splitter.castShadow = true;
    this.root.add(splitter);

    // rear diffuser + spoiler
    const diff = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 1.42), this.trim);
    diff.position.set(-2.32, 0.3, 0);
    this.root.add(diff);

    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 1.5), this.paint);
    spoiler.position.set(-2.06, 1.13, 0);
    spoiler.rotation.z = 0.07;
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
    fin.position.set(-1.28, 1.54, 0);
    fin.rotation.z = 0.5;
    this.root.add(fin);

    for (const z of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.028, 0.03), this.chrome);
      h.position.set(-0.3, 0.9, z * 0.855);
      this.root.add(h);
    }

    // beltline trim
    const belt = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.03, HALF_WIDTH * 2 + 0.015), this.chrome);
    belt.position.set(-0.32, 1.03, 0);
    this.root.add(belt);

    // exhaust tips
    for (const z of [-0.42, 0.42]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.14, 16), this.chrome);
      p.rotation.z = Math.PI / 2;
      p.position.set(-2.44, 0.36, z);
      this.root.add(p);
    }
  }

  _buildLights() {
    for (const z of [-0.58, 0.58]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.46), this.headlightMat);
      hl.position.set(2.34, 0.85, z);
      this.root.add(hl);
    }

    const drl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.022, 1.0), this.headlightMat);
    drl.position.set(2.37, 0.74, 0);
    this.root.add(drl);

    // full-width tail bar
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.055, 1.42), this.tailMat);
    tail.position.set(-2.38, 0.9, 0);
    this.root.add(tail);

    for (const z of [-0.68, 0.68]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.28), this.tailMat);
      t.position.set(-2.36, 0.83, z);
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
      color: new THREE.Color("#c9d0d8"),
      metalness: 1,
      roughness: 0.22,
      envMapIntensity: 1.6,
    });
    const discMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#3a4048"),
      metalness: 0.85,
      roughness: 0.45,
    });
    const caliperMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#c11f2b"),
      metalness: 0.5,
      roughness: 0.4,
    });

    const tyreGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 40, 1);
    tyreGeo.rotateX(Math.PI / 2);
    const shoulderGeo = new THREE.TorusGeometry(WHEEL_R - 0.055, 0.055, 10, 34);
    const rimGeo = new THREE.CylinderGeometry(0.265, 0.265, 0.315, 36, 1);
    rimGeo.rotateX(Math.PI / 2);
    const discGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.05, 30);
    discGeo.rotateX(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.33, 18);
    hubGeo.rotateX(Math.PI / 2);

    // upper half tube: theta 90°..270° keeps the top half after the rotation
    const linerGeo = new THREE.CylinderGeometry(
      ARCH_R - 0.02,
      ARCH_R - 0.02,
      1.3,
      26,
      1,
      true,
      Math.PI / 2,
      Math.PI
    );
    linerGeo.rotateX(Math.PI / 2);
    const linerMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c10,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });

    for (const { x, z } of WHEELS) {
      // dark wheel-well so you never see straight through the body
      const liner = new THREE.Mesh(linerGeo, linerMat);
      liner.position.set(x, WHEEL_R, 0);
      this.root.add(liner);

      const group = new THREE.Group();

      const tyre = new THREE.Mesh(tyreGeo, tyreMat);
      tyre.castShadow = true;
      tyre.receiveShadow = true;
      group.add(tyre);

      for (const sx of [-1, 1]) {
        const shoulder = new THREE.Mesh(shoulderGeo, tyreMat);
        shoulder.position.z = sx * 0.125;
        group.add(shoulder);
      }

      group.add(new THREE.Mesh(rimGeo, rimMat));

      // five twin spokes
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        for (const off of [-0.085, 0.085]) {
          const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.32), rimMat);
          spoke.position.set(
            Math.cos(angle) * 0.135 + off * Math.sin(angle),
            Math.sin(angle) * 0.135 - off * Math.cos(angle),
            0
          );
          spoke.rotation.z = angle - Math.PI / 2;
          group.add(spoke);
        }
      }

      group.add(new THREE.Mesh(hubGeo, discMat));
      const disc = new THREE.Mesh(discGeo, discMat);
      group.add(disc);

      const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.075), caliperMat);
      caliper.position.set(0.13, -0.05, 0.07);
      group.add(caliper);

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
