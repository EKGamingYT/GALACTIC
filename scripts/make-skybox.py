# Erzeugt die sechs Würfelseiten für den Cesium-Sternenhimmel (Planetenkarten) aus der
# äquatorialen NASA-SVS-Sternenkarte (public/textures/starmap_4k.jpg).
# Die Ausrichtung jeder Seite wird empirisch bestimmt: für jede der 8 möglichen Spiegelungen/
# Drehungen wird die Korrelation mit Cesiums eingebautem Tycho-Sternkatalog-Würfel gemessen
# (gleiches ICRF-Bezugssystem) und die beste Variante genommen.
# Aufruf: python scripts/make-skybox.py
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'public', 'textures', 'starmap_4k.jpg')
REF = os.path.join(ROOT, 'node_modules', 'cesium', 'Build', 'Cesium', 'Assets', 'Textures', 'SkyBox', 'tycho2t3_80_{}.jpg')
OUT = os.path.join(ROOT, 'public', 'textures', 'skybox')
SIZE = 1024

sky = np.asarray(Image.open(SRC).convert('RGB'), dtype=np.float32)
H, W, _ = sky.shape

# Achse jeder Seite (ICRF: +x Frühlingspunkt, +z Himmelsnordpol) und zwei Querachsen
FACES = {
    'px': ([1, 0, 0], [0, 1, 0], [0, 0, 1]),
    'mx': ([-1, 0, 0], [0, 1, 0], [0, 0, 1]),
    'py': ([0, 1, 0], [1, 0, 0], [0, 0, 1]),
    'my': ([0, -1, 0], [1, 0, 0], [0, 0, 1]),
    'pz': ([0, 0, 1], [1, 0, 0], [0, 1, 0]),
    'mz': ([0, 0, -1], [1, 0, 0], [0, 1, 0]),
}


def render_face(axis, u_ax, v_ax, n):
    s = (np.arange(n) + 0.5) / n * 2 - 1
    a, b = np.meshgrid(s, s)  # a: Spalte, b: Zeile
    d = np.array(axis)[None, None, :] + a[..., None] * np.array(u_ax) + b[..., None] * np.array(v_ax)
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    ra = np.arctan2(d[..., 1], d[..., 0])
    dec = np.arcsin(np.clip(d[..., 2], -1, 1))
    # Karte: RA 0h in Bildmitte, nach links zunehmend; Norden oben
    u = (0.5 - ra / (2 * np.pi)) % 1.0
    v = 0.5 - dec / np.pi
    x = np.clip((u * W).astype(int), 0, W - 1)
    y = np.clip((v * H).astype(int), 0, H - 1)
    return sky[y, x]


def variants(img):
    for k in range(4):
        r = np.rot90(img, k)
        yield (k, False), r
        yield (k, True), r[:, ::-1]


def brightness(img):
    g = img.mean(axis=-1) if img.ndim == 3 else img
    return np.log1p(g)


os.makedirs(OUT, exist_ok=True)
for name, (axis, u_ax, v_ax) in FACES.items():
    ref = np.asarray(Image.open(REF.format(name)).convert('L').resize((128, 128)), dtype=np.float32)
    small = render_face(axis, u_ax, v_ax, 128)
    rb = brightness(ref).ravel()
    rb = (rb - rb.mean()) / (rb.std() + 1e-6)
    best = None
    for key, var in variants(small):
        vb = brightness(var).ravel()
        vb = (vb - vb.mean()) / (vb.std() + 1e-6)
        c = float((rb * vb).mean())
        if best is None or c > best[0]:
            best = (c, key)
    (k, flip) = best[1]
    full = render_face(axis, u_ax, v_ax, SIZE)
    full = np.rot90(full, k)
    if flip:
        full = full[:, ::-1]
    Image.fromarray(np.clip(full, 0, 255).astype(np.uint8)).save(os.path.join(OUT, f'{name}.jpg'), quality=88)
    print(f'{name}: Korrelation {best[0]:.3f}, Drehung {k * 90}°, gespiegelt {flip}')
