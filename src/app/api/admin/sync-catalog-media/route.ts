import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const productFiles = [
  { file: 'logitech-rally-bar.svg', id: 'c0000000-0000-0000-0000-000000000001' },
  { file: 'logitech-rally-bar-mini.svg', id: 'c0000000-0000-0000-0000-000000000002' },
  { file: 'logitech-meetup-2.svg', id: 'c0000000-0000-0000-0000-000000000003' },
  { file: 'cisco-room-bar.svg', id: 'c0000000-0000-0000-0000-000000000004' },
  { file: 'cisco-room-bar-pro.svg', id: 'c0000000-0000-0000-0000-000000000005' },
  { file: 'yealink-smartvision-40.svg', id: 'c0000000-0000-0000-0000-000000000006' },
  { file: 'yealink-uvc86.svg', id: 'c0000000-0000-0000-0000-000000000007' },
  { file: 'peoplelink-elite-12x.svg', id: 'c0000000-0000-0000-0000-000000000008' },
  { file: 'peoplelink-elite-20x.svg', id: 'c0000000-0000-0000-0000-000000000009' },
  { file: 'jabra-panacast-50-vbs.svg', id: 'c0000000-0000-0000-0000-000000000010' },
  { file: 'jabra-panacast-50-room-system.svg', id: 'c0000000-0000-0000-0000-000000000011' },
  { file: 'jabra-panacast-55.svg', id: 'c0000000-0000-0000-0000-000000000012' },
];

export async function GET() {
  try {
    const supabase = getAdminClient();
    const results: any[] = [];

    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const hasBucket = buckets?.some((b) => b.name === 'product-media');
    if (!hasBucket) {
      await supabase.storage.createBucket('product-media', { public: true });
    }

    for (const item of productFiles) {
      const filePath = path.join(process.cwd(), 'public', 'products', item.file);
      if (!fs.existsSync(filePath)) {
        results.push({ file: item.file, status: 'not_found' });
        continue;
      }

      const fileBuffer = fs.readFileSync(filePath);
      const storagePath = `products/${item.file}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('product-media')
        .upload(storagePath, fileBuffer, {
          contentType: 'image/svg+xml',
          upsert: true,
        });

      if (uploadError) {
        results.push({ file: item.file, error: uploadError.message });
        continue;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('product-media').getPublicUrl(storagePath);

      // Update products table
      const { error: pError } = await supabase
        .from('products')
        .update({ hero_image_url: publicUrl })
        .eq('id', item.id);

      // Update product_media table
      const { error: pmError } = await supabase
        .from('product_media')
        .update({ url: publicUrl })
        .eq('product_id', item.id)
        .eq('sort_order', 1);

      results.push({
        file: item.file,
        status: 'uploaded',
        publicUrl,
        productUpdated: !pError,
        mediaUpdated: !pmError,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'All product media uploaded to Supabase Storage and database rows updated.',
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Sync error' }, { status: 500 });
  }
}
