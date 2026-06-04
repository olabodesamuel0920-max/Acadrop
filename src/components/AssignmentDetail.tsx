// src/components/AssignmentDetail.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import JSZip from 'jszip'
import { 
  ArrowLeft, 
  Calendar, 
  Trash2, 
  Download, 
  Search, 
  CheckCircle, 
  AlertTriangle, 
  X, 
  Loader2, 
  FileText, 
  History, 
  MessageSquare, 
  Plus, 
  Eye, 
  Clock,
  ArrowRight,
  Send,
  AlertCircle
} from 'lucide-react'

interface AssignmentDetailProps {
  course: any
  assignment: any
  roster: any[]
  submissions: any[]
  lecturerId: string
}

export default function AssignmentDetail({ 
  course, 
  assignment, 
  roster, 
  submissions,
  lecturerId
}: AssignmentDetailProps) {
  const router = useRouter()
  const supabase = createClient()

  // Lifecycle states
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [deletingAssignment, setDeletingAssignment] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Search/Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'missing' | 'late'>('all')

  // Expanded student views (timeline/history)
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)

  // Notes drawer states
  const [notesStudent, setNotesStudent] = useState<any | null>(null)
  const [newNoteText, setNewNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // ZIP Generation states
  const [archiving, setArchiving] = useState(false)
  const [archiveProgress, setArchiveProgress] = useState('')
  const [archiveWarning, setArchiveWarning] = useState<string | null>(null)
  const [showWarningModal, setShowWarningModal] = useState(false)

  // Helper matching submissions to roster students
  const studentData = roster.map(student => {
    const submission = submissions.find(s => s.student_id === student.id)
    const versions = submission?.submission_versions || []
    const latestVersion = versions.find((v: any) => v.is_latest)
    const notes = submission?.submission_notes || []

    let status: 'submitted' | 'missing' | 'late' = 'missing'
    if (latestVersion) {
      const dueTime = new Date(assignment.due_date).getTime()
      const submittedTime = new Date(latestVersion.submitted_at).getTime()
      status = submittedTime > dueTime ? 'late' : 'submitted'
    }

    return {
      student,
      submission,
      versions,
      latestVersion,
      notes,
      status
    }
  })

  // Filtered lists
  const filteredData = studentData.filter(item => {
    const fullName = `${item.student.first_name} ${item.student.last_name}`.toLowerCase()
    const matric = item.student.student_id.toLowerCase()
    const email = item.student.email.toLowerCase()
    const matchesSearch = fullName.includes(searchQuery.toLowerCase()) || 
                          matric.includes(searchQuery.toLowerCase()) ||
                          email.includes(searchQuery.toLowerCase())

    const matchesStatus = statusFilter === 'all' || item.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Counts
  const totalRoster = roster.length
  const totalSubmitted = studentData.filter(s => s.status !== 'missing').length
  const totalMissing = totalRoster - totalSubmitted
  const totalLate = studentData.filter(s => s.status === 'late').length
  const submissionRate = totalRoster > 0 ? Math.round((totalSubmitted / totalRoster) * 100) : 0

  // Handler: Modify status (Draft, Published, Closed, Archived)
  const handleUpdateStatus = async (newStatus: 'draft' | 'published' | 'closed' | 'archived') => {
    setUpdatingStatus(true)
    try {
      const { error } = await supabase
        .from('assignments')
        .update({ status: newStatus })
        .eq('id', assignment.id)

      if (error) throw error
      router.refresh()
    } catch (err: any) {
      alert(err.message || 'Failed to update assignment status.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Handler: Soft delete assignment
  const handleSoftDelete = async () => {
    setDeletingAssignment(true)
    try {
      const { error } = await supabase
        .from('assignments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', assignment.id)

      if (error) throw error
      router.push(`/courses/${course.id}`)
    } catch (err: any) {
      alert(err.message || 'Failed to delete assignment.')
      setDeletingAssignment(false)
    }
  }

  // Handler: Add Submission Notes
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNoteText.trim() || !notesStudent) return

    setSavingNote(true)
    try {
      let submissionId = notesStudent.submission?.id

      // Create submission envelope if student doesn't have one (edge case: adding notes to a missing student)
      if (!submissionId) {
        const { data: newSub, error: subError } = await supabase
          .from('submissions')
          .insert({
            assignment_id: assignment.id,
            student_id: notesStudent.student.id
          })
          .select('id')
          .single()

        if (subError) throw subError
        submissionId = newSub.id
      }

      // Insert note history record
      const { error: noteError } = await supabase
        .from('submission_notes')
        .insert({
          submission_id: submissionId,
          lecturer_id: lecturerId,
          note_text: newNoteText.trim()
        })

      if (noteError) throw noteError

      setNewNoteText('')
      
      // Update local notes states for rendering before fetch resolves
      const updatedNotes = [
        ...notesStudent.notes,
        {
          id: Math.random().toString(),
          note_text: newNoteText.trim(),
          created_at: new Date().toISOString(),
          lecturer_id: lecturerId,
          lecturer: { first_name: 'Me', last_name: '' }
        }
      ]
      setNotesStudent({
        ...notesStudent,
        submission: { id: submissionId },
        notes: updatedNotes
      })

      router.refresh()
    } catch (err: any) {
      alert(err.message || 'Failed to add note.')
    } finally {
      setSavingNote(false)
    }
  }

  // Handler: Build ZIP Archive
  const handleGenerateArchive = async (force: boolean = false) => {
    if (archiving) return
    setArchiveProgress('Initializing...')
    setArchiving(true)
    setArchiveWarning(null)

    try {
      // Calculate total size estimated
      const totalBytes = studentData.reduce((sum, item) => {
        if (item.latestVersion) {
          return sum + parseInt(item.latestVersion.file_size || '0', 10)
        }
        return sum
      }, 0)

      const sizeMB = totalBytes / (1024 * 1024)

      // Warning threshold check: 150MB warning
      if (sizeMB > 150 && !force) {
        setArchiveWarning(`The total size of the submissions is approximately ${sizeMB.toFixed(1)}MB. Zipping this in the browser may cause performance lag or crashes on slower devices.`)
        setShowWarningModal(true)
        setArchiving(false)
        return
      }

      const zip = new JSZip()
      const folder = zip.folder('submissions')

      // 1. Download and package submission files
      for (let i = 0; i < studentData.length; i++) {
        const item = studentData[i]
        const progressPercent = Math.round((i / studentData.length) * 100)
        setArchiveProgress(`Downloading files: ${progressPercent}%`)

        const studentName = `${item.student.last_name}_${item.student.first_name}`.replace(/\s+/g, '_')
        const fileBase = `${item.student.student_id}_${studentName}`

        if (item.latestVersion) {
          // Download directly using Supabase binary download (bypasses pre-signed URLs)
          const { data: blob, error: downloadError } = await supabase
            .storage
            .from('submissions')
            .download(item.latestVersion.file_path)

          if (downloadError) {
            console.error(`Failed to download ${item.latestVersion.file_path}:`, downloadError)
            // Add placeholder error file inside zip
            folder?.file(`${fileBase}_ERROR.txt`, `ERROR: Could not download student submission file at ${item.latestVersion.file_path}`)
          } else if (blob) {
            // Find file extension
            const ext = item.latestVersion.file_name.split('.').pop() || 'pdf'
            folder?.file(`${fileBase}_v${item.latestVersion.version_number}.${ext}`, blob)
          }
        } else {
          // Non-submitter placeholder file for auditing
          folder?.file(`${fileBase}_MISSING.txt`, `Compliance audit log:\nStudent ${item.student.first_name} ${item.student.last_name} (${item.student.student_id}) failed to submit this assignment.`)
        }
      }

      // 2. Generate submission_register.csv
      setArchiveProgress('Compiling submission register...')
      let csvContent = 'Student ID,First Name,Last Name,Email,Status,Latest Submission Time,Receipt Code,Active Version,Lecturer Notes Count\n'
      studentData.forEach(item => {
        const matric = item.student.student_id
        const fname = item.student.first_name.replace(/"/g, '""')
        const lname = item.student.last_name.replace(/"/g, '""')
        const email = item.student.email
        const status = item.status.toUpperCase()
        const subTime = item.latestVersion ? new Date(item.latestVersion.submitted_at).toLocaleString() : 'N/A'
        const receipt = item.latestVersion ? item.latestVersion.receipt_code : 'N/A'
        const version = item.latestVersion ? item.latestVersion.version_number : 'N/A'
        const notesCount = item.notes.length

        csvContent += `"${matric}","${fname}","${lname}","${email}","${status}","${subTime}","${receipt}","${version}",${notesCount}\n`
      })
      zip.file('submission_register.csv', csvContent)

      // 3. Generate missing_roster.csv
      const missingList = studentData.filter(s => s.status === 'missing')
      let missingCsv = 'Student ID,First Name,Last Name,Email\n'
      missingList.forEach(item => {
        missingCsv += `"${item.student.student_id}","${item.student.first_name}","${item.student.last_name}","${item.student.email}"\n`
      })
      zip.file('missing_roster.csv', missingCsv)

      // 4. Generate manifest.html
      setArchiveProgress('Creating styled HTML manifest...')
      const formattedDate = new Date().toLocaleString()
      const dueDate = new Date(assignment.due_date).toLocaleString()
      let manifestHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Acadrop Manifest: Assignment #${assignment.assignment_number}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; line-height: 1.5; padding: 40px; background: #f8fafc; }
          .container { max-width: 1000px; margin: 0 auto; background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
          h1 { margin: 0 0 10px 0; font-size: 24px; color: #0f172a; }
          h2 { margin: 0; font-size: 16px; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.05em; }
          .meta-grid { display: grid; grid-template-cols: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .meta-item { background: #f1f5f9; padding: 15px; border-radius: 8px; font-size: 14px; }
          .meta-label { font-weight: bold; color: #64748b; margin-bottom: 5px; text-transform: uppercase; font-size: 10px; tracking-wider; }
          .meta-val { font-size: 16px; font-weight: 600; color: #0f172a; }
          .stats-grid { display: grid; grid-template-cols: repeat(4, 1fr); gap: 15px; margin-bottom: 40px; }
          .stat-card { border: 1px solid #e2e8f0; padding: 15px; border-radius: 8px; text-align: center; }
          .stat-num { font-size: 24px; font-weight: 800; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
          th { border-bottom: 2px solid #cbd5e1; padding: 10px 12px; text-align: left; color: #475569; text-transform: uppercase; font-size: 10px; font-weight: bold; }
          td { border-bottom: 1px solid #f1f5f9; padding: 12px; color: #334155; }
          .status { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: bold; }
          .status-submitted { background: #d1fae5; color: #065f46; }
          .status-late { background: #fef3c7; color: #92400e; }
          .status-missing { background: #ffe4e6; color: #991b1b; }
          .footer { font-size: 11px; color: #94a3b8; text-align: center; margin-top: 5px; border-t: 1px solid #e2e8f0; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>${course.code} - ${course.academic_session}</h2>
            <h1>Manifest: Assignment #${assignment.assignment_number} - ${assignment.title}</h1>
          </div>
          
          <div class="meta-grid">
            <div class="meta-item">
              <div class="meta-label">Due Date</div>
              <div class="meta-val">${dueDate}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Archive Exported At</div>
              <div class="meta-val">${formattedDate}</div>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-card" style="border-left: 4px solid #64748b;">
              <div class="meta-label">Expected</div>
              <div class="stat-num">${totalRoster}</div>
            </div>
            <div class="stat-card" style="border-left: 4px solid #4f46e5; color: #4f46e5;">
              <div class="meta-label">Submitted</div>
              <div class="stat-num">${totalSubmitted}</div>
            </div>
            <div class="stat-card" style="border-left: 4px solid #f43f5e; color: #f43f5e;">
              <div class="meta-label">Missing</div>
              <div class="stat-num">${totalMissing}</div>
            </div>
            <div class="stat-card" style="border-left: 4px solid #f59e0b; color: #f59e0b;">
              <div class="meta-label">Late</div>
              <div class="stat-num">${totalLate}</div>
            </div>
          </div>

          <h3>Submissions Registry</h3>
          <table>
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Submitted At</th>
                <th>Receipt Code</th>
                <th>Notes Count</th>
              </tr>
            </thead>
            <tbody>
      `

      studentData.forEach(item => {
        const subTime = item.latestVersion ? new Date(item.latestVersion.submitted_at).toLocaleString() : '—'
        const receipt = item.latestVersion ? item.latestVersion.receipt_code : '—'
        const statusClass = item.status === 'submitted' ? 'status-submitted' : item.status === 'late' ? 'status-late' : 'status-missing'
        
        manifestHtml += `
          <tr>
            <td style="font-family: monospace; font-weight: bold;">${item.student.student_id}</td>
            <td><strong>${item.student.last_name}</strong>, ${item.student.first_name}</td>
            <td style="font-family: monospace; color: #64748b;">${item.student.email}</td>
            <td><span class="status ${statusClass}">${item.status.toUpperCase()}</span></td>
            <td>${subTime}</td>
            <td style="font-family: monospace;">${receipt}</td>
            <td>${item.notes.length}</td>
          </tr>
        `
      })

      manifestHtml += `
            </tbody>
          </table>
          
          <div class="footer">
            Generated automatically by Acadrop Registry Engine. Structured Physical Archiving Compliance Sheet.
          </div>
        </div>
      </body>
      </html>
      `
      zip.file('manifest.html', manifestHtml)

      // 5. Compile ZIP and trigger browser download
      setArchiveProgress('Compiling ZIP file in memory...')
      const archiveBlob = await zip.generateAsync({ type: 'blob' })
      setArchiveProgress('Triggering download...')

      const url = window.URL.createObjectURL(archiveBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${course.code}_Assignment_${assignment.assignment_number}_Archive_Pack.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      setArchiveProgress('')
      setArchiving(false)
    } catch (err: any) {
      alert(err.message || 'Failed to generate archive pack ZIP.')
      setArchiveProgress('')
      setArchiving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-app text-fg-app min-h-screen">
      {/* Top navbar */}
      <header className="border-b border-app-border bg-sidebar-bg/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/courses/${course.id}`}
              className="p-2 rounded-lg hover:bg-card-bg border border-app-border text-app-muted hover:text-fg-app transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs text-app-muted font-medium">{course.code}</span>
                <span className="text-xs text-app-muted font-semibold">•</span>
                <span className="text-xs text-app-muted font-medium">Assignment #{assignment.assignment_number}</span>
              </div>
              <h1 className="text-md font-bold tracking-tight truncate max-w-[280px] sm:max-w-md">
                {assignment.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Status change actions */}
            <div className="relative inline-flex items-center gap-2">
              <span className="hidden sm:inline text-xs text-app-muted">Lifecycle:</span>
              <select
                disabled={updatingStatus}
                value={assignment.status}
                onChange={(e) => handleUpdateStatus(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-input-bg border border-input-border text-fg-app focus:outline-none focus:border-brand-primary cursor-pointer disabled:opacity-50"
              >
                <option value="draft">Draft</option>
                <option value="published">Published (Open)</option>
                <option value="closed">Closed (Submissions Locked)</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-lg hover:bg-card-bg border border-app-border text-app-muted hover:text-brand-danger transition-colors cursor-pointer"
              title="Delete Assignment"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main page panel */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        {/* Banner with info instructions */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Assignment Control Dashboard</h2>
            <p className="text-xs text-app-muted mt-1 leading-relaxed max-w-2xl">
              Course: <span className="font-semibold text-fg-app">{course.name} ({course.academic_session})</span>. Share the submission portal link below to collect files from students. Use the grid to view timeline logs, notes history, and compilation versions.
            </p>
            {/* Direct Submit URL display */}
            <div className="mt-3 flex items-center gap-2 text-xs font-mono text-brand-primary">
              <span className="text-app-muted">Submit link:</span>
              <span className="underline select-all">{typeof window !== 'undefined' ? `${window.location.origin}/submit/${assignment.id}` : ''}</span>
            </div>
          </div>
          
          <button
            onClick={() => handleGenerateArchive(false)}
            disabled={archiving}
            className="btn-gradient px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0 w-full md:w-auto justify-center"
          >
            {archiving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">{archiveProgress}</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download Archive Pack
              </>
            )}
          </button>
        </div>

        {/* Workflow Metrics Panel */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-6">
          <div className="glass-panel p-6 rounded-2xl shadow-sm text-center">
            <span className="text-xs font-semibold text-app-muted uppercase tracking-wider">Expected Roster</span>
            <div className="text-3xl font-bold mt-1">{totalRoster}</div>
          </div>
          <div className="glass-panel p-6 rounded-2xl shadow-sm text-center border-l-4 border-l-brand-primary">
            <span className="text-xs font-semibold text-brand-primary uppercase tracking-wider">Submitted</span>
            <div className="text-3xl font-bold mt-1 text-brand-primary">{totalSubmitted}</div>
          </div>
          <div className="glass-panel p-6 rounded-2xl shadow-sm text-center border-l-4 border-l-brand-danger">
            <span className="text-xs font-semibold text-brand-danger uppercase tracking-wider">Missing</span>
            <div className="text-3xl font-bold mt-1 text-brand-danger">{totalMissing}</div>
          </div>
          <div className="glass-panel p-6 rounded-2xl shadow-sm text-center border-l-4 border-l-brand-warning">
            <span className="text-xs font-semibold text-brand-warning uppercase tracking-wider">Late</span>
            <div className="text-3xl font-bold mt-1 text-brand-warning">{totalLate}</div>
          </div>
          <div className="glass-panel p-6 rounded-2xl shadow-sm text-center">
            <span className="text-xs font-semibold text-app-muted uppercase tracking-wider">Rate</span>
            <div className="text-3xl font-bold mt-1">{submissionRate}%</div>
          </div>
        </div>

        {/* Submissions tracking list grid */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-lg font-bold">Students Collection Grid</h3>
            
            {/* Search and filter controls */}
            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-app-muted" />
                <input
                  type="text"
                  placeholder="Search student or matric..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-1.5 text-xs bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary w-full sm:w-48 text-fg-app"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs rounded-xl bg-input-bg border border-input-border text-fg-app focus:outline-none focus:border-brand-primary cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="submitted">Submitted (On-time)</option>
                <option value="late">Submitted (Late)</option>
                <option value="missing">Missing</option>
              </select>
            </div>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden border border-app-border shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-app-border bg-sidebar-bg/40 text-xs font-bold uppercase tracking-wider text-app-muted">
                    <th className="px-6 py-3.5">Student ID</th>
                    <th className="px-6 py-3.5">Student Name</th>
                    <th className="px-6 py-3.5">Submission Status</th>
                    <th className="px-6 py-3.5">Submitted Time</th>
                    <th className="px-6 py-3.5">Receipt ID</th>
                    <th className="px-6 py-3.5">Active Version</th>
                    <th className="px-6 py-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border/40">
                  {filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-app-muted">
                        No students match the active search and filter constraints.
                      </td>
                    </tr>
                  ) : (
                    filteredData.map(({ student, submission, versions, latestVersion, notes, status }) => {
                      const isExpanded = expandedStudentId === student.id
                      const notesCount = notes.length

                      return (
                        <>
                          <tr key={student.id} className="hover:bg-card-bg/25 transition-colors">
                            <td className="px-6 py-3.5 font-bold font-mono text-brand-primary">{student.student_id}</td>
                            <td className="px-6 py-3.5">
                              <div className="font-semibold text-fg-app">{student.last_name}, {student.first_name}</div>
                              <div className="text-[10px] text-app-muted font-mono">{student.email}</div>
                            </td>
                            <td className="px-6 py-3.5">
                              {status === 'submitted' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-brand-success/15 text-brand-success">
                                  <CheckCircle className="h-3 w-3" /> Submitted
                                </span>
                              )}
                              {status === 'late' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-brand-warning/15 text-brand-warning">
                                  <Clock className="h-3 w-3" /> Submitted Late
                                </span>
                              )}
                              {status === 'missing' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-brand-danger/15 text-brand-danger">
                                  <AlertCircle className="h-3 w-3" /> Missing
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3.5 text-app-muted">
                              {latestVersion ? new Date(latestVersion.submitted_at).toLocaleString() : '—'}
                            </td>
                            <td className="px-6 py-3.5 font-mono">
                              {latestVersion ? latestVersion.receipt_code : '—'}
                            </td>
                            <td className="px-6 py-3.5 text-center">
                              {latestVersion ? (
                                <span className="bg-card-bg px-2 py-0.5 rounded border border-app-border font-bold">
                                  v{latestVersion.version_number}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-6 py-3.5">
                              <div className="flex items-center justify-center gap-2">
                                {/* Toggle expand history */}
                                <button
                                  onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
                                  className={`p-1.5 rounded-lg border border-app-border transition-colors hover:bg-card-bg cursor-pointer ${
                                    isExpanded ? 'text-brand-primary border-brand-primary' : 'text-app-muted'
                                  }`}
                                  title="Show Timeline & History"
                                >
                                  <History className="h-3.5 w-3.5" />
                                </button>

                                {/* Notes Drawer link */}
                                <button
                                  onClick={() => setNotesStudent({ student, submission, versions, latestVersion, notes, status })}
                                  className={`p-1.5 rounded-lg border border-app-border transition-colors hover:bg-card-bg cursor-pointer relative ${
                                    notesCount > 0 ? 'text-brand-secondary border-brand-secondary/40' : 'text-app-muted'
                                  }`}
                                  title="Submission Notes"
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                  {notesCount > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-brand-secondary text-white rounded-full text-[8px] h-3.5 w-3.5 flex items-center justify-center font-bold">
                                      {notesCount}
                                    </span>
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* EXPANDED ROW: Version History & Timeline */}
                          {isExpanded && (
                            <tr key={`${student.id}-expanded`} className="bg-card-bg/15 border-l-4 border-l-brand-primary">
                              <td colSpan={7} className="px-6 py-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {/* Left pane: Version History list */}
                                  <div className="space-y-2">
                                    <h4 className="font-bold text-xs uppercase tracking-wider text-app-muted flex items-center gap-1.5">
                                      <History className="h-3.5 w-3.5 text-brand-primary" />
                                      Submission Upload History
                                    </h4>
                                    {versions.length === 0 ? (
                                      <p className="text-xs text-app-muted italic">No files uploaded yet.</p>
                                    ) : (
                                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                        {versions.map((version: any) => (
                                          <div
                                            key={version.id}
                                            className="p-2.5 rounded-lg bg-card-bg border border-app-border flex items-center justify-between gap-3 text-[11px]"
                                          >
                                            <div className="space-y-0.5">
                                              <div className="flex items-center gap-2">
                                                <span className="font-bold text-fg-app">Version {version.version_number}</span>
                                                <span className="font-mono text-brand-primary">{version.receipt_code}</span>
                                                {version.is_latest && (
                                                  <span className="bg-brand-success/15 text-brand-success text-[8px] font-bold px-1.5 py-0.2 rounded uppercase">
                                                    LATEST
                                                  </span>
                                                )}
                                              </div>
                                              <div className="text-app-muted truncate max-w-[200px]" title={version.file_name}>
                                                {version.file_name} ({(version.file_size / (1024 * 1024)).toFixed(2)} MB)
                                              </div>
                                              <div className="text-[10px] text-app-muted">
                                                Uploaded: {new Date(version.submitted_at).toLocaleString()}
                                              </div>
                                            </div>

                                            {/* Download individual version */}
                                            <a
                                              href={`${supabase.storage.from('submissions').getPublicUrl(version.file_path).data.publicUrl}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="p-1.5 rounded-md hover:bg-input-bg border border-app-border text-app-muted hover:text-fg-app flex items-center justify-center shrink-0 cursor-pointer"
                                              title="Download Version"
                                            >
                                              <Download className="h-3.5 w-3.5" />
                                            </a>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Right pane: Student interaction timeline logs */}
                                  <div className="space-y-2">
                                    <h4 className="font-bold text-xs uppercase tracking-wider text-app-muted flex items-center gap-1.5">
                                      <Eye className="h-3.5 w-3.5 text-brand-info" />
                                      Activity Timeline Logs
                                    </h4>

                                    <div className="space-y-3 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[1px] before:bg-app-border">
                                      {/* Event 1: Published */}
                                      <div className="relative pl-6 text-[11px] flex items-start gap-2">
                                        <div className="absolute left-[9px] top-1.5 w-2 h-2 rounded-full bg-brand-primary" />
                                        <div>
                                          <div className="font-semibold">Assignment Published</div>
                                          <div className="text-[10px] text-app-muted">
                                            {new Date(assignment.created_at).toLocaleString()}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Event 2: Student viewed assignment */}
                                      <div className="relative pl-6 text-[11px] flex items-start gap-2">
                                        <div className="absolute left-[9px] top-1.5 w-2 h-2 rounded-full bg-brand-info" />
                                        <div>
                                          <div className="font-semibold">Student Opened Portal Link</div>
                                          <div className="text-[10px] text-app-muted">
                                            Logs view timeline is registered client-side on submission visit.
                                          </div>
                                        </div>
                                      </div>

                                      {/* Event 3: Submission attempt */}
                                      {latestVersion && (
                                        <div className="relative pl-6 text-[11px] flex items-start gap-2">
                                          <div className="absolute left-[9px] top-1.5 w-2 h-2 rounded-full bg-brand-success" />
                                          <div>
                                            <div className="font-semibold">Receipt generated: {latestVersion.receipt_code}</div>
                                            <div className="text-[10px] text-app-muted">
                                              Version {latestVersion.version_number} finalized at {new Date(latestVersion.submitted_at).toLocaleString()}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* NOTES HISTORY DRAWER (Right sidebar Drawer modal) */}
      {notesStudent && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity"
            onClick={() => !savingNote && setNotesStudent(null)}
          />

          {/* Drawer content body */}
          <div className="relative w-full max-w-md bg-sidebar-bg border-l border-app-border shadow-2xl z-10 flex flex-col h-full animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-4 border-b border-app-border flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Submission Notes History</h3>
                <p className="text-[10px] text-app-muted font-mono mt-0.5">
                  {notesStudent.student.student_id} • {notesStudent.student.first_name} {notesStudent.student.last_name}
                </p>
              </div>
              <button
                disabled={savingNote}
                onClick={() => setNotesStudent(null)}
                className="p-1 rounded-lg hover:bg-card-bg text-app-muted hover:text-fg-app cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Note logs list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {notesStudent.notes.length === 0 ? (
                <div className="text-center py-12 text-app-muted space-y-2">
                  <MessageSquare className="h-8 w-8 mx-auto opacity-30" />
                  <p className="text-xs italic">No internal annotations logged for this student yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {notesStudent.notes.map((note: any) => (
                    <div key={note.id} className="p-3 rounded-xl bg-card-bg border border-app-border/60 text-xs space-y-1">
                      <div className="flex justify-between items-center text-[10px] text-app-muted border-b border-app-border/40 pb-1.5 mb-1.5">
                        <span className="font-bold">{note.lecturer?.first_name} {note.lecturer?.last_name || 'Staff'}</span>
                        <span>{new Date(note.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-fg-app whitespace-pre-wrap leading-relaxed">{note.note_text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* New Note Form footer */}
            <div className="p-4 border-t border-app-border bg-card-bg/25">
              <form onSubmit={handleAddNote} className="space-y-3">
                <textarea
                  required
                  rows={2}
                  disabled={savingNote}
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Type an internal note (e.g. extension granted, doctor note approved)..."
                  className="w-full p-2.5 text-xs bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary text-fg-app resize-none"
                />
                <button
                  type="submit"
                  disabled={savingNote || !newNoteText.trim()}
                  className="w-full btn-gradient py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingNote ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-3 w-3" />
                      Add Note Entry
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* SOFT DELETE CONFIRM MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => !deletingAssignment && setShowDeleteConfirm(false)} />
          <div className="relative glass-panel bg-sidebar-bg w-full max-w-sm rounded-2xl p-6 shadow-2xl z-10 border border-app-border text-center space-y-4">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-danger/10 text-brand-danger">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-md">Delete Assignment?</h3>
              <p className="text-xs text-app-muted max-w-[280px] mx-auto">
                Are you sure you want to delete this assignment? It will be soft-deleted. Roster configurations and registry submissions will be protected but hidden.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <button
                disabled={deletingAssignment}
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-card-bg cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={deletingAssignment}
                onClick={handleSoftDelete}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-brand-danger hover:opacity-90 text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {deletingAssignment && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ZIP WARNING THRESHOLD MODAL */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setShowWarningModal(false)} />
          <div className="relative glass-panel bg-sidebar-bg w-full max-w-sm rounded-2xl p-6 shadow-2xl z-10 border border-app-border text-center space-y-4">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-warning/10 text-brand-warning">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-md">Size Warning ( &gt; 150MB)</h3>
              <p className="text-xs text-app-muted max-w-[280px] mx-auto leading-relaxed">
                {archiveWarning}
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={() => setShowWarningModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-card-bg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowWarningModal(false)
                  handleGenerateArchive(true)
                }}
                className="btn-gradient px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Download Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
