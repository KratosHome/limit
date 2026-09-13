import type { TaskItem, TaskStatistics } from '@/types/tasks';

export interface TaskDayBlock {
  task: TaskItem;
  startMinutes: number;
  endMinutes: number;
  visibleEndMinutes: number;
  estimated: boolean;
  trackedSeconds: number | null;
}

export interface TaskDayModel {
  day: string;
  plannedTasks: TaskItem[];
  scheduledBlocks: TaskDayBlock[];
  conflictTaskIds: string[];
  actualByTask: Record<string, number>;
  unionScheduledMinutes: number;
  totalEstimatedSeconds: number;
  totalDayTrackedSeconds: number | null;
  plannedTrackedSeconds: number | null;
  outsidePlanSeconds: number | null;
  completedCount: number;
  openCount: number;
  unscheduledTasks: TaskItem[];
  unplannedBacklog: TaskItem[];
  dayTimeKnown: boolean;
}

function scheduledMinutes(task: TaskItem): number | null {
  if (!task.scheduledTime) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(task.scheduledTime);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function buildTaskDayModel(
  tasks: TaskItem[],
  statistics: TaskStatistics,
  day: string,
): TaskDayModel {
  const dayTimeKnown =
    statistics.range.from === day && statistics.range.to === day;
  const actualByTask: Record<string, number> = Object.fromEntries(
    dayTimeKnown
      ? statistics.byTask.map(({ taskId, seconds }) => [taskId, seconds])
      : [],
  );
  const plannedTasks = tasks.filter(
    (task) => task.scheduledDate === day && task.status !== 'cancelled',
  );
  const scheduledBlocks: TaskDayBlock[] = [];
  const unscheduledTasks: TaskItem[] = [];

  for (const task of plannedTasks) {
    const startMinutes = scheduledMinutes(task);
    if (startMinutes === null) {
      unscheduledTasks.push(task);
      continue;
    }
    const endMinutes = startMinutes + (task.estimateMinutes ?? 0);
    scheduledBlocks.push({
      task,
      startMinutes,
      endMinutes,
      visibleEndMinutes: Math.min(endMinutes, 1440),
      estimated: task.estimateMinutes !== null,
      trackedSeconds: dayTimeKnown ? (actualByTask[task.id] ?? 0) : null,
    });
  }
  scheduledBlocks.sort(
    (a, b) => a.startMinutes - b.startMinutes || a.task.number - b.task.number,
  );

  const conflicts = new Set<string>();
  let furthestBlock: TaskDayBlock | null = null;
  let unionEnd = 0;
  let unionScheduledMinutes = 0;
  for (const block of scheduledBlocks) {
    // An unknown duration is a point marker, not an occupied interval.
    if (!block.estimated || block.endMinutes <= block.startMinutes) continue;
    if (furthestBlock && block.startMinutes < furthestBlock.endMinutes) {
      conflicts.add(furthestBlock.task.id);
      conflicts.add(block.task.id);
    }
    if (!furthestBlock || block.endMinutes > furthestBlock.endMinutes) {
      furthestBlock = block;
    }
    unionScheduledMinutes += Math.max(
      0,
      block.visibleEndMinutes - Math.max(block.startMinutes, unionEnd),
    );
    unionEnd = Math.max(unionEnd, block.visibleEndMinutes);
  }

  const completedCount = plannedTasks.filter(
    (task) => task.status === 'done',
  ).length;
  const plannedTrackedSeconds = dayTimeKnown
    ? plannedTasks.reduce((sum, task) => sum + (actualByTask[task.id] ?? 0), 0)
    : null;
  const totalDayTrackedSeconds = dayTimeKnown ? statistics.totalSeconds : null;

  return {
    day,
    plannedTasks,
    scheduledBlocks,
    conflictTaskIds: scheduledBlocks
      .filter((block) => conflicts.has(block.task.id))
      .map((block) => block.task.id),
    actualByTask,
    unionScheduledMinutes,
    totalEstimatedSeconds: plannedTasks.reduce(
      (sum, task) => sum + (task.estimateMinutes ?? 0) * 60,
      0,
    ),
    totalDayTrackedSeconds,
    plannedTrackedSeconds,
    outsidePlanSeconds:
      totalDayTrackedSeconds !== null && plannedTrackedSeconds !== null
        ? Math.max(0, totalDayTrackedSeconds - plannedTrackedSeconds)
        : null,
    completedCount,
    openCount: plannedTasks.length - completedCount,
    unscheduledTasks,
    unplannedBacklog: tasks.filter(
      (task) =>
        task.scheduledDate === null &&
        task.status !== 'done' &&
        task.status !== 'cancelled',
    ),
    dayTimeKnown,
  };
}
