// src/app/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LecturerDashboard from '@/components/LecturerDashboard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Fetch lecturer details including department and university
  const { data: lecturer, error: lecturerError } = await supabase
    .from('lecturers')
    .select(`
      id,
      first_name,
      last_name,
      department_id,
      department:departments (
        id,
        name,
        university:universities (
          id,
          name
        )
      )
    `)
    .eq('id', user.id)
    .single()

  if (lecturerError || !lecturer) {
    console.error('Error fetching lecturer profile:', lecturerError)
    // Fallback if profile trigger delayed
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-app text-fg-app">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold">Setting up your profile...</h2>
          <p className="text-app-muted">Please refresh the page in a few seconds.</p>
        </div>
      </div>
    )
  }

  // Fetch courses owned by the lecturer, including roster student counts and assignment counts
  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select(`
      id,
      code,
      name,
      academic_session,
      semester,
      created_at,
      roster_students (id),
      assignments (id)
    `)
    .eq('lecturer_id', user.id)
    .order('created_at', { ascending: false })

  if (coursesError) {
    console.error('Error fetching courses:', coursesError)
  }

  // Map courses to include count of items directly
  const formattedCourses = (courses || []).map((course: any) => ({
    id: course.id,
    code: course.code,
    name: course.name,
    academicSession: course.academic_session,
    semester: course.semester,
    studentCount: course.roster_students?.length || 0,
    assignmentCount: course.assignments?.length || 0,
  }))


  return (
    <LecturerDashboard
      lecturer={lecturer}
      courses={formattedCourses}
    />
  )
}
