// Una imagen subida (/ci/…) a la medida en que se enseña: el servidor la
// manda reducida (y en WebP) en vez de la original. Las demás, tal cual.
export const aMedida = (url, ancho) => (url && /^(https?:\/\/[^/]+)?\/ci\/[\w-]+$/.test(url) ? `${url}?w=${ancho}` : url);

// Una foto para una lección o una entrega: las HEIC (iPad, iPhone) y las que
// pasan de 2 MB se pasan a JPG de 2000 px como mucho; lo demás, tal cual (#455).
export async function imagenSubible(file) {
  const esFoto = /^image\//.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
  if (!esFoto || (/^image\/(png|jpe?g|webp|gif)$/.test(file.type) && file.size <= 2 * 1048576)) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const k = Math.min(1, 2000 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const c = document.createElement('canvas'); c.width = Math.round((img.naturalWidth || img.width) * k); c.height = Math.round((img.naturalHeight || img.height) * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    return b ? new File([b], `${String(file.name || 'foto').replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' }) : file;
  } catch { return file; } finally { URL.revokeObjectURL(url); }
}
