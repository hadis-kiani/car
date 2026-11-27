const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync('index.html', 'utf8');
const source = html.slice(html.indexOf('const environmentPresets='), html.indexOf('function makeWindowTexture()'));
assert(source.startsWith('const environmentPresets='));
const modes = ['day', 'night', 'sunset', 'rain', 'snow'];
const buttons = modes.map(mode => ({
  dataset: {environment: mode},
  classList: {toggle(_, value) { this.active = value; }},
  setAttribute(name, value) { this[name] = value; },
  addEventListener(_, callback) { this.click = callback; }
}));
const status = {textContent: ''};
class Color { constructor(value) { this.value = value; } set(value) { this.value = value; } }
class Position { set(x, y, z) { this.x = x; this.y = y; this.z = z; } }
class Geometry { constructor() { this.attributes = {}; } setAttribute(name, attr) { this.attributes[name] = attr; } }
class Attribute { constructor(array) { this.array = array; this.needsUpdate = false; } }
class Renderable { constructor(geometry, material) { this.geometry = geometry; this.material = material; this.position = new Position(); } }
const material = () => ({color: new Color(0)});
const environment = {hemi: {}, sun: {color: new Color(0), position: {}}, ground: material(), asphalt: material(), sidewalk: material(), roof: material(), leaves: [material(), material(), material()], streetLight: material()};
const city = {userData: {environment}, background: new Color(0), fog: {color: new Color(0)}, add(object) { this.objects.push(object); }, objects: []};
let saved = 'night';
const context = {
  Math, Float32Array, city: undefined, drivePoint: {x: 12, z: -7},
  document: {querySelectorAll: () => buttons},
  $: () => status,
  localStorage: {getItem: () => saved, setItem: (_, value) => { saved = value; }},
  T: {BufferGeometry: Geometry, BufferAttribute: Attribute, LineSegments: Renderable, Points: Renderable, LineBasicMaterial: class {}, PointsMaterial: class {}}
};
vm.createContext(context);
vm.runInContext(source, context);
assert.strictEqual(status.textContent, 'حالت انتخاب‌شده: شب');
assert.strictEqual(buttons[1]['aria-pressed'], 'true');
context.city = city;
context.initEnvironment(city);
assert.strictEqual(city.objects.length, 2);
assert.strictEqual(environment.hemi.intensity, .55);
assert.strictEqual(city.userData.weather.rain.visible, false);
assert.strictEqual(city.userData.weather.snow.visible, false);
buttons[3].click();
assert.strictEqual(saved, 'rain');
assert.strictEqual(city.userData.weather.rain.visible, true);
assert.strictEqual(city.userData.weather.snow.visible, false);
assert.strictEqual(environment.asphalt.roughness, .3);
assert.strictEqual(buttons[3]['aria-pressed'], 'true');
const rain = city.userData.weather.rain;
const beforeRain = rain.geometry.attributes.position.array[1];
context.updateWeather(.1);
assert.notStrictEqual(rain.geometry.attributes.position.array[1], beforeRain);
assert.strictEqual(rain.geometry.attributes.position.needsUpdate, true);
assert.strictEqual(rain.position.x, 12);
assert.strictEqual(rain.position.z, -7);
buttons[4].click();
assert.strictEqual(saved, 'snow');
assert.strictEqual(city.userData.weather.rain.visible, false);
assert.strictEqual(city.userData.weather.snow.visible, true);
assert.strictEqual(environment.ground.color.value, 0xd8e0df);
const snow = city.userData.weather.snow;
const beforeSnow = snow.geometry.attributes.position.array[1];
context.updateWeather(.1);
assert.notStrictEqual(snow.geometry.attributes.position.array[1], beforeSnow);
buttons[2].click();
assert.strictEqual(environment.sun.position.y, 24);
assert.strictEqual(city.userData.weather.snow.visible, false);
buttons[0].click();
assert.strictEqual(environment.asphalt.roughness, .95);
assert.strictEqual(environment.ground.color.value, 0x7b8178);
context.selectEnvironment('invalid');
assert.strictEqual(saved, 'day');
console.log('Environment selection, persistence, lighting and precipitation tests passed');
