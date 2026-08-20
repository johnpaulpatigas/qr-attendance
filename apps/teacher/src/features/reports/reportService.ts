import { getSupabaseClient } from '@qr-attendance/supabase';
import type { StudentWithSection, AttendanceRecord } from '@qr-attendance/types';

export interface SF2StudentRow {
  student: StudentWithSection;
  dailyStatus: Record<number, 'present' | 'late' | 'absent' | null>; // dayOfMonth -> status
  totalAbsences: number;
  totalTardy: number;
  totalPresent: number;
}

export interface SF2ReportData {
  schoolName: string;
  schoolId: string;
  district: string;
  division: string;
  region: string;
  gradeLevel: number;
  sectionName: string;
  schoolYear: string;
  monthName: string;
  month: number;
  year: number;
  schoolDays: number[];
  maleStudents: SF2StudentRow[];
  femaleStudents: SF2StudentRow[];
  maleTotalAbsent: number;
  maleTotalTardy: number;
  femaleTotalAbsent: number;
  femaleTotalTardy: number;
  totalEnrollment: number;
  averageDailyAttendance: number;
  attendancePercentage: number;
}

export interface DailyReportRow {
  studentId: string;
  lrn: string;
  studentName: string;
  sex: string;
  status: string;
  recordedAt: string | null;
  source: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export async function fetchDailyReport(
  classId: string,
  dateStr: string
): Promise<DailyReportRow[]> {
  const client = getSupabaseClient();
  try {
    const { data: students } = await client
      .from('students')
      .select('*')
      .eq('section_id', classId)
      .order('last_name', { ascending: true });

    if (!students || students.length === 0) {
      return [];
    }

    const studentList = students as StudentWithSection[];

    const { data: attendance } = await client
      .from('attendance')
      .select('*')
      .eq('class_id', classId)
      .eq('attendance_date', dateStr);

    const attMap = new Map<string, AttendanceRecord>();
    if (attendance && Array.isArray(attendance)) {
      attendance.forEach((a: any) => {
        attMap.set(a.student_id, a);
      });
    }

    return studentList.map((s) => {
      const att = attMap.get(s.id);
      const fullName = `${s.last_name}, ${s.first_name} ${s.middle_name || ''} ${s.suffix || ''}`.trim();
      return {
        studentId: s.id,
        lrn: s.lrn,
        studentName: fullName,
        sex: s.sex,
        status: att ? att.status : 'unrecorded',
        recordedAt: att ? att.recorded_at : null,
        source: att ? att.source : '—',
      };
    });
  } catch {
    return [];
  }
}

export async function generateSF2Report(
  classId: string,
  year: number,
  month: number // 1-12
): Promise<SF2ReportData> {
  const client = getSupabaseClient();

  // Determine weekdays in month
  const daysInMonth = new Date(year, month, 0).getDate();
  const schoolDays: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclude Sun (0) and Sat (6)
      schoolDays.push(d);
    }
  }

  // Fetch real students from database for class
  let students: StudentWithSection[] = [];
  let sectionName = 'Unassigned';
  let gradeLevel = 10;
  let schoolYearName = '2026-2027';

  try {
    const { data, error } = await client
      .from('students')
      .select(`
        *,
        class_sections (
          section_name,
          grade_level
        ),
        school_years (
          name
        )
      `)
      .eq('section_id', classId)
      .order('last_name', { ascending: true });

    if (!error && data && data.length > 0) {
      students = (data as any[]).map((d) => ({
        ...d,
        section_name: d.class_sections?.section_name || 'Section',
        school_year_name: d.school_years?.name || '2026-2027',
      }));
      sectionName = students[0].section_name || sectionName;
      gradeLevel = students[0].grade_level || gradeLevel;
      schoolYearName = students[0].school_year_name || schoolYearName;
    }
  } catch (err) {
    console.warn('Could not fetch students for SF2:', err);
  }

  // Fetch real attendance records for the entire month
  const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const attKeyMap = new Map<string, 'present' | 'late' | 'absent'>();
  try {
    const { data: attData } = await client
      .from('attendance')
      .select('*')
      .eq('class_id', classId)
      .gte('attendance_date', startStr)
      .lte('attendance_date', endStr);

    if (attData && Array.isArray(attData)) {
      attData.forEach((a: any) => {
        const day = Number(a.attendance_date.split('-')[2]);
        attKeyMap.set(`${a.student_id}_${day}`, a.status);
      });
    }
  } catch (err) {
    console.warn('Could not fetch monthly attendance:', err);
  }

  const buildStudentRows = (list: StudentWithSection[]): SF2StudentRow[] => {
    return list.map((student) => {
      const dailyStatus: Record<number, 'present' | 'late' | 'absent' | null> = {};
      let totalAbsences = 0;
      let totalTardy = 0;
      let totalPresent = 0;

      schoolDays.forEach((day) => {
        const st = attKeyMap.get(`${student.id}_${day}`);
        if (st === 'present') {
          dailyStatus[day] = 'present';
          totalPresent++;
        } else if (st === 'late') {
          dailyStatus[day] = 'late';
          totalTardy++;
          totalPresent++;
        } else if (st === 'absent') {
          dailyStatus[day] = 'absent';
          totalAbsences++;
        } else {
          // Strictly unrecorded / no session on this day
          dailyStatus[day] = null;
        }
      });

      return {
        student,
        dailyStatus,
        totalAbsences,
        totalTardy,
        totalPresent,
      };
    });
  };

  const maleRows = buildStudentRows(students.filter((s) => s.sex === 'MALE'));
  const femaleRows = buildStudentRows(students.filter((s) => s.sex === 'FEMALE'));

  const maleTotalAbsent = maleRows.reduce((sum, r) => sum + r.totalAbsences, 0);
  const maleTotalTardy = maleRows.reduce((sum, r) => sum + r.totalTardy, 0);
  const femaleTotalAbsent = femaleRows.reduce((sum, r) => sum + r.totalAbsences, 0);
  const femaleTotalTardy = femaleRows.reduce((sum, r) => sum + r.totalTardy, 0);

  const totalEnrollment = students.length;
  const totalSchoolDaysCount = Math.max(1, schoolDays.length);
  const totalDailyAttendance = (maleRows.reduce((s, r) => s + r.totalPresent, 0) + femaleRows.reduce((s, r) => s + r.totalPresent, 0));
  const ada = totalEnrollment > 0 ? Number((totalDailyAttendance / totalSchoolDaysCount).toFixed(1)) : 0;
  const attendancePercentage = totalEnrollment > 0 ? Number((((ada / totalEnrollment) * 100)).toFixed(1)) : 0;

  return {
    schoolName: 'DepEd School',
    schoolId: '301234',
    district: 'District II',
    division: 'Division of Schools',
    region: 'Region',
    gradeLevel,
    sectionName,
    schoolYear: schoolYearName,
    monthName: MONTH_NAMES[month - 1] || 'August',
    month,
    year,
    schoolDays,
    maleStudents: maleRows,
    femaleStudents: femaleRows,
    maleTotalAbsent,
    maleTotalTardy,
    femaleTotalAbsent,
    femaleTotalTardy,
    totalEnrollment,
    averageDailyAttendance: ada,
    attendancePercentage: Math.min(100, attendancePercentage),
  };
}
