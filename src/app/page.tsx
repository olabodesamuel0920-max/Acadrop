// src/app/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, FolderArchive, ArrowRight, ShieldCheck, Mail, Lock, User, RefreshCw } from 'lucide-react'

export default function AuthPage() {
  const router = useRouter()
  const supabase = createClient()

  // State toggles
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // UI state
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    try {
      if (isSignUp) {
        // Sign Up lecturer (custom trigger will copy first_name/last_name to public.lecturers)
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
            },
          },
        })
        if (signUpError) throw signUpError
        setMessage('Registration successful! Please check your email for confirmation or login.')
        setIsSignUp(false)
      } else {
        // Sign In
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (signInError) throw signInError
        router.refresh() // Let middleware handle redirecting to dashboard
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-bg-app text-fg-app font-sans">
      {/* LEFT PANE: Premium visual showcase */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-slate-950 items-center justify-center p-12">
        {/* Glow Effects */}
        <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-brand-primary opacity-15 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-brand-secondary opacity-15 blur-[120px]" />
        
        <div className="z-10 max-w-lg space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-primary to-brand-secondary">
              <FolderArchive className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-white">Acadrop</span>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl leading-tight">
              Review <span className="text-brand-primary">digitally</span>.<br />
              Archive <span className="text-brand-secondary">physically</span>.
            </h1>
            <p className="text-lg text-app-muted leading-relaxed">
              Designed for lecturers who prefer reviewing assignments digitally, but need compliant physical records for audits, accreditation, and department standards.
            </p>
          </div>

          {/* Key Value Cards */}
          <div className="grid gap-4 mt-8">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="p-2 rounded-lg bg-brand-primary/10 text-brand-primary">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Roster Integration</h3>
                <p className="text-sm text-app-muted">Upload CSV lists and track submitted vs missing students in real-time.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="p-2 rounded-lg bg-brand-secondary/10 text-brand-secondary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Tamper-Proof Receipt Registry</h3>
                <p className="text-sm text-app-muted">Provide students with serialized codes and timelines to instantly resolve disputes.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="p-2 rounded-lg bg-brand-success/10 text-brand-success">
                <FolderArchive className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white">One-Click Archive Packs</h3>
                <p className="text-sm text-app-muted">Download structured ZIP packets with styled manifest sheets and registers.</p>
              </div>
            </div>
          </div>

          <div className="pt-4 text-xs text-app-muted border-t border-white/10">
            Approved for departmental compliance and audit standards. Version 1.1.0
          </div>
        </div>
      </div>

      {/* RIGHT PANE: Auth glassmorphic form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 relative">
        {/* Mobile Logo Header */}
        <div className="lg:hidden absolute top-8 left-8 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-brand-primary to-brand-secondary">
            <FolderArchive className="h-4 w-4 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-fg-app">Acadrop</span>
        </div>

        {/* Small Screen Background Glow */}
        <div className="lg:hidden absolute top-[10%] right-[10%] w-[150px] h-[150px] rounded-full bg-brand-primary opacity-10 blur-3xl pointer-events-none" />

        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-extrabold tracking-tight">
              {isSignUp ? 'Lecturer Workspace Registration' : 'Lecturer Workspace Login'}
            </h2>
            <p className="mt-2 text-sm text-app-muted">
              {isSignUp ? 'Create your workspace administrator account' : 'Access your university courses and archives'}
            </p>
          </div>

          {/* Form container */}
          <div className="glass-panel rounded-2xl p-6 sm:p-8 shadow-xl transition-all duration-300">
            <form onSubmit={handleAuth} className="space-y-5">
              {error && (
                <div className="p-4 rounded-lg bg-brand-danger/10 border border-brand-danger/20 text-brand-danger text-sm font-medium">
                  {error}
                </div>
              )}
              {message && (
                <div className="p-4 rounded-lg bg-brand-success/10 border border-brand-success/20 text-brand-success text-sm font-medium">
                  {message}
                </div>
              )}

              {isSignUp && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-app-muted">First Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-app-muted" />
                      <input
                        type="text"
                        required
                        placeholder="John"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary transition-colors text-fg-app"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-app-muted">Last Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-app-muted" />
                      <input
                        type="text"
                        required
                        placeholder="Doe"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary transition-colors text-fg-app"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-app-muted">Academic Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-app-muted" />
                  <input
                    type="email"
                    required
                    placeholder="lecturer@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary transition-colors text-fg-app"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold uppercase tracking-wider text-app-muted">Password</label>
                  {!isSignUp && (
                    <a href="#" className="text-xs font-medium text-brand-primary hover:underline">
                      Forgot Password?
                    </a>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-app-muted" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary transition-colors text-fg-app"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-gradient py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    {isSignUp ? 'Create Admin Account' : 'Sign In'}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {/* Form Footer */}
            <div className="mt-6 text-center">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-xs font-medium text-brand-primary hover:underline cursor-pointer bg-transparent border-none"
              >
                {isSignUp
                  ? 'Already have an account? Sign in'
                  : "New to Acadrop? Register your department's lecturer account"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
