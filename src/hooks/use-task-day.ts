import { useCallback, useEffect, useMemo, useState } from 'react';
import { limitApi } from '../api';
import type { TaskStatistics, TaskWorkspace } from '../types/tasks';

type DaySnapshot = {
  day: string;
  source: string;
  attempt: number;
  workspace: TaskWorkspace | null;
  dataSource: string | null;
  error: boolean;
};

function matchesDay(statistics: TaskStatistics, day: string) {
  return statistics.range.from === day && statistics.range.to === day;
}

export function useTaskDay(
  workspace: TaskWorkspace,
  day: string,
): {
  workspace: TaskWorkspace;
  statistics: TaskStatistics | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
} {
  const [snapshot, setSnapshot] = useState<DaySnapshot | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Dashboard polling returns new arrays even when nothing changed. Compare
  // task revisions so a read-triggered notification cannot create a load loop.
  const source = useMemo(
    () =>
      JSON.stringify(
        workspace.tasks.map((task) => [
          task.id,
          task.updatedAt,
          task.trackedSeconds,
          task.sprintId,
        ]),
      ),
    [workspace.tasks],
  );
  const useGlobal = matchesDay(workspace.statistics, day);

  useEffect(() => {
    if (useGlobal) return;
    let active = true;
    const failed = () => {
      if (!active) return;
      setSnapshot((previous) => ({
        day,
        source,
        attempt,
        workspace: previous?.day === day ? previous.workspace : null,
        dataSource: previous?.day === day ? previous.dataSource : null,
        error: true,
      }));
    };
    void limitApi.getTaskWorkspace({ from: day, to: day }).then((next) => {
      if (!active) return;
      if (!matchesDay(next.statistics, day)) {
        failed();
        return;
      }
      setSnapshot({
        day,
        source,
        attempt,
        workspace: next,
        dataSource: source,
        error: false,
      });
    }, failed);
    return () => {
      active = false;
    };
  }, [day, source, useGlobal, attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  if (useGlobal) {
    return {
      workspace,
      statistics: workspace.statistics,
      loading: false,
      error: false,
      retry,
    };
  }
  const sameDay = snapshot?.day === day;
  const cached = sameDay ? snapshot.workspace : null;
  const currentRows = sameDay && snapshot.dataSource === source;
  const settled =
    sameDay && snapshot.source === source && snapshot.attempt === attempt;
  return {
    // A day fetch may materialize occurrences absent from the global snapshot.
    // The timer still follows the latest global checkpoint between fetches.
    workspace: cached
      ? {
          ...workspace,
          // A refreshed global snapshot contains all persisted occurrences.
          // Keep its newer task records actionable while day totals refresh.
          tasks: currentRows ? cached.tasks : workspace.tasks,
          statistics: cached.statistics,
          generationLimited: currentRows
            ? cached.generationLimited
            : workspace.generationLimited,
        }
      : workspace,
    statistics:
      cached && matchesDay(cached.statistics, day) ? cached.statistics : null,
    loading: !settled,
    error: Boolean(sameDay && snapshot.error),
    retry,
  };
}
