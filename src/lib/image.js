/**
 * Resize/compress a base64 image data URL so it fits within storage limits.
 * Returns a JPEG data URL. Falls back to the original on failure.
 */
export function compressImage(dataUrl, { maxWidth = 800, maxHeight = 800, quality = 0.75, type = 'image/jpeg' } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const scale = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas context unavailable'));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL(type, quality));
    };
    img.onerror = () => reject(new Error('failed to load image for compression'));
    img.src = dataUrl;
  });
}

export async function compressImageSafe(dataUrl, options) {
  try {
    return await compressImage(dataUrl, options);
  } catch {
    return dataUrl;
  }
}
