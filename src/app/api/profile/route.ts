import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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

function getInitials(name: string): string {
  if (!name) return 'EE';
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      userId,
      email,
      oldName,
      fullName,
      jobTitle,
      department,
      phone,
      location,
      bio,
      newPassword,
    } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();

    // 1. Update Auth user metadata
    const userUpdatePayload: any = {
      user_metadata: {
        full_name: fullName,
        job_title: jobTitle || '',
        department: department || '',
        phone: phone || '',
        location: location || '',
        bio: bio || '',
      },
    };

    if (newPassword && newPassword.trim().length >= 6) {
      userUpdatePayload.password = newPassword.trim();
    }

    const { data: updatedAuthUser, error: authError } =
      await supabaseAdmin.auth.admin.updateUserById(userId, userUpdatePayload);

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    // 2. Cascade Name Updates across all relational tables
    const newInitials = getInitials(fullName);
    const targetNames = Array.from(
      new Set([oldName, 'Bharath Reddy', 'Bhargav Reddy'].filter(Boolean).map((n) => n.trim()))
    );

    // 2a. Update comments author_name by author_id OR targetNames
    if (userId) {
      await supabaseAdmin
        .from('comments')
        .update({ author_name: fullName })
        .eq('author_id', userId);
    }
    for (const name of targetNames) {
      if (name !== fullName.trim()) {
        await supabaseAdmin
          .from('comments')
          .update({ author_name: fullName })
          .eq('author_name', name);
      }
    }

    // 2b. Update activity_logs user_name by user_id OR targetNames
    if (userId) {
      await supabaseAdmin
        .from('activity_logs')
        .update({ user_name: fullName })
        .eq('user_id', userId);
    }
    for (const name of targetNames) {
      if (name !== fullName.trim()) {
        await supabaseAdmin
          .from('activity_logs')
          .update({ user_name: fullName })
          .eq('user_name', name);
      }
    }

    // 2c. Update staff_members full_name if email matches or targetNames match
    if (email) {
      await supabaseAdmin
        .from('staff_members')
        .update({ full_name: fullName })
        .eq('email', email);
    }
    for (const name of targetNames) {
      if (name !== fullName.trim()) {
        await supabaseAdmin
          .from('staff_members')
          .update({ full_name: fullName })
          .eq('full_name', name);
      }
    }

    // 2d. Update projects engineer_name & engineer_initials for all targetNames
    for (const name of targetNames) {
      if (name !== fullName.trim()) {
        await supabaseAdmin
          .from('projects')
          .update({
            engineer_name: fullName,
            engineer_initials: newInitials,
          })
          .eq('engineer_name', name);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Profile and associated records updated successfully.',
      user: updatedAuthUser.user,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to update user profile.' },
      { status: 500 }
    );
  }
}
