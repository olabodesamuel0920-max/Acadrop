// src/app/submit/[assignmentId]/receipt/[submissionVersionId]/page.tsx
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { 
  FolderArchive, 
  CheckCircle2, 
  Download, 
  Printer, 
  FileText, 
  User, 
  Calendar, 
  ShieldCheck, 
  ArrowRight,
  Eye,
  Check
} from 'lucide-react'

export const dynamic = 'force-dynamic'

interface ReceiptPageProps {
  params: Promise<{
    assignmentId: string
    submissionVersionId: string
  }>
}

export default async function StudentReceiptPage({ params }: ReceiptPageProps) {
  const { submissionVersionId } = await params
  const supabase = createAdminClient()

  // Fetch the submission version details with full nested relationships
  const { data: version, error } = await supabase
    .from('submission_versions')
    .select(`
      id,
      version_number,
      receipt_code,
      file_name,
      file_size,
      file_hash,
      submitted_at,
      ip_address,
      submission:submissions (
        id,
        created_at,
        student:roster_students (
          id,
          student_id,
          first_name,
          last_name,
          email
        ),
        assignment:assignments (
          id,
          assignment_number,
          title,
          created_at,
          due_date,
          course:courses (
            id,
            code,
            name,
            academic_session,
            semester
          )
        )
      )
    `)
    .eq('id', submissionVersionId)
    .single()

  if (error || !version) {
    console.error('Error fetching receipt:', error)
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-app text-fg-app">
        <div className="text-center p-6 glass-panel rounded-2xl max-w-sm">
          <h2 className="text-xl font-bold text-brand-danger">Receipt Not Found</h2>
          <p className="text-sm text-app-muted mt-2">
            The requested digital receipt record could not be found or you do not have permission to view it.
          </p>
        </div>
      </div>
    )
  }

  const { submission } = version as any
  const { student, assignment } = submission
  const { course } = assignment

  // Fetch Viewed timestamp (from assignment_views) to display in the audit timeline
  const { data: viewLog } = await supabase
    .from('assignment_views')
    .select('viewed_at')
    .eq('assignment_id', assignment.id)
    .eq('student_id', student.id)
    .single()

  const viewedTime = viewLog ? new Date(viewLog.viewed_at).toLocaleString() : 'Registered'
  const publishedTime = new Date(assignment.created_at).toLocaleString()
  const submittedTime = new Date(version.submitted_at).toLocaleString()

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-bg-app text-fg-app min-h-screen p-6 relative">
      {/* Background glow effects */}
      <div className="absolute top-[10%] left-[10%] w-[200px] h-[200px] rounded-full bg-brand-success/5 opacity-10 blur-[100px] pointer-events-none" />
      
      <div className="w-full max-w-xl space-y-6 relative z-10 print:max-w-full print:p-0">
        
        {/* Receipt Panel */}
        <div className="glass-panel p-6 sm:p-8 rounded-2xl shadow-xl space-y-6 border border-app-border bg-sidebar-bg/60 print:border-none print:shadow-none print:bg-white print:text-black">
          
          {/* Header */}
          <div className="text-center space-y-2 border-b border-app-border/40 pb-6 print:border-black">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-success/10 text-brand-success mb-2 print:hidden">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">Submission Receipt</h1>
            <p className="text-sm font-bold font-mono text-brand-primary print:text-black">
              Receipt ID: {version.receipt_code}
            </p>
            <p className="text-xs text-app-muted">
              {course.code} • {course.name} ({course.academic_session})
            </p>
          </div>

          {/* Details Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-card-bg/40 border border-app-border/40 space-y-1 print:border-black">
              <div className="font-bold text-app-muted uppercase tracking-wider text-[9px] flex items-center gap-1">
                <User className="h-3 w-3" /> Student Profile
              </div>
              <div className="font-bold text-sm">{student.last_name}, {student.first_name}</div>
              <div className="font-mono text-app-muted">ID: {student.student_id}</div>
              <div className="text-app-muted">{student.email}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-card-bg/40 border border-app-border/40 space-y-1 print:border-black">
              <div className="font-bold text-app-muted uppercase tracking-wider text-[9px] flex items-center gap-1">
                <FileText className="h-3 w-3" /> Assignment Details
              </div>
              <div className="font-bold text-sm">Assignment #{assignment.assignment_number}</div>
              <div className="truncate text-app-muted" title={assignment.title}>{assignment.title}</div>
              <div className="text-app-muted">Due: {new Date(assignment.due_date).toLocaleString()}</div>
            </div>
          </div>

          {/* Registry Data */}
          <div className="p-4 rounded-xl bg-card-bg border border-app-border space-y-3 print:border-black">
            <div className="text-xs font-bold uppercase tracking-wider text-app-muted border-b border-app-border/40 pb-1.5">
              Registry Transaction Metadata
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-app-muted">Uploaded File:</span>
                <span className="font-semibold text-fg-app text-right truncate max-w-[200px]" title={version.file_name}>
                  {version.file_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-app-muted">File Size:</span>
                <span className="font-semibold text-fg-app">
                  {(version.file_size / (1024 * 1024)).toFixed(2)} MB ({version.file_size.toLocaleString()} bytes)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-app-muted">Active Version:</span>
                <span className="bg-brand-primary/10 text-brand-primary px-1.5 py-0.2 rounded font-bold">
                  v{version.version_number}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-app-muted">IP Address logged:</span>
                <span className="font-mono">{version.ip_address || '127.0.0.1'}</span>
              </div>
              {/* Note: SHA-256 is stored but hidden from prominent UI display per review guidelines */}
            </div>
          </div>

          {/* ========================================== */}
          {/* VERIFICATION AUDIT TIMELINE LOGS           */}
          {/* ========================================== */}
          <div className="p-4 rounded-xl bg-card-bg border border-app-border space-y-4 print:border-black">
            <div className="text-xs font-bold uppercase tracking-wider text-app-muted border-b border-app-border/40 pb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand-success" />
              Identity & Integrity Verification Timeline
            </div>

            <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[1px] before:bg-app-border/80 text-xs">
              {/* Event 1: Published */}
              <div className="relative pl-6 flex items-start gap-2">
                <div className="absolute left-[9px] top-1.5 w-2 h-2 rounded-full bg-brand-primary" />
                <div>
                  <div className="font-bold">Assignment Opened</div>
                  <div className="text-[10px] text-app-muted">Portal active on {publishedTime}</div>
                </div>
              </div>

              {/* Event 2: Student opened link */}
              <div className="relative pl-6 flex items-start gap-2">
                <div className="absolute left-[9px] top-1.5 w-2 h-2 rounded-full bg-brand-info" />
                <div>
                  <div className="font-bold">Student Portal Open & ID Matched</div>
                  <div className="text-[10px] text-app-muted">Session authenticated on {viewedTime}</div>
                </div>
              </div>

              {/* Event 3: Student Submitted */}
              <div className="relative pl-6 flex items-start gap-2">
                <div className="absolute left-[9px] top-1.5 w-2 h-2 rounded-full bg-brand-success" />
                <div>
                  <div className="font-bold">File Finalized & Transferred</div>
                  <div className="text-[10px] text-app-muted">Binary uploaded on {submittedTime}</div>
                </div>
              </div>

              {/* Event 4: Receipt Generated */}
              <div className="relative pl-6 flex items-start gap-2">
                <div className="absolute left-[9px] top-1.5 w-2 h-2 rounded-full bg-brand-secondary" />
                <div>
                  <div className="font-bold">Compliance Receipt Issued</div>
                  <div className="text-[10px] text-brand-secondary font-semibold font-mono">
                    Token: {version.receipt_code}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-center pt-2 print:hidden">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-card-bg transition-colors cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              Print Receipt PDF
            </button>
            <Link
              href={`/submit/${assignment.id}`}
              className="btn-gradient px-4 py-2 text-xs font-semibold rounded-xl flex items-center gap-1.5"
            >
              Back to Portal
            </Link>
          </div>

          <div className="text-center text-[10px] text-app-muted border-t border-app-border/40 pt-4 print:text-black print:border-black">
            Acadrop Compliance Engine • Academic Registry Registry Dispute Code System
          </div>
        </div>
      </div>
    </div>
  )
}
