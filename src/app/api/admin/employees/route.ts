import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET() {
  try {
    const supabaseAdmin = getAdminClient();
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const employees = users.map((u: any) => ({
      id: u.id,
      email: u.email,
      fullName: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Employee',
      role: u.user_metadata?.role || 'Employee',
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      emailConfirmedAt: u.email_confirmed_at,
    }));

    return NextResponse.json({ users: employees });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { action, userId, newPassword, fullName, email } = await req.json();
    const supabaseAdmin = getAdminClient();

    if (action === 'create') {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: newPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: 'Employee' },
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, user: data.user });
    }

    if (action === 'reset_password') {
      if (!userId || !newPassword) {
        return NextResponse.json({ error: 'User ID and new password are required' }, { status: 400 });
      }
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, message: 'Password updated successfully' });
    }

    if (action === 'delete') {
      if (!userId) {
        return NextResponse.json({ error: 'User ID required' }, { status: 400 });
      }
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true, message: 'User deleted successfully' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
