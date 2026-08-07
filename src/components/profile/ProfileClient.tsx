'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { TopHeader } from '@/components/layout/TopHeader';

const ENGINEERING_DEPARTMENTS = [
  'AV & Unified Communications',
  'ELV & Physical Security',
  'Enterprise Networking & SD-WAN',
  'Data Center Infrastructure & Power',
  'Cloud Systems & DevOps',
  'Industrial & Building Automation',
  'Healthcare & Clinical Engineering',
  'Civil & Infrastructure Systems',
  'General Systems Engineering',
];

export function ProfileClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Original auth state
  const [userId, setUserId] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState('Enterprise Employee');
  const [createdAt, setCreatedAt] = useState('');
  const [lastSignInAt, setLastSignInAt] = useState('');

  // Editable Profile Form State
  const [oldName, setOldName] = useState('');
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('AV & Unified Communications');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');

  // Password Update Form State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordSection, setShowPasswordSection] = useState(false);

  useEffect(() => {
    async function loadUserProfile() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session || !session.user) {
          router.push('/login');
          return;
        }

        const u = session.user;
        setUserId(u.id);
        setUserEmail(u.email || '');
        setCreatedAt(u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A');
        setLastSignInAt(
          u.last_sign_in_at
            ? `${new Date(u.last_sign_in_at).toLocaleDateString()} ${new Date(
                u.last_sign_in_at
              ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : 'Current Session'
        );

        const meta = u.user_metadata || {};
        const role = meta.role || u.app_metadata?.role || (u.email === 'admin@velocis.eng' ? 'System Admin' : 'Employee');
        setUserRole(role);

        const currentName = meta.full_name || u.email?.split('@')[0] || 'Enterprise User';
        setOldName(currentName);
        setFullName(currentName);
        setJobTitle(meta.job_title || 'Systems Engineer');
        setDepartment(meta.department || 'AV & Unified Communications');
        setPhone(meta.phone || '');
        setLocation(meta.location || 'Silicon Valley HQ');
        setBio(meta.bio || '');
      } catch (err) {
        console.error('Failed to load user profile:', err);
      } finally {
        setLoading(false);
      }
    }

    loadUserProfile();
  }, [router]);

  const initials = fullName
    ? fullName
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'EU';

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!fullName.trim()) {
      setErrorMsg('Full Name cannot be empty.');
      return;
    }

    if (showPasswordSection && newPassword) {
      if (newPassword.length < 6) {
        setErrorMsg('New password must be at least 6 characters long.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMsg('New password and confirmation do not match.');
        return;
      }
    }

    setSaving(true);
    try {
      const supabase = createClient();

      // 1. Update active user metadata directly via client SDK to persist in localStorage JWT immediately
      const clientUpdatePayload: any = {
        data: {
          full_name: fullName.trim(),
          job_title: jobTitle.trim(),
          department,
          phone: phone.trim(),
          location: location.trim(),
          bio: bio.trim(),
        },
      };

      if (showPasswordSection && newPassword) {
        clientUpdatePayload.password = newPassword.trim();
      }

      const { error: clientAuthError } = await supabase.auth.updateUser(clientUpdatePayload);
      if (clientAuthError) {
        console.warn('Client auth update warning:', clientAuthError.message);
      }

      // 2. Call admin API to update PostgreSQL tables (comments, activity_logs, staff_members, projects)
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          email: userEmail,
          oldName,
          fullName: fullName.trim(),
          jobTitle: jobTitle.trim(),
          department,
          phone: phone.trim(),
          location: location.trim(),
          bio: bio.trim(),
          newPassword: showPasswordSection && newPassword ? newPassword : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to update profile in database.');
      }

      // Refresh session
      await supabase.auth.refreshSession();

      // Trigger global event so TopHeader, Sidebar & active tabs update initials and name immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('user_profile_updated', {
          detail: { fullName: fullName.trim(), initials },
        }));
      }

      setOldName(fullName.trim());
      setSuccessMsg('Profile updated successfully! Changes have propagated across your session, projects, and records.');
      if (showPasswordSection) {
        setNewPassword('');
        setConfirmPassword('');
        setShowPasswordSection(false);
      }
    } catch (err: any) {
      console.error('Profile update error:', err);
      setErrorMsg(err.message || 'An unexpected error occurred while saving profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetForm = () => {
    setFullName(oldName);
    setErrorMsg(null);
    setSuccessMsg(null);
    setNewPassword('');
    setConfirmPassword('');
    setShowPasswordSection(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[#f7f9fc]">
        <TopHeader breadcrumb={{ category: 'Settings', title: 'User Profile' }} />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-xs font-bold text-[#05162e]">
            <span className="material-symbols-outlined animate-spin text-[#005FB7]">progress_activity</span>
            <span>Loading user profile...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#f7f9fc]">
      <TopHeader breadcrumb={{ category: 'Settings', title: 'User Profile' }} />

      <main className="flex-1 p-6 max-w-[1280px] w-full mx-auto flex flex-col gap-6">
        {/* Page Title & Breadcrumb Header */}
        <div className="border-b border-[#c5c6ce] pb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
          <div>
            <span className="text-xs font-semibold text-[#005FB7] uppercase tracking-wider font-mono">
              Identity & Access Management
            </span>
            <h1 className="text-2xl font-bold text-[#05162e] mt-0.5">
              Personal Profile & Engineering Credentials
            </h1>
            <p className="text-xs text-[#44474d] mt-1">
              Manage your corporate identity, discipline designations, and security credentials. Changes reflect automatically across project revisions, comments, and logs.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetForm}
              disabled={saving}
              className="px-3 py-1.5 rounded bg-[#eceef1] text-[#44474d] hover:bg-[#e0e3e6] text-xs font-semibold transition-colors border border-[#c5c6ce] flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">restart_alt</span>
              <span>Reset</span>
            </button>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="px-4 py-1.5 rounded bg-[#005FB7] text-white hover:bg-[#05162e] text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm border border-[#005FB7] disabled:opacity-50"
            >
              {saving ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Alert Notifications */}
        {successMsg && (
          <div className="p-4 bg-[#e2f0d9] border border-[#b5d5a7] rounded text-xs text-[#1e4620] flex items-start gap-3 shadow-xs">
            <span className="material-symbols-outlined text-[#2e7d32] text-[20px] shrink-0">
              check_circle
            </span>
            <div className="flex-1">
              <p className="font-bold">Update Successful</p>
              <p className="mt-0.5">{successMsg}</p>
            </div>
            <button
              onClick={() => setSuccessMsg(null)}
              className="text-[#1e4620] hover:text-[#05162e]"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 bg-[#ffdad6] border border-[#ffb4ab] rounded text-xs text-[#93000a] flex items-start gap-3 shadow-xs">
            <span className="material-symbols-outlined text-[#ba1a1a] text-[20px] shrink-0">
              error
            </span>
            <div className="flex-1">
              <p className="font-bold">Update Failed</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-[#93000a] hover:text-[#ba1a1a]"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}

        {/* Profile Card Header with Live Avatar Preview */}
        <div className="bg-white border border-[#c5c6ce] rounded p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {/* Live Corporate Initials Avatar */}
            <div className="relative group">
              <div className="w-18 h-18 rounded-full bg-[#1b2b44] text-white flex items-center justify-center text-2xl font-bold font-mono border-2 border-[#005FB7] shadow-sm">
                {initials}
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#005FB7] text-white flex items-center justify-center text-[13px] border-2 border-white shadow-xs">
                <span className="material-symbols-outlined text-[14px]">verified</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-[#05162e]">
                  {fullName || 'Enterprise Employee'}
                </h2>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider font-mono border ${
                    userRole.toLowerCase().includes('admin')
                      ? 'bg-[#d6e3ff] text-[#001b3c] border-[#b7c7e7]'
                      : 'bg-[#e2f0d9] text-[#1e4620] border-[#b5d5a7]'
                  }`}
                >
                  {userRole}
                </span>
              </div>
              <p className="text-xs text-[#44474d] font-mono flex items-center gap-2">
                <span>{userEmail}</span>
                <span className="text-[#c5c6ce]">•</span>
                <span className="text-[#005FB7] font-semibold">{jobTitle}</span>
              </p>
              <p className="text-[11px] text-[#75777e] flex items-center gap-3 mt-0.5">
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">apartment</span>
                  <span>{department}</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">location_on</span>
                  <span>{location}</span>
                </span>
              </p>
            </div>
          </div>

          <div className="bg-[#f7f9fc] border border-[#e0e3e6] rounded p-3 text-xs flex flex-col gap-1 w-full md:w-auto min-w-[220px]">
            <div className="flex justify-between text-[#75777e]">
              <span>User ID:</span>
              <span className="font-mono font-semibold text-[#05162e]">{userId.slice(0, 8)}...</span>
            </div>
            <div className="flex justify-between text-[#75777e]">
              <span>Provisioned:</span>
              <span className="font-semibold text-[#05162e]">{createdAt}</span>
            </div>
            <div className="flex justify-between text-[#75777e]">
              <span>Last Active:</span>
              <span className="font-mono text-[#05162e] text-[11px]">{lastSignInAt}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Columns: Editable Personal & Professional Info */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              {/* Section 1: Identity & Role */}
              <div className="bg-white border border-[#c5c6ce] rounded overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 bg-[#f2f4f7] border-b border-[#e6e8eb] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#005FB7] text-[18px]">
                      person
                    </span>
                    <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider">
                      Identity & Engineering Discipline
                    </h3>
                  </div>
                  <span className="text-[11px] text-[#75777e]">Core Information</span>
                </div>

                <div className="p-5 flex flex-col gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#191c1e] mb-1.5">
                        Full Name <span className="text-[#ba1a1a]">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. John Doe"
                          className="w-full pl-8 pr-3 py-2 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] font-semibold"
                        />
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#75777e] text-[16px]">
                          badge
                        </span>
                      </div>
                      <p className="text-[11px] text-[#75777e] mt-1">
                        Updates your avatar initials ({initials}) and author signature across the system.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#191c1e] mb-1.5">
                        Work Email Address
                      </label>
                      <div className="relative">
                        <input
                          type="email"
                          disabled
                          value={userEmail}
                          className="w-full pl-8 pr-3 py-2 rounded bg-[#f2f4f7] border border-[#c5c6ce] text-xs text-[#44474d] cursor-not-allowed font-mono"
                        />
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#75777e] text-[16px]">
                          mail
                        </span>
                      </div>
                      <p className="text-[11px] text-[#75777e] mt-1">
                        Managed by enterprise authentication directory.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#191c1e] mb-1.5">
                        Job Title / Designation
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={jobTitle}
                          onChange={(e) => setJobTitle(e.target.value)}
                          placeholder="e.g. Senior AV Solutions Architect"
                          className="w-full pl-8 pr-3 py-2 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7]"
                        />
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#75777e] text-[16px]">
                          work
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#191c1e] mb-1.5">
                        Engineering Discipline / Department
                      </label>
                      <div className="relative">
                        <select
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                          className="w-full pl-8 pr-8 py-2 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] appearance-none"
                        >
                          {ENGINEERING_DEPARTMENTS.map((dept) => (
                            <option key={dept} value={dept}>
                              {dept}
                            </option>
                          ))}
                        </select>
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#75777e] text-[16px]">
                          domain
                        </span>
                        <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[#75777e] text-[18px] pointer-events-none">
                          expand_more
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#191c1e] mb-1.5">
                        Office Location / Regional Hub
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. HQ - Silicon Valley (Building 4)"
                          className="w-full pl-8 pr-3 py-2 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7]"
                        />
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#75777e] text-[16px]">
                          location_on
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#191c1e] mb-1.5">
                        Direct Phone / Extension
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="e.g. +1 (555) 019-2834"
                          className="w-full pl-8 pr-3 py-2 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7]"
                        />
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#75777e] text-[16px]">
                          call
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#191c1e] mb-1.5">
                      Professional Summary / Focus Area
                    </label>
                    <textarea
                      rows={3}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="e.g. Specializing in enterprise video conferencing topologies, Crestron/Q-SYS automation, and large auditorium AV architectures."
                      className="w-full p-3 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7]"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Security & Password Update */}
              <div className="bg-white border border-[#c5c6ce] rounded overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 bg-[#f2f4f7] border-b border-[#e6e8eb] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#005FB7] text-[18px]">
                      lock
                    </span>
                    <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider">
                      Authentication & Password Security
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPasswordSection(!showPasswordSection)}
                    className="text-xs text-[#005FB7] hover:underline font-semibold flex items-center gap-1"
                  >
                    <span>{showPasswordSection ? 'Hide Form' : 'Change Password'}</span>
                    <span className="material-symbols-outlined text-[16px]">
                      {showPasswordSection ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                </div>

                {showPasswordSection ? (
                  <div className="p-5 flex flex-col gap-4 border-t border-[#e6e8eb] bg-[#fdfdfe]">
                    <div className="p-3 bg-[#d6e3ff] border border-[#b7c7e7] rounded text-xs text-[#001b3c] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-[#005FB7]">
                        info
                      </span>
                      <span>
                        Passwords must be at least 6 characters. Changing your password will update your credentials for subsequent logins.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#191c1e] mb-1.5">
                          New Password
                        </label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                          className="w-full px-3 py-2 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#191c1e] mb-1.5">
                          Confirm New Password
                        </label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter new password"
                          className="w-full px-3 py-2 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7]"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 flex items-center justify-between text-xs text-[#44474d]">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#2e7d32] text-[18px]">
                        check_circle
                      </span>
                      <span>Account password is set and active.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPasswordSection(true)}
                      className="px-3 py-1.5 rounded bg-[#eceef1] text-[#05162e] hover:bg-[#e0e3e6] font-semibold border border-[#c5c6ce]"
                    >
                      Update Password
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Access, RLS & Propagation Info */}
            <div className="flex flex-col gap-6">
              {/* Access Scope Card */}
              <div className="bg-white border border-[#c5c6ce] rounded overflow-hidden shadow-xs">
                <div className="px-4 py-3 bg-[#f2f4f7] border-b border-[#e6e8eb] flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#005FB7] text-[16px]">
                      security
                    </span>
                    Access Permissions
                  </h3>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#d6e3ff] text-[#001b3c]">
                    {userRole}
                  </span>
                </div>

                <div className="p-4 flex flex-col gap-3 text-xs">
                  <div className="flex items-center justify-between py-1.5 border-b border-[#eceef1]">
                    <span className="text-[#44474d]">Project Repository</span>
                    <span className="font-semibold text-[#1e4620] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">check</span> Read & Write
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-[#eceef1]">
                    <span className="text-[#44474d]">Hardware Catalog (PIM)</span>
                    <span className="font-semibold text-[#1e4620] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">check</span> Read & Write
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-[#eceef1]">
                    <span className="text-[#44474d]">Supabase Storage</span>
                    <span className="font-semibold text-[#1e4620] flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">check</span> Direct Upload
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[#44474d]">System Administration</span>
                    <span
                      className={`font-semibold flex items-center gap-1 ${
                        userRole.toLowerCase().includes('admin')
                          ? 'text-[#1e4620]'
                          : 'text-[#75777e]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {userRole.toLowerCase().includes('admin') ? 'check' : 'lock'}
                      </span>
                      {userRole.toLowerCase().includes('admin') ? 'Full Access' : 'Restricted'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Data Cascade Guarantee Notice */}
              <div className="bg-white border border-[#c5c6ce] rounded overflow-hidden shadow-xs">
                <div className="px-4 py-3 bg-[#f2f4f7] border-b border-[#e6e8eb]">
                  <h3 className="text-xs font-bold text-[#05162e] uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#005FB7] text-[16px]">
                      sync
                    </span>
                    Global Data Propagation
                  </h3>
                </div>

                <div className="p-4 flex flex-col gap-2.5 text-xs text-[#44474d]">
                  <p>
                    When you update your name, EKMS automatically reconciles all relational references:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-[11px]">
                    <li>Header and Sidebar avatar initials are recalculated instantly.</li>
                    <li>Project engineer signatures and author initials update across all drawings.</li>
                    <li>Comments and historical activity logs update to reflect your new name.</li>
                    <li>Active authentication session tokens are refreshed synchronously.</li>
                  </ul>
                </div>
              </div>

              {/* Save Button in side panel */}
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-[#005FB7] text-white hover:bg-[#05162e] transition-colors rounded py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-bold shadow-sm border border-[#005FB7] disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    <span>Saving Profile Changes...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    <span>Save Profile Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
