import { ScheduleState, DisruptionEvent, ReplanPolicy, ReplanDiff } from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export interface ReplanResponse {
  success: boolean;
  schedule: ScheduleState;
  diff: ReplanDiff;
  committed: boolean;
}

export async function getSchedule(): Promise<ScheduleState> {
  const res = await fetch(apiUrl('/api/schedule'));
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to fetch schedule.');
  }
  const data = await res.json();
  return data.schedule;
}

export async function resetSchedule(seed: string): Promise<ScheduleState> {
  const res = await fetch(apiUrl('/api/reset'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to reset schedule.');
  }
  const data = await res.json();
  return data.schedule;
}

export async function replanSchedule(
  disruption: DisruptionEvent,
  policy: ReplanPolicy,
  maxChurn: number,
  commit: boolean
): Promise<ReplanResponse> {
  const res = await fetch(apiUrl('/api/replan'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disruption, policy, maxChurn, commit }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to execute replan.');
  }
  return res.json();
}
