// Globale Oberflächentextur aus NASA-Trek-Kacheln zusammensetzen (im Browser, CORS erlaubt):
// Ebene 1 = 4 × 2 Kacheln à 256 px → 1024 × 512 px, äquirektangulär.
import * as THREE from 'three';

export function trekTexture(urlTemplate, maxLevel = 1, onReady) {
  const level = Math.min(1, maxLevel);
  const cols = 2 * 2 ** level, rows = cols / 2; // Ebene 0: 2×1, Ebene 1: 4×2
  const canvas = document.createElement('canvas');
  canvas.width = cols * 256;
  canvas.height = rows * 256;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  let pending = cols * rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = img.onerror = () => {
        if (img.naturalWidth) ctx.drawImage(img, x * 256, y * 256, 256, 256);
        tex.needsUpdate = true;
        if (--pending === 0) onReady?.(tex);
      };
      img.src = urlTemplate.replace('{z}', level).replace('{y}', y).replace('{x}', x);
    }
  }
  return tex;
}
