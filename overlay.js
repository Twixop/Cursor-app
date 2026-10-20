(() => {
  // Diagnostic (visible dans le terminal)
  window.addEventListener('error', (e) => console.log('erreur :', e.message));
  if (new URLSearchParams(location.search).get('debug') === '1') {
    document.documentElement.classList.add('debug');
  }
  console.log('chargée. pont =', typeof window.cursorBridge, '| taille', innerWidth + 'x' + innerHeight);

  const canvas = document.getElementById('trail');
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  // ---------- Réglages (reçus du processus principal) ----------
  let S = {
    effect: 'line', rainbow: false,
    colorStart: '#00f0ff', colorEnd: '#ff2bd6',
    trailLength: 28, trailWidth: 10, glow: 14
  };
  let startRGB = [0, 240, 255];
  let endRGB = [255, 43, 214];
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  // La longueur de la traînée se mesure en distance parcourue (pixels) :
  // elle est donc aussi longue à vitesse lente qu'à vitesse rapide, et se remplit
  // aussi vite que la souris avance. Réglage 28 = environ 450 px, 200 = 3200 px.
  const PX_PER_UNIT = 16;
  const MAX_POINTS = 500;

  // ---------- État ----------
  const points = [];     // chemin de la souris (ligne, points)
  let pathLen = 0;       // longueur totale du chemin en pixels
  const queue = [];      // positions reçues depuis la dernière image
  const particles = [];  // étincelles
  let mx = 0, my = 0;
  let prevX = null, prevY = null;
  let moved = false;
  let running = false;
  let hue = 0;

  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

  // t : 0 = bout de la traînée, 1 = près du curseur
  function colorAt(t, alpha) {
    if (S.rainbow) return `hsla(${Math.round((hue + t * 140) % 360)}, 100%, 60%, ${alpha})`;
    const [r, g, b] = mix(endRGB, startRGB, t);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function glowFor(t) {
    ctx.shadowColor = colorAt(t, 0.9);
    ctx.shadowBlur = S.glow * t;
  }

  window.cursorBridge.onSettings((s) => {
    S = s;
    startRGB = hexToRgb(s.colorStart);
    endRGB = hexToRgb(s.colorEnd);
    points.length = 0;     // repart d'une traînée propre avec le nouvel effet
    pathLen = 0;
    queue.length = 0;
    particles.length = 0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  });

  let seen = false;
  window.cursorBridge.onCursor((p) => {
    if (!seen) { seen = true; console.log('premier point reçu :', p.x, p.y); }
    mx = p.x;
    my = p.y;
    moved = true;
    if (S.effect !== 'sparks') {
      queue.push({ x: p.x, y: p.y });
      if (queue.length > 64) queue.shift();
    }
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  });

  // ---------- Gestion du chemin ----------
  function addPoint(x, y) {
    const n = points.length;
    // Écart minimal entre deux points : évite des milliers de points à vitesse lente
    const minStep = S.effect === 'dots' ? Math.max(4, S.trailWidth) : 2;
    if (n > 0) {
      const last = points[n - 1];
      const d = Math.hypot(x - last.x, y - last.y);
      if (d < minStep && n > 1) {
        // trop proche : on déplace simplement la tête de la traînée
        const prev = points[n - 2];
        pathLen -= dist(prev, last);
        last.x = x;
        last.y = y;
        pathLen += dist(prev, last);
        return;
      }
      pathLen += d;
    }
    points.push({ x, y });
  }

  function removeHead() {
    if (points.length > 1) pathLen -= dist(points[0], points[1]);
    else pathLen = 0;
    points.shift();
  }

  function trim() {
    const maxLen = S.trailLength * PX_PER_UNIT;
    while (points.length > 2 && pathLen > maxLen) removeHead();
    while (points.length > MAX_POINTS) removeHead();
  }

  // ---------- Effets ----------
  // Pour les très longues traînées, on dessine un point sur deux, trois… afin de
  // rester fluide (jamais plus de ~160 éléments dessinés par image).
  function sampled() {
    const step = Math.max(1, Math.ceil(points.length / 160));
    if (step === 1) return points;
    const out = [];
    for (let i = 0; i < points.length; i += step) out.push(points[i]);
    if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
    return out;
  }

  function drawLine() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pts = sampled();
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
    if (total <= 0) return;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += dist(pts[i - 1], pts[i]);
      const t = acc / total; // 0 = bout, 1 = curseur (selon la distance)
      ctx.strokeStyle = colorAt(t, t);
      glowFor(t);
      ctx.lineWidth = Math.max(1, S.trailWidth * t);
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  }

  function drawDots() {
    const pts = sampled();
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
    if (total <= 0) return;
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) acc += dist(pts[i - 1], pts[i]);
      const t = Math.max(0.02, acc / total);
      ctx.fillStyle = colorAt(t, t);
      glowFor(t);
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, Math.max(1, (S.trailWidth / 2) * t), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function spawn(x, y) {
    if (particles.length > 700) particles.shift();
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.3 + Math.random() * 1.6;
    const life = Math.max(8, S.trailLength * (0.6 + Math.random() * 0.6));
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.2,
      life, max: life,
      size: (S.trailWidth / 2) * (0.4 + Math.random() * 0.6)
    });
  }

  function spawnAlongMove() {
    const fromX = prevX === null ? mx : prevX;
    const fromY = prevY === null ? my : prevY;
    const n = Math.min(24, Math.max(1, Math.ceil(Math.hypot(mx - fromX, my - fromY) / 5)));
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      spawn(lerp(fromX, mx, k), lerp(fromY, my, k));
    }
    prevX = mx;
    prevY = my;
  }

  function drawSparks() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03;
      p.vx *= 0.99;
      p.life--;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      const t = p.life / p.max; // 1 = jeune, 0 = presque éteinte
      ctx.fillStyle = colorAt(t, t);
      glowFor(t);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.6, p.size * t + 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- Boucle de dessin ----------
  function frame() {
    hue = (hue + 3) % 360;

    if (S.effect === 'sparks') {
      if (moved) { spawnAlongMove(); moved = false; }
    } else if (moved) {
      // toutes les positions reçues depuis la dernière image : courbes plus fidèles
      for (const q of queue) addPoint(q.x, q.y);
      queue.length = 0;
      trim();
      moved = false;
    } else if (points.length) {
      // souris immobile : la traînée se résorbe (plus vite quand elle est longue)
      const k = Math.max(1, Math.ceil(points.length / 15));
      for (let i = 0; i < k && points.length; i++) removeHead();
    }

    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (S.effect === 'sparks') drawSparks();
    else if (S.effect === 'dots') drawDots();
    else drawLine();

    if (points.length > 0 || particles.length > 0 || moved) {
      requestAnimationFrame(frame);
    } else {
      running = false; // plus rien à dessiner : on arrête la boucle
      prevX = prevY = null;
    }
  }
})();
