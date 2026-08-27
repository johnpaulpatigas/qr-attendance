import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import type {
  QueuedAttendanceScan,
  ClassSectionWithDetails,
  AttendanceSession,
  AttendanceRecordWithStudent,
} from '@qr-attendance/types';
import { AppStorage } from './storage';

export interface CachedStudent {
  id: string;
  lrn: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  suffix: string | null;
  grade_level?: number;
  qr_identifier: string;
  section_id: string;
}

const DB_NAME = 'qr_attendance_db';

let sqliteConnection: SQLiteConnection | null = null;
let dbConnection: SQLiteDBConnection | null = null;
let isInitialized = false;
let isNative = false;

const DB_SCHEMA = `
CREATE TABLE IF NOT EXISTS local_offline_queue (
  id TEXT PRIMARY KEY,
  client_event_id TEXT UNIQUE,
  session_id TEXT,
  class_id TEXT,
  qr_payload TEXT,
  student_name TEXT,
  student_lrn TEXT,
  status TEXT DEFAULT 'pending',
  scanned_at TEXT,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  payload_json TEXT
);

CREATE TABLE IF NOT EXISTS local_cached_students (
  id TEXT PRIMARY KEY,
  lrn TEXT UNIQUE,
  qr_identifier TEXT,
  first_name TEXT,
  last_name TEXT,
  middle_name TEXT,
  suffix TEXT,
  grade_level INTEGER,
  section_id TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_std_qr ON local_cached_students(qr_identifier);
CREATE INDEX IF NOT EXISTS idx_std_lrn ON local_cached_students(lrn);
CREATE INDEX IF NOT EXISTS idx_std_sec ON local_cached_students(section_id);

CREATE TABLE IF NOT EXISTS local_cached_sections (
  id TEXT PRIMARY KEY,
  grade_level INTEGER,
  section_name TEXT,
  room_number TEXT,
  school_year_id TEXT,
  school_year_name TEXT,
  teacher_id TEXT,
  adviser_id TEXT,
  student_count INTEGER,
  my_role TEXT,
  my_subject TEXT,
  details_json TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS local_cached_sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT,
  teacher_id TEXT,
  attendance_date TEXT,
  session_type TEXT,
  subject_name TEXT,
  started_at TEXT,
  ended_at TEXT,
  session_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_sess_lookup ON local_cached_sessions(class_id, attendance_date, session_type);

CREATE TABLE IF NOT EXISTS local_cached_records (
  id TEXT PRIMARY KEY,
  student_id TEXT,
  class_id TEXT,
  attendance_session_id TEXT,
  attendance_date TEXT,
  attendance_type TEXT,
  subject_name TEXT,
  status TEXT,
  recorded_by TEXT,
  recorded_at TEXT,
  source TEXT,
  teacher_name TEXT,
  record_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_rec_session ON local_cached_records(attendance_session_id);
CREATE INDEX IF NOT EXISTS idx_rec_student ON local_cached_records(student_id);
`;

/**
 * Initializes SQLite database connection with Native/Web detection.
 */
