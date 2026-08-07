import { createClient } from '@/lib/supabase/client';

export interface UploadProgressCallback {
  (progressPercent: number): void;
}

/**
 * Uploads a file directly to Supabase Storage with bucket fallback
 */
export async function uploadProductFile(
  file: File | Blob,
  folder: string,
  fileName: string,
  onProgress?: UploadProgressCallback
): Promise<{ publicUrl: string; storagePath: string; size: number; mimeType: string }> {
  const supabase = createClient();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const timestamp = Date.now();
  const storagePath = `${folder}/${timestamp}-${sanitizedName}`;
  const mimeType = file.type || 'application/octet-stream';
  const size = file.size;

  // Try product-media bucket first, fallback to assets bucket
  let targetBucket = 'product-media';
  let { error: uploadError } = await supabase.storage
    .from(targetBucket)
    .upload(storagePath, file, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.warn(`Upload to ${targetBucket} failed, falling back to assets bucket:`, uploadError);
    targetBucket = 'assets';
    const fallback = await supabase.storage
      .from(targetBucket)
      .upload(`products/${storagePath}`, file, {
        contentType: mimeType,
        upsert: true,
      });

    if (fallback.error) {
      throw new Error(`Upload failed: ${fallback.error.message || uploadError.message}`);
    }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(targetBucket).getPublicUrl(targetBucket === 'assets' ? `products/${storagePath}` : storagePath);

  if (onProgress) onProgress(100);

  return {
    publicUrl,
    storagePath,
    size,
    mimeType,
  };
}
