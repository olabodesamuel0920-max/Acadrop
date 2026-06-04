// src/components/StudentUploadForm.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  verifyStudentAction, 
  verifyOtpAction, 
  getUploadParametersAction, 
  finalizeSubmissionAction,
  clearStudentSessionAction
} from '@/lib/actions'
import { 
  FolderArchive, 
  UserCheck, 
  FileText, 
  Upload, 
  Check, 
  X, 
  AlertCircle, 
  Calendar, 
  Loader2, 
  Lock, 
  Mail, 
  FileCheck,
  ShieldAlert,
  ArrowRight,
  LogOut
} from 'lucide-react'

interface StudentUploadFormProps {
  assignment: any
  activeStudent: any
}

export default function StudentUploadForm({ assignment, activeStudent }: StudentUploadFormProps) {
  const router = useRouter()

  // 1. Verification states
  const [matricNumber, setMatricNumber] = useState('')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  
  // OTP flow details
  const [requireOtpCode, setRequireOtpCode] = useState(false)
  const [otpTargetEmail, setOtpTargetEmail] = useState('')

  // 2. Active student details
  const [student, setStudent] = useState<any>(activeStudent)

  // 3. File upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileHash, setFileHash] = useState<string | null>(null)
  const [calculatingHash, setCalculatingHash] = useState(false)
  
  // Health parameters
  const [isTypeValid, setIsTypeValid] = useState(false)
  const [isSizeValid, setIsSizeValid] = useState(false)
  const [isReadyToSubmit, setIsReadyToSubmit] = useState(false)

  // Submission process states
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState('')

  // Check file integrity on change
  useEffect(() => {
    if (!selectedFile) {
      setIsTypeValid(false)
      setIsSizeValid(false)
      setIsReadyToSubmit(false)
      setFileHash(null)
      return
    }

    const fileExt = selectedFile.name.split('.').pop()?.toLowerCase() || ''
    const typeOk = assignment.allowed_extensions.includes(fileExt)
    const sizeOk = selectedFile.size <= assignment.max_file_size_mb * 1024 * 1024

    setIsTypeValid(typeOk)
    setIsSizeValid(sizeOk)
    setIsReadyToSubmit(typeOk && sizeOk && !!student)

    if (typeOk && sizeOk) {
      calculateFileHash(selectedFile)
    } else {
      setFileHash(null)
    }
  }, [selectedFile, student])

  // Native Web Crypto API SHA-256 hash calculator
  const calculateFileHash = async (file: File) => {
    setCalculatingHash(true)
    try {
      const buffer = await file.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      setFileHash(hashHex)
    } catch (err) {
      console.error('Failed to compute file hash:', err)
    } finally {
      setCalculatingHash(false)
    }
  }

  // Student verification form handler
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerifyError(null)
    setVerifying(true)

    try {
      const res = await verifyStudentAction(assignment.id, matricNumber, email)
      if (!res.success) {
        throw new Error(res.error || 'Identity verification failed.')
      }

      if (res.requireOtp) {
        setRequireOtpCode(true)
        setOtpTargetEmail(res.email || '')
      } else {
        // Logged in successfully: Reload router to fetch session
        router.refresh()
        // Local update
        setStudent({ student_id: matricNumber.toUpperCase(), email })
      }
    } catch (err: any) {
      setVerifyError(err.message || 'Verification failed.')
    } finally {
      setVerifying(false)
    }
  }

  // OTP validation handler
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setVerifyError(null)
    setVerifying(true)

    try {
      const res = await verifyOtpAction(assignment.id, otpTargetEmail, otp)
      if (!res.success) {
        throw new Error(res.error || 'Invalid OTP code.')
      }

      // Logged in successfully
      router.refresh()
      setStudent({ student_id: matricNumber.toUpperCase(), email: otpTargetEmail })
      setRequireOtpCode(false)
    } catch (err: any) {
      setVerifyError(err.message || 'OTP validation failed.')
    } finally {
      setVerifying(false)
    }
  }

  // Sign out student
  const handleSignOut = async () => {
    await clearStudentSessionAction()
    setStudent(null)
    setSelectedFile(null)
    setRequireOtpCode(false)
    setMatricNumber('')
    setEmail('')
    setOtp('')
    router.refresh()
  }

  // Submission handler (Direct-to-Storage with Commit Transaction)
  const handleSubmit = async () => {
    if (!isReadyToSubmit || !selectedFile || !fileHash || submitting) return

    setSubmitError(null)
    setSubmitting(true)
    setUploadProgress('Preparing upload channels...')

    try {
      // Step A: Get pre-signed URL
      const paramsRes = await getUploadParametersAction(selectedFile.name, selectedFile.size)
      if (!paramsRes.success || !paramsRes.uploadUrl) {
        throw new Error(paramsRes.error || 'Failed to prepare upload channel.')
      }

      // Step B: Direct upload to Supabase Storage via PUT
      setUploadProgress('Uploading file to university storage...')
      const uploadRes = await fetch(paramsRes.uploadUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type,
          'x-upsert': 'true' // Allow overwrite if file path collides
        }
      })

      if (!uploadRes.ok) {
        throw new Error('Network upload failed. Please try again.')
      }

      // Step C: Commit transaction metadata
      setUploadProgress('Generating receipt code...')
      const finalizeRes = await finalizeSubmissionAction(
        paramsRes.filePath,
        selectedFile.name,
        selectedFile.size,
        fileHash
      )

      if (!finalizeRes.success) {
        throw new Error(finalizeRes.error || 'Failed to register submission receipt.')
      }

      // Step D: Redirect to success receipt page
      router.push(`/submit/${assignment.id}/receipt/${finalizeRes.submissionVersionId}`)
    } catch (err: any) {
      setSubmitError(err.message || 'Submission process encountered an error.')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-bg-app text-fg-app min-h-screen p-6 relative">
      {/* Background glow effects */}
      <div className="absolute top-[10%] left-[10%] w-[200px] h-[200px] rounded-full bg-brand-primary opacity-10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[10%] w-[200px] h-[200px] rounded-full bg-brand-secondary opacity-10 blur-[100px] pointer-events-none" />

      {/* Main card */}
      <div className="w-full max-w-xl space-y-6 relative z-10">
        {/* Portal Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-primary to-brand-secondary mb-2">
            <FolderArchive className="h-5 w-5 text-white" />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight">Student Submission Portal</h2>
          <p className="text-xs text-app-muted">
            {assignment.course?.code} • {assignment.course?.name} ({assignment.course?.academic_session})
          </p>
        </div>

        {/* ========================================== */}
        {/* STATE 1 & 2: VERIFICATION PANELS           */}
        {/* ========================================== */}
        {!student ? (
          <div className="glass-panel p-6 sm:p-8 rounded-2xl shadow-xl space-y-6">
            {!requireOtpCode ? (
              /* Step 1: Matric + Email lookup */
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-md text-fg-app">Verify Identity</h3>
                  <p className="text-xs text-app-muted">
                    Enter your details matching the official class roster uploaded by your lecturer.
                  </p>
                </div>

                {verifyError && (
                  <div className="p-3 rounded-lg bg-brand-danger/10 border border-brand-danger/20 text-brand-danger text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{verifyError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-app-muted">Student Number / Matric</label>
                  <div className="relative">
                    <UserCheck className="absolute left-3 top-3 h-4 w-4 text-app-muted" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. S12345"
                      value={matricNumber}
                      onChange={(e) => setMatricNumber(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary text-fg-app"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-app-muted">Academic Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-app-muted" />
                    <input
                      type="email"
                      required
                      placeholder="e.g. student@university.edu"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary text-fg-app"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={verifying}
                  className="w-full btn-gradient py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {verifying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Verify Identity
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Step 2: OTP Verification */
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-md text-fg-app">Security Check: Verification Code Required</h3>
                  <p className="text-xs text-app-muted">
                    We sent a 6-digit verification code to <span className="font-semibold text-fg-app">{otpTargetEmail}</span>. Please check your inbox and spam folders.
                  </p>
                </div>

                {verifyError && (
                  <div className="p-3 rounded-lg bg-brand-danger/10 border border-brand-danger/20 text-brand-danger text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <span>{verifyError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-app-muted">Verification Code</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-app-muted" />
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="e.g. 123456"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary text-fg-app font-mono text-center tracking-widest"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={() => setRequireOtpCode(false)}
                    className="text-xs text-app-muted hover:text-fg-app hover:underline cursor-pointer bg-transparent border-none"
                  >
                    Back to details
                  </button>
                  <button
                    type="submit"
                    disabled={verifying}
                    className="btn-gradient px-6 py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {verifying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Confirm Code
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* ========================================== */
          /* STATE 3: UPLOAD PORTAL PANEL               */
          /* ========================================== */
          <div className="space-y-6">
            {/* Student info card */}
            <div className="glass-panel p-4 rounded-xl flex items-center justify-between border border-app-border text-xs">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-brand-success" />
                <span>Verified student: <strong>{student.student_id}</strong> ({student.email})</span>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-card-bg border border-app-border text-app-muted hover:text-brand-danger transition-colors cursor-pointer text-[10px]"
              >
                <LogOut className="h-3 w-3" />
                Sign Out
              </button>
            </div>

            {/* Main Assignment upload form */}
            <div className="glass-panel p-6 rounded-2xl border border-app-border shadow-xl space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-brand-primary">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Due Date: {new Date(assignment.due_date).toLocaleString()}</span>
                </div>
                <h3 className="font-bold text-lg">Assignment #{assignment.assignment_number}: {assignment.title}</h3>
                {assignment.description && (
                  <p className="text-xs text-app-muted leading-relaxed whitespace-pre-wrap p-3 rounded-lg bg-card-bg border border-app-border/40">
                    {assignment.description}
                  </p>
                )}
              </div>

              {submitError && (
                <div className="p-4 rounded-xl bg-brand-danger/10 border border-brand-danger/20 text-brand-danger text-xs font-semibold">
                  {submitError}
                </div>
              )}

              {/* UPLOAD ZONE */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-app-muted">File Upload</label>
                
                <div className="relative border-2 border-dashed border-app-border rounded-xl p-8 text-center hover:border-brand-primary transition-colors bg-card-bg/20">
                  <input
                    type="file"
                    disabled={submitting}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) setSelectedFile(file)
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="space-y-3">
                    <div className="mx-auto h-10 w-10 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-fg-app">Drag & drop your file or click to browse</p>
                      <p className="text-[10px] text-app-muted mt-1">
                        Allowed types: {assignment.allowed_extensions.map((e: string) => `.${e}`).join(', ')} • Max size: {assignment.max_file_size_mb}MB
                      </p>
                    </div>
                  </div>
                </div>

                {/* Selected File Details */}
                {selectedFile && (
                  <div className="p-3.5 rounded-xl bg-card-bg border border-app-border flex items-center justify-between text-xs gap-3">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="h-4 w-4 text-brand-primary shrink-0" />
                      <div className="truncate">
                        <div className="font-semibold truncate max-w-[200px]" title={selectedFile.name}>{selectedFile.name}</div>
                        <div className="text-[10px] text-app-muted">({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)</div>
                      </div>
                    </div>
                    
                    {calculatingHash ? (
                      <span className="text-[10px] text-brand-secondary flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Hash signature...
                      </span>
                    ) : fileHash ? (
                      <span className="text-[10px] text-brand-success flex items-center gap-1 font-mono uppercase bg-brand-success/10 px-2 py-0.5 rounded border border-brand-success/20">
                        <Check className="h-3 w-3" /> Hash ready
                      </span>
                    ) : null}
                  </div>
                )}
              </div>

              {/* ========================================== */}
              {/* SUBMISSION HEALTH CARD COMPONENT            */}
              {/* ========================================== */}
              <div className="p-4 rounded-xl bg-card-bg border border-app-border space-y-3 shadow-inner">
                <div className="text-xs font-bold uppercase tracking-wider text-app-muted border-b border-app-border/40 pb-1.5 flex items-center justify-between">
                  <span>Submission Health Verification</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${isReadyToSubmit ? 'bg-brand-success/15 text-brand-success' : 'bg-brand-danger/15 text-brand-danger'}`}>
                    {isReadyToSubmit ? 'VERIFIED' : 'PENDING'}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Rule 1: File type valid */}
                  <div className="flex items-center justify-between">
                    <span className="text-app-muted">File Type is Allowed</span>
                    {selectedFile ? (
                      isTypeValid ? (
                        <Check className="h-4 w-4 text-brand-success font-bold" />
                      ) : (
                        <X className="h-4 w-4 text-brand-danger font-bold" />
                      )
                    ) : (
                      <span className="text-[10px] text-app-muted italic">No file</span>
                    )}
                  </div>

                  {/* Rule 2: File size valid */}
                  <div className="flex items-center justify-between">
                    <span className="text-app-muted">File Size under Limit</span>
                    {selectedFile ? (
                      isSizeValid ? (
                        <Check className="h-4 w-4 text-brand-success font-bold" />
                      ) : (
                        <X className="h-4 w-4 text-brand-danger font-bold" />
                      )
                    ) : (
                      <span className="text-[10px] text-app-muted italic">No file</span>
                    )}
                  </div>

                  {/* Rule 3: Assignment open */}
                  <div className="flex items-center justify-between">
                    <span className="text-app-muted">Submission Portal is Open</span>
                    <Check className="h-4 w-4 text-brand-success font-bold" />
                  </div>

                  {/* Rule 4: Student verified */}
                  <div className="flex items-center justify-between">
                    <span className="text-app-muted">Student Roster Authenticated</span>
                    <Check className="h-4 w-4 text-brand-success font-bold" />
                  </div>

                  {/* Divider */}
                  <div className="border-t border-app-border/40 pt-2 flex items-center justify-between font-bold text-fg-app">
                    <span>Overall Registry Readiness</span>
                    {isReadyToSubmit && fileHash ? (
                      <span className="text-brand-success flex items-center gap-1">
                        <Check className="h-4 w-4" /> Ready to Submit
                      </span>
                    ) : (
                      <span className="text-brand-danger flex items-center gap-1">
                        <X className="h-4 w-4" /> Blocked
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* SUBMIT CONTROLS */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!isReadyToSubmit || !fileHash || submitting}
                className="w-full btn-gradient py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{uploadProgress}</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="h-4 w-4" />
                    Finalize Digital Submission
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
