'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const supabase = createClient();
      const origin =
        typeof window !== 'undefined'
          ? window.location.origin
          : 'http://localhost:3000';

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/reset-password`,
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        setSubmitted(true);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred requesting password reset.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f9fc] flex flex-col justify-center items-center px-4 select-none">
      <div className="w-full max-w-md bg-white border border-[#c5c6ce] rounded p-8 shadow-sm">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 bg-[#05162e] rounded flex items-center justify-center text-white mb-3">
            <span className="material-symbols-outlined text-[28px]">lock_reset</span>
          </div>
          <h1 className="text-xl font-bold text-[#05162e]">
            Reset Password
          </h1>
          <p className="text-xs text-[#44474d] mt-1">
            Enter your registered enterprise email address to receive password recovery instructions.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-3 bg-[#ffdad6] border border-[#ba1a1a] rounded text-xs text-[#93000a] flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {submitted ? (
          <div className="flex flex-col items-center text-center gap-4 py-4">
            <div className="w-12 h-12 bg-[#d6e3ff] rounded-full flex items-center justify-center text-[#005FB7]">
              <span className="material-symbols-outlined text-[24px]">mark_email_read</span>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[#05162e]">Check Your Inbox</h3>
              <p className="text-xs text-[#44474d]">
                We sent password reset instructions to <strong className="text-[#05162e]">{email}</strong>.
              </p>
            </div>
            <Link
              href="/login"
              className="mt-4 text-xs font-bold text-[#005FB7] hover:underline flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              <span>Back to Login</span>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset} className="flex flex-col gap-4">
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
                  <span>Sending Reset Link...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">
                    send
                  </span>
                  <span>Send Recovery Email</span>
                </>
              )}
            </button>

            <div className="text-center mt-2">
              <Link
                href="/login"
                className="text-xs text-[#44474d] hover:text-[#005FB7] transition-colors inline-flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                <span>Return to Sign In</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
