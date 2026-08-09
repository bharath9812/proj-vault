/**
 * Image Normalization Engine for EKMS Catalog Showcase
 * 
 * Premium Enterprise Product Image Post-Processing Pipeline
 * ─────────────────────────────────────────────────────────
 * Normalizes any uploaded image (portrait, screenshot, square, ultra-wide)
 * into a standardized 16:9 1280×720 high-fidelity asset with:
 *   • Clean white/near-white studio background
 *   • Subtle natural product shadow
 *   • Generous whitespace for premium presentation
 *   • Format-aware processing (transparent PNG/WebP vs opaque JPG)
 * 
 * Design Principle: Professional enterprise AV/hardware product catalog,
 * inspired by Logitech, Cisco, Jabra, and Crestron official product galleries.
 */

/**
 * Detects whether an image contains meaningful transparency (alpha channel).
 * Samples pixel data to distinguish true transparent product renders from
 * opaque images that happen to be PNG/WebP format.
 */
function detectTransparency(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sampleCanvas: HTMLCanvasElement
): boolean {
  const sampleCtx = sampleCanvas.getContext('2d');
  if (!sampleCtx) return false;

  // Use a smaller canvas for faster pixel analysis
  const sampleW = Math.min(img.naturalWidth, 256);
  const sampleH = Math.min(img.naturalHeight, 256);
  sampleCanvas.width = sampleW;
  sampleCanvas.height = sampleH;

  sampleCtx.clearRect(0, 0, sampleW, sampleH);
  sampleCtx.drawImage(img, 0, 0, sampleW, sampleH);

  const imageData = sampleCtx.getImageData(0, 0, sampleW, sampleH);
  const data = imageData.data;
  let transparentPixels = 0;
  const totalPixels = data.length / 4;

  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 240) {
      transparentPixels++;
    }
  }

  // If more than 2% of pixels have meaningful transparency, treat as transparent
  return transparentPixels / totalPixels > 0.02;
}

/**
 * Detects whether the image already has a predominantly white/light background.
 * Samples edge pixels to determine the background color without analyzing the
 * product area in the center.
 */
function hasWhiteBackground(
  img: HTMLImageElement,
  sampleCanvas: HTMLCanvasElement
): boolean {
  const sampleCtx = sampleCanvas.getContext('2d');
  if (!sampleCtx) return false;

  const sampleW = Math.min(img.naturalWidth, 256);
  const sampleH = Math.min(img.naturalHeight, 256);
  sampleCanvas.width = sampleW;
  sampleCanvas.height = sampleH;

  sampleCtx.clearRect(0, 0, sampleW, sampleH);
  sampleCtx.drawImage(img, 0, 0, sampleW, sampleH);

  // Sample pixels along edges (top row, bottom row, left col, right col)
  const imageData = sampleCtx.getImageData(0, 0, sampleW, sampleH);
  const data = imageData.data;
  let lightPixels = 0;
  let edgePixelCount = 0;

  const edgeDepth = Math.max(2, Math.floor(sampleW * 0.05));

  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      // Only sample edge pixels
      const isEdge =
        y < edgeDepth ||
        y >= sampleH - edgeDepth ||
        x < edgeDepth ||
        x >= sampleW - edgeDepth;

      if (!isEdge) continue;

      const idx = (y * sampleW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      edgePixelCount++;

      // Check if pixel is light/white (all channels > 220, fully opaque)
      if (a > 240 && r > 220 && g > 220 && b > 220) {
        lightPixels++;
      }
    }
  }

  // If >60% of edge pixels are white/light, the image already has a white bg
  return edgePixelCount > 0 && lightPixels / edgePixelCount > 0.6;
}

/**
 * Draws a subtle, realistic product shadow on the canvas.
 * Creates an elliptical contact shadow beneath the product area
 * for a professional studio photography look.
 */
function drawProductShadow(
  ctx: CanvasRenderingContext2D,
  productBottomY: number,
  centerX: number,
  productWidth: number,
  canvasWidth: number,
  canvasHeight: number
): void {
  // Contact shadow ellipse
  const shadowY = Math.min(productBottomY + 6, canvasHeight - 20);
  const shadowWidth = productWidth * 0.7;
  const shadowHeight = 8;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(centerX, shadowY, shadowWidth / 2, shadowHeight, 0, 0, Math.PI * 2);
  ctx.closePath();

  const shadowGrad = ctx.createRadialGradient(
    centerX, shadowY, 0,
    centerX, shadowY, shadowWidth / 2
  );
  shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.10)');
  shadowGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.05)');
  shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shadowGrad;
  ctx.fill();
  ctx.restore();

  // Softer outer ambient shadow
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(centerX, shadowY + 2, shadowWidth * 0.9 / 2, shadowHeight * 2.5, 0, 0, Math.PI * 2);
  ctx.closePath();

  const ambientGrad = ctx.createRadialGradient(
    centerX, shadowY + 2, 0,
    centerX, shadowY + 2, shadowWidth * 0.9 / 2
  );
  ambientGrad.addColorStop(0, 'rgba(0, 0, 0, 0.04)');
  ambientGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.01)');
  ambientGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = ambientGrad;
  ctx.fill();
  ctx.restore();
}

