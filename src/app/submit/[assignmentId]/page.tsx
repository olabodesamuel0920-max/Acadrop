// src/app/submit/[assignmentId]/page.tsx
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import StudentUploadForm from '@/components/StudentUploadForm'

export const dynamic = 'force-dynamic'

interface SubmitPageProps {
  params: Promise<{
    assignmentId: string
  }>
}

export default async function StudentSubmitPage({ params }: SubmitPageProps) {
  const { assignmentId } = await params
  const supabase = createAdminClient()

  // 1. Fetch assignment and course details
  const { data: assignment, error: assignmentError } = await supabase
    .from('assignments')
    .select(`
      id,
      assignment_number,
      title,
      description,
      due_date,
      allowed_extensions,
      max_file_size_mb,
      status,
      require_otp,
      course:courses (
        id,
        code,
        name,
        academic_session,
        semester
      )
    `)
    .eq('id', assignmentId)
    .is('deleted_at', null)
    .single()

  if (assignmentError || !assignment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-app text-fg-app">
        <div className="text-center p-6 glass-panel rounded-2xl max-w-sm">
          <h2 className="text-xl font-bold text-brand-danger">Link Invalid</h2>
          <p className="text-sm text-app-muted mt-2">
            The assignment submission link appears to be invalid or has been disabled.
          </p>
        </div>
      </div>
    )
  }

  // 2. Render warning if not published
  if (assignment.status !== 'published') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-app text-fg-app">
        <div className="text-center p-6 glass-panel rounded-2xl max-w-sm">
          <h2 className="text-xl font-bold text-brand-warning">Portal Closed</h2>
          <p className="text-sm text-app-muted mt-2">
            This assignment is currently in {assignment.status} status and is not accepting submissions.
          </p>
        </div>
      </div>
    )
  }

  // 3. Check for active student session
  const cookieStore = await cookies()
  const token = cookieStore.get('acadrop-student-session')?.value
  let activeStudent = null

  if (token) {
    const { data: session } = await supabase
      .from('student_sessions')
      .select('student:roster_students (id, student_id, first_name, last_name, email)')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (session && session.student) {
      activeStudent = session.student
    }
  }

  return (
    <StudentUploadForm
      assignment={assignment}
      activeStudent={activeStudent}
    />
  )
}
