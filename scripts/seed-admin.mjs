import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env file
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      env[key.trim()] = valueParts.join('=').trim();
    }
  });
  return env;
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey || serviceRoleKey.includes('your-supabase')) {
  console.error('❌ Error: Missing SUPABASE_SERVICE_ROLE_KEY in .env file.');
  console.error('Please ensure SUPABASE_SERVICE_ROLE_KEY is set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const adminEmail = process.argv[2] || 'admin@nexus.eng';
const adminPassword = process.argv[3] || 'Admin@123456';
const adminName = process.argv[4] || 'System Administrator';

async function seedAdmin() {
  console.log(`🚀 Provisioning Root Admin Account: ${adminEmail}...`);

  const { data, error } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true, // Auto-confirm email for initial admin
    user_metadata: {
      full_name: adminName,
      role: 'Admin',
    },
  });

  if (error) {
    if (error.message.includes('already exists') || error.status === 422) {
      console.log(`⚠️ User ${adminEmail} already exists in auth.users.`);
    } else {
      console.error('❌ Failed to create admin user:', error.message);
      process.exit(1);
    }
  } else {
    console.log('✅ Root Administrator account successfully created & confirmed!');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Role: Admin`);
  }
}

seedAdmin();
