'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Email not confirmed')) {
          setInfoMsg(
            'Please verify your email address. A confirmation link was sent to your inbox upon account creation.'
          );
        } else {
          setErrorMsg(error.message);
        }
        setLoading(false);
        return;
      }

      if (data.session) {
        router.push('/');
        router.refresh();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f9fc] flex flex-col justify-center items-center px-4 select-none">
      <div className="w-full max-w-md bg-white border border-[#c5c6ce] rounded p-8 shadow-sm">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-12 h-12 bg-[#05162e] rounded flex items-center justify-center text-white mb-3">
            <span className="material-symbols-outlined text-[28px]">token</span>
          </div>
          <h1 className="text-xl font-bold text-[#05162e]">
            Velocis EKMS Enterprise
          </h1>
          <p className="text-xs text-[#44474d] mt-1">
            Engineering Knowledge Management System
          </p>
        </div>

        {/* Alert Messages */}
        {errorMsg && (
          <div className="mb-6 p-3 bg-[#ffdad6] border border-[#ba1a1a] rounded text-xs text-[#93000a] flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && (
          <div className="mb-6 p-3 bg-[#d6e3ff] border border-[#005FB7] rounded text-xs text-[#001b3c] flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">
              mark_email_unread
            </span>
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#191c1e] mb-1">
              Work Email Address
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
                placeholder="engineer@enterprise.com"
                className="w-full pl-9 pr-3 py-2 rounded bg-white border border-[#c5c6ce] text-xs text-[#191c1e] focus:outline-none focus:border-[#005FB7] focus:ring-1 focus:ring-[#005FB7] transition-all"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-[#191c1e]">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-[#005FB7] hover:underline"
              >
                Forgot Password?
              </Link>
            </div>
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
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-[#005FB7] text-white hover:bg-[#00468a] transition-colors py-2 rounded text-xs font-bold flex items-center justify-center gap-2 border border-[#005FB7] disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[16px]">
                  progress_activity
                </span>
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">
                  login
                </span>
                <span>Sign In to EKMS</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[#e0e3e6] text-center">
          <p className="text-[11px] text-[#75777e]">
            Access restricted to authorized enterprise employees only.
            <br />
            New accounts are provisioned by System Administrators.
          </p>
        </div>
      </div>
    </div>
  );
}
