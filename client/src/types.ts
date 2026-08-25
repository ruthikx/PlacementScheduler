export interface Student {
  id: string;
  name: string;
  cgpa: number;
  branch: string;
  shortlists: string[];
}

export interface Company {
  id: string;
  name: string;
  tier: 'niche' | 'mass';
  cgpaCutoff: number;
  panelsCount: number;
  durationSlots: number;
  preferredDay?: number;
}

export interface Room {
  id: string;
  name: string;
}

export interface Interview {
  id: string;
  studentId: string;
  companyId: string;
  panelIndex: number;
  roomName: string;
  day: number;
  startSlot: number;
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
  hoursLate?: number;
  startSlot?: number;
  endSlot?: number;
}

export type ReplanPolicy = 'STRICT' | 'EXTEND_DAY' | 'DROP_LOWEST_PRIORITY';

export interface ScheduleMetrics {
  percentScheduled: number;
  totalInterviews: number;
  scheduledCount: number;
  failedCount: number;
  studentClashes: number;
  roomUtilization: number;
  panelUtilization: number;
  avgWaitTime: number;
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
  notifications: string[];
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

