// Réglages : valeurs par défaut, validation, lecture et écriture sur le disque.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = Object.freeze({
  effect: 'line',          // 'line' | 'dots' | 'sparks'
  rainbow: false,          // arc-en-ciel animé (remplace les deux couleurs)
  colorStart: '#00f0ff',   // couleur près du curseur
  colorEnd: '#ff2bd6',     // couleur du bout de la traînée
  trailLength: 28,
  trailWidth: 10,
  glow: 14
});

const LIMITS = {
  trailLength: [5, 200],
  trailWidth: [2, 30],
  glow: [0, 40]
};
const EFFECTS = ['line', 'dots', 'sparks'];
const HEX = /^#[0-9a-fA-F]{6}$/;

function sanitize(input) {
  const s = { ...DEFAULTS, ...(input && typeof input === 'object' ? input : {}) };
  const out = {
    effect: EFFECTS.includes(s.effect) ? s.effect : DEFAULTS.effect,
    rainbow: Boolean(s.rainbow),
    colorStart: HEX.test(s.colorStart) ? s.colorStart.toLowerCase() : DEFAULTS.colorStart,
    colorEnd: HEX.test(s.colorEnd) ? s.colorEnd.toLowerCase() : DEFAULTS.colorEnd
  };
  for (const key of Object.keys(LIMITS)) {
    const n = Number(s[key]);
    const [min, max] = LIMITS[key];
    out[key] = Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : DEFAULTS[key];
  }
  return out;
}

const filePath = () => path.join(app.getPath('userData'), 'settings.json');

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    return { settings: sanitize(raw), existed: true };
  } catch {
    return { settings: { ...DEFAULTS }, existed: false };
  }
}

function save(settings) {
  try {
    fs.mkdirSync(path.dirname(filePath()), { recursive: true });
    fs.writeFileSync(filePath(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.log('[trail] sauvegarde des réglages impossible :', err.message);
  }
}

module.exports = { DEFAULTS, sanitize, load, save };
