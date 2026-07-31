'use client';

import React, { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddEmployeeModal({
  isOpen,
  onClose,
  onSuccess,
}: AddEmployeeModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          email,
          newPassword: password,
          fullName,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setErrorMsg(data.error || 'Failed to create employee account.');
      } else {
        setSuccessMsg(
          `Employee account provisioned for ${fullName} (${email}).`
        );
        setFullName('');
        setEmail('');
        setPassword('');
        if (onSuccess) onSuccess();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred creating employee account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#191c1e]/50 flex items-center justify-center p-4 select-none">
      <div className="bg-white border border-[#c5c6ce] rounded w-full max-w-md p-6 shadow-md flex flex-col gap-4">
        {/* Modal Header */}
        <div className="flex justify-between items-center border-b border-[#e0e3e6] pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#005FB7] text-[20px]">
              person_add
            </span>
            <h2 className="text-sm font-bold text-[#05162e]">
              Provision New Employee Account
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#75777e] hover:text-[#05162e] transition-colors p-1"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-[#ffdad6] border border-[#ba1a1a] rounded text-xs text-[#93000a] flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-[#d6e3ff] border border-[#005FB7] rounded text-xs text-[#001b3c] flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">
              mark_email_unread
            </span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleAddEmployee} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#191c1e] mb-1">
              Full Employee Name
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#75777e] text-[18px]">
                badge
              </span>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                className="w-full pl-9 pr-3 py-2 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#191c1e] mb-1">
              Employee Email Address
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#75777e] text-[18px]">
                mail
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="s.jenkins@enterprise.com"
                className="w-full pl-9 pr-3 py-2 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#191c1e] mb-1">
              Initial Password
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#75777e] text-[18px]">
                lock
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-10 py-2 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#75777e] hover:text-[#05162e] transition-colors"
                title={showPassword ? 'Hide password' : 'View password full'}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
            <p className="text-[11px] text-[#75777e] mt-1">
              An email verification link will be automatically dispatched to confirm the account.
            </p>
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-3 border-t border-[#e0e3e6]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-[#eceef1] text-[#44474d] hover:bg-[#e0e3e6] text-xs font-semibold border border-[#c5c6ce] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded bg-[#005FB7] text-white hover:bg-[#00468a] text-xs font-bold border border-[#005FB7] transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[16px]">
                    progress_activity
                  </span>
                  <span>Provisioning...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">
                    person_add
                  </span>
                  <span>Create Account</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
