import "./style.css";
import * as THREE from "three";
import { configurations, getConfig } from "./environments.js";
import { Car } from "./car.js";
import { Environment } from "./environment.js";

/* ------------------------------------------------------------------ */
/* renderer / scene                                                    */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 320);

const car = new Car(renderer);
scene.add(car.root);

const env = new Environment(scene, renderer);

/* ------------------------------------------------------------------ */
/* orbit camera (self-contained, inertia + auto-rotate)                */
/* ------------------------------------------------------------------ */

const orbit = {
  azimuth: 0.62,
  polar: 1.19,
  targetAzimuth: 0.62,
  targetPolar: 1.19,
  radius: 10.6,
  targetRadius: 10.6,
  minPolar: 0.55,
  maxPolar: 1.45,
  minRadius: 6.4,
  maxRadius: 17,
  autoRotate: true,
  dragging: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
  focus: new THREE.Vector3(0, 0.95, 0),
};

function applyCamera() {
  const sinP = Math.sin(orbit.polar);
  camera.position.set(
    orbit.focus.x + orbit.radius * sinP * Math.sin(orbit.azimuth),
    orbit.focus.y + orbit.radius * Math.cos(orbit.polar),
    orbit.focus.z + orbit.radius * sinP * Math.cos(orbit.azimuth)
  );
  camera.lookAt(orbit.focus);
}

canvas.addEventListener("pointerdown", (e) => {
  orbit.dragging = true;
  orbit.pointerId = e.pointerId;
  orbit.lastX = e.clientX;
  orbit.lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = "grabbing";
});

canvas.addEventListener("pointermove", (e) => {
  if (!orbit.dragging || e.pointerId !== orbit.pointerId) return;
  const dx = e.clientX - orbit.lastX;
  const dy = e.clientY - orbit.lastY;
  orbit.lastX = e.clientX;
  orbit.lastY = e.clientY;
  orbit.targetAzimuth -= dx * 0.0062;
  orbit.targetPolar = THREE.MathUtils.clamp(orbit.targetPolar - dy * 0.0042, orbit.minPolar, orbit.maxPolar);
});

function endDrag(e) {
  if (e.pointerId !== orbit.pointerId) return;
  orbit.dragging = false;
  orbit.pointerId = null;
  canvas.style.cursor = "grab";
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    orbit.targetRadius = THREE.MathUtils.clamp(
      orbit.targetRadius + e.deltaY * 0.0065,
      orbit.minRadius,
      orbit.maxRadius
    );
  },
  { passive: false }
);

canvas.style.cursor = "grab";

/* keyboard support for the orbit */
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLButtonElement) return;
  if (e.key === "ArrowLeft") orbit.targetAzimuth += 0.16;
  else if (e.key === "ArrowRight") orbit.targetAzimuth -= 0.16;
  else if (e.key === "ArrowUp") orbit.targetPolar = Math.max(orbit.minPolar, orbit.targetPolar - 0.12);
  else if (e.key === "ArrowDown") orbit.targetPolar = Math.min(orbit.maxPolar, orbit.targetPolar + 0.12);
  else return;
  e.preventDefault();
});

/* ------------------------------------------------------------------ */
/* environment selection UI                                            */
/* ------------------------------------------------------------------ */

const buttons = [...document.querySelectorAll(".env")];
const badge = document.getElementById("env-badge");
const autoRotateBtn = document.getElementById("auto-rotate");

let currentKey = "sunny";

function selectEnvironment(key, { instant = false } = {}) {
  const config = getConfig(key);
  if (!config) return;
  currentKey = key;

  buttons.forEach((btn) => {
    const active = btn.dataset.env === key;
    btn.setAttribute("aria-checked", String(active));
    btn.tabIndex = active ? 0 : -1;
  });

  badge.textContent = config.label;
  badge.style.background = config.badge.bg;
  badge.style.borderColor = config.badge.border;
  badge.style.color = config.badge.color;

  env.apply(config, { instant });

  // the car reacts to the environment too (headlights, road wetness feel)
  car.setEnvironment(key);

  // keep the URL shareable
  const url = new URL(window.location.href);
  url.searchParams.set("env", key);
  history.replaceState(null, "", url);
}

buttons.forEach((btn, i) => {
  btn.tabIndex = btn.dataset.env === currentKey ? 0 : -1;
  btn.addEventListener("click", () => selectEnvironment(btn.dataset.env));
  btn.addEventListener("keydown", (e) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    let next = i;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = buttons.length - 1;
    else next = (i + dir + buttons.length) % buttons.length;
    buttons[next].focus();
    selectEnvironment(buttons[next].dataset.env);
  });
});

autoRotateBtn.addEventListener("click", () => {
  orbit.autoRotate = !orbit.autoRotate;
  autoRotateBtn.setAttribute("aria-pressed", String(orbit.autoRotate));
  autoRotateBtn.textContent = `چرخش خودکار: ${orbit.autoRotate ? "روشن" : "خاموش"}`;
});

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

const initialKey = configurations.some((c) => c.key === new URLSearchParams(location.search).get("env"))
  ? new URLSearchParams(location.search).get("env")
  : "sunny";

selectEnvironment(initialKey, { instant: true });

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  // nudge the framing left so the car clears the panel on wide screens
  if (w / h > 1.4) camera.setViewOffset(w, h, w * 0.055, 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  env.setPixelRatio(renderer.getPixelRatio());
}
window.addEventListener("resize", resize);
resize();
applyCamera();

/* ------------------------------------------------------------------ */
/* animation loop                                                      */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock();
let elapsed = 0;
let firstFrame = true;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (orbit.autoRotate && !orbit.dragging) orbit.targetAzimuth += dt * 0.075;

  const k = 1 - Math.pow(0.0016, dt);
  orbit.azimuth += (orbit.targetAzimuth - orbit.azimuth) * k;
  orbit.polar += (orbit.targetPolar - orbit.polar) * k;
  orbit.radius += (orbit.targetRadius - orbit.radius) * k;

  applyCamera();

  env.update(dt, elapsed, camera);
  car.update(dt, elapsed);

  renderer.render(scene, camera);

  if (firstFrame) {
    firstFrame = false;
    document.getElementById("loading").classList.add("hidden");
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

/* expose for quick manual tweaks in the console */
window.__car = { scene, camera, env, car, selectEnvironment };