export async function initOfflineDatabase(): Promise<SQLiteDBConnection | null> {
  if (isInitialized && dbConnection) return dbConnection;

  try {
    isNative = Capacitor.isNativePlatform();

    if (isNative) {
      if (!sqliteConnection) {
        sqliteConnection = new SQLiteConnection(CapacitorSQLite);
      }

      const retCC = await sqliteConnection.checkConnectionsConsistency();
      const isConn = (await sqliteConnection.isConnection(DB_NAME, false)).result;

      if (retCC.result && isConn) {
        dbConnection = await sqliteConnection.retrieveConnection(DB_NAME, false);
      } else {
        dbConnection = await sqliteConnection.createConnection(
          DB_NAME,
          false,
          'no-encryption',
          1,
          false
        );
      }

      await dbConnection.open();
      await dbConnection.execute(DB_SCHEMA);
      isInitialized = true;

      // Hydrate storage queue from SQLite on boot to protect against Webview restarts
      try {
        const res = await dbConnection.query(
          'SELECT payload_json FROM local_offline_queue WHERE status = ? ORDER BY scanned_at ASC;',
          ['pending']
        );
        if (res.values && res.values.length > 0) {
          const sqliteScans: QueuedAttendanceScan[] = res.values.map((v: { payload_json: string }) =>
            JSON.parse(v.payload_json)
          );
          const storageScans = AppStorage.getJSON<QueuedAttendanceScan[]>(
            'mnhs_qr_attendance_offline_queue',
            []
          );
          const mergedMap = new Map<string, QueuedAttendanceScan>();
          sqliteScans.forEach((s) => mergedMap.set(s.id, s));
          storageScans.forEach((s) => mergedMap.set(s.id, s));
          AppStorage.setJSON('mnhs_qr_attendance_offline_queue', Array.from(mergedMap.values()));
        }
      } catch (hydrateErr) {
        console.warn('Queue hydration notice:', hydrateErr);
      }

      return dbConnection;
    }
  } catch (err) {
    console.warn('Native SQLite initialization fallback to memory/storage:', err);
  }

  isInitialized = true;
  return null;
}

// ----------------------------------------------------
// QUEUE OPERATIONS
// ----------------------------------------------------

export async function enqueueOfflineScan(scan: QueuedAttendanceScan): Promise<void> {
  const db = await initOfflineDatabase();
  if (db && isNative) {
    try {
      const sql = `
        INSERT OR REPLACE INTO local_offline_queue (
          id, client_event_id, session_id, class_id, qr_payload,
          student_name, student_lrn, status, scanned_at, retry_count, last_error, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      const values = [
        scan.id,
        scan.payload.client_event_id || scan.id,
        scan.payload.session_id,
        scan.payload.class_id,
        scan.payload.qr_payload,
        scan.student_name || null,
        scan.student_lrn || null,
        scan.status,
        scan.scanned_at,
        scan.retry_count || 0,
        scan.last_error || null,
        JSON.stringify(scan),
      ];
      await db.run(sql, values);
      return;
    } catch (err) {
      console.warn('SQLite queue insert error:', err);
    }
  }

  // Storage fallback
  const queue = AppStorage.getJSON<QueuedAttendanceScan[]>('mnhs_qr_attendance_offline_queue', []);
  const existingIdx = queue.findIndex((s) => s.id === scan.id);
  if (existingIdx >= 0) {
    queue[existingIdx] = scan;
  } else {
    queue.push(scan);
  }
  AppStorage.setJSON('mnhs_qr_attendance_offline_queue', queue);
}

export async function getQueuedOfflineScans(): Promise<QueuedAttendanceScan[]> {
  const db = await initOfflineDatabase();
  if (db && isNative) {
    try {
      const res = await db.query('SELECT payload_json FROM local_offline_queue WHERE status = ? ORDER BY scanned_at ASC;', ['pending']);
      if (res.values && res.values.length > 0) {
        return res.values.map((v: { payload_json: string }) => JSON.parse(v.payload_json));
      }
      return [];
    } catch (err) {
      console.warn('SQLite queue query error:', err);
    }
  }

  return AppStorage.getJSON<QueuedAttendanceScan[]>('mnhs_qr_attendance_offline_queue', []);
}

export async function removeQueuedOfflineScan(id: string): Promise<void> {
  const db = await initOfflineDatabase();
  if (db && isNative) {
    try {
      await db.run('DELETE FROM local_offline_queue WHERE id = ?;', [id]);
      return;
    } catch (err) {
      console.warn('SQLite queue delete error:', err);
    }
  }

  const queue = AppStorage.getJSON<QueuedAttendanceScan[]>('mnhs_qr_attendance_offline_queue', []);
  const filtered = queue.filter((s) => s.id !== id);
  AppStorage.setJSON('mnhs_qr_attendance_offline_queue', filtered);
}

export async function clearQueuedOfflineScans(): Promise<void> {
  const db = await initOfflineDatabase();
  if (db && isNative) {
    try {
      await db.run('DELETE FROM local_offline_queue;');
      return;
    } catch (err) {
      console.warn('SQLite queue clear error:', err);
    }
  }

  AppStorage.setJSON('mnhs_qr_attendance_offline_queue', []);
}

// ----------------------------------------------------
// STUDENT ROSTER OPERATIONS
// ----------------------------------------------------

export async function saveCachedStudents(students: CachedStudent[]): Promise<void> {
  if (!students || students.length === 0) return;
  const db = await initOfflineDatabase();
  if (db && isNative) {
    try {
      const now = new Date().toISOString();
      const statements: { statement: string; values: unknown[] }[] = students.map((s) => ({
        statement: `
          INSERT OR REPLACE INTO local_cached_students (
            id, lrn, qr_identifier, first_name, last_name, middle_name, suffix, grade_level, section_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        values: [
          s.id,
          s.lrn,
          s.qr_identifier || s.id,
          s.first_name,
          s.last_name,
          s.middle_name || null,
          s.suffix || null,
          s.grade_level || 0,
          s.section_id,
          now,
        ],
      }));
      await db.executeSet(statements);
    } catch (err) {
      console.warn('SQLite student insert error:', err);
    }
  }

  // Also sync with AppStorage for instant multi-layer access
  const master = AppStorage.getJSON<Record<string, CachedStudent>>('mnhs_qr_master_students_index', {});
  students.forEach((s) => {
    if (s.qr_identifier) master[s.qr_identifier] = s;
    if (s.id) master[s.id] = s;
    if (s.lrn) master[s.lrn] = s;
  });
  AppStorage.setJSON('mnhs_qr_master_students_index', master);
}

