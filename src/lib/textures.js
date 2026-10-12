// Prozedurale Planetentexturen (Canvas) – Platzhalter bis echte, frei
// lizenzierte Kartenbilder eingebunden sind.
import * as THREE from 'three';

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  return `rgb(${Math.round(Math.min(1, c.r * f) * 255)},${Math.round(Math.min(1, c.g * f) * 255)},${Math.round(Math.min(1, c.b * f) * 255)})`;
}

export function planetTexture(body) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const rand = rng([...body.id].reduce((a, ch) => a + ch.charCodeAt(0) * 97, 7));
  ctx.fillStyle = body.color;
  ctx.fillRect(0, 0, 256, 128);

  if (body.texture === 'bands') {
    // Wolkenbänder der Gasriesen
    let y = 0;
    while (y < 128) {
      const h = 3 + rand() * 12;
      ctx.fillStyle = shade(body.color, 0.78 + rand() * 0.4);
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, y, 256, h);
      y += h;
    }
    if (body.id === 'jupiter') {
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#b5603a';
      ctx.beginPath();
      ctx.ellipse(170, 82, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (body.id === 'earth') {
    ctx.globalAlpha = 1;
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = rand() > 0.35 ? '#3f7d3a' : '#b49a64';
      ctx.beginPath();
      ctx.ellipse(rand() * 256, 20 + rand() * 88, 6 + rand() * 22, 4 + rand() * 12, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f2f6ff';
    ctx.fillRect(0, 0, 256, 8);
    ctx.fillRect(0, 120, 256, 8);
  } else {
    // Gesteinsplaneten: Flecken/Krater
    for (let i = 0; i < 260; i++) {
      ctx.globalAlpha = 0.18 + rand() * 0.25;
      ctx.fillStyle = shade(body.color, 0.6 + rand() * 0.8);
      ctx.beginPath();
      ctx.arc(rand() * 256, rand() * 128, 1 + rand() * 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