/**
 * Main image post-processing pipeline.
 * 
 * Processes any uploaded product image into a premium enterprise-grade
 * catalog asset with consistent visual treatment across all formats.
 * 
 * Processing modes:
 * 1. Transparent PNG/WebP → Place on clean white studio bg + subtle shadow
 * 2. Opaque image with white bg → Preserve as-is, fit to 16:9 on white
 * 3. Opaque image with colored bg → Fit to 16:9 on white with soft edge fade
 * 
 * @param file - The uploaded image file (PNG, JPG, WebP, etc.)
 * @param targetWidth - Output canvas width (default 1280)
 * @param targetHeight - Output canvas height (default 720)
 * @returns Normalized File object ready for upload to Supabase Storage
 */
export async function normalizeImageToHeroRatio(
  file: File,
  targetWidth = 1280,
  targetHeight = 720
): Promise<File> {
  // SVG and non-image files pass through unchanged
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

      // ─── Step 1: Draw Premium White Studio Background ───
      // Clean white base
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // Very subtle warm-neutral vignette gradient for studio depth
      const vignetteGrad = ctx.createRadialGradient(
        targetWidth / 2,
        targetHeight / 2,
        targetWidth * 0.25,
        targetWidth / 2,
        targetHeight / 2,
        targetWidth * 0.75
      );
      vignetteGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      vignetteGrad.addColorStop(0.7, 'rgba(248, 249, 252, 1)');
      vignetteGrad.addColorStop(1, 'rgba(242, 244, 247, 1)');
      ctx.fillStyle = vignetteGrad;
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // ─── Step 2: Calculate Product Placement ───
      const naturalWidth = img.naturalWidth || img.width;
      const naturalHeight = img.naturalHeight || img.height;

      // Generous padding for premium whitespace (8% on each side)
      const paddingX = targetWidth * 0.08;
      const paddingY = targetHeight * 0.08;
      const availWidth = targetWidth - paddingX * 2;
      const availHeight = targetHeight - paddingY * 2;

      const scale = Math.min(availWidth / naturalWidth, availHeight / naturalHeight);
      const drawWidth = naturalWidth * scale;
      const drawHeight = naturalHeight * scale;
      const drawX = (targetWidth - drawWidth) / 2;
      const drawY = (targetHeight - drawHeight) / 2;

      // ─── Step 3: Detect Image Characteristics ───
      const sampleCanvas = document.createElement('canvas');
      const supportsTransparency =
        file.type === 'image/png' || file.type === 'image/webp';
      const isTransparent = supportsTransparency
        ? detectTransparency(ctx, img, sampleCanvas)
        : false;
      const alreadyWhiteBg = !isTransparent
        ? hasWhiteBackground(img, sampleCanvas)
        : false;

      // ─── Step 4: Draw Product with Format-Aware Treatment ───
      if (isTransparent) {
        // === TRANSPARENT PRODUCT RENDER ===
        // Draw shadow first (underneath the product)
        drawProductShadow(
          ctx,
          drawY + drawHeight,
          targetWidth / 2,
          drawWidth,
          targetWidth,
          targetHeight
        );

        // Draw the product directly on clean white background
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      } else if (alreadyWhiteBg) {
        // === IMAGE ALREADY HAS WHITE BACKGROUND ===
        // Draw directly — the white bg blends seamlessly
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      } else {
        // === OPAQUE IMAGE WITH COLORED BACKGROUND ===
        // Draw the image with a very subtle rounded clip for cleanliness
        ctx.save();

        const radius = 8;
        const clipX = drawX - 2;
        const clipY = drawY - 2;
        const clipW = drawWidth + 4;
        const clipH = drawHeight + 4;

        ctx.beginPath();
        ctx.moveTo(clipX + radius, clipY);
        ctx.lineTo(clipX + clipW - radius, clipY);
        ctx.quadraticCurveTo(clipX + clipW, clipY, clipX + clipW, clipY + radius);
        ctx.lineTo(clipX + clipW, clipY + clipH - radius);
        ctx.quadraticCurveTo(clipX + clipW, clipY + clipH, clipX + clipW - radius, clipY + clipH);
        ctx.lineTo(clipX + radius, clipY + clipH);
        ctx.quadraticCurveTo(clipX, clipY + clipH, clipX, clipY + clipH - radius);
        ctx.lineTo(clipX, clipY + radius);
        ctx.quadraticCurveTo(clipX, clipY, clipX + radius, clipY);
        ctx.closePath();
        ctx.clip();

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
        ctx.restore();

        // Draw subtle shadow below the image frame
        drawProductShadow(
          ctx,
          drawY + drawHeight + 4,
          targetWidth / 2,
          drawWidth,
          targetWidth,
          targetHeight
        );
      }

      // ─── Step 5: Export as high-quality PNG ───
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
