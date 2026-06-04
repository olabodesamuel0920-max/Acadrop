// src/lib/actions.ts
'use server'

import { cookies, headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'

// 1. Verify Matric Number & Email, then start session or prompt OTP
export async function verifyStudentAction(assignmentId: string, matricNumber: string, email: string) {
  const supabase = createAdminClient()

  try {
    // A. Fetch assignment and course details
    const { data: assignment, error: assignmentError } = await supabase
      .from('assignments')
      .select('id, course_id, require_otp, status')
      .eq('id', assignmentId)
      .is('deleted_at', null)
      .single()

    if (assignmentError || !assignment) {
      return { success: false, error: 'Assignment not found.' }
    }

    if (assignment.status !== 'published') {
      return { success: false, error: 'This assignment is not open for submissions.' }
    }

    // B. Check roster mapping
    const { data: student, error: studentError } = await supabase
      .from('roster_students')
      .select('id, student_id, email, first_name, last_name')
      .eq('course_id', assignment.course_id)
      .eq('student_id', matricNumber.trim().toUpperCase())
      .eq('email', email.trim().toLowerCase())
      .single()

    if (studentError || !student) {
      return { success: false, error: 'Student details not found on the course roster.' }
    }

    // C. Track Viewed event (Assignment Views timeline entry)
    await supabase
      .from('assignment_views')
      .upsert({
        assignment_id: assignment.id,
        student_id: student.id
      }, { onConflict: 'assignment_id,student_id' })

    // D. Check require_otp toggle
    if (assignment.require_otp) {
      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString()
      const expiry = new Date(Date.now() + 15 * 60000).toISOString() // 15 mins

      const { error: otpError } = await supabase
        .from('student_verifications')
        .insert({
          assignment_id: assignment.id,
          email: student.email,
          otp,
          expires_at: expiry
        })

      if (otpError) throw otpError

      // DEVELOPER DX LOGGING: Log OTP to console for local testing ease
      console.log(`[Acadrop OTP] Verification Code for ${student.email}: ${otp}`)

      // Send via email client if configured
      if (process.env.RESEND_API_KEY) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: process.env.EMAIL_FROM_ADDRESS || 'noreply@acadrop.university.edu',
              to: student.email,
              subject: 'Acadrop Verification Code',
              html: `<p>Your Acadrop submission verification code is: <strong>${otp}</strong>. This code expires in 15 minutes.</p>`
            })
          })
        } catch (emailErr) {
          console.error('Failed to send Resend OTP email:', emailErr)
        }
      }

      return { success: true, requireOtp: true, email: student.email }
    } else {
      // OTP not required: Start session immediately
      const token = crypto.randomUUID()
      const expiry = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2 hours

      const { error: sessionError } = await supabase
        .from('student_sessions')
        .insert({
          student_id: student.id,
          assignment_id: assignment.id,
          token,
          expires_at: expiry
        })

      if (sessionError) throw sessionError

      // Set cookie
      const cookieStore = await cookies()
      cookieStore.set('acadrop-student-session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 2 * 60 * 60 // 2 hours
      })

      return { success: true, requireOtp: false }
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Verification process failed.' }
  }
}

