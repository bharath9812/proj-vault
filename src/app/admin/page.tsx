'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TopHeader } from '@/components/layout/TopHeader';
import { AddEmployeeModal } from '@/components/admin/AddEmployeeModal';

export default function AdminPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Password Reset Modal State
  const [resetUser, setResetUser] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  // 1. Verify Admin Access (Strict RBAC Protection)
  useEffect(() => {
    async function checkAdminAuth() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session || !session.user) {
          router.push('/login');
          return;
        }

        const userRole = session.user.user_metadata?.role || session.user.app_metadata?.role;
        // Allow user if role is Admin or if email is an admin email
        const isAdminUser = userRole?.toLowerCase() === 'admin' || session.user.email === 'admin@velocis.eng';

        if (!isAdminUser) {
          alert('Access Denied: You must be a System Administrator to access /admin.');
          router.push('/');
          return;
        }

        setIsAdmin(true);
        fetchUsers();
      } catch (err) {
        console.error('Auth verification error:', err);
        router.push('/');
      }
    }

    checkAdminAuth();
  }, [router]);

  // 2. Fetch Live Accounts from Supabase Auth via Admin API
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch('/api/admin/employees');
      const data = await res.json();
      if (data.users) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  // 3. Reset User Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser || !newPassword) return;

    setResetting(true);
    setResetMsg(null);
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset_password',
          userId: resetUser.id,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || 'Failed to reset password');
      } else {
        setResetMsg(`Password updated successfully for ${resetUser.fullName}!`);
        setNewPassword('');
        setTimeout(() => {
          setResetUser(null);
          setResetMsg(null);
        }, 1500);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  // 4. Delete Employee Account
  const handleDeleteUser = async (user: any) => {
    if (!confirm(`Are you sure you want to permanently delete account for ${user.fullName} (${user.email})?`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          userId: user.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(data.error || 'Failed to delete user account');
      } else {
        fetchUsers();
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting account');
    }
  };

  if (isAdmin === null) {
    return (
      <div className="h-full bg-[#f7f9fc] flex items-center justify-center text-xs font-bold text-[#05162e]">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined animate-spin text-[#005FB7]">progress_activity</span>
          <span>Verifying Admin Permissions...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#f7f9fc]">
      <TopHeader />

      <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto flex flex-col gap-6">
        <div className="border-b border-[#c5c6ce] pb-4 flex justify-between items-end">
          <div>
            <span className="text-xs font-semibold text-[#005FB7] uppercase tracking-wider">
              System Administration
            </span>
            <h1 className="text-2xl font-bold text-[#05162e] mt-0.5">
              EKMS Security, Employee Provisioning & Storage Controls
            </h1>
          </div>
          {/* <button
            onClick={() => setShowModal(true)}
            className="bg-[#005FB7] text-white hover:bg-[#00468a] transition-colors rounded px-4 py-2 text-xs font-bold flex items-center gap-2 border border-[#005FB7] shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">
              person_add
            </span>
            <span>Provision New Employee</span>
          </button> */}
        </div>

        {/* Security & RLS Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-[#c5c6ce] rounded p-4 shadow-sm flex flex-col gap-2">
            <h3 className="text-sm font-bold text-[#05162e] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#005FB7] text-[18px]">
                security
              </span>
              Row-Level Security (RLS)
            </h3>
            <p className="text-xs text-[#44474d]">
              Enforced on Supabase PostgreSQL tables: <code className="font-mono">assets</code>, <code className="font-mono">projects</code>, <code className="font-mono">asset_versions</code>.
            </p>
            <span className="px-2 py-1 bg-[#d6e3ff] text-[#001b3c] text-[11px] font-mono font-bold rounded self-start mt-2">
              Status: Active & Enforced
            </span>
          </div>

          <div className="bg-white border border-[#c5c6ce] rounded p-4 shadow-sm flex flex-col gap-2">
            <h3 className="text-sm font-bold text-[#05162e] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#005FB7] text-[18px]">
                cloud_upload
              </span>
              Supabase Storage Buckets
            </h3>
            <p className="text-xs text-[#44474d]">
              Binary files stored in <code className="font-mono">assets</code>. PostgreSQL contains metadata pointers only.
            </p>
            <span className="px-2 py-1 bg-[#d4e3ff] text-[#041c36] text-[11px] font-mono font-bold rounded self-start mt-2">
              Status: Direct Client Upload Enabled
            </span>
          </div>

          <div className="bg-white border border-[#c5c6ce] rounded p-4 shadow-sm flex flex-col gap-2">
            <h3 className="text-sm font-bold text-[#05162e] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#005FB7] text-[18px]">
                badge
              </span>
              User Access Model
            </h3>
            <p className="text-xs text-[#44474d]">
              Public registration is disabled. Accounts can only be created by system administrators via employee provisioning.
            </p>
            <span className="px-2 py-1 bg-[#eceef1] text-[#44474d] text-[11px] font-mono font-bold rounded self-start mt-2">
              Status: Admin Provisioning Only
            </span>
          </div>
        </div>

        {/* Employee Account Management Section */}
        <div className="bg-white border border-[#c5c6ce] rounded p-6 shadow-sm flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-[#e0e3e6] pb-3">
            <div>
              <h2 className="text-sm font-bold text-[#05162e] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#005FB7]">
                  badge
                </span>
                Employee Account Management
              </h2>
              <p className="text-xs text-[#44474d]">
                Live Supabase accounts, reset credentials, and manage team access.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchUsers}
                className="p-1.5 rounded bg-[#eceef1] text-[#05162e] hover:bg-[#e0e3e6] transition-colors border border-[#c5c6ce]"
                title="Refresh user list"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
              </button>
              {/* <button
                onClick={() => setShowModal(true)}
                className="px-3 py-1.5 rounded bg-[#005FB7] text-white hover:bg-[#00468a] text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>New Account</span>
              </button> */}
              <button
                onClick={() => setShowModal(true)}
                className="bg-[#005FB7] text-white hover:bg-[#00468a] transition-colors rounded px-4 py-2 text-xs font-bold flex items-center gap-2 border border-[#005FB7] shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">
                  person_add
                </span>
                <span>Provision New Employee</span>
              </button>
            </div>
          </div>

          {/* Live Employees Data Table */}
          <div className="overflow-x-auto border border-[#c5c6ce] rounded">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#e6e8eb] text-[#191c1e] font-semibold border-b border-[#c5c6ce]">
                <tr>
                  <th className="py-2.5 px-4">User / Full Name</th>
                  <th className="py-2.5 px-4">Email Address</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Created Date</th>
                  <th className="py-2.5 px-4">Last Sign In</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e6e8eb] text-[#191c1e]">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#75777e]">
                      <div className="flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined animate-spin text-[#005FB7]">progress_activity</span>
                        <span>Loading live Supabase accounts...</span>
                      </div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#75777e]">
                      No active users found in Supabase Auth.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    const initials = u.fullName?.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() || 'EM';
                    const createdDate = new Date(u.createdAt).toLocaleDateString();
                    const lastSignIn = u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString() + ' ' + new Date(u.lastSignInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never';

                    return (
                      <tr key={u.id} className="hover:bg-[#f2f4f7] transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[#1b2b44] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                              {initials}
                            </div>
                            <span className="font-bold text-[#05162e]">{u.fullName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[#44474d]">{u.email}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${u.role === 'Admin' ? 'bg-[#d6e3ff] text-[#001b3c]' : 'bg-[#e6e8eb] text-[#44474d]'
                            }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#75777e]">{createdDate}</td>
                        <td className="py-3 px-4 text-[#75777e] font-mono text-[11px]">{lastSignIn}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setResetUser(u)}
                              className="px-2.5 py-1 rounded bg-[#eceef1] text-[#005FB7] hover:bg-[#d6e3ff] text-[11px] font-semibold transition-colors flex items-center gap-1 border border-[#c5c6ce]"
                              title="Reset Password"
                            >
                              <span className="material-symbols-outlined text-[14px]">lock_reset</span>
                              <span>Reset Password</span>
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1 rounded bg-[#ffdad6] text-[#ba1a1a] hover:bg-[#ba1a1a] hover:text-white transition-colors"
                              title="Delete Account"
                            >
                              <span className="material-symbols-outlined text-[15px]">delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-[#f7f9fc] border border-[#e0e3e6] rounded text-xs text-[#44474d] flex items-start gap-3">
            <span className="material-symbols-outlined text-[#005FB7] text-[20px] mt-0.5">
              mark_email_unread
            </span>
            <div>
              <p className="font-semibold text-[#05162e] mb-0.5">
                Email Verification & Password Security Policy
              </p>
              <p>
                When a new employee is provisioned with their Name, Work Email, and Initial Password, Supabase dispatches a verification link to their email address. Employees must verify their email prior to their initial login.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Reset Password Modal */}
      {resetUser && (
        <div className="fixed inset-0 z-50 bg-[#191c1e]/50 flex items-center justify-center p-4 select-none">
          <div className="bg-white border border-[#c5c6ce] rounded w-full max-w-md p-6 shadow-md flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-[#e0e3e6] pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#005FB7] text-[20px]">
                  lock_reset
                </span>
                <h2 className="text-sm font-bold text-[#05162e]">
                  Reset Employee Password
                </h2>
              </div>
              <button
                onClick={() => setResetUser(null)}
                className="text-[#75777e] hover:text-[#05162e] transition-colors p-1"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {resetMsg && (
              <div className="p-3 bg-[#d6e3ff] border border-[#005FB7] rounded text-xs text-[#001b3c]">
                {resetMsg}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#191c1e] mb-1">
                  Employee Account
                </label>
                <p className="text-xs font-bold text-[#05162e] bg-[#f2f4f7] p-2 rounded border border-[#c5c6ce]">
                  {resetUser.fullName} ({resetUser.email})
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#191c1e] mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new strong password"
                  className="w-full px-3 py-2 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#e0e3e6]">
                <button
                  type="button"
                  onClick={() => setResetUser(null)}
                  className="px-4 py-2 rounded bg-[#eceef1] text-[#44474d] text-xs font-semibold hover:bg-[#e0e3e6]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetting}
                  className="px-4 py-2 rounded bg-[#005FB7] text-white text-xs font-bold hover:bg-[#00468a] disabled:opacity-50"
                >
                  {resetting ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AddEmployeeModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => fetchUsers()}
      />
    </div>
  );
}

