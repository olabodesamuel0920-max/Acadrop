// src/app/courses/[courseId]/assignments/[assignmentId]/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AssignmentDetail from '@/components/AssignmentDetail'

export const dynamic = 'force-dynamic'

interface AssignmentPageProps {
  params: Promise<{
    courseId: string
    assignmentId: string
  }>
}

export default async function AssignmentPage({ params }: AssignmentPageProps) {
  const { courseId, assignmentId } = await params
  const supabase = await createClient()

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Fetch course details (to check ownership)
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, code, name, academic_session, semester')
    .eq('id', courseId)
    .eq('lecturer_id', user.id)
    .single()

  if (courseError || !course) {
    console.error('Course fetch error or unauthorized:', courseError)
    redirect('/dashboard')
  }

  // Fetch assignment, checking ownership transitively and ensuring it's not soft-deleted
  const { data: assignment, error: assignmentError } = await supabase
    .from('assignments')
    .select('*')
    .eq('id', assignmentId)
    .eq('course_id', courseId)
    .is('deleted_at', null)
    .single()

  if (assignmentError || !assignment) {
    console.error('Assignment fetch error or soft-deleted:', assignmentError)
    redirect(`/courses/${courseId}`)
  }

  // Fetch course roster
  const { data: roster, error: rosterError } = await supabase
    .from('roster_students')
    .select('id, student_id, first_name, last_name, email')
    .eq('course_id', courseId)
    .order('last_name', { ascending: true })

  if (rosterError) {
    console.error('Roster fetch error:', rosterError)
  }

  // Fetch all submissions for this assignment including all versions
  const { data: submissions, error: submissionsError } = await supabase
    .from('submissions')
    .select(`
      id,
      student_id,
      created_at,
      updated_at,
      submission_versions (
        id,
        version_number,
        receipt_code,
        file_path,
        file_name,
        file_size,
        submitted_at,
        is_latest
      ),
      submission_notes (
        id,
        note_text,
        created_at,
        lecturer_id,
        lecturer:lecturers (
          first_name,
          last_name
        )
      )
    `)
    .eq('assignment_id', assignmentId)

  if (submissionsError) {
    console.error('Submissions fetch error:', submissionsError)
  }

  const rosterList = roster || []
  const submissionsList = submissions || []

  return (
    <AssignmentDetail
      course={course}
      assignment={assignment}
      roster={rosterList}
      submissions={submissionsList}
      lecturerId={user.id}
    />
  )
}
