import type { DateRange } from './navigation';

export type TaskStatus =
  'backlog' | 'todo' | 'in-progress' | 'done' | 'cancelled';
export type TaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';
export interface TaskRepeatInput {
  frequency: 'weekly' | 'monthly';
  days: number[];
  until: string | null;
}
export interface TaskInput {
  id?: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  scheduledDate: string | null;
  scheduledTime: string | null;
  dueDate: string | null;
  estimateMinutes: number | null;
  appIds: string[];
  sprintId: string | null;
  repeat?: TaskRepeatInput | null;
}
export interface TaskItem extends Omit<TaskInput, 'id' | 'repeat'> {
  id: string;
  number: number;
  recurrenceId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  trackedSeconds: number;
}
export interface TaskRecurrence extends TaskRepeatInput {
  id: string;
  title: string;
  startDate: string;
  enabled: boolean;
}
export interface SprintInput {
  id?: string;
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
  status: 'planned' | 'active' | 'completed';
}
export interface TaskSprint extends Omit<SprintInput, 'id'> {
  id: string;
  totalTasks: number;
  completedTasks: number;
  trackedSeconds: number;
  estimatedMinutes: number;
}
export interface TaskStatistics {
  range: DateRange;
  totalSeconds: number;
  completedCount: number;
  openCount: number;
  overdueCount: number;
  days: { day: string; seconds: number; completed: number }[];
  byTask: { taskId: string; title: string; seconds: number }[];
  byApp: { appId: string | null; seconds: number }[];
}
export interface TaskTimerState {
  taskId: string | null;
  state: 'idle' | 'running' | 'waiting' | 'paused';
  reason: 'app' | 'tracking' | 'locked' | 'error' | null;
  sessionSeconds: number;
}
export interface TaskWorkspace {
  generationLimited?: boolean;
  tasks: TaskItem[];
  sprints: TaskSprint[];
  recurrences: TaskRecurrence[];
  statistics: TaskStatistics;
  timer: TaskTimerState;
}
