-- SQL Migration: Acadrop MVP Initial Schema v1.2 (Hardening Pass)
-- Location: supabase/migrations/20260605000000_initial_schema.sql

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Define Enums
create type public.assignment_status as enum ('draft', 'published', 'closed', 'archived');

-- 1. UNIVERSITIES TABLE
create table public.universities (
    id uuid default uuid_generate_v4() primary key,
    name varchar(255) not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. DEPARTMENTS TABLE
create table public.departments (
    id uuid default uuid_generate_v4() primary key,
    university_id uuid references public.universities(id) on delete cascade not null,
    name varchar(255) not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. LECTURERS TABLE
-- Primary key matches auth.users.id from Supabase Auth
create table public.lecturers (
    id uuid references auth.users(id) on delete cascade primary key,
    department_id uuid references public.departments(id) on delete restrict not null,
    first_name varchar(100) not null,
    last_name varchar(100) not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. COURSES TABLE
create table public.courses (
    id uuid default uuid_generate_v4() primary key,
    lecturer_id uuid references public.lecturers(id) on delete cascade not null,
    department_id uuid references public.departments(id) on delete restrict not null,
    code varchar(20) not null,
    name varchar(255) not null,
    academic_session varchar(50) not null, -- e.g. "2026/2027"
    semester text not null,                 -- e.g. "Semester 1"
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. ROSTER STUDENTS TABLE
create table public.roster_students (
    id uuid default uuid_generate_v4() primary key,
    course_id uuid references public.courses(id) on delete cascade not null,
    student_id varchar(50) not null, -- Student ID / Matric Number
    first_name varchar(100) not null,
    last_name varchar(100) not null,
    email varchar(255) not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_student_id_per_course unique (course_id, student_id),
    constraint unique_email_per_course unique (course_id, email)
);

create index idx_roster_students_email on public.roster_students(course_id, email);
create index idx_roster_students_matric on public.roster_students(course_id, student_id);

-- 6. ASSIGNMENTS TABLE
create table public.assignments (
    id uuid default uuid_generate_v4() primary key,
    course_id uuid references public.courses(id) on delete cascade not null,
    assignment_number integer not null, -- e.g. 1 for Assignment 1
    title varchar(255) not null,
    description text,
    due_date timestamp with time zone not null,
    allowed_extensions varchar(10)[] not null, -- e.g. ['pdf', 'zip']
    max_file_size_mb integer default 50 not null,
    status public.assignment_status default 'draft'::public.assignment_status not null,
    require_otp boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    deleted_at timestamp with time zone default null -- soft-delete support
);

-- 7. STUDENT VERIFICATIONS (For OTP verification when require_otp = true)
create table public.student_verifications (
    id uuid default uuid_generate_v4() primary key,
    assignment_id uuid references public.assignments(id) on delete cascade not null,
    email varchar(255) not null,
    otp varchar(6) not null,
    expires_at timestamp with time zone not null,
    verified boolean default false not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. SUBMISSIONS ENVELOPE (One row per student per assignment)
create table public.submissions (
    id uuid default uuid_generate_v4() primary key,
    assignment_id uuid references public.assignments(id) on delete cascade not null,
    student_id uuid references public.roster_students(id) on delete cascade not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_student_submission unique (assignment_id, student_id)
);

create index idx_submissions_lookup on public.submissions(assignment_id, student_id);

-- 9. SUBMISSION NOTES (Dedicated note table supporting note history)
create table public.submission_notes (
    id uuid default uuid_generate_v4() primary key,
    submission_id uuid references public.submissions(id) on delete cascade not null,
    lecturer_id uuid references public.lecturers(id) on delete restrict not null,
    note_text text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index idx_submission_notes_submission_id on public.submission_notes(submission_id);

-- 10. SUBMISSION VERSIONS TABLE
create table public.submission_versions (
    id uuid default uuid_generate_v4() primary key,
    submission_id uuid references public.submissions(id) on delete cascade not null,
    version_number integer not null,
    receipt_code varchar(30) not null unique,
    file_path varchar(512) not null,
    file_name varchar(255) not null,
    file_size bigint not null,
    file_hash varchar(64) not null, -- SHA-256 (hidden from UI)
    submitted_at timestamp with time zone default timezone('utc'::text, now()) not null,
    ip_address varchar(45),
    is_latest boolean default true not null
);

create index idx_submission_versions_latest on public.submission_versions(submission_id, is_latest);

-- 11. ASSIGNMENT VIEWS (Tracks student activity timeline)
create table public.assignment_views (
    id uuid default uuid_generate_v4() primary key,
    assignment_id uuid references public.assignments(id) on delete cascade not null,
    student_id uuid references public.roster_students(id) on delete cascade not null,
    viewed_at timestamp with time zone default timezone('utc'::text, now()) not null,
    
    constraint unique_view unique (assignment_id, student_id)
);

-- 12. STUDENT SESSIONS (Database-backed session management for student uploads)
create table public.student_sessions (
    id uuid default uuid_generate_v4() primary key,
    student_id uuid references public.roster_students(id) on delete cascade not null,
    assignment_id uuid references public.assignments(id) on delete cascade not null,
    token uuid default uuid_generate_v4() not null unique,
    expires_at timestamp with time zone not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index idx_student_sessions_token on public.student_sessions(token);

-- Create Sequence for Receipt Numbers
create sequence if not exists public.receipt_serial_seq start 1001;


-- ==========================================
-- SEED DATA (DEFAULT UNIVERSITY & DEPARTMENT)
-- ==========================================
insert into public.universities (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Acadrop University')
on conflict (id) do nothing;

insert into public.departments (id, university_id, name)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'General Academic Department')
on conflict (id) do nothing;


-- ==========================================
-- TRIGGERS & PL/PGSQL FUNCTIONS
-- ==========================================

-- Trigger: Automatically link lecturer to profile upon Auth Signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.lecturers (id, department_id, first_name, last_name)
    values (
        new.id,
        '00000000-0000-0000-0000-000000000002', -- Default General Department
        coalesce(new.raw_user_meta_data->>'first_name', 'Lecturer'),
        coalesce(new.raw_user_meta_data->>'last_name', 'User')
    );
    return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();


-- Trigger: Generate Serialized Human-Readable Receipt Codes
create or replace function public.generate_receipt_code()
returns trigger as $$
declare
    current_year text;
    next_serial bigint;
begin
    current_year := to_char(now(), 'YYYY');
    next_serial := nextval('public.receipt_serial_seq');
    new.receipt_code := 'ADR-' || current_year || '-' || lpad(next_serial::text, 6, '0');
    return new;
end;
$$ language plpgsql;

create trigger tr_generate_receipt_code
before insert on public.submission_versions
for each row
execute function public.generate_receipt_code();


-- Trigger: Increment Submission Version Numbers Automatically
create or replace function public.assign_submission_version_number()
returns trigger as $$
declare
    next_version integer;
begin
    select coalesce(max(version_number), 0) + 1
    into next_version
    from public.submission_versions
    where submission_id = new.submission_id;
    
    new.version_number := next_version;
    return new;
end;
$$ language plpgsql;

create trigger tr_assign_submission_version_number
before insert on public.submission_versions
for each row
execute function public.assign_submission_version_number();


-- Trigger: Enforce only one `is_latest` version per submission envelope
create or replace function public.maintain_latest_submission_version()
returns trigger as $$
begin
    -- Mark all previous versions for this envelope as not latest
    update public.submission_versions
    set is_latest = false
    where submission_id = new.submission_id
      and id <> new.id;
      
    -- Update timestamp of parent submission envelope
    update public.submissions
    set updated_at = now()
    where id = new.submission_id;
    
    return new;
end;
$$ language plpgsql;

create trigger tr_maintain_latest_submission_version
after insert on public.submission_versions
for each row
execute function public.maintain_latest_submission_version();


-- ==========================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on all tables
alter table public.universities enable row level security;
alter table public.departments enable row level security;
alter table public.lecturers enable row level security;
alter table public.courses enable row level security;
alter table public.roster_students enable row level security;
alter table public.assignments enable row level security;
alter table public.student_verifications enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_notes enable row level security;
alter table public.submission_versions enable row level security;
alter table public.assignment_views enable row level security;
alter table public.student_sessions enable row level security;

-- Universities & Departments: Read access for everyone
create policy "Anyone can read universities" on public.universities for select using (true);
create policy "Anyone can read departments" on public.departments for select using (true);

-- Lecturers: Lecturers can manage their own profiles
create policy "Lecturers can manage own profiles" on public.lecturers for all using (auth.uid() = id);

-- Courses: Lecturers manage courses they teach
create policy "Lecturers manage own courses" on public.courses for all using (lecturer_id = auth.uid());

-- Roster Students: Lecturers manage students enrolled in their courses
create policy "Lecturers manage course rosters" on public.roster_students for all
using (
    exists (
        select 1 from public.courses
        where courses.id = roster_students.course_id
          and courses.lecturer_id = auth.uid()
    )
);

-- Assignments: Lecturers manage, public can view (needed for student portal)
create policy "Lecturers manage course assignments" on public.assignments for all
using (
    exists (
        select 1 from public.courses
        where courses.id = assignments.course_id
          and courses.lecturer_id = auth.uid()
    )
);
create policy "Public can view assignments" on public.assignments for select using (true);

-- Submissions & Versions: Read/Write managed transitively by Lecturer ownership
create policy "Lecturers can read submissions" on public.submissions for select
using (
    exists (
        select 1 from public.assignments
        join public.courses on courses.id = assignments.course_id
        where assignments.id = submissions.assignment_id
          and courses.lecturer_id = auth.uid()
    )
);

create policy "Lecturers can edit submission details" on public.submissions for update
using (
    exists (
        select 1 from public.assignments
        join public.courses on courses.id = assignments.course_id
        where assignments.id = submissions.assignment_id
          and courses.lecturer_id = auth.uid()
    )
);

create policy "Lecturers can manage submission notes" on public.submission_notes for all
using (
    exists (
        select 1 from public.submissions
        join public.assignments on assignments.id = submissions.assignment_id
        join public.courses on courses.id = assignments.course_id
        where submissions.id = submission_notes.submission_id
          and courses.lecturer_id = auth.uid()
    )
);

create policy "Lecturers can read submission versions" on public.submission_versions for select
using (
    exists (
        select 1 from public.submissions
        join public.assignments on assignments.id = submissions.assignment_id
        join public.courses on courses.id = assignments.course_id
        where submissions.id = submission_versions.submission_id
          and courses.lecturer_id = auth.uid()
    )
);

-- Assignment Views, Sessions & Verifications: Public can read/insert
create policy "Public can read/write assignment views" on public.assignment_views for all using (true);
create policy "Public can read/write OTP verifications" on public.student_verifications for all using (true);
create policy "Public can read/write student sessions" on public.student_sessions for all using (true);
