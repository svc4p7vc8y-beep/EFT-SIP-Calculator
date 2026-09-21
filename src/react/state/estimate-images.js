export const MAX_ESTIMATE_IMAGES = 8;
export const MAX_ESTIMATE_IMAGE_DATA = 2_800_000;
const safeImage = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export function normalizeEstimateImages(value) {
  if (!Array.isArray(value)) return [];
  let total = 0;
  const ids = new Set();
  return value.slice(0, MAX_ESTIMATE_IMAGES).flatMap((image) => {
    if (!image || typeof image !== 'object' || typeof image.data !== 'string' || !safeImage.test(image.data)) return [];
    total += image.data.length;
    if (total > MAX_ESTIMATE_IMAGE_DATA) return [];
    const id = typeof image.id === 'string' && image.id.length <= 80 && !ids.has(image.id) ? image.id : crypto.randomUUID();
    ids.add(id);
    return [{
      id,
      data: image.data,
      caption: String(image.caption || '').slice(0, 160),
    }];
  });
}

export async function prepareEstimateImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
    throw new Error('Выберите JPG, PNG или WEBP размером до 12 МБ.');
  }
  let objectUrl;
  const image = typeof createImageBitmap === 'function' ? await createImageBitmap(file) : await new Promise((resolve, reject) => {
    objectUrl = URL.createObjectURL(file);
    const fallback = new Image();
    fallback.onload = () => resolve(fallback);
    fallback.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Не удалось открыть изображение.')); };
    fallback.src = objectUrl;
  });
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось обработать изображение.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { id: crypto.randomUUID(), data: canvas.toDataURL('image/jpeg', .78), caption: file.name.replace(/\.[^.]+$/, '').slice(0, 160) };
  } finally {
    image.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
