// Siderische Rotationsperiode in Stunden (negativ = rückläufig / retrograd).
// Kleinkörper bringen ihre Periode selbst mit (body.rotationHours, evtl. null → keine Rotation).
export const ROTATION_HOURS = {
  sun: 609.12,
  mercury: 1407.6,
  venus: -5832.5,
  earth: 23.9345,
  moon: 655.72,
  mars: 24.6229,
  jupiter: 9.925,
  saturn: 10.656,
  uranus: -17.24,
  neptune: 16.11,
  pluto: -153.29,
};

// Rotationsperiode (Stunden, mit Vorzeichen) eines Körpers oder null
export function rotationPeriod(body) {
  const p = ROTATION_HOURS[body.id] ?? body.rotationHours;
  return typeof p === 'number' && p !== 0 ? p : null;
}
