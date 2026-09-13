const { AppError, ERROR_CODES } = require('./errors.cjs');

// A single explicitly selected task owns the timer. Only short runtime
// intervals are saved; restarting Limit never counts the time it was closed.
function createTaskController({
  store,
  getContext,
  notify,
  now = Date.now,
  monotonic = () => performance.now(),
}) {
  let taskId = null;
  let paused = false;
  let failed = false;
  let sessionSeconds = 0;
  let anchor = null;
  let pending = null;
  let interval = null;
  let disposed = false;
  let lastState = '';

  function changed() {
    try {
      notify();
    } catch {
      /* A saved checkpoint remains saved if a window closes. */
    }
  }
  function currentCondition() {
    if (!taskId) return { state: 'idle', reason: null, appId: null };
    if (failed) return { state: 'paused', reason: 'error', appId: null };
    if (paused) return { state: 'paused', reason: null, appId: null };
    const task = store.getTask(taskId);
    if (!task || ['done', 'cancelled'].includes(task.status))
      return { state: 'idle', reason: null, appId: null };
    const context = getContext();
    if (context.locked)
      return { state: 'waiting', reason: 'locked', appId: null };
    if (!context.trackingEnabled)
      return { state: 'waiting', reason: 'tracking', appId: null };
    if (
      task.appIds.length &&
      (!context.appReady || !task.appIds.includes(context.appId))
    )
      return { state: 'waiting', reason: 'app', appId: null };
    return {
      state: 'running',
      reason: null,
      appId: task.appIds.length ? context.appId : null,
    };
  }
  function state() {
    const condition = currentCondition();
    return {
      taskId,
      state: condition.state,
      reason: condition.reason,
      sessionSeconds,
    };
  }
  function announce() {
    const next = state();
    const signature = `${next.taskId}:${next.state}:${next.reason}`;
    if (signature !== lastState) {
      lastState = signature;
      changed();
    }
  }
  function flush() {
    if (!pending) return;
    const result = store.addTaskTime({
      taskId: pending.taskId,
      startedAt: new Date(pending.start).toISOString(),
      endedAt: new Date(pending.end).toISOString(),
      appId: pending.appId,
    });
    if (!result) throw new AppError(ERROR_CODES.INVALID_TASK);
    pending = null;
    changed();
  }
  function checkpoint(force = false) {
    if (disposed) return;
    try {
      const wall = now();
      const mono = monotonic();
      const condition = currentCondition();
      const elapsed = anchor ? mono - anchor.mono : 0;
      const valid =
        anchor &&
        elapsed > 0 &&
        elapsed <= 30_000 &&
        Math.abs(wall - anchor.wall - elapsed) < 2000 &&
        anchor.condition.state === 'running' &&
        condition.state === 'running' &&
        anchor.condition.appId === condition.appId;
      if (!valid && pending) flush();
      if (valid) {
        if (
          pending &&
          (pending.appId !== condition.appId || wall - pending.start > 30_000)
        )
          flush();
        pending ||= {
          taskId,
          start: wall - elapsed,
          end: wall,
          appId: condition.appId,
        };
        pending.end = wall;
        sessionSeconds += elapsed / 1000;
      }
      anchor = { wall, mono, condition };
      if (force || (pending && pending.end - pending.start >= 5000)) flush();
      if (condition.state === 'idle' && taskId) reset();
      announce();
    } catch (error) {
      const wasFailed = failed;
      failed = true;
      anchor = null;
      // A dashboard refresh can call checkpoint again. Announce the failure
      // once so a persistent disk error cannot create a refresh/retry loop.
      if (!wasFailed) announce();
      if (force) throw error;
    }
  }
  function reset() {
    taskId = null;
    paused = false;
    failed = false;
    sessionSeconds = 0;
    anchor = null;
  }
  function mutate(action) {
    if (disposed) throw new AppError(ERROR_CODES.INVALID_TASK);
    checkpoint(true);
    const result = action();
    if (taskId) {
      const task = store.getTask(taskId);
      if (!task || ['done', 'cancelled'].includes(task.status)) reset();
    }
    anchor = taskId
      ? { wall: now(), mono: monotonic(), condition: currentCondition() }
      : null;
    changed();
    return result;
  }
  return {
    state,
    checkpoint,
    start() {
      if (disposed || interval) return;
      interval = setInterval(() => checkpoint(), 1000);
      interval.unref();
    },
    workspace(range) {
      checkpoint();
      return {
        ...store.getTaskWorkspace(range, new Date(now())),
        timer: state(),
      };
    },
    save: (input) => mutate(() => store.saveTask(input, new Date(now()))),
    setStatus: (id, status) =>
      mutate(() => store.setTaskStatus(id, status, new Date(now()))),
    delete: (id) => mutate(() => store.deleteTask(id)),
    saveSprint: (input) => mutate(() => store.saveTaskSprint(input)),
    deleteSprint: (id) => mutate(() => store.deleteTaskSprint(id)),
    disableRecurrence: (id) =>
      mutate(() => store.disableTaskRecurrence(id, new Date(now()))),
    startTimer(id) {
      if (disposed) throw new AppError(ERROR_CODES.INVALID_TASK);
      const task = store.getTask(id);
      if (!task || ['done', 'cancelled'].includes(task.status))
        throw new AppError(ERROR_CODES.INVALID_TASK);
      checkpoint(true);
      // A failed checkpoint must be retried before another task can own time.
      flush();
      if (task.status !== 'in-progress')
        store.setTaskStatus(id, 'in-progress', new Date(now()));
      if (taskId !== id) sessionSeconds = 0;
      taskId = id;
      paused = false;
      failed = false;
      anchor = {
        wall: now(),
        mono: monotonic(),
        condition: currentCondition(),
      };
      changed();
      return state();
    },
    pauseTimer() {
      checkpoint(true);
      paused = Boolean(taskId);
      anchor = null;
      changed();
      return state();
    },
    stopTimer() {
      checkpoint(true);
      flush();
      reset();
      changed();
      return state();
    },
    dispose() {
      if (disposed) return;
      try {
        checkpoint(true);
      } catch {
        /* Storage status exposes the failure; do not count time after exit. */
      }
      clearInterval(interval);
      interval = null;
      disposed = true;
    },
  };
}
module.exports = { createTaskController };
