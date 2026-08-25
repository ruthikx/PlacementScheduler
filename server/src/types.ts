export interface Student {
  id: string;
  name: string;
  cgpa: number;
  branch: string;
  shortlists: string[]; // List of company IDs that shortlisted this student
}

export interface Company {
  id: string;
  name: string;
  tier: 'niche' | 'mass';
  cgpaCutoff: number;
  panelsCount: number; // Number of parallel panels running interviews
  durationSlots: number; // Duration of an interview in 30-min slots (e.g. 1 = 30m, 2 = 60m)
  preferredDay?: number; // 0-indexed day preference (e.g. Day 1 is index 0)
}

export interface Room {
  id: string;
  name: string;
}

export interface Interview {
  id: string;
  studentId: string;
  companyId: string;
  panelIndex: number; // 0 to panelsCount-1
  roomName: string;
  day: number; // 0 to 3 (4 days)
  startSlot: number; // 0 to 17 (9:00 AM to 6:00 PM, 30m slots)
  durationSlots: number;
}

export type DisruptionType = 'COMPANY_LATE' | 'PANEL_DROP' | 'STUDENT_WITHDRAWAL' | 'ROOM_UNAVAILABLE';

export interface DisruptionEvent {
  type: DisruptionType;
  companyId?: string;
  studentId?: string;
  panelIndex?: number;
  roomName?: string;
  day?: number;
  hoursLate?: number; // For COMPANY_LATE
  startSlot?: number; // For PANEL_DROP and ROOM_UNAVAILABLE
  endSlot?: number; // For ROOM_UNAVAILABLE
}

export type ReplanPolicy = 'STRICT' | 'EXTEND_DAY' | 'DROP_LOWEST_PRIORITY';

export interface ScheduleMetrics {
  percentScheduled: number;
  totalInterviews: number;
  scheduledCount: number;
  failedCount: number;
  studentClashes: number;
  roomUtilization: number; // % of slots occupied across all rooms
  panelUtilization: number; // % of slots occupied across all company panels
  avgWaitTime: number; // average wait time in minutes for students with multiple interviews on the same day
}

export interface FailedInterview {
  studentId: string;
  companyId: string;
  reason: string;
}

export interface DiffItem {
  type: 'MOVED' | 'CANCELLED' | 'RECOVERED';
  studentName: string;
  companyName: string;
  details: string;
}

export interface ReplanDiff {
  changes: DiffItem[];
  notifications: string[]; // List of strings detailing who to notify (e.g. "Notify Student Priya Sharma & Google Rep")
}

export interface ScheduleState {
  seed: string;
  students: Student[];
  companies: Company[];
  rooms: Room[];
  interviews: Interview[];
  failedInterviews: FailedInterview[];
  metrics: ScheduleMetrics;
}