export async function findCachedStudentByQr(
  targetId: string,
  classId?: string
): Promise<CachedStudent | null> {
  const cleanTarget = targetId.replace(/^ATTENDANCE:/i, '').trim();
  if (!cleanTarget) return null;

  const db = await initOfflineDatabase();
  if (db && isNative) {
    try {
      let query = `
        SELECT id, lrn, qr_identifier, first_name, last_name, middle_name, suffix, grade_level, section_id
        FROM local_cached_students
        WHERE qr_identifier = ? OR id = ? OR lrn = ?
      `;
      const params: unknown[] = [cleanTarget, cleanTarget, cleanTarget];

      if (classId) {
        query += ` AND section_id = ?`;
        params.push(classId);
      }
      query += ` LIMIT 1;`;

      const res = await db.query(query, params);
      if (res.values && res.values.length > 0) {
        return res.values[0] as CachedStudent;
      }
    } catch (err) {
      console.warn('SQLite student lookup error:', err);
    }
  }

  // Storage fallback
  const master = AppStorage.getJSON<Record<string, CachedStudent>>('mnhs_qr_master_students_index', {});
  if (master[cleanTarget]) return master[cleanTarget];

  return null;
}

// ----------------------------------------------------
// CLASS SECTIONS OPERATIONS
// ----------------------------------------------------

