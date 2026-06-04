// src/app/api/debug/generate-demo/route.ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Only allow in development mode for safety
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Demo generator is only available in development mode.' },
      { status: 403 }
    )
  }

  const supabase = createAdminClient()

  try {
    // 1. Get first lecturer profile
    const { data: lecturers, error: lecturerError } = await supabase
      .from('lecturers')
      .select('id, department_id')
      .limit(1)

    if (lecturerError || !lecturers || lecturers.length === 0) {
      return NextResponse.json(
        { error: 'No lecturer profiles found. Please register a lecturer account first by signing up on the landing page.' },
        { status: 400 }
      )
    }

    const lecturer = lecturers[0]

    // 2. Clear old demo data to ensure a clean run
    const { data: oldCourses } = await supabase
      .from('courses')
      .select('id')
      .eq('code', 'DEMO-CS101')
      .eq('lecturer_id', lecturer.id)

    if (oldCourses && oldCourses.length > 0) {
      const courseIds = oldCourses.map(c => c.id)
      await supabase.from('courses').delete().in('id', courseIds)
    }

    // 3. Insert Demo Course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .insert({
        lecturer_id: lecturer.id,
        department_id: lecturer.department_id,
        code: 'DEMO-CS101',
        name: 'Introduction to Software Engineering',
        academic_session: '2026/2027',
        semester: 'Semester 1'
      })
      .select('id')
      .single()

    if (courseError || !course) throw courseError

    // 4. Create Roster of 100 Students
    const studentRows = []
    const firstNames = ['John', 'Jane', 'Robert', 'Mary', 'Michael', 'Linda', 'William', 'Elizabeth', 'David', 'Barbara']
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia', 'Rodriguez', 'Wilson']

    for (let i = 1; i <= 100; i++) {
      const fName = firstNames[(i - 1) % firstNames.length]
      const lName = lastNames[Math.floor((i - 1) / firstNames.length) % lastNames.length]
      const studentId = `S10${String(i).padStart(3, '0')}` // S10001 to S10100

      studentRows.push({
        course_id: course.id,
        student_id: studentId,
        first_name: fName,
        last_name: lName,
        email: `student${i}@university.edu`.toLowerCase()
      })
    }

    const { data: roster, error: rosterError } = await supabase
      .from('roster_students')
      .insert(studentRows)
      .select('id, student_id, email')

    if (rosterError || !roster) throw rosterError

    // 5. Create 3 Demo Assignments
    // A. Assignment 1: Published, on-time + late submissions, no OTP
    const { data: assignment1, error: a1Error } = await supabase
      .from('assignments')
      .insert({
        course_id: course.id,
        assignment_number: 1,
        title: 'Assignment 1: Software Design Patterns',
        description: 'Implement a Singleton and a Factory Pattern in TypeScript. Submit a compiled PDF containing explanations and code snippets.',
        due_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Due 1 day ago (to allow testing late items!)
        allowed_extensions: ['pdf', 'zip'],
        max_file_size_mb: 20,
        status: 'published',
        require_otp: false
      })
      .select('id, due_date')
      .single()

    if (a1Error || !assignment1) throw a1Error

    // B. Assignment 2: Published, OTP required, no submissions yet (to test upload flow)
    const { data: assignment2, error: a2Error } = await supabase
      .from('assignments')
      .insert({
        course_id: course.id,
        assignment_number: 2,
        title: 'Assignment 2: Database Schema Architecture',
        description: 'Design a relational schema for a library management system. OTP security code check is enabled.',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Due in 7 days
        allowed_extensions: ['pdf', 'png'],
        max_file_size_mb: 10,
        status: 'published',
        require_otp: true
      })
      .select('id')
      .single()

    if (a2Error || !assignment2) throw a2Error

    // C. Assignment 3: Draft
    const { data: assignment3, error: a3Error } = await supabase
      .from('assignments')
      .insert({
        course_id: course.id,
        assignment_number: 3,
        title: 'Assignment 3: Web Deployment Checklist',
        description: 'Deploy a basic app on Vercel and write a verification log document.',
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        allowed_extensions: ['txt', 'pdf'],
        max_file_size_mb: 5,
        status: 'draft',
        require_otp: false
      })
      .select('id')
      .single()

    if (a3Error || !assignment3) throw a3Error

    // 6. Generate Submissions for Assignment 1
    // - 80 students submit on-time
    // - 10 students submit late
    // - 10 students missing (no submissions)
    // - 5 students submit two versions to test versioning logs
    const submissionEnvelopes = []
    const submissionVersions = []
    const views = []

    const totalStudents = roster.length // 100
    const submittersCount = 90 // 80 on-time + 10 late
    const dueDate = new Date(assignment1.due_date)

    // Build lists
    for (let i = 0; i < submittersCount; i++) {
      const studentRecord = roster[i]
      
      // Determine submission timestamp
      let submittedAt: Date
      if (i < 80) {
        // On-time: Submitted 2 hours before due date
        submittedAt = new Date(dueDate.getTime() - 2 * 60 * 60 * 1000)
      } else {
        // Late: Submitted 4 hours after due date
        submittedAt = new Date(dueDate.getTime() + 4 * 60 * 60 * 1000)
      }

      // Add timeline view event (they viewed it 1 hour before submitting)
      views.push({
        assignment_id: assignment1.id,
        student_id: studentRecord.id,
        viewed_at: new Date(submittedAt.getTime() - 1 * 60 * 60 * 1000).toISOString()
      })

      // We need to create submission envelopes first, but to get IDs we can insert them sequentially
      // or build a batch insert. Let's do it in a simple loop for absolute reliability.
      const { data: envelope, error: envError } = await supabase
        .from('submissions')
        .insert({
          assignment_id: assignment1.id,
          student_id: studentRecord.id
        })
        .select('id')
        .single()

      if (envError || !envelope) throw envError

      // File properties
      const fileSize = Math.floor(500000 + Math.random() * 2000000) // 500KB to 2.5MB
      const mockHash = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')

      // Version 1
      submissionVersions.push({
        submission_id: envelope.id,
        version_number: 1,
        receipt_code: `ADR-2026-${String(1000 + i).padStart(6, '0')}`,
        file_path: `courses/${course.id}/assignments/${assignment1.id}/${studentRecord.student_id}_mock_v1.pdf`,
        file_name: `Software_Patterns_${studentRecord.student_id}.pdf`,
        file_size: fileSize,
        file_hash: mockHash,
        submitted_at: submittedAt.toISOString(),
        ip_address: `192.168.1.${10 + i}`,
        is_latest: true
      })

      // For 5 students, add a version override!
      if (i < 5) {
        // We will make the first version (v1) be NOT latest, and add a newer v2 which IS latest
        // This simulates a resubmission.
        const v2SubmittedAt = new Date(submittedAt.getTime() + 30 * 60 * 1000) // 30 minutes later
        
        // Mutate v1 to be is_latest = false
        submissionVersions[i].is_latest = false

        // Add v2
        submissionVersions.push({
          submission_id: envelope.id,
          version_number: 2,
          receipt_code: `ADR-2026-${String(2000 + i).padStart(6, '0')}`,
          file_path: `courses/${course.id}/assignments/${assignment1.id}/${studentRecord.student_id}_mock_v2.pdf`,
          file_name: `Software_Patterns_${studentRecord.student_id}_REVISED.pdf`,
          file_size: fileSize + 50000,
          file_hash: mockHash.split('').reverse().join(''), // reverse hash
          submitted_at: v2SubmittedAt.toISOString(),
          ip_address: `192.168.1.${10 + i}`,
          is_latest: true
        })
      }
    }

    // Insert Views & Versions in bulk
    await supabase.from('assignment_views').insert(views)
    const { error: versionsError } = await supabase.from('submission_versions').insert(submissionVersions)
    if (versionsError) throw versionsError

    // 7. Insert some lecturer notes
    // Add internal lecturer notes to the first 3 submissions
    const { data: demoSubs } = await supabase
      .from('submissions')
      .select('id')
      .eq('assignment_id', assignment1.id)
      .limit(3)

    if (demoSubs && demoSubs.length > 0) {
      const notes = [
        { submission_id: demoSubs[0].id, lecturer_id: lecturer.id, note_text: 'Student contacted me via MS Teams requesting extension. Checked medical report.' },
        { submission_id: demoSubs[0].id, lecturer_id: lecturer.id, note_text: 'Extension officially granted for 12 hours.' },
        { submission_id: demoSubs[1].id, lecturer_id: lecturer.id, note_text: 'Verified file integrity: Student submitted a ZIP contains compile errors.' },
        { submission_id: demoSubs[2].id, lecturer_id: lecturer.id, note_text: 'Approved resubmission attempt. Version 2 is the active sheet.' }
      ]
      await supabase.from('submission_notes').insert(notes)
    }

    return NextResponse.json({
      success: true,
      summary: {
        message: 'Successfully generated Acadrop Demo Environment!',
        course_code: 'DEMO-CS101',
        course_name: 'Introduction to Software Engineering',
        roster_students_count: roster.length,
        assignments_created: [
          { number: 1, title: 'Assignment 1', status: 'published', require_otp: false, submissions_count: submittersCount },
          { number: 2, title: 'Assignment 2', status: 'published', require_otp: true, submissions_count: 0 },
          { number: 3, title: 'Assignment 3', status: 'draft', require_otp: false, submissions_count: 0 }
        ]
      }
    })
  } catch (err: any) {
    console.error('Demo Generator failed:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Verification seeding failed.' },
      { status: 500 }
    )
  }
}
