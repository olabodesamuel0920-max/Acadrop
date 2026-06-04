// src/components/CourseDetail.tsx
'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { 
  ArrowLeft, 
  BookOpen, 
  Users, 
  Plus, 
  Upload, 
  FileSpreadsheet, 
  Copy, 
  Check, 
  Calendar, 
  AlertCircle, 
  X, 
  Loader2, 
  FileText,
  Clock
} from 'lucide-react'

interface CourseDetailProps {
  course: any
  roster: any[]
  assignments: any[]
}

export default function CourseDetail({ course, roster, assignments }: CourseDetailProps) {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Tab State: 'assignments' | 'roster'
  const [activeTab, setActiveTab] = useState<'assignments' | 'roster'>('assignments')

  // UI States
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  
  // CSV Upload States
  const [uploadingCSV, setUploadingCSV] = useState(false)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [csvSuccess, setCsvSuccess] = useState<string | null>(null)

  // Create Assignment Form States
  const [assignmentNumber, setAssignmentNumber] = useState('')
  const [assignmentTitle, setAssignmentTitle] = useState('')
  const [assignmentDesc, setAssignmentDesc] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [allowedExts, setAllowedExts] = useState<string[]>(['pdf'])
  const [maxSize, setMaxSize] = useState('50')
  const [requireOtp, setRequireOtp] = useState(false)
  const [assignmentStatus, setAssignmentStatus] = useState<'draft' | 'published'>('draft')
  const [creatingAssignment, setCreatingAssignment] = useState(false)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)

  const handleCopyLink = (assignmentId: string) => {
    const origin = window.location.origin
    const link = `${origin}/submit/${assignmentId}`
    navigator.clipboard.writeText(link)
    setCopiedId(assignmentId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Self-contained CSV validation and parser
  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/)
    if (lines.length === 0 || !lines[0].trim()) {
      throw new Error('CSV file appears to be empty.')
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    
    // Check required columns
    const required = ['student_id', 'first_name', 'last_name', 'email']
    const missing = required.filter(r => !headers.includes(r))
    if (missing.length > 0) {
      throw new Error(`Invalid CSV headers. Missing required columns: ${missing.join(', ')}`)
    }

    const studentIdIndex = headers.indexOf('student_id')
    const firstNameIndex = headers.indexOf('first_name')
    const lastNameIndex = headers.indexOf('last_name')
    const emailIndex = headers.indexOf('email')

    const parsedRows = []
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue // Skip empty lines

      // Basic comma splitter respecting quotes
      const cols: string[] = []
      let current = ''
      let inQuotes = false
      for (let j = 0; j < line.length; j++) {
        const char = line[j]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          cols.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      cols.push(current.trim())

      const studentId = cols[studentIdIndex]?.replace(/^"|"$/g, '') || ''
      const firstName = cols[firstNameIndex]?.replace(/^"|"$/g, '') || ''
      const lastName = cols[lastNameIndex]?.replace(/^"|"$/g, '') || ''
      const email = cols[emailIndex]?.replace(/^"|"$/g, '') || ''

      // Validation
      if (!studentId || !firstName || !lastName || !email) {
        throw new Error(`Row ${i + 1} has missing values. Every student must have a Student ID, First Name, Last Name, and Email.`)
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        throw new Error(`Row ${i + 1} has an invalid email format: "${email}"`)
      }

      parsedRows.push({
        course_id: course.id,
        student_id: studentId.toUpperCase(),
        first_name: firstName,
        last_name: lastName,
        email: email.toLowerCase()
      })
    }

    if (parsedRows.length === 0) {
      throw new Error('No valid student rows found in CSV.')
    }

    return parsedRows
  }

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCsvError(null)
    setCsvSuccess(null)
    setUploadingCSV(true)

    try {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        throw new Error('Please upload a valid .csv file.')
      }

      const fileText = await file.text()
      const studentRows = parseCSV(fileText)

      // SAFE UPSERT: Merges rows on student_id conflict to prevent cascade deletions
      const { error: upsertError } = await supabase
        .from('roster_students')
        .upsert(studentRows, { onConflict: 'course_id,student_id' })

      if (upsertError) throw upsertError

      setCsvSuccess(`Successfully enrolled/updated ${studentRows.length} students in the roster!`)
      router.refresh()
    } catch (err: any) {
      setCsvError(err.message || 'Failed to parse or upload CSV roster.')
    } finally {
      setUploadingCSV(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault()
    setAssignmentError(null)
    setCreatingAssignment(true)

    try {
      const num = parseInt(assignmentNumber, 10)
      if (isNaN(num) || num <= 0) {
        throw new Error('Assignment Number must be a positive integer.')
      }
      if (!assignmentTitle.trim() || !dueDate) {
        throw new Error('Title and Due Date are required.')
      }

      const formattedDueDate = new Date(dueDate).toISOString()
      const maxFileSize = parseInt(maxSize, 10)

      if (isNaN(maxFileSize) || maxFileSize <= 0) {
        throw new Error('Max file size must be a positive integer.')
      }

      if (allowedExts.length === 0) {
        throw new Error('Select at least one allowed file extension.')
      }

      const { error: insertError } = await supabase
        .from('assignments')
        .insert({
          course_id: course.id,
          assignment_number: num,
          title: assignmentTitle.trim(),
          description: assignmentDesc.trim(),
          due_date: formattedDueDate,
          allowed_extensions: allowedExts,
          max_file_size_mb: maxFileSize,
          status: assignmentStatus,
          require_otp: requireOtp
        })

      if (insertError) throw insertError

      // Reset
      setAssignmentNumber('')
      setAssignmentTitle('')
      setAssignmentDesc('')
      setDueDate('')
      setAllowedExts(['pdf'])
      setMaxSize('50')
      setRequireOtp(false)
      setAssignmentStatus('draft')
      setIsAssignmentModalOpen(false)
      
      router.refresh()
    } catch (err: any) {
      setAssignmentError(err.message || 'Failed to create assignment.')
    } finally {
      setCreatingAssignment(false)
    }
  }

  const toggleExtension = (ext: string) => {
    if (allowedExts.includes(ext)) {
      setAllowedExts(allowedExts.filter(e => e !== ext))
    } else {
      setAllowedExts([...allowedExts, ext])
    }
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'published':
        return 'bg-brand-success/15 text-brand-success'
      case 'closed':
        return 'bg-brand-danger/15 text-brand-danger'
      case 'archived':
        return 'bg-brand-warning/15 text-brand-warning'
      case 'draft':
      default:
        return 'bg-app-muted/15 text-app-muted'
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-app text-fg-app min-h-screen">
      {/* Header Banner */}
      <header className="border-b border-app-border bg-sidebar-bg/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 rounded-lg hover:bg-card-bg border border-app-border text-app-muted hover:text-fg-app transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded">
                  {course.code}
                </span>
                <span className="text-xs text-app-muted font-medium">{course.academicSession} ({course.semester})</span>
              </div>
              <h1 className="text-md font-bold tracking-tight mt-0.5 truncate max-w-[280px] sm:max-w-md">
                {course.name}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAssignmentModalOpen(true)}
              className="btn-gradient px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              New Assignment
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-app-border">
          <button
            onClick={() => setActiveTab('assignments')}
            className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'assignments'
                ? 'border-brand-primary text-brand-primary bg-brand-primary/5 rounded-t-xl'
                : 'border-transparent text-app-muted hover:text-fg-app hover:border-app-border'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Assignments ({assignments.length})
          </button>
          <button
            onClick={() => setActiveTab('roster')}
            className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'roster'
                ? 'border-brand-primary text-brand-primary bg-brand-primary/5 rounded-t-xl'
                : 'border-transparent text-app-muted hover:text-fg-app hover:border-app-border'
            }`}
          >
            <Users className="h-4 w-4" />
            Class Roster ({roster.length})
          </button>
        </div>

        {/* ======================================================== */}
        {/* ASSIGNMENTS TAB                                          */}
        {/* ======================================================== */}
        {activeTab === 'assignments' && (
          <div className="space-y-6">
            {assignments.length === 0 ? (
              <div className="glass-panel p-12 text-center rounded-2xl border-dashed border-2 border-app-border space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto">
                  <h3 className="text-md font-bold">No assignments yet</h3>
                  <p className="text-sm text-app-muted">
                    Create an assignment first, then share the submission link with students to start receiving submissions.
                  </p>
                </div>
                <button
                  onClick={() => setIsAssignmentModalOpen(true)}
                  className="btn-gradient px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
                >
                  Create Assignment
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="glass-panel p-6 rounded-2xl border border-app-border shadow-sm flex flex-col md:flex-row justify-between gap-6"
                  >
                    {/* Left: Info details */}
                    <div className="flex-1 space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${getStatusBadgeClass(assignment.status)}`}>
                          {assignment.status}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-app-muted">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Due: {new Date(assignment.dueDate).toLocaleString()}</span>
                        </div>
                        {assignment.requireOtp && (
                          <span className="bg-brand-info/10 text-brand-info border border-brand-info/20 px-2 py-0.5 rounded text-[10px] font-bold">
                            OTP REQUIRED
                          </span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Link
                          href={`/courses/${course.id}/assignments/${assignment.id}`}
                          className="text-lg font-bold hover:text-brand-primary transition-colors inline-block"
                        >
                          Assignment #{assignment.assignmentNumber}: {assignment.title}
                        </Link>
                        {assignment.description && (
                          <p className="text-sm text-app-muted line-clamp-2 max-w-2xl">
                            {assignment.description}
                          </p>
                        )}
                      </div>

                      {/* Copy Link Portal */}
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <button
                          onClick={() => handleCopyLink(assignment.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-card-bg border border-app-border hover:border-brand-primary transition-all cursor-pointer"
                        >
                          {copiedId === assignment.id ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-brand-success" />
                              <span className="text-brand-success">Copied Link</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5 text-app-muted" />
                              <span>Copy Submit Link</span>
                            </>
                          )}
                        </button>
                        <Link
                          href={`/courses/${course.id}/assignments/${assignment.id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-app-border hover:bg-card-bg transition-colors"
                        >
                          View Submissions Grid
                        </Link>
                      </div>
                    </div>

                    {/* Right: First-Class Workflow Metrics Banner */}
                    <div className="w-full md:w-80 flex flex-col justify-center p-4 rounded-xl bg-card-bg/30 border border-app-border/40 gap-3">
                      <div className="flex items-center justify-between text-xs text-app-muted border-b border-app-border/40 pb-2">
                        <span className="font-bold uppercase tracking-wider text-[10px]">Workflow Status</span>
                        <span className="font-semibold text-fg-app">{assignment.metrics.rate}% Complete</span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="bg-card-bg/60 p-2 rounded-lg border border-app-border/20">
                          <div className="text-xs text-app-muted">Expected</div>
                          <div className="text-lg font-bold mt-0.5">{assignment.metrics.expected}</div>
                        </div>
                        <div className="bg-brand-primary/10 p-2 rounded-lg border border-brand-primary/20 text-brand-primary">
                          <div className="text-xs">Submitted</div>
                          <div className="text-lg font-bold mt-0.5">{assignment.metrics.submitted}</div>
                        </div>
                        <div className="bg-brand-danger/10 p-2 rounded-lg border border-brand-danger/20 text-brand-danger">
                          <div className="text-xs">Missing</div>
                          <div className="text-lg font-bold mt-0.5">{assignment.metrics.missing}</div>
                        </div>
                        <div className="bg-brand-warning/10 p-2 rounded-lg border border-brand-warning/20 text-brand-warning">
                          <div className="text-xs">Late</div>
                          <div className="text-lg font-bold mt-0.5">{assignment.metrics.late}</div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-input-bg h-2 rounded-full overflow-hidden border border-app-border/20">
                        <div
                          className="bg-gradient-to-r from-brand-primary to-brand-secondary h-full rounded-full transition-all duration-500"
                          style={{ width: `${assignment.metrics.rate}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* ROSTER TAB                                               */}
        {/* ======================================================== */}
        {activeTab === 'roster' && (
          <div className="space-y-6">
            {/* CSV Status Messages */}
            {csvError && (
              <div className="p-4 rounded-xl bg-brand-danger/10 border border-brand-danger/20 text-brand-danger text-sm font-semibold flex items-start gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{csvError}</span>
              </div>
            )}
            {csvSuccess && (
              <div className="p-4 rounded-xl bg-brand-success/10 border border-brand-success/20 text-brand-success text-sm font-semibold flex items-start gap-3">
                <Check className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{csvSuccess}</span>
              </div>
            )}

            {roster.length === 0 ? (
              /* Roster Upload Empty State */
              <div className="glass-panel p-12 text-center rounded-2xl border-dashed border-2 border-app-border space-y-6">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-info/10 text-brand-info">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <div className="space-y-2 max-w-md mx-auto">
                  <h3 className="text-md font-bold">Upload Class Roster</h3>
                  <p className="text-sm text-app-muted">
                    Before students can submit assignments, upload a CSV roster mapping their student numbers and emails. Students will verify against this list to submit.
                  </p>
                </div>

                <div className="max-w-xs mx-auto p-4 bg-card-bg border border-app-border rounded-xl text-left text-xs space-y-1.5 text-app-muted">
                  <div className="font-semibold text-fg-app uppercase tracking-wider text-[10px]">Expected CSV Schema:</div>
                  <code>student_id,first_name,last_name,email</code>
                  <div>Example row:</div>
                  <code>S12345,John,Smith,john.smith@university.edu</code>
                </div>

                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleCSVUpload}
                    accept=".csv"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingCSV}
                    className="btn-gradient px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer mx-auto disabled:opacity-50"
                  >
                    {uploadingCSV ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Upload Roster CSV
                  </button>
                </div>
              </div>
            ) : (
              /* Roster Table List */
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="text-lg font-bold">Class Roster Summary</h3>
                    <p className="text-sm text-app-muted">Total enrolled students: {roster.length}</p>
                  </div>
                  
                  {/* Re-upload option */}
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleCSVUpload}
                      accept=".csv"
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingCSV}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-app-border hover:bg-card-bg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {uploadingCSV ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      Sync/Update Roster CSV
                    </button>
                  </div>
                </div>

                <div className="glass-panel rounded-2xl overflow-hidden shadow-sm border border-app-border">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-app-border bg-sidebar-bg/40 text-xs font-bold uppercase tracking-wider text-app-muted">
                          <th className="px-6 py-3.5">Student ID (Matric)</th>
                          <th className="px-6 py-3.5">First Name</th>
                          <th className="px-6 py-3.5">Last Name</th>
                          <th className="px-6 py-3.5">Academic Email</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-app-border/40">
                        {roster.map((student) => (
                          <tr key={student.id} className="hover:bg-card-bg/20 transition-colors">
                            <td className="px-6 py-3.5 font-bold font-mono text-brand-primary">{student.student_id}</td>
                            <td className="px-6 py-3.5 font-medium">{student.first_name}</td>
                            <td className="px-6 py-3.5 font-medium">{student.last_name}</td>
                            <td className="px-6 py-3.5 font-mono text-app-muted">{student.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* CREATE ASSIGNMENT MODAL */}
      {isAssignmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity" 
            onClick={() => !creatingAssignment && setIsAssignmentModalOpen(false)}
          />

          <div className="relative glass-panel bg-sidebar-bg w-full max-w-lg rounded-2xl p-6 shadow-2xl z-10 border border-app-border animate-in fade-in zoom-in-95 duration-150 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-app-border">
              <h3 className="text-lg font-bold">Create New Assignment</h3>
              <button
                disabled={creatingAssignment}
                onClick={() => setIsAssignmentModalOpen(false)}
                className="p-1 rounded-lg hover:bg-card-bg text-app-muted hover:text-fg-app transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAssignment} className="space-y-4 pt-4">
              {assignmentError && (
                <div className="p-3 rounded-lg bg-brand-danger/10 border border-brand-danger/20 text-brand-danger text-xs font-semibold">
                  {assignmentError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-app-muted">Assignment Number</label>
                <input
                  type="number"
                  required
                  disabled={creatingAssignment}
                  placeholder="e.g. 1"
                  value={assignmentNumber}
                  onChange={(e) => setAssignmentNumber(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary text-fg-app"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-app-muted">Assignment Title</label>
                <input
                  type="text"
                  required
                  disabled={creatingAssignment}
                  placeholder="e.g. Assignment 1 - Programming Fundamentals"
                  value={assignmentTitle}
                  onChange={(e) => setAssignmentTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary text-fg-app"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-app-muted">Description / Instructions</label>
                <textarea
                  rows={3}
                  disabled={creatingAssignment}
                  placeholder="Explain assignment rules, folder structures, or instructions..."
                  value={assignmentDesc}
                  onChange={(e) => setAssignmentDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary text-fg-app resize-y"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-app-muted">Due Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    disabled={creatingAssignment}
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary text-fg-app"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-app-muted">Max File Size (MB)</label>
                  <input
                    type="number"
                    required
                    disabled={creatingAssignment}
                    value={maxSize}
                    onChange={(e) => setMaxSize(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary text-fg-app"
                  />
                </div>
              </div>

              {/* File restrictions checkboxes */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-app-muted">Allowed Extensions</label>
                <div className="flex flex-wrap gap-3">
                  {['pdf', 'zip', 'docx', 'txt', 'html', 'py', 'java'].map((ext) => (
                    <button
                      key={ext}
                      type="button"
                      disabled={creatingAssignment}
                      onClick={() => toggleExtension(ext)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                        allowedExts.includes(ext)
                          ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                          : 'border-app-border text-app-muted hover:border-fg-app'
                      }`}
                    >
                      .{ext}
                    </button>
                  ))}
                </div>
              </div>

              {/* Verification and Status switches */}
              <div className="space-y-4 pt-2 border-t border-app-border/40">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-fg-app flex items-center gap-1.5">
                      Security: Require Email OTP
                    </label>
                    <p className="text-[11px] text-app-muted max-w-[280px]">
                      By default, students submit with Matric + Email. Turn this ON to require a 6-digit email confirmation code.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    disabled={creatingAssignment}
                    checked={requireOtp}
                    onChange={(e) => setRequireOtp(e.target.checked)}
                    className="h-4 w-4 text-brand-primary rounded border-input-border focus:ring-brand-primary"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-fg-app flex items-center gap-1.5">
                      Publish Immediately
                    </label>
                    <p className="text-[11px] text-app-muted max-w-[280px]">
                      Leave off to create as a draft. Turn ON to open the student submission portal immediately.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    disabled={creatingAssignment}
                    checked={assignmentStatus === 'published'}
                    onChange={(e) => setAssignmentStatus(e.target.checked ? 'published' : 'draft')}
                    className="h-4 w-4 text-brand-primary rounded border-input-border focus:ring-brand-primary"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-app-border mt-6">
                <button
                  type="button"
                  disabled={creatingAssignment}
                  onClick={() => setIsAssignmentModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border border-app-border hover:bg-card-bg transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingAssignment}
                  className="btn-gradient px-4 py-2 text-sm font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {creatingAssignment && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
