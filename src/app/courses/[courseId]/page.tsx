// src/app/courses/[courseId]/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CourseDetail from '@/components/CourseDetail'

export const dynamic = 'force-dynamic'

interface CoursePageProps {
  params: Promise<{
    courseId: string
  }>
}

export default async function CoursePage({ params }: CoursePageProps) {
  const { courseId } = await params
  const supabase = await createClient()

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Fetch course details, verifying ownership
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select(`
      id,
      code,
      name,
      academic_session,
      semester,
      department_id
    `)
    .eq('id', courseId)
    .eq('lecturer_id', user.id)
    .single()

  if (courseError || !course) {
    console.error('Error fetching course or access denied:', courseError)
    redirect('/dashboard')
  }

  // Fetch student roster
  const { data: roster, error: rosterError } = await supabase
    .from('roster_students')
    .select(`
      id,
      student_id,
      first_name,
      last_name,
      email
    `)
    .eq('course_id', courseId)
    .order('last_name', { ascending: true })

  if (rosterError) {
    console.error('Error fetching roster:', rosterError)
  }

  // Fetch assignments with nested submissions and versions to calculate metrics
  // Filter out soft-deleted assignments where deleted_at IS NOT NULL
  const { data: assignments, error: assignmentsError } = await supabase
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
      created_at,
      submissions (
        id,
        student_id,
        submission_versions (
          submitted_at,
          is_latest
        )
      )
    `)
    .eq('course_id', courseId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (assignmentsError) {
    console.error('Error fetching assignments:', assignmentsError)
  }

  const rosterList = roster || []
  const expectedCount = rosterList.length

  // Format assignments with computed workflow metrics
  const formattedAssignments = (assignments || []).map((assignment: any) => {
    const submissions = assignment.submissions || []
    
    // Total submitted is count of unique students who have submitted
    const submittedCount = submissions.length
    const missingCount = Math.max(0, expectedCount - submittedCount)

    // Calculate late submissions (latest version submitted_at > due_date)
    const dueDate = new Date(assignment.due_date)
    let lateCount = 0

    submissions.forEach((sub: any) => {
      const versions = sub.submission_versions || []
      const latestVersion = versions.find((v: any) => v.is_latest)
      if (latestVersion) {
        const submittedDate = new Date(latestVersion.submitted_at)
        if (submittedDate > dueDate) {
          lateCount++
        }
      }
    })

    const submissionRate = expectedCount > 0 
      ? Math.round((submittedCount / expectedCount) * 100) 
      : 0

    return {
      id: assignment.id,
      title: assignment.title,
      assignmentNumber: assignment.assignment_number,
      description: assignment.description,
      dueDate: assignment.due_date,
      allowedExtensions: assignment.allowed_extensions,
      maxFileSizeMb: assignment.max_file_size_mb,
      status: assignment.status,
      requireOtp: assignment.require_otp,
      metrics: {
        expected: expectedCount,
        submitted: submittedCount,
        missing: missingCount,
        late: lateCount,
        rate: submissionRate
      }
    }
  })

  const formattedCourse = {
    id: course.id,
    code: course.code,
    name: course.name,
    academicSession: course.academic_session,
    semester: course.semester,
    departmentId: course.department_id
  }

  return (
    <CourseDetail
      course={formattedCourse}
      roster={rosterList}
      assignments={formattedAssignments}
    />
  )
}

