// src/components/LecturerDashboard.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { 
  FolderArchive, 
  GraduationCap, 
  BookOpen, 
  Plus, 
  LogOut, 
  FileText, 
  Users, 
  ChevronRight, 
  X, 
  Loader2 
} from 'lucide-react'

interface LecturerDashboardProps {
  lecturer: any
  courses: Array<{
    id: string
    code: string
    name: string
    academicSession: string
    semester: string
    studentCount: number
    assignmentCount: number
  }>
}

export default function LecturerDashboard({ lecturer, courses }: LecturerDashboardProps) {
  const router = useRouter()
  const supabase = createClient()

  // Modal and form states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [courseCode, setCourseCode] = useState('')
  const [courseName, setCourseName] = useState('')
  const [academicSession, setAcademicSession] = useState('')
  const [semester, setSemester] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)


  // Calculations
  const totalCourses = courses.length
  const totalStudents = courses.reduce((sum, c) => sum + c.studentCount, 0)
  const totalAssignments = courses.reduce((sum, c) => sum + c.assignmentCount, 0)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!courseCode.trim() || !courseName.trim() || !academicSession.trim() || !semester.trim()) {
        throw new Error('All fields are required.')
      }

      const { error: insertError } = await supabase
        .from('courses')
        .insert({
          lecturer_id: lecturer.id,
          department_id: lecturer.department_id,
          code: courseCode.trim().toUpperCase(),
          name: courseName.trim(),
          academic_session: academicSession.trim(),
          semester: semester.trim(),
        })

      if (insertError) throw insertError

      // Reset form and close modal
      setCourseCode('')
      setCourseName('')
      setAcademicSession('')
      setSemester('')
      setIsModalOpen(false)
      
      // Refresh server components data
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to create course.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-bg-app text-fg-app min-h-screen">
      {/* Top Navigation Bar */}
      <header className="border-b border-app-border bg-sidebar-bg/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-brand-primary to-brand-secondary">
              <FolderArchive className="h-4 w-4 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">Acadrop</span>
          </div>

          {/* User Profile & Logout */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-sm font-semibold">{lecturer.first_name} {lecturer.last_name}</span>
              <span className="text-xs text-app-muted truncate max-w-[200px]">
                {lecturer.department?.name}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-app-border hover:bg-card-bg/85 hover:text-brand-danger transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        {/* Department Info Header Banner */}
        <div className="glass-panel p-6 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm border border-app-border">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-primary mb-1">
              {lecturer.department?.university?.name || 'University Workspace'}
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Lecturer Control Panel
            </h1>
            <p className="text-sm text-app-muted mt-1">
              Manage your academic courses, students registries, and compliance archives.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn-gradient px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Create Course
          </button>
        </div>

        {/* Global Summary Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="glass-panel p-6 rounded-2xl shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-app-muted">Total Courses</span>
              <div className="p-2 rounded-lg bg-brand-primary/10 text-brand-primary">
                <BookOpen className="h-5 w-5" />
              </div>
            </div>
            <div className="text-3xl font-bold">{totalCourses}</div>
          </div>

          <div className="glass-panel p-6 rounded-2xl shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-app-muted">Roster Students</span>
              <div className="p-2 rounded-lg bg-brand-info/10 text-brand-info">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="text-3xl font-bold">{totalStudents}</div>
          </div>

          <div className="glass-panel p-6 rounded-2xl shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-app-muted">Total Assignments</span>
              <div className="p-2 rounded-lg bg-brand-secondary/10 text-brand-secondary">
                <FileText className="h-5 w-5" />
              </div>
            </div>
            <div className="text-3xl font-bold">{totalAssignments}</div>
          </div>
        </div>

        {/* Course Grid Lists */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight">Active Courses</h2>

          {courses.length === 0 ? (
            /* Empty State */
            <div className="glass-panel p-12 text-center rounded-2xl border-dashed border-2 border-app-border space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-md font-bold">No courses created yet</h3>
                <p className="text-sm text-app-muted">
                  Get started by creating a course to manage rosters and track student assignment collections.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="btn-gradient px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
              >
                Create Your First Course
              </button>
            </div>
          ) : (
            /* Active Course Cards Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course) => (
                <div
                  key={course.id}
                  onClick={() => router.push(`/courses/${course.id}`)}
                  className="glass-panel p-6 rounded-2xl shadow-sm border border-app-border flex flex-col justify-between cursor-pointer transition-all hover:scale-[1.01] hover:border-brand-primary group relative overflow-hidden"
                >
                  {/* Subtle hover gradient background */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-brand-primary/5 to-brand-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                  <div className="space-y-3 relative z-10">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-primary/10 text-brand-primary">
                        {course.code}
                      </span>
                      <span className="text-xs text-app-muted font-medium">{course.academicSession} ({course.semester})</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-lg group-hover:text-brand-primary transition-colors truncate">
                        {course.name}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-6 mt-6 border-t border-app-border relative z-10">
                    <div className="flex items-center gap-4 text-xs text-app-muted font-medium">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {course.studentCount} Students
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {course.assignmentCount} Assignments
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-app-muted group-hover:text-brand-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* CREATE COURSE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop overlay */}
          <div 
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity" 
            onClick={() => !loading && setIsModalOpen(false)}
          />

          {/* Dialog Body */}
          <div className="relative glass-panel bg-sidebar-bg w-full max-w-md rounded-2xl p-6 shadow-2xl z-10 border border-app-border animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-app-border">
              <h3 className="text-lg font-bold">Create New Course</h3>
              <button
                disabled={loading}
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-card-bg text-app-muted hover:text-fg-app transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-4 pt-4">
              {error && (
                <div className="p-3 rounded-lg bg-brand-danger/10 border border-brand-danger/20 text-brand-danger text-xs font-semibold">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-app-muted">Course Code</label>
                <input
                  type="text"
                  required
                  disabled={loading}
                  placeholder="e.g. CS101"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary text-fg-app disabled:opacity-50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-app-muted">Course Name</label>
                <input
                  type="text"
                  required
                  disabled={loading}
                  placeholder="e.g. Introduction to Computer Science"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary text-fg-app disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-app-muted">Academic Session</label>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    placeholder="e.g. 2026/2027"
                    value={academicSession}
                    onChange={(e) => setAcademicSession(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary text-fg-app disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-app-muted">Semester</label>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    placeholder="e.g. Semester 1"
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-input-bg border border-input-border rounded-xl focus:outline-none focus:border-brand-primary text-fg-app disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-app-border mt-6">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border border-app-border hover:bg-card-bg transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gradient px-4 py-2 text-sm font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
