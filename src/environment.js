import * as THREE from "three";

const _c = new THREE.Color();
const _v = new THREE.Vector3();

function skyVertex() {
  return /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
}

function skyFragment() {
  return /* glsl */ `
    uniform vec3 uTop;
    uniform vec3 uHorizon;
    uniform vec3 uBottom;
    uniform vec3 uSunColor;
    uniform vec3 uSunDir;
    uniform float uGlowPower;
    uniform float uGlowStrength;
    uniform float uSunPower;
    varying vec3 vDir;

    void main() {
      vec3 dir = normalize(vDir);
      float h = dir.y;

      vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
      col = mix(col, uBottom, pow(clamp(-h, 0.0, 1.0), 0.55));

      // horizon band, keeps the sky reading as a gradient rather than a wall
      float band = exp(-abs(h) * 9.0);
      col += uHorizon * band * 0.22;

      float sd = max(dot(dir, normalize(uSunDir)), 0.0);
      float glow = pow(sd, uGlowPower) * uGlowStrength;
      float disc = smoothstep(0.9975, 0.9992, sd) * uSunPower;

      col += uSunColor * glow;
      col += uSunColor * disc;

      // gentle dithering to avoid banding on the gradient
      float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      col += (dither - 0.5) * (1.0 / 255.0);

      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;
}

const RAIN_VERT = /* glsl */ `
  attribute float aTip;
  attribute float aSpeed;
  attribute float aSeed;
  uniform float uTime;
  uniform float uHeight;
  uniform float uLength;
  varying float vTip;
  void main() {
    vTip = aTip;
    vec3 p = position;
    p.y = mod(p.y - uTime * aSpeed, uHeight);
    p.y += aTip * uLength;
    p.x += sin(aSeed * 6.283 + uTime * 0.6) * 0.08;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const RAIN_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vTip;
  void main() {
    gl_FragColor = vec4(uColor, uOpacity * mix(0.15, 0.8, vTip));
  }
`;

const SNOW_VERT = /* glsl */ `
  attribute float aSpeed;
  attribute float aSeed;
  uniform float uTime;
  uniform float uHeight;
  uniform float uPixelRatio;
  varying float vSeed;
  void main() {
    vSeed = aSeed;
    vec3 p = position;
    p.y = mod(p.y - uTime * aSpeed, uHeight);
    p.x += sin(uTime * 0.7 + aSeed * 12.0) * 0.9;
    p.z += cos(uTime * 0.55 + aSeed * 9.0) * 0.9;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (5.0 + aSeed * 7.0) * uPixelRatio * (9.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const SNOW_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.08, d);
    gl_FragColor = vec4(uColor, a * uOpacity);
  }
`;

/* ------------------------------------------------------------------ */

function makeSpriteTexture(size, stops) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCloudTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const blobs = [
    [128, 150, 74],
    [86, 132, 52],
    [176, 138, 56],
    [112, 108, 40],
    [156, 104, 34],
  ];
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.55, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ */

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 0;
    this.blend = 1;

    // fog is set once so the car materials compile with fog support
    this.scene.fog = new THREE.FogExp2(0xcfe3f2, 0.0075);

    this._buildSky();
    this._buildLights();
    this._buildGround();
    this._buildStars();
    this._buildClouds();
    this._buildRain();
    this._buildSnow();
    this._buildSunSprite();

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.envMapRT = null;

    this.state = this._configToState(null);
    this.target = this._configToState(null);
  }

  /* ---------------- scene pieces ---------------- */

  _buildSky() {
    this.skyUniforms = {
      uTop: { value: new THREE.Color("#2f7fc4") },
      uHorizon: { value: new THREE.Color("#cfe6f7") },
      uBottom: { value: new THREE.Color("#d8e6ee") },
      uSunColor: { value: new THREE.Color("#fff6dd") },
      uSunDir: { value: new THREE.Vector3(0.45, 0.78, 0.42).normalize() },
      uGlowPower: { value: 12 },
      uGlowStrength: { value: 0.55 },
      uSunPower: { value: 1 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: skyVertex(),
      fragmentShader: skyFragment(),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(180, 48, 32), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  _buildLights() {
    this.sun = new THREE.DirectionalLight("#fff4e0", 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 70;
    this.sun.shadow.camera.left = -9;
    this.sun.shadow.camera.right = 9;
    this.sun.shadow.camera.top = 9;
    this.sun.shadow.camera.bottom = -9;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 2.2;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight("#bcdcf7", "#9aa88a", 0.75);
    this.scene.add(this.hemi);
  }

  _buildGround() {
    const geo = new THREE.CircleGeometry(220, 96);
    geo.rotateX(-Math.PI / 2);

    this.groundMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#8b9686"),
      roughness: 0.88,
      metalness: 0.05,
      envMapIntensity: 0.7,
    });

    this.ground = new THREE.Mesh(geo, this.groundMat);
    this.ground.receiveShadow = true;
    this.ground.position.y = 0;
    this.scene.add(this.ground);

    // a slightly darker staging circle so the car sits on a readable "set"
    const ringGeo = new THREE.RingGeometry(6.2, 6.35, 96);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#ffffff"),
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.position.y = 0.014;
    this.scene.add(this.ring);
  }

  _buildStars() {
    const count = 1100;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * 0.85 + 0.06;
      const r = 165;
      const y = Math.sin(v * Math.PI * 0.5) * r;
      const rr = Math.cos(v * Math.PI * 0.5) * r;
      positions[i * 3] = Math.cos(u) * rr;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(u) * rr;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    this.starMat = new THREE.PointsMaterial({
      color: new THREE.Color("#e8f0ff"),
      size: 1.25,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  _buildClouds() {
    const tex = makeCloudTexture();
    this.clouds = new THREE.Group();
    const layout = [
      [-52, 26, -62, 62],
      [38, 22, -78, 74],
      [76, 30, 18, 80],
      [-70, 24, 40, 66],
      [10, 34, 82, 88],
      [-18, 20, -96, 58],
    ];
    for (const [x, y, z, scale] of layout) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        fog: false,
        color: new THREE.Color("#ffffff"),
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(x, y, z);
      sprite.scale.set(scale, scale * 0.55, 1);
      this.clouds.add(sprite);
    }
    this.scene.add(this.clouds);
  }

  _buildRain() {
    const drops = 4200;
    const positions = new Float32Array(drops * 2 * 3);
    const tips = new Float32Array(drops * 2);
    const speeds = new Float32Array(drops * 2);
    const seeds = new Float32Array(drops * 2);
    const H = 22;

    for (let i = 0; i < drops; i++) {
      const x = (Math.random() - 0.5) * 42;
      const y = Math.random() * H;
      const z = (Math.random() - 0.5) * 42;
      const speed = 16 + Math.random() * 10;
      const seed = Math.random();
      for (let k = 0; k < 2; k++) {
        const idx = (i * 2 + k) * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;
        tips[i * 2 + k] = k;
        speeds[i * 2 + k] = speed;
        seeds[i * 2 + k] = seed;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aTip", new THREE.BufferAttribute(tips, 1));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    this.rainUniforms = {
      uTime: { value: 0 },
      uHeight: { value: H },
      uLength: { value: 0.75 },
      uColor: { value: new THREE.Color("#b9cde0") },
      uOpacity: { value: 0 },
    };

    this.rainMat = new THREE.ShaderMaterial({
      uniforms: this.rainUniforms,
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });

    this.rain = new THREE.LineSegments(geo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  _buildSnow() {
    const flakes = 2600;
    const positions = new Float32Array(flakes * 3);
    const speeds = new Float32Array(flakes);
    const seeds = new Float32Array(flakes);
    const H = 24;

    for (let i = 0; i < flakes; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 36;
      positions[i * 3 + 1] = Math.random() * H;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 36;
      speeds[i] = 0.8 + Math.random() * 1.5;
      seeds[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    this.snowUniforms = {
      uTime: { value: 0 },
      uHeight: { value: H },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColor: { value: new THREE.Color("#ffffff") },
      uOpacity: { value: 0 },
    };

    this.snowMat = new THREE.ShaderMaterial({
      uniforms: this.snowUniforms,
      vertexShader: SNOW_VERT,
      fragmentShader: SNOW_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
    });

    this.snow = new THREE.Points(geo, this.snowMat);
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.scene.add(this.snow);
  }

  _buildSunSprite() {
    const tex = makeSpriteTexture(256, [
      [0, "rgba(255,255,255,1)"],
      [0.18, "rgba(255,246,220,0.55)"],
      [0.45, "rgba(255,230,190,0.15)"],
      [1, "rgba(255,220,170,0)"],
    ]);
    this.sunSpriteMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color("#fff3d6"),
    });
    this.sunSprite = new THREE.Sprite(this.sunSpriteMat);
    this.sunSprite.scale.set(46, 46, 1);
    this.sky.add(this.sunSprite);
  }

  /* ---------------- state / transitions ---------------- */

  _configToState(config) {
    if (!config) {
      return {
        top: new THREE.Color("#2f7fc4"),
        horizon: new THREE.Color("#cfe6f7"),
        bottom: new THREE.Color("#d8e6ee"),
        sunColor: new THREE.Color("#fff6dd"),
        sunDir: new THREE.Vector3(0.45, 0.78, 0.42).normalize(),
        glowPower: 12,
        glowStrength: 0.55,
        sunPower: 1,
        lightColor: new THREE.Color("#fff4e0"),
        lightPower: 3,
        hemiSky: new THREE.Color("#bcdcf7"),
        hemiGround: new THREE.Color("#9aa88a"),
        hemiPower: 0.75,
        fogColor: new THREE.Color("#cfe3f2"),
        fogDensity: 0.0075,
        groundColor: new THREE.Color("#8b9686"),
        groundRough: 0.88,
        groundMetal: 0.05,
        exposure: 1,
        rain: 0,
        snow: 0,
        headlights: 0,
        cloudColor: new THREE.Color("#ffffff"),
        cloudOpacity: 0.28,
        starOpacity: 0,
        sunSpriteOpacity: 0.7,
        ringOpacity: 0.12,
      };
    }

    const s = config.sky;
    return {
      top: new THREE.Color(s.top),
      horizon: new THREE.Color(s.horizon),
      bottom: new THREE.Color(s.bottom),
      sunColor: new THREE.Color(s.sunColor),
      sunDir: new THREE.Vector3(...config.sun.dir).normalize(),
      glowPower: s.glowPower,
      glowStrength: s.glowStrength,
      sunPower: s.sunPower / 1200,
      lightColor: new THREE.Color(config.sun.color),
      lightPower: config.sun.intensity,
      hemiSky: new THREE.Color(config.hemi.sky),
      hemiGround: new THREE.Color(config.hemi.ground),
      hemiPower: config.hemi.intensity,
      fogColor: new THREE.Color(config.fog.color),
      fogDensity: config.fog.density,
      groundColor: new THREE.Color(config.ground.color),
      groundRough: config.ground.roughness,
      groundMetal: config.ground.metalness,
      exposure: config.exposure,
      rain: config.rain,
      snow: config.snow,
      headlights: config.headlights,
      cloudColor: new THREE.Color(s.cloudColor),
      cloudOpacity: s.cloudOpacity,
      starOpacity: s.starOpacity,
      sunSpriteOpacity: Math.min(1.4, 0.25 + s.glowStrength * 0.9),
      ringOpacity: config.key === "night" ? 0.18 : 0.11,
    };
  }

  _applyStateToScene(st) {
    const u = this.skyUniforms;
    u.uTop.value.copy(st.top);
    u.uHorizon.value.copy(st.horizon);
    u.uBottom.value.copy(st.bottom);
    u.uSunColor.value.copy(st.sunColor);
    u.uSunDir.value.copy(st.sunDir);
    u.uGlowPower.value = st.glowPower;
    u.uGlowStrength.value = st.glowStrength;
    u.uSunPower.value = st.sunPower;

    this.sun.color.copy(st.lightColor);
    this.sun.intensity = st.lightPower;
    this.sun.position.copy(st.sunDir).multiplyScalar(30);
    this.sun.target.position.set(0, 0.5, 0);

    this.hemi.color.copy(st.hemiSky);
    this.hemi.groundColor.copy(st.hemiGround);
    this.hemi.intensity = st.hemiPower;

    this.scene.fog.color.copy(st.fogColor);
    this.scene.fog.density = st.fogDensity;

    this.groundMat.color.copy(st.groundColor);
    this.groundMat.roughness = st.groundRough;
    this.groundMat.metalness = st.groundMetal;

    this.ringMat.opacity = st.ringOpacity;

    this.starMat.opacity = st.starOpacity;
    this.stars.visible = st.starOpacity > 0.01;

    for (const cloud of this.clouds.children) {
      cloud.material.color.copy(st.cloudColor);
      cloud.material.opacity = st.cloudOpacity;
    }
    this.sunSpriteMat.color.copy(st.sunColor);
    this.sunSpriteMat.opacity = st.sunSpriteOpacity;
    this.sunSprite.position.copy(st.sunDir).multiplyScalar(150);

    this.renderer.toneMappingExposure = st.exposure;

    this.rainUniforms.uOpacity.value = st.rain * 0.85;
    this.rain.visible = st.rain > 0.01;
    this.snowUniforms.uOpacity.value = st.snow * 0.95;
    this.snow.visible = st.snow > 0.01;
  }

  /** Rebuild the image-based lighting to match the preset. */
  _refreshEnvMap(st) {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size * 2;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, `#${st.top.getHexString()}`);
    grad.addColorStop(0.48, `#${st.horizon.getHexString()}`);
    grad.addColorStop(0.52, `#${st.fogColor.getHexString()}`);
    grad.addColorStop(1, `#${st.bottom.getHexString()}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size * 2, size);

    // sun blob, placed on the equirect where the light direction points
    const dir = st.sunDir;
    const lon = Math.atan2(dir.z, dir.x);
    const lat = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    const px = ((lon / (Math.PI * 2)) + 0.5) * size * 2;
    const py = (0.5 - lat / Math.PI) * size;
    const radius = st.glowPower < 7 ? 46 : 22;
    const g = ctx.createRadialGradient(px, py, 0, px, py, radius * 2.4);
    g.addColorStop(0, `rgba(255,255,255,${Math.min(1, 0.5 + st.glowStrength * 0.7)})`);
    const srgb = st.sunColor.clone().convertLinearToSRGB();
    const r = Math.round(srgb.r * 255);
    const gg = Math.round(srgb.g * 255);
    const bb = Math.round(srgb.b * 255);
    g.addColorStop(0.35, `rgba(${r},${gg},${bb},0.45)`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size * 2, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    const rt = this.pmrem.fromEquirectangular(tex);
    if (this.envMapRT) this.envMapRT.dispose();
    this.envMapRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 1;
    tex.dispose();
  }

  /* ---------------- public API ---------------- */

  apply(config, { instant = false } = {}) {
    this.target = this._configToState(config);
    this.currentKey = config.key;
    this._refreshEnvMap(this.target);

    if (instant || !this.state) {
      this.state = this._configToState(config);
      this._applyStateToScene(this.state);
    }
  }

  setPixelRatio(ratio) {
    this.snowUniforms.uPixelRatio.value = Math.min(ratio, 2);
  }

  update(dt, elapsed, camera) {
    this.time = elapsed;

    // ease toward the target state
    const k = 1 - Math.pow(0.0028, dt);
    const a = this.state;
    const b = this.target;

    a.top.lerp(b.top, k);
    a.horizon.lerp(b.horizon, k);
    a.bottom.lerp(b.bottom, k);
    a.sunColor.lerp(b.sunColor, k);
    a.sunDir.lerp(b.sunDir, k).normalize();
    a.glowPower += (b.glowPower - a.glowPower) * k;
    a.glowStrength += (b.glowStrength - a.glowStrength) * k;
    a.sunPower += (b.sunPower - a.sunPower) * k;
    a.lightColor.lerp(b.lightColor, k);
    a.lightPower += (b.lightPower - a.lightPower) * k;
    a.hemiSky.lerp(b.hemiSky, k);
    a.hemiGround.lerp(b.hemiGround, k);
    a.hemiPower += (b.hemiPower - a.hemiPower) * k;
    a.fogColor.lerp(b.fogColor, k);
    a.fogDensity += (b.fogDensity - a.fogDensity) * k;
    a.groundColor.lerp(b.groundColor, k);
    a.groundRough += (b.groundRough - a.groundRough) * k;
    a.groundMetal += (b.groundMetal - a.groundMetal) * k;
    a.exposure += (b.exposure - a.exposure) * k;
    a.rain += (b.rain - a.rain) * k;
    a.snow += (b.snow - a.snow) * k;
    a.cloudColor.lerp(b.cloudColor, k);
    a.cloudOpacity += (b.cloudOpacity - a.cloudOpacity) * k;
    a.starOpacity += (b.starOpacity - a.starOpacity) * k;
    a.sunSpriteOpacity += (b.sunSpriteOpacity - a.sunSpriteOpacity) * k;
    a.ringOpacity += (b.ringOpacity - a.ringOpacity) * k;

    this._applyStateToScene(a);

    // sky + stars follow the camera so they never clip
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.stars.rotation.y = elapsed * 0.004;

    // particles always surround the viewer
    this.rain.position.set(camera.position.x, 0, camera.position.z);
    this.snow.position.set(camera.position.x, 0, camera.position.z);
    this.rainUniforms.uTime.value = elapsed;
    this.snowUniforms.uTime.value = elapsed;

    // clouds drift
    for (let i = 0; i < this.clouds.children.length; i++) {
      const cloud = this.clouds.children[i];
      cloud.position.x += dt * (0.35 + i * 0.06);
      if (cloud.position.x > 110) cloud.position.x = -110;
    }
  }
}
