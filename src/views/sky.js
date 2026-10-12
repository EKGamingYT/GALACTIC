// Himmelsansicht (SPHEREx). Platzhalter, bis Datenpipeline + Kachelung stehen.
export function createSkyView(container) {
  container.innerHTML = `
    <div class="placeholder">
      <h2>Himmel · SPHEREx</h2>
      <p>Hier entsteht der Zeitvergleich des Nachthimmels: zwei SPHEREx-Durchgänge
      (z. B. Sep 2025 ↔ Mär 2026) übereinander, mit Schieberegler, Blinkvergleich
      und eingeblendeten Bahnen bekannter Asteroiden und Kometen.</p>
      <p class="muted">Datenquelle: NASA/IPAC IRSA – SPHEREx Quick Release.</p>
    </div>`;
  return {};
}
