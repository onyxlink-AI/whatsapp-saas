import { applyRoutineCommand } from '../central-routines';
import type { CentralRoutineState, RoutineActor, RoutineRun } from '../central-routines';
import { applyTaskCommand } from '../central-tasks';
import type { CentralTask, CentralTaskState } from '../central-tasks';

export type MaterializeRoutineTaskInput = {
  workspaceId: string;
  routineId: string;
  runId: string;
  occurredAt: string;
  actor?: RoutineActor;
};

export type MaterializeRoutineTaskResult =
  | {
      success: true;
      routineState: CentralRoutineState;
      taskState: CentralTaskState;
      run: RoutineRun;
      task: CentralTask;
      duplicate: boolean;
    }
  | {
      success: false;
      error:
        | 'workspace_mismatch'
        | 'routine_not_found'
        | 'run_not_found'
        | 'invalid_run_status'
        | 'task_creation_failed'
        | 'run_completion_failed';
    };

function taskIdForRun(runId: string): string {
  return `routine-run-task:${runId}`;
}

export function materializeRoutineRunTask(
  routineState: CentralRoutineState,
  taskState: CentralTaskState,
  input: MaterializeRoutineTaskInput,
): MaterializeRoutineTaskResult {
  if (routineState.workspaceId !== input.workspaceId || taskState.workspaceId !== input.workspaceId) {
    return { success: false, error: 'workspace_mismatch' };
  }

  const routine = routineState.routines[input.routineId];
  if (!routine) return { success: false, error: 'routine_not_found' };
  const run = routineState.runs[input.runId];
  if (!run || run.routineId !== routine.id) return { success: false, error: 'run_not_found' };

  const taskId = taskIdForRun(run.id);
  if (run.status === 'completed' && run.taskId === taskId && taskState.tasks[taskId]) {
    return {
      success: true,
      routineState,
      taskState,
      run,
      task: taskState.tasks[taskId],
      duplicate: true,
    };
  }
  if (run.status !== 'working') return { success: false, error: 'invalid_run_status' };

  const actor = input.actor ?? { actorId: 'routine-orchestrator', role: 'system' };
  const taskResult = applyTaskCommand(taskState, {
    type: 'task.created',
    commandId: `routine-run-task-created:${run.id}`,
    taskId,
    workspaceId: input.workspaceId,
    actor,
    occurredAt: input.occurredAt,
    title: routine.taskTemplate.title,
    description: routine.taskTemplate.description,
    priority: routine.taskTemplate.priority,
    source: 'routine',
    assignedAgentId: routine.assignedAgentId,
    requiresApproval: routine.taskTemplate.requiresApproval,
  });
  if (!taskResult.success) return { success: false, error: 'task_creation_failed' };

  const runResult = applyRoutineCommand(routineState, {
    type: 'routine.run_completed',
    commandId: `routine-run-completed:${run.id}`,
    routineId: routine.id,
    runId: run.id,
    workspaceId: input.workspaceId,
    expectedRunRevision: run.revision,
    actor,
    occurredAt: input.occurredAt,
    taskId,
  });
  if (!runResult.success || !runResult.run) return { success: false, error: 'run_completion_failed' };

  return {
    success: true,
    routineState: runResult.state,
    taskState: taskResult.state,
    run: runResult.run,
    task: taskResult.task,
    duplicate: taskResult.duplicate && runResult.duplicate,
  };
}
