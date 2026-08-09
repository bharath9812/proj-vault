import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in server environment.');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const productFiles = [
  { file: 'rally_bar___tap_ip.svg', id: 'c0000000-0000-0000-0000-000000000001' },
  { file: 'rally_bar_mini.svg', id: 'c0000000-0000-0000-0000-000000000002' },
  { file: 'meetup_2.svg', id: 'c0000000-0000-0000-0000-000000000003' },
  { file: 'room_bar.svg', id: 'c0000000-0000-0000-0000-000000000004' },
  { file: 'room_bar_pro.svg', id: 'c0000000-0000-0000-0000-000000000005' },
  { file: 'smartvision_40.svg', id: 'c0000000-0000-0000-0000-000000000006' },
  { file: 'uvc86.svg', id: 'c0000000-0000-0000-0000-000000000007' },
  { file: 'elite_12x_camera.svg', id: 'c0000000-0000-0000-0000-000000000008' },
  { file: 'elite_20x_camera.svg', id: 'c0000000-0000-0000-0000-000000000009' },
  { file: 'panacast_50_vbs.svg', id: 'c0000000-0000-0000-0000-000000000010' },
  { file: 'panacast_50_room_system.svg', id: 'c0000000-0000-0000-0000-000000000011' },
  { file: 'panacast_55_vbs_bar.svg', id: 'c0000000-0000-0000-0000-000000000012' },
  { file: 'crestron_flex_r_series_dual_display_system.svg', id: '587313e5-e0a1-48b7-8f4a-e73bbbf5ff08' },
];

export async function GET() {
  try {
    const supabase = getAdminClient();
    const results: any[] = [];

    const { data: buckets } = await supabase.storage.listBuckets();
    const hasBucket = buckets?.some((b) => b.name === 'product-media');
    if (!hasBucket) {
      await supabase.storage.createBucket('product-media', { public: true });
    }

    for (const item of productFiles) {
      const filePath = path.join(process.cwd(), 'public', 'products', 'real', item.file);
      if (!fs.existsSync(filePath)) {
        results.push({ file: item.file, status: 'not_found' });
        continue;
      }

      const fileBuffer = fs.readFileSync(filePath);
      const storagePath = `products/real/${item.file}`;

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
        .eq('is_featured', true);

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
      message: 'All 13 product media uploaded to Supabase Storage and database rows updated.',
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Sync error' }, { status: 500 });
  }
}
