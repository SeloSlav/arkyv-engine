import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import HamburgerIcon from '@/components/HamburgerIcon';
import Footer from '@/components/Footer';
import ConfirmModal from '@/components/auth/ConfirmModal';
import getSupabaseClient from '@/lib/supabaseClient';

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const supabase = getSupabaseClient();

  const [email, setEmail] = useState('');
  const [handle, setHandle] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [signOutLoading, setSignOutLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      // Fetch profile handle
      const fetchProfile = async () => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('handle')
          .eq('user_id', user.id)
          .single();
        
        if (profile) {
          setHandle(profile.handle || '');
        }
      };
      fetchProfile();
    }
  }, [user, supabase]);

  const handleUpdateHandle = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (handle.length > 30) {
        setError('Handle must be 30 characters or less');
        setLoading(false);
        return;
      }

      const { error: handleError } = await supabase
        .from('profiles')
        .update({ handle: handle })
        .eq('user_id', user.id);

      if (handleError) throw handleError;

      setMessage('Handle updated successfully!');
    } catch (err) {
      setError(err.message || 'Failed to update handle');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const { error: emailError } = await supabase.auth.updateUser({
        email: email,
      });

      if (emailError) throw emailError;

      setMessage('Check your email to confirm the change. You may need to verify both the old and new email addresses.');
    } catch (err) {
      setError(err.message || 'Failed to update email');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!currentPassword) {
      setError('Please enter your current password');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      // First verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        setError('Current password is incorrect');
        setLoading(false);
        return;
      }

      // If verification succeeds, update to new password
      const { error: passwordError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (passwordError) throw passwordError;

      setMessage('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        user.email,
        {
          redirectTo: `${window.location.origin}/profile`,
        }
      );

      if (resetError) throw resetError;

      setMessage('Password reset email sent! Check your inbox for instructions.');
    } catch (err) {
      setError(err.message || 'Failed to send password reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setSignOutLoading(true);
    setError('');

    try {
      await signOut();
      setShowSignOutModal(false);
      // Redirect to home page after sign out
      router.push('/');
    } catch (err) {
      setError(err.message || 'Failed to sign out');
    } finally {
      setSignOutLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setError('');

    try {
      // Delete user's profile and related data
      // Note: You may need to implement a server-side function to properly delete all user data
      const { error: deleteError } = await supabase.rpc('delete_user_account');
      
      if (deleteError) {
        // If RPC doesn't exist, at least delete the profile
        const { error: profileError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', user.id);
        
        if (profileError) throw profileError;
      }

      // Sign out and redirect
      await signOut();
      router.push('/?deleted=true');
    } catch (err) {
      setError(err.message || 'Failed to delete account. Please contact support.');
      setDeleteLoading(false);
      setShowDeleteModal(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-cyan-300 font-terminal text-lg tracking-wider">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <div className="min-h-screen bg-black text-white">
        <HamburgerIcon />

        <div className="max-w-4xl mx-auto px-6 py-20">
          <div className="mb-12">
            <h1 className="font-terminal text-4xl md:text-5xl text-center text-cyan-100 tracking-[0.25em] uppercase mb-4 drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]">
              Profile Settings
            </h1>
            <p className="text-center text-cyan-300/60 font-terminal text-sm tracking-wider">
              Manage your account settings and preferences
            </p>
          </div>

          {message && (
            <div className="mb-6 p-4 bg-green-500/20 border border-green-500/50 rounded-lg text-green-200">
              {message}
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200">
              {error}
            </div>
          )}

          {/* Handle Settings */}
          <div className="mb-8 p-6 rounded-xl border-2 border-cyan-400/40 bg-gradient-to-br from-slate-900/90 to-black/90">
            <h2 className="font-terminal text-xl text-cyan-100 tracking-wider uppercase mb-6">
              Display Handle
            </h2>
            <form onSubmit={handleUpdateHandle} className="space-y-4">
              <div>
                <label className="block text-cyan-200 text-sm font-terminal tracking-wider mb-2">
                  Handle
                </label>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  className="w-full px-4 py-3 bg-black/50 border border-cyan-400/30 rounded-md text-white focus:outline-none focus:border-hot-pink/60 transition-colors"
                  maxLength={30}
                  placeholder="Choose a display name"
                  required
                />
                <p className="text-cyan-300/60 text-xs mt-2">
                  This is your display name when playing in profile mode. Use "set handle &lt;name&gt;" in-game to change it.
                </p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 rounded-md bg-gradient-to-r from-hot-pink/80 via-cyber-purple/80 to-electric-blue/70 text-white font-semibold text-sm tracking-wider uppercase shadow-[0_0_25px_rgba(255,20,147,0.25)] hover:shadow-[0_0_35px_rgba(255,20,147,0.4)] transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Updating...' : 'Update Handle'}
              </button>
            </form>
          </div>

          {/* Email Settings */}
          <div className="mb-8 p-6 rounded-xl border-2 border-cyan-400/40 bg-gradient-to-br from-slate-900/90 to-black/90">
            <h2 className="font-terminal text-xl text-cyan-100 tracking-wider uppercase mb-6">
              Email Address
            </h2>
            <form onSubmit={handleUpdateEmail} className="space-y-4">
              <div>
                <label className="block text-cyan-200 text-sm font-terminal tracking-wider mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-black/50 border border-cyan-400/30 rounded-md text-white focus:outline-none focus:border-hot-pink/60 transition-colors"
                  required
                />
                <p className="text-cyan-300/60 text-xs mt-2">
                  You'll need to verify your new email address
                </p>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 rounded-md bg-gradient-to-r from-hot-pink/80 via-cyber-purple/80 to-electric-blue/70 text-white font-semibold text-sm tracking-wider uppercase shadow-[0_0_25px_rgba(255,20,147,0.25)] hover:shadow-[0_0_35px_rgba(255,20,147,0.4)] transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Updating...' : 'Update Email'}
              </button>
            </form>
          </div>

          {/* Password Settings */}
          <div className="mb-8 p-6 rounded-xl border-2 border-cyan-400/40 bg-gradient-to-br from-slate-900/90 to-black/90">
            <h2 className="font-terminal text-xl text-cyan-100 tracking-wider uppercase mb-6">
              Change Password
            </h2>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className="block text-cyan-200 text-sm font-terminal tracking-wider mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-black/50 border border-cyan-400/30 rounded-md text-white focus:outline-none focus:border-hot-pink/60 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-cyan-200 text-sm font-terminal tracking-wider mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-black/50 border border-cyan-400/30 rounded-md text-white focus:outline-none focus:border-hot-pink/60 transition-colors"
                  minLength={6}
                  required
                />
                <p className="text-cyan-300/60 text-xs mt-2">
                  Must be at least 6 characters
                </p>
              </div>
              <div>
                <label className="block text-cyan-200 text-sm font-terminal tracking-wider mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-black/50 border border-cyan-400/30 rounded-md text-white focus:outline-none focus:border-hot-pink/60 transition-colors"
                  minLength={6}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 rounded-md bg-gradient-to-r from-hot-pink/80 via-cyber-purple/80 to-electric-blue/70 text-white font-semibold text-sm tracking-wider uppercase shadow-[0_0_25px_rgba(255,20,147,0.25)] hover:shadow-[0_0_35px_rgba(255,20,147,0.4)] transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Updating...' : 'Change Password'}
              </button>
            </form>
          </div>

          {/* Password Reset */}
          <div className="mb-8 p-6 rounded-xl border-2 border-cyan-400/40 bg-gradient-to-br from-slate-900/90 to-black/90">
            <h2 className="font-terminal text-xl text-cyan-100 tracking-wider uppercase mb-4">
              Forgot Your Password?
            </h2>
            <p className="text-slate-300 mb-6">
              If you can't remember your current password, we can send you a password reset link via email.
            </p>
            <button
              onClick={handlePasswordReset}
              disabled={loading}
              className="px-8 py-3 rounded-md border-2 border-cyan-400/60 bg-black/60 text-cyan-300 text-sm tracking-wider uppercase font-terminal hover:border-cyan-300 hover:text-white hover:bg-cyan-400/10 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(0,255,255,0.2)]"
            >
              {loading ? 'Sending...' : 'Send Password Reset Email'}
            </button>
          </div>

          {/* Sign Out */}
          <div className="mb-8 p-6 rounded-xl border-2 border-cyan-400/40 bg-gradient-to-br from-slate-900/90 to-black/90">
            <h2 className="font-terminal text-xl text-cyan-100 tracking-wider uppercase mb-4">
              Session Management
            </h2>
            <p className="text-slate-300 mb-6">
              Sign out of your current session. You'll need to log back in to access your account.
            </p>
            <button
              onClick={() => setShowSignOutModal(true)}
              className="px-8 py-3 rounded-md bg-gradient-to-r from-cyan-500 to-cyan-700 text-white font-semibold text-sm tracking-wider uppercase hover:from-cyan-600 hover:to-cyan-800 transition duration-300 shadow-[0_0_25px_rgba(0,255,255,0.3)] hover:shadow-[0_0_35px_rgba(0,255,255,0.5)]"
            >
              Sign Out
            </button>
          </div>

          {/* Danger Zone */}
          <div className="p-6 rounded-xl border-2 border-red-500/40 bg-gradient-to-br from-red-900/20 to-black/90">
            <h2 className="font-terminal text-xl text-red-300 tracking-wider uppercase mb-4">
              Danger Zone
            </h2>
            <p className="text-slate-300 mb-6">
              Once you delete your account, there is no going back. This will permanently delete your profile,
              characters, and all associated data.
            </p>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-8 py-3 rounded-md bg-gradient-to-r from-red-500 to-red-700 text-white font-semibold text-sm tracking-wider uppercase hover:from-red-600 hover:to-red-800 transition duration-300 shadow-[0_0_25px_rgba(239,68,68,0.3)] hover:shadow-[0_0_35px_rgba(239,68,68,0.5)]"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>

      <Footer color="#000000" />

      <ConfirmModal
        isOpen={showSignOutModal}
        onClose={() => setShowSignOutModal(false)}
        onConfirm={handleSignOut}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        cancelText="Cancel"
        confirmStyle="primary"
        loading={signOutLoading}
      />

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteAccount}
        title="Delete Account"
        message="Are you absolutely sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted. Please type your email address below to confirm."
        confirmText="Delete Forever"
        cancelText="Cancel"
        confirmStyle="danger"
        loading={deleteLoading}
        requiresEmailConfirmation={true}
        userEmail={user?.email || ''}
      />
    </>
  );
}

