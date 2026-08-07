/**
 * Image Normalization Engine for EKMS Catalog Showcase
 * Normalizes any uploaded image (portrait, screenshot, square, ultra-wide)
 * into a standardized 16:9 1280x720 high-fidelity asset with letterbox fitting.
 */

export async function normalizeImageToHeroRatio(
  file: File,
  targetWidth = 1280,
  targetHeight = 720,
  bgColor = '#0b1329'
): Promise<File> {
  // If SVG or non-image, return original
  if (file.type === 'image/svg+xml' || !file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(file);
        return;
      }

      // Draw background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // Subtle hardware grid / gradient backdrop
      const grad = ctx.createLinearGradient(0, 0, targetWidth, targetHeight);
      grad.addColorStop(0, '#0b1329');
      grad.addColorStop(0.5, '#111c38');
      grad.addColorStop(1, '#0b1329');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // Calculate contain dimensions
      const naturalWidth = img.naturalWidth || img.width;
      const naturalHeight = img.naturalHeight || img.height;

      // Add a slight padding so the image doesn't touch the absolute edge
      const padding = 16;
      const availWidth = targetWidth - padding * 2;
      const availHeight = targetHeight - padding * 2;

      const scale = Math.min(availWidth / naturalWidth, availHeight / naturalHeight);
      const drawWidth = naturalWidth * scale;
      const drawHeight = naturalHeight * scale;
      const drawX = (targetWidth - drawWidth) / 2;
      const drawY = (targetHeight - drawHeight) / 2;

      // Draw shadow behind the device/content
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 8;

      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

      // Export canvas to Blob and File
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const normalizedFile = new File(
            [blob],
            `${file.name.replace(/\.[^/.]+$/, '')}-16x9.png`,
            { type: 'image/png' }
          );
          resolve(normalizedFile);
        },
        'image/png',
        0.95
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