export async function saveCachedSections(sections: ClassSectionWithDetails[]): Promise<void> {
  if (!sections || sections.length === 0) return;
  const db = await initOfflineDatabase();
  if (db && isNative) {
    try {
      const now = new Date().toISOString();
      const statements = sections.map((s) => ({
        statement: `
          INSERT OR REPLACE INTO local_cached_sections (
            id, grade_level, section_name, room_number, school_year_id, school_year_name,
            teacher_id, adviser_id, student_count, my_role, my_subject, details_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        values: [
          s.id,
          s.grade_level,
          s.section_name,
          s.room_number || null,
          s.school_year_id,
          s.school_year_name,
          s.teacher_id || null,
          s.adviser_id || null,
          s.student_count || 0,
          s.my_role || null,
          s.my_subject || null,
          JSON.stringify(s),
          now,
        ],
      }));
      await db.executeSet(statements);
    } catch (err) {
      console.warn('SQLite sections save error:', err);
    }
  }

  AppStorage.setJSON('teacher_cached_sections', sections);
}

export async function getCachedSections(): Promise<ClassSectionWithDetails[]> {
  const db = await initOfflineDatabase();
  if (db && isNative) {
    try {
      const res = await db.query('SELECT details_json FROM local_cached_sections ORDER BY grade_level DESC, section_name ASC;');
      if (res.values && res.values.length > 0) {
        return res.values.map((v: { details_json: string }) => JSON.parse(v.details_json));
      }
    } catch (err) {
      console.warn('SQLite sections query error:', err);
    }
  }

  return AppStorage.getJSON<ClassSectionWithDetails[]>('teacher_cached_sections', []);
}

// ----------------------------------------------------
// ATTENDANCE SESSIONS & RECORDS
// ----------------------------------------------------

export async function saveCachedSession(session: AttendanceSession): Promise<void> {
  const db = await initOfflineDatabase();
  if (db && isNative) {
    try {
      const sql = `
        INSERT OR REPLACE INTO local_cached_sessions (
          id, class_id, teacher_id, attendance_date, session_type, subject_name, started_at, ended_at, session_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `;
      await db.run(sql, [
        session.id,
        session.class_id,
        session.teacher_id,
        session.attendance_date,
        session.session_type,
        session.subject_name || null,
        session.started_at,
        session.ended_at || null,
        JSON.stringify(session),
      ]);
    } catch (err) {
      console.warn('SQLite session save error:', err);
    }
  }

  const subjPart = session.subject_name ? `_${session.subject_name.replace(/\s+/g, '_')}` : '';
  const cacheKey = `teacher_cached_session_${session.class_id}_${session.attendance_date}_${session.session_type}${subjPart}`;
  AppStorage.setJSON(cacheKey, session);
}

export async function saveCachedRecords(
  sessionId: string,
  records: AttendanceRecordWithStudent[]
): Promise<void> {
  const db = await initOfflineDatabase();
  if (db && isNative && records.length > 0) {
    try {
      const statements = records.map((r) => ({
        statement: `
          INSERT OR REPLACE INTO local_cached_records (
            id, student_id, class_id, attendance_session_id, attendance_date, attendance_type,
            subject_name, status, recorded_by, recorded_at, source, teacher_name, record_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        values: [
          r.id,
          r.student_id,
          r.class_id,
          r.attendance_session_id,
          r.attendance_date,
          r.attendance_type,
          r.subject_name || null,
          r.status,
          r.recorded_by,
          r.recorded_at,
          r.source,
          r.student ? `${r.student.first_name} ${r.student.last_name}` : null,
          JSON.stringify(r),
        ],
      }));
      await db.executeSet(statements);
    } catch (err) {
      console.warn('SQLite records save error:', err);
    }
  }

  AppStorage.setJSON(`teacher_cached_records_${sessionId}`, records);
}

export async function getCachedRecords(sessionId: string): Promise<AttendanceRecordWithStudent[]> {
  const db = await initOfflineDatabase();
  if (db && isNative) {
    try {
      const res = await db.query(
        'SELECT record_json FROM local_cached_records WHERE attendance_session_id = ? ORDER BY recorded_at DESC;',
        [sessionId]
      );
      if (res.values && res.values.length > 0) {
        return res.values.map((v: { record_json: string }) => JSON.parse(v.record_json));
      }
    } catch (err) {
      console.warn('SQLite records query error:', err);
    }
  }

  return AppStorage.getJSON<AttendanceRecordWithStudent[]>(`teacher_cached_records_${sessionId}`, []);
}
