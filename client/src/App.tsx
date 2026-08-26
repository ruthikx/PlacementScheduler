import { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  RotateCcw,
  UserMinus,
  Briefcase,
  Layers,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import {
  getSchedule,
  resetSchedule,
  replanSchedule,
  ReplanResponse
} from './api';
import {
  ScheduleState,
  DisruptionEvent,
  DisruptionType,
  ReplanPolicy,
  Interview
} from './types';

// Helper to convert slot index to 12h time format
function getSlotLabel(slotIndex: number): string {
  const baseHour = 9;
  const totalMinutes = slotIndex * 30;
  const hour24 = baseHour + Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  const minStr = minutes === 0 ? '00' : minutes.toString();
  return `${hour12}:${minStr} ${ampm}`;
}

export default function App() {
  const [scheduleState, setScheduleState] = useState<ScheduleState | null>(null);
  const [seed, setSeed] = useState('demo-seed-123');
  const [activeDay, setActiveDay] = useState(0); // 0 to 3
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Disruption Form State
  const [disruptionType, setDisruptionType] = useState<DisruptionType>('COMPANY_LATE');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedRoomName, setSelectedRoomName] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedPanelIndex, setSelectedPanelIndex] = useState(0);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [disruptionDay, setDisruptionDay] = useState(0);
  const [hoursLate, setHoursLate] = useState(2);
  const [startSlot, setStartSlot] = useState(2); // 10:00 AM
  const [endSlot, setEndSlot] = useState(6);   // 12:00 PM

  // Replan policy parameters
  const [policy, setPolicy] = useState<ReplanPolicy>('STRICT');
  const [maxChurn, setMaxChurn] = useState(10);

  // Active preview state
  const [previewResponse, setPreviewResponse] = useState<ReplanResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [activeDisruptions, setActiveDisruptions] = useState<DisruptionEvent[]>([]);

  // Load schedule on mount
  useEffect(() => {
    handleLoadCurrentSchedule();
  }, []);

  const handleLoadCurrentSchedule = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSchedule();
      setScheduleState(data);
      if (data.companies.length > 0) {
        setSelectedCompanyId(data.companies[0].id);
      }
      if (data.rooms.length > 0) {
        setSelectedRoomName(data.rooms[0].name);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load schedule.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    setError(null);
    setPreviewResponse(null);
    setPreviewing(false);
    setActiveDisruptions([]);
    try {
      const data = await resetSchedule(seed);
      setScheduleState(data);
      if (data.companies.length > 0) {
        setSelectedCompanyId(data.companies[0].id);
      }
      if (data.rooms.length > 0) {
        setSelectedRoomName(data.rooms[0].name);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate new schedule.');
    } finally {
      setLoading(false);
    }
  };

  // Autocomplete suggestions for student search (max 5)
  const studentSuggestions = useMemo(() => {
    if (!studentSearchQuery || !scheduleState) return [];
    const query = studentSearchQuery.toLowerCase();
    return scheduleState.students
      .filter(s => s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query))
      .filter(s => !selectedStudentIds.includes(s.id))
      .slice(0, 5);
  }, [studentSearchQuery, scheduleState, selectedStudentIds]);

  const selectedPanelCompany = useMemo(() => {
    return scheduleState?.companies.find(c => c.id === selectedCompanyId);
  }, [scheduleState, selectedCompanyId]);

  useEffect(() => {
    const panelCount = selectedPanelCompany?.panelsCount ?? 1;
    if (selectedPanelIndex >= panelCount) {
      setSelectedPanelIndex(0);
    }
  }, [selectedPanelCompany, selectedPanelIndex]);

  const selectedWithdrawalStudents = useMemo(() => {
    if (!scheduleState) return [];
    const selectedIds = new Set(selectedStudentIds);
    return scheduleState.students.filter(s => selectedIds.has(s.id));
  }, [scheduleState, selectedStudentIds]);

  // Construct current disruption event from state
  const currentDisruptionEvent = useMemo((): DisruptionEvent => {
    return {
      type: disruptionType,
      companyId: disruptionType === 'COMPANY_LATE' || disruptionType === 'PANEL_DROP' ? selectedCompanyId : undefined,
      panelIndex: disruptionType === 'PANEL_DROP' ? selectedPanelIndex : undefined,
      studentId: disruptionType === 'STUDENT_WITHDRAWAL' ? selectedStudentIds[0] : undefined,
      studentIds: disruptionType === 'STUDENT_WITHDRAWAL' ? selectedStudentIds : undefined,
      roomName: disruptionType === 'ROOM_UNAVAILABLE' ? selectedRoomName : undefined,
      day: disruptionType !== 'STUDENT_WITHDRAWAL' ? disruptionDay : undefined,
      hoursLate: disruptionType === 'COMPANY_LATE' ? hoursLate : undefined,
      startSlot: disruptionType === 'PANEL_DROP' || disruptionType === 'ROOM_UNAVAILABLE' ? startSlot : undefined,
      endSlot: disruptionType === 'ROOM_UNAVAILABLE' ? endSlot : undefined,
    };
  }, [
    disruptionType,
    selectedCompanyId,
    selectedRoomName,
    selectedStudentId,
    selectedStudentIds,
    selectedPanelIndex,
    disruptionDay,
    hoursLate,
    startSlot,
    endSlot,
  ]);

  const handlePreviewReplan = async () => {
    if (!scheduleState) return;
    setError(null);
    setLoading(true);
    try {
      const response = await replanSchedule(currentDisruptionEvent, policy, maxChurn, false);
      setPreviewResponse(response);
      setPreviewing(true);
    } catch (err: any) {
      setError(err.message || 'Failed to generate replan preview.');
    } finally {
      setLoading(false);
    }
  };

  const handleCommitReplan = async () => {
    if (!scheduleState) return;
    setError(null);
    setLoading(true);
    try {
      // If we already previewed, we can send that same disruption to commit
      const response = await replanSchedule(currentDisruptionEvent, policy, maxChurn, true);
      setScheduleState(response.schedule);
      setActiveDisruptions(prev => [...prev, currentDisruptionEvent]);
      setPreviewResponse(null);
      setPreviewing(false);
      // Reset form variables
      setStudentSearchQuery('');
      setSelectedStudentId('');
      setSelectedStudentIds([]);
    } catch (err: any) {
      setError(err.message || 'Failed to commit replan.');
    } finally {
      setLoading(false);
    }
  };

  const handleDiscardPreview = () => {
    setPreviewResponse(null);
    setPreviewing(false);
  };

  // Determine what schedule to display (Preview vs Committed)
  const displaySchedule = previewing && previewResponse ? previewResponse.schedule : scheduleState;

  // Calculate grid dimensions
  // Check if there are any interviews in slots 18-21 (after 6 PM) to show extra columns
  const showExtendedSlots = useMemo(() => {
    if (!displaySchedule) return false;
    return displaySchedule.interviews.some(i => i.day === activeDay && i.startSlot >= 18);
  }, [displaySchedule, activeDay]);

  const totalSlots = showExtendedSlots ? 22 : 18; // 18 slots = 9am to 6pm, 22 slots = 9am to 8pm
  const slotIndices = Array.from({ length: totalSlots }, (_, i) => i);

  // Check if a cell is affected by a room closure (disruption)
  const isRoomCellUnavailable = (roomName: string, day: number, slot: number): boolean => {
    // Check committed disruptions + pending preview disruptions
    const disruptions = [...activeDisruptions];
    if (previewing && currentDisruptionEvent.type === 'ROOM_UNAVAILABLE') {
      disruptions.push(currentDisruptionEvent);
    }

    return disruptions.some(d => {
      if (d.type === 'ROOM_UNAVAILABLE' && d.roomName === roomName && d.day === day) {
        return slot >= (d.startSlot || 0) && slot < (d.endSlot || 18);
      }
      return false;
    });
  };

  // Check if a panel is dropped for a slot
  const isPanelCellDropped = (companyId: string, panelIndex: number, day: number, slot: number): boolean => {
    const disruptions = [...activeDisruptions];
    if (previewing && currentDisruptionEvent.type === 'PANEL_DROP') {
      disruptions.push(currentDisruptionEvent);
    }
    return disruptions.some(d => {
      if (d.type === 'PANEL_DROP' && d.companyId === companyId && d.panelIndex === panelIndex && d.day === day) {
        return slot >= (d.startSlot || 0);
      }
      return false;
    });
  };

  // Group interviews by room, day, startSlot for quick table index resolution
  const scheduleTableData = useMemo(() => {
    const data: { [roomName: string]: { [day: number]: { [slot: number]: Interview } } } = {};
    if (!displaySchedule) return data;

    displaySchedule.rooms.forEach(r => {
      data[r.name] = { 0: {}, 1: {}, 2: {}, 3: {} };
    });

    displaySchedule.interviews.forEach(i => {
      if (data[i.roomName]) {
        data[i.roomName][i.day][i.startSlot] = i;
      }
    });

    return data;
  }, [displaySchedule]);

  if (!scheduleState) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full text-center border border-gray-200">
          <Calendar className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">The Placement Week Scheduler</h1>
          <p className="text-gray-600 mb-6 text-sm">
            Ready to initialize the whiteboard? Input a seed below to generate student shortlists and compile the initial feasible schedule.
          </p>
          <div className="mb-4">
            <label className="block text-left text-xs font-semibold text-gray-600 uppercase mb-1">PRNG Dataset Seed</label>
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. demo-seed-123"
            />
          </div>
          <button
            onClick={handleReset}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg shadow transition duration-150 ease-in-out flex items-center justify-center gap-2"
          >
            {loading ? 'Generating...' : 'Generate & Schedule'}
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const { metrics, failedInterviews, companies, rooms, students } = displaySchedule!;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 px-6 py-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-600 text-white p-1.5 rounded-lg">
              <Calendar className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900">Placement Week Scheduler</h1>
            <span className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded border border-indigo-200">
              Active: {scheduleState.seed}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Campus Placement Operations Room Whiteboard</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            <span className="text-xs font-medium text-slate-500 uppercase">PRNG Seed:</span>
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="bg-transparent border-none text-sm font-semibold text-slate-800 focus:outline-none w-28"
            />
          </div>
          <button
            onClick={handleReset}
            disabled={loading}
            className="bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold py-1.5 px-4 rounded-lg shadow-sm flex items-center gap-2 transition"
          >
            <RotateCcw className="w-4 h-4" />
            Re-seed
          </button>
        </div>
      </header>

      {/* Preview Warning Banner */}
      {previewing && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex justify-between items-center animate-pulse">
          <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            PREVIEWING REPLAN CHANGES. THESE ARE NOT SAVED TO THE WHITEBOARD.
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCommitReplan}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded shadow"
            >
              Commit Replan
            </button>
            <button
              onClick={handleDiscardPreview}
              className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold px-3 py-1.5 rounded"
            >
              Discard Preview
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left Controls & Simulator Sidebar */}
        <div className="xl:col-span-1 space-y-6">
          {/* Metrics Panel */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-500" />
              Scheduler KPIs
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-2xl font-extrabold text-indigo-600">{metrics.percentScheduled}%</span>
                <span className="block text-xs font-medium text-slate-500 mt-0.5">Scheduled</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-2xl font-extrabold text-slate-800">{metrics.scheduledCount}</span>
                <span className="block text-xs font-medium text-slate-500 mt-0.5">Appts Placed</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-2xl font-extrabold text-emerald-600">{metrics.roomUtilization}%</span>
                <span className="block text-xs font-medium text-slate-500 mt-0.5">Room Util</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                <span className="text-2xl font-extrabold text-slate-800">{metrics.avgWaitTime}m</span>
                <span className="block text-xs font-medium text-slate-500 mt-0.5">Avg Student Wait</span>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-xs">
              <span className="text-slate-500 font-medium">Failed Schedule:</span>
              <span className={`font-bold px-2 py-0.5 rounded ${failedInterviews.length > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-green-50 text-green-700'}`}>
                {failedInterviews.length} interviews
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 font-medium">Panels Util:</span>
              <span className="font-semibold text-slate-700">{metrics.panelUtilization}%</span>
            </div>
          </div>

          {/* Simulate Disruption Panel */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Simulate Disruption
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Disruption Type</label>
                <select
                  value={disruptionType}
                  onChange={(e) => {
                    setDisruptionType(e.target.value as DisruptionType);
                    setPreviewResponse(null);
                    setPreviewing(false);
                  }}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="COMPANY_LATE">Company Arriving Late</option>
                  <option value="PANEL_DROP">Panel Dropping Out</option>
                  <option value="STUDENT_WITHDRAWAL">Student Withdrawing</option>
                  <option value="ROOM_UNAVAILABLE">Room Becoming Closed</option>
                </select>
              </div>

              {/* Company late inputs */}
              {disruptionType === 'COMPANY_LATE' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Select Company</label>
                    <select
                      value={selectedCompanyId}
                      onChange={(e) => setSelectedCompanyId(e.target.value)}
                      className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.tier})</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Day</label>
                      <select
                        value={disruptionDay}
                        onChange={(e) => setDisruptionDay(parseInt(e.target.value))}
                        className="w-full text-sm border border-slate-300 rounded-lg p-2"
                      >
                        <option value={0}>Day 1</option>
                        <option value={1}>Day 2</option>
                        <option value={2}>Day 3</option>
                        <option value={3}>Day 4</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Hours Late</label>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        value={hoursLate}
                        onChange={(e) => setHoursLate(parseInt(e.target.value))}
                        className="w-full text-sm border border-slate-300 rounded-lg p-2"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Panel Drop inputs */}
              {disruptionType === 'PANEL_DROP' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Select Company</label>
                    <select
                      value={selectedCompanyId}
                      onChange={(e) => setSelectedCompanyId(e.target.value)}
                      className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.panelsCount} panels)</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Day</label>
                      <select
                        value={disruptionDay}
                        onChange={(e) => setDisruptionDay(parseInt(e.target.value))}
                        className="w-full text-sm border border-slate-300 rounded-lg p-2"
                      >
                        <option value={0}>Day 1</option>
                        <option value={1}>Day 2</option>
                        <option value={2}>Day 3</option>
                        <option value={3}>Day 4</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Panel</label>
                      <select
                        value={selectedPanelIndex}
                        onChange={(e) => setSelectedPanelIndex(parseInt(e.target.value))}
                        className="w-full text-sm border border-slate-300 rounded-lg p-2"
                      >
                        {Array.from({ length: selectedPanelCompany?.panelsCount ?? 1 }).map((_, i) => (
                          <option key={i} value={i}>Panel {i}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Start Time</label>
                    <select
                      value={startSlot}
                      onChange={(e) => setStartSlot(parseInt(e.target.value))}
                      className="w-full text-sm border border-slate-300 rounded-lg p-2"
                    >
                      {Array.from({ length: 18 }).map((_, i) => (
                        <option key={i} value={i}>{getSlotLabel(i)}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Room closed inputs */}
              {disruptionType === 'ROOM_UNAVAILABLE' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Select Room</label>
                    <select
                      value={selectedRoomName}
                      onChange={(e) => setSelectedRoomName(e.target.value)}
                      className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {rooms.map(r => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Day</label>
                    <select
                      value={disruptionDay}
                      onChange={(e) => setDisruptionDay(parseInt(e.target.value))}
                      className="w-full text-sm border border-slate-300 rounded-lg p-2"
                    >
                      <option value={0}>Day 1</option>
                      <option value={1}>Day 2</option>
                      <option value={2}>Day 3</option>
                      <option value={3}>Day 4</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Start Time</label>
                      <select
                        value={startSlot}
                        onChange={(e) => setStartSlot(parseInt(e.target.value))}
                        className="w-full text-sm border border-slate-300 rounded-lg p-2"
                      >
                        {Array.from({ length: 18 }).map((_, i) => (
                          <option key={i} value={i}>{getSlotLabel(i)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">End Time</label>
                      <select
                        value={endSlot}
                        onChange={(e) => setEndSlot(parseInt(e.target.value))}
                        className="w-full text-sm border border-slate-300 rounded-lg p-2"
                      >
                        {Array.from({ length: 19 }).map((_, i) => (
                          <option key={i} value={i} disabled={i <= startSlot}>{getSlotLabel(i)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* Student withdrawal input with Autocomplete */}
              {disruptionType === 'STUDENT_WITHDRAWAL' && (
                <div className="relative">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Search Student Name</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={studentSearchQuery}
                      onChange={(e) => {
                        setStudentSearchQuery(e.target.value);
                        setSelectedStudentId('');
                      }}
                      placeholder="Type name (e.g. Priya)"
                      className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <UserMinus className="w-5 h-5 text-slate-400 shrink-0" />
                  </div>
                  {/* Suggestions List */}
                  {studentSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                      {studentSuggestions.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedStudentId(s.id);
                            setSelectedStudentIds(prev => prev.includes(s.id) ? prev : [...prev, s.id]);
                            setStudentSearchQuery('');
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between border-b border-slate-100 last:border-none"
                        >
                          <span className="font-semibold text-slate-800">{s.name}</span>
                          <span className="text-slate-500">{s.cgpa} CGPA | {s.branch.split(' ')[0]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedWithdrawalStudents.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {selectedWithdrawalStudents.map(student => (
                        <label
                          key={student.id}
                          className="flex items-center justify-between gap-2 text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded border border-indigo-150 font-medium"
                        >
                          <span className="truncate">{student.name} ({student.id})</span>
                          <input
                            type="checkbox"
                            checked
                            onChange={() => {
                              setSelectedStudentIds(prev => prev.filter(id => id !== student.id));
                              if (selectedStudentId === student.id) {
                                setSelectedStudentId('');
                              }
                            }}
                            className="accent-indigo-600"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Replan configuration parameters */}
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                  Replan Policy
                  <span className="group relative">
                    <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-pointer" />
                    <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-48 bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg z-50">
                      STRICT: drop affected slots. EXTEND_DAY: add evening slots. DROP_LOWEST: cancel mass recruiter slots.
                    </span>
                  </span>
                </label>
                <select
                  value={policy}
                  onChange={(e) => setPolicy(e.target.value as ReplanPolicy)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:outline-none"
                >
                  <option value="STRICT">Strict (Cancel disrupted slots)</option>
                  <option value="EXTEND_DAY">Extend Day (Schedule in evening)</option>
                  <option value="DROP_LOWEST_PRIORITY">Drop Lowest Priority Company</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center text-xs font-bold text-slate-500 mb-1">
                  <span>Max Reshuffle Churn</span>
                  <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{maxChurn} appts</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={maxChurn}
                  onChange={(e) => setMaxChurn(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={handlePreviewReplan}
                disabled={loading || (disruptionType === 'STUDENT_WITHDRAWAL' && selectedStudentIds.length === 0)}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold py-2.5 px-4 rounded-lg shadow-sm transition text-center"
              >
                Preview Replan
              </button>
              <button
                onClick={handleCommitReplan}
                disabled={loading || (disruptionType === 'STUDENT_WITHDRAWAL' && selectedStudentIds.length === 0)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow-sm transition text-center"
              >
                Apply Disruption
              </button>
            </div>
            {error && <p className="text-xs text-rose-600 font-semibold">{error}</p>}
          </div>

          {/* Active Disruptions List */}
          {activeDisruptions.length > 0 && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Active Disruptions</h2>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {activeDisruptions.map((d, index) => (
                  <div key={index} className="text-xs border border-amber-100 bg-amber-50 p-2.5 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-800 block">
                        {d.type.replace('_', ' ')}
                      </span>
                      <span className="text-slate-500 block">
                        {d.type === 'COMPANY_LATE' && `Company C-${d.companyId?.split('-')[1]} late ${d.hoursLate}h on Day ${d.day! + 1}`}
                        {d.type === 'PANEL_DROP' && `Panel ${d.panelIndex} for C-${d.companyId?.split('-')[1]} dropped Day ${d.day! + 1}`}
                        {d.type === 'STUDENT_WITHDRAWAL' && `${(d.studentIds || (d.studentId ? [d.studentId] : [])).length} students withdrew`}
                        {d.type === 'ROOM_UNAVAILABLE' && `Room ${d.roomName} closed Day ${d.day! + 1}`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Dashboard Area (Grid whiteboard + preview logs) */}
        <div className="xl:col-span-3 space-y-6">
          {/* Day selection tabs */}
          <div className="flex justify-between items-center bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex gap-1.5">
              {[0, 1, 2, 3].map(d => (
                <button
                  key={d}
                  onClick={() => setActiveDay(d)}
                  className={`px-5 py-2 text-sm font-bold rounded-lg transition ${activeDay === d ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  Day {d + 1}
                </button>
              ))}
            </div>
            <div className="text-xs text-slate-400 font-medium px-4">
              9:00 AM - 6:00 PM (30m intervals)
            </div>
          </div>

          {/* Preview Logs Panel */}
          {previewing && previewResponse && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-indigo-150 pb-3">
                <h2 className="font-bold text-indigo-950 flex items-center gap-1.5">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  Replan Preview Summary ({previewResponse.diff.changes.length} adjustments)
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleCommitReplan}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-1.5 px-4 rounded shadow"
                  >
                    Commit to Whiteboard
                  </button>
                  <button
                    onClick={handleDiscardPreview}
                    className="bg-white border border-indigo-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold py-1.5 px-4 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Changes List */}
                <div>
                  <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-2">Adjusted Appointments</h3>
                  <div className="bg-white rounded-lg border border-indigo-100 p-3 max-h-48 overflow-y-auto space-y-2 text-xs">
                    {previewResponse.diff.changes.length === 0 ? (
                      <p className="text-slate-400 italic text-center py-4">No appointments relocated or changed.</p>
                    ) : (
                      previewResponse.diff.changes.map((change, idx) => (
                        <div key={idx} className="border-b border-slate-100 pb-2 last:border-none last:pb-0">
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="font-bold text-slate-900">{change.studentName}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              change.type === 'MOVED' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              change.type === 'CANCELLED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                              'bg-green-50 text-green-700 border border-green-200'
                            }`}>
                              {change.type}
                            </span>
                          </div>
                          <p className="text-slate-600 font-semibold">{change.companyName}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{change.details}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Notifications Checklist */}
                <div>
                  <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-2">Dispatch Notifications</h3>
                  <div className="bg-white rounded-lg border border-indigo-100 p-3 max-h-48 overflow-y-auto space-y-1.5 text-xs">
                    {previewResponse.diff.notifications.length === 0 ? (
                      <p className="text-slate-400 italic text-center py-4">No notifications needed.</p>
                    ) : (
                      previewResponse.diff.notifications.map((notif, idx) => (
                        <div key={idx} className="flex gap-2 items-start text-slate-600">
                          <span className="text-indigo-500 font-bold shrink-0">•</span>
                          <span>{notif}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Primary whiteboard schedule grid */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500">
                    <th className="p-3 w-32 border-r border-slate-200 sticky left-0 bg-slate-50 z-20">Room</th>
                    {slotIndices.map(s => (
                      <th key={s} className="p-2 text-center border-r border-slate-200 font-semibold w-24">
                        {getSlotLabel(s)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rooms.map(room => {
                    const rowInterviews = scheduleTableData[room.name]?.[activeDay] || {};
                    let skipCount = 0;

                    return (
                      <tr key={room.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                        {/* Room Column */}
                        <td className="p-3 font-semibold text-xs text-slate-900 bg-white border-r border-slate-200 sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {room.name}
                          </span>
                        </td>

                        {slotIndices.map(s => {
                          if (skipCount > 0) {
                            skipCount--;
                            return null;
                          }

                          // Check if cell is occupied by interview
                          const interview = rowInterviews[s];
                          if (interview) {
                            skipCount = interview.durationSlots - 1;
                            const comp = companies.find(c => c.id === interview.companyId);
                            const stud = students.find(st => st.id === interview.studentId);
                            const isNiche = comp?.tier === 'niche';

                            // Visual checks
                            const isDisruptedCell = isPanelCellDropped(interview.companyId, interview.panelIndex, activeDay, s);

                            return (
                              <td
                                key={s}
                                colSpan={interview.durationSlots}
                                className="p-1 border-r border-slate-200 align-middle"
                              >
                                <div className={`h-14 rounded-lg p-1.5 border text-[11px] overflow-hidden flex flex-col justify-between shadow-sm relative group cursor-default transition-all ${
                                  isDisruptedCell ? 'bg-red-50 border-red-300 text-red-900' :
                                  isNiche ? 'bg-indigo-50/90 border-indigo-200 text-indigo-950 hover:border-indigo-400' :
                                  'bg-emerald-50/90 border-emerald-200 text-emerald-950 hover:border-emerald-400'
                                }`}>
                                  <div className="flex justify-between items-start">
                                    <span className="font-bold truncate text-[11px] block pr-1 leading-tight">
                                      {comp?.name || 'Company'}
                                    </span>
                                    <span className="text-[9px] shrink-0 font-medium text-slate-500 uppercase">
                                      P{interview.panelIndex}
                                    </span>
                                  </div>

                                  <div className="font-semibold truncate text-[10px] block leading-tight text-slate-700">
                                    {stud?.name || 'Student'}
                                  </div>

                                  <div className="flex justify-between items-center text-[9px] text-slate-400">
                                    <span>{stud?.branch.split(' ')[0]}</span>
                                    <span className="font-bold">{stud?.cgpa} CGPA</span>
                                  </div>

                                  {/* Disruption Icon Overlay */}
                                  {isDisruptedCell && (
                                    <div className="absolute top-1 right-1">
                                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500 animate-bounce" />
                                    </div>
                                  )}

                                  {/* Tooltip on hover */}
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-56 bg-slate-900 text-white text-xs p-3 rounded-lg shadow-xl z-30 space-y-1">
                                    <p className="font-bold border-b border-slate-800 pb-1 mb-1">{stud?.name}</p>
                                    <p><span className="text-slate-400">Branch:</span> {stud?.branch}</p>
                                    <p><span className="text-slate-400">CGPA:</span> {stud?.cgpa}</p>
                                    <p><span className="text-slate-400">Company:</span> {comp?.name} ({comp?.tier})</p>
                                    <p><span className="text-slate-400">Panel:</span> Panel {interview.panelIndex + 1}</p>
                                    <p><span className="text-slate-400">Time:</span> {getSlotLabel(s)} - {getSlotLabel(s + interview.durationSlots)}</p>
                                  </div>
                                </div>
                              </td>
                            );
                          }

                          // Check if cell is blocked by room closure
                          const isRoomClosed = isRoomCellUnavailable(room.name, activeDay, s);
                          if (isRoomClosed) {
                            return (
                              <td
                                key={s}
                                className="p-1 border-r border-slate-200 bg-rose-100/50 align-middle"
                              >
                                <div className="h-14 rounded-lg border border-dashed border-rose-300 flex items-center justify-center text-rose-700 text-[10px] font-bold">
                                  Closed
                                </div>
                              </td>
                            );
                          }

                          // Render empty cell
                          return (
                            <td
                              key={s}
                              className="p-1 border-r border-slate-200 bg-slate-50/20"
                            >
                              <div className="h-14 rounded-lg border border-dashed border-slate-100 hover:border-slate-300 transition duration-75"></div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Failed / Conflict Log Accordion */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-800 flex items-center gap-1.5">
                <Briefcase className="w-5 h-5 text-indigo-500" />
                Unscheduled Shortlist Slots ({failedInterviews.length})
              </h2>
              <span className="text-xs text-slate-400">
                These students were shortlisted but couldn't be scheduled
              </span>
            </div>

            {failedInterviews.length === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-6 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Perfect placement schedule! Every shortlisted interview is assigned.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-52 overflow-y-auto pr-1">
                {failedInterviews.map((failed, idx) => {
                  const student = students.find(s => s.id === failed.studentId);
                  const company = companies.find(c => c.id === failed.companyId);
                  return (
                    <div key={idx} className="border border-rose-100 bg-rose-50/30 p-3 rounded-lg flex flex-col justify-between gap-1">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-xs text-slate-800 leading-tight">
                          {student?.name || 'Student'}
                        </span>
                        <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-100 px-1 py-0.2 rounded shrink-0">
                          {student?.cgpa} CGPA
                        </span>
                      </div>
                      <div className="text-[11px] font-semibold text-indigo-950">
                        {company?.name || 'Company'}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 italic leading-tight">
                        {failed.reason}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