// 2. Validate OTP and issue session
export async function verifyOtpAction(assignmentId: string, email: string, otp: string) {
  const supabase = createAdminClient()

  try {
    const { data: verification, error: verifyError } = await supabase
      .from('student_verifications')
      .select('*')
      .eq('assignment_id', assignmentId)
      .eq('email', email.trim().toLowerCase())
      .eq('otp', otp.trim())
      .eq('verified', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (verifyError || !verification) {
      return { success: false, error: 'Invalid or expired verification code.' }
    }

    // Mark verified
    await supabase
      .from('student_verifications')
      .update({ verified: true })
      .eq('id', verification.id)

    // Lookup student profile
    const { data: student, error: studentError } = await supabase
      .from('roster_students')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .single()

    if (studentError || !student) {
      return { success: false, error: 'Roster account not found.' }
    }

    // Create session
    const token = crypto.randomUUID()
    const expiry = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2 hours

    const { error: sessionError } = await supabase
      .from('student_sessions')
      .insert({
        student_id: student.id,
        assignment_id: assignmentId,
        token,
        expires_at: expiry
      })

    if (sessionError) throw sessionError

    // Set cookie
    const cookieStore = await cookies()
    cookieStore.set('acadrop-student-session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 2 * 60 * 60
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || 'OTP validation failed.' }
  }
}

// 3. Clear student session
export async function clearStudentSessionAction() {
  const cookieStore = await cookies()
  const token = cookieStore.get('acadrop-student-session')?.value
  
  if (token) {
    const supabase = createAdminClient()
    await supabase.from('student_sessions').delete().eq('token', token)
  }
  
  cookieStore.delete('acadrop-student-session')
  return { success: true }
}

// 4. Request Pre-signed Upload URL
export async function getUploadParametersAction(fileName: string, fileSize: number) {
  const cookieStore = await cookies()
  const token = cookieStore.get('acadrop-student-session')?.value

  if (!token) {
    return { success: false, error: 'Unauthorized. Session expired or missing.' }
  }

  const supabase = createAdminClient()

  try {
    // A. Validate student session
    const { data: session, error: sessionError } = await supabase
      .from('student_sessions')
      .select(`
        student_id,
        assignment_id,
        student:roster_students(student_id, last_name, first_name),
        assignment:assignments(course_id, allowed_extensions, max_file_size_mb)
      `)
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (sessionError || !session) {
      return { success: false, error: 'Unauthorized. Student session has expired.' }
    }

    const { student, assignment, student_id, assignment_id } = session as any
    const fileExt = fileName.split('.').pop()?.toLowerCase() || ''

    // B. Validate size & extension constraints (Harden Pass)
    if (fileSize > assignment.max_file_size_mb * 1024 * 1024) {
      return { success: false, error: `File size exceeds the limit of ${assignment.max_file_size_mb}MB.` }
    }

    if (!assignment.allowed_extensions.includes(fileExt)) {
      return { success: false, error: `File type .${fileExt} is not allowed. Allowed types: ${assignment.allowed_extensions.join(', ')}` }
    }

    // C. Calculate version number
    const { data: existingSub } = await supabase
      .from('submissions')
      .select('id')
      .eq('assignment_id', assignment_id)
      .eq('student_id', student_id)
      .single()

    let version = 1
    if (existingSub) {
      const { data: versions } = await supabase
        .from('submission_versions')
        .select('version_number')
        .eq('submission_id', existingSub.id)
        .order('version_number', { ascending: false })
        .limit(1)

      if (versions && versions.length > 0) {
        version = versions[0].version_number + 1
      }
    }

    // D. Generate path
    const cleanLastName = student.last_name.replace(/[^a-zA-Z0-9]/g, '')
    const cleanFirstName = student.first_name.replace(/[^a-zA-Z0-9]/g, '')
    const timestamp = Math.floor(Date.now() / 1000)
    const filePath = `courses/${assignment.course_id}/assignments/${assignment_id}/${student.student_id}_${cleanLastName}_${cleanFirstName}_v${version}_${timestamp}.${fileExt}`

    // E. Request pre-signed URL from Supabase Storage API
    const { data, error: storageError } = await supabase
      .storage
      .from('submissions')
      .createSignedUploadUrl(filePath)

    if (storageError || !data) {
      throw storageError || new Error('Failed to create pre-signed URL.')
    }

    return {
      success: true,
      uploadUrl: data.signedUrl,
      token: data.token, // Upload authorization token
      filePath,
      version
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to prepare upload parameters.' }
  }
}

// 5. Commit Submission to Database
export async function finalizeSubmissionAction(
  filePath: string,
  fileName: string,
  fileSize: number,
  fileHash: string
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('acadrop-student-session')?.value

  if (!token) {
    return { success: false, error: 'Unauthorized. Session expired.' }
  }

  const supabase = createAdminClient()

  try {
    // Retrieve client IP address securely on the server
    const headersList = await headers()
    const ipAddress = headersList.get('x-forwarded-for') || '127.0.0.1'
    // A. Validate session
    const { data: session, error: sessionError } = await supabase
      .from('student_sessions')
      .select('student_id, assignment_id, student:roster_students(email)')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (sessionError || !session) {
      return { success: false, error: 'Unauthorized or expired session.' }
    }

    const { student_id, assignment_id, student } = session as any

    // B. Check if submission envelope already exists, otherwise create it
    let { data: submission } = await supabase
      .from('submissions')
      .select('id')
      .eq('assignment_id', assignment_id)
      .eq('student_id', student_id)
      .single()

    if (!submission) {
      const { data: newSub, error: newSubError } = await supabase
        .from('submissions')
        .insert({
          assignment_id,
          student_id
        })
        .select('id')
        .single()

      if (newSubError) throw newSubError
      submission = newSub
    }

    // C. Write version (the Postgres triggers will automatically assign receipt code and handle is_latest)
    const { data: newVersion, error: versionError } = await supabase
      .from('submission_versions')
      .insert({
        submission_id: submission.id,
        file_path: filePath,
        file_name: fileName,
        file_size: fileSize,
        file_hash: fileHash,
        ip_address: ipAddress
      })
      .select('id, version_number, receipt_code, submitted_at')
      .single()

    if (versionError) throw versionError

    // D. Send receipt via email if Resend is configured
    if (process.env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM_ADDRESS || 'noreply@acadrop.university.edu',
            to: student.email,
            subject: `Submission Receipt: ${newVersion.receipt_code}`,
            html: `
              <h2>Acadrop Submission Confirmation</h2>
              <p>Your assignment submission was successfully received.</p>
              <ul>
                <li><strong>Receipt Code:</strong> ${newVersion.receipt_code}</li>
                <li><strong>Filename:</strong> ${fileName}</li>
                <li><strong>Version:</strong> ${newVersion.version_number}</li>
                <li><strong>Time:</strong> ${new Date(newVersion.submitted_at).toLocaleString()}</li>
              </ul>
              <p>Please keep this receipt code for compliance and records verification.</p>
            `
          })
        })
      } catch (emailErr) {
        console.error('Failed to send Resend receipt email:', emailErr)
      }
    }

    // E. Clear student session
    await supabase.from('student_sessions').delete().eq('token', token)
    cookieStore.delete('acadrop-student-session')

    return {
      success: true,
      submissionVersionId: newVersion.id
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to finalize submission registry.' }
  }
}
