(async () => {
  const $ = (id) => document.getElementById(id);
  const SLIDERS = ['trailLength', 'trailWidth', 'glow'];
  const FIELDS = ['effect', 'rainbow', 'colorStart', 'colorEnd', ...SLIDERS];

  const PRESETS = [
    { name: 'Néon',    a: '#00f0ff', b: '#ff2bd6' },
    { name: 'Feu',     a: '#ffd000', b: '#ff2a00' },
    { name: 'Océan',   a: '#7df9ff', b: '#0050ff' },
    { name: 'Matrix',  a: '#7cff00', b: '#00a63c' },
    { name: 'Violet',  a: '#e0b3ff', b: '#6a00ff' },
    { name: 'Glace',   a: '#ffffff', b: '#5ec8ff' }
  ];

  const read = () => ({
    effect: $('effect').value,
    rainbow: $('rainbow').checked,
    colorStart: $('colorStart').value,
    colorEnd: $('colorEnd').value,
    trailLength: Number($('trailLength').value),
    trailWidth: Number($('trailWidth').value),
    glow: Number($('glow').value)
  });

  function refreshLabels() {
    for (const id of SLIDERS) $(id + '-out').textContent = $(id).value;
    const rainbow = $('rainbow').checked;
    $('colorStart').disabled = rainbow;
    $('colorEnd').disabled = rainbow;
  }

  function show(s) {
    $('effect').value = s.effect;
    $('rainbow').checked = s.rainbow;
    $('colorStart').value = s.colorStart;
    $('colorEnd').value = s.colorEnd;
    for (const id of SLIDERS) $(id).value = s[id];
    refreshLabels();
  }

  function send() {
    refreshLabels();
    window.settingsBridge.set(read());
  }

  for (const id of FIELDS) $(id).addEventListener('input', send);

  // Palettes prêtes à l'emploi
  for (const p of PRESETS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset';
    const swatch = document.createElement('i');
    swatch.style.background = `linear-gradient(90deg, ${p.a}, ${p.b})`;
    btn.append(swatch, document.createTextNode(p.name));
    btn.addEventListener('click', () => {
      $('colorStart').value = p.a;
      $('colorEnd').value = p.b;
      $('rainbow').checked = false;
      send();
    });
    $('presets').appendChild(btn);
  }

  $('reset').addEventListener('click', async () => show(await window.settingsBridge.reset()));
  $('close').addEventListener('click', () => window.close());

  show(await window.settingsBridge.get());
})();
