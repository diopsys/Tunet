// Tunet-Zeitschaltuhr: Zugriff auf /api/schedules im Tunet-Server.

import { apiRequest } from './settingsApi';

const json = (body) => ({ body: JSON.stringify(body) });

export const fetchSchedules = () => apiRequest('/schedules', {});
export const fetchScheduleRuns = (limit = 100) => apiRequest(`/schedules/runs?limit=${encodeURIComponent(limit)}`, {});
export const createSchedule = (schedule) => apiRequest('/schedules', { method: 'POST', ...json(schedule) });
export const updateSchedule = (id, schedule) =>
  apiRequest(`/schedules/${encodeURIComponent(id)}`, { method: 'PUT', ...json(schedule) });
export const deleteSchedule = (id) => apiRequest(`/schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const skipSchedule = (id, body) =>
  apiRequest(`/schedules/${encodeURIComponent(id)}/skip`, { method: 'POST', ...json(body) });
export const runScheduleNow = (id, kind) =>
  apiRequest(`/schedules/${encodeURIComponent(id)}/run`, { method: 'POST', ...json({ kind }) });
export const updateScheduleSettings = (settings) =>
  apiRequest('/schedules/settings', { method: 'PUT', ...json(settings) });
