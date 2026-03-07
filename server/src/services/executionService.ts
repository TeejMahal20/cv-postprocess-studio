import { spawn } from 'child_process';
import path from 'path';
import url from 'url';
import fs from 'fs/promises';
import { getSessionDir, getInputsDir, getSession, sessions } from './fileService.js';
import type { CalibrationConfig, ExecuteResponse, ExecuteResult } from '../../../shared/types.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const RUNNER_PATH = path.resolve(__dirname, '../../scripts/runner.py');

function logMemory(label: string) {
  const mem = process.memoryUsage();
  console.log(
    `[MEM ${label}] heap: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB, rss: ${(mem.rss / 1024 / 1024).toFixed(1)}MB`,
  );
}

export async function executeCode(
  sessionId: string,
  code: string,
  config: CalibrationConfig,
): Promise<ExecuteResponse> {
  console.log(`[Exec] Starting execution for session ${sessionId.slice(0, 8)}..., code: ${code.length} chars`);
  logMemory('exec-start');

  const session = getSession(sessionId);
  if (!session) {
    throw Object.assign(new Error('Session not found'), { status: 404 });
  }

  const runId = `run_${Date.now()}`;
  const sessionDir = getSessionDir(sessionId);
  const runDir = path.join(sessionDir, runId);
  const inputsDir = path.join(runDir, 'inputs');
  const outputsDir = path.join(runDir, 'outputs');

  await fs.mkdir(inputsDir, { recursive: true });
  await fs.mkdir(outputsDir, { recursive: true });

  // Copy session inputs to run inputs
  const srcInputs = getInputsDir(sessionId);
  const files = await fs.readdir(srcInputs);
  console.log(`[Exec] Copying ${files.length} input files to ${runId}`);
  for (const file of files) {
    await fs.copyFile(
      path.join(srcInputs, file),
      path.join(inputsDir, file),
    );
  }

  // Write calibration config
  await fs.writeFile(
    path.join(inputsDir, 'config.json'),
    JSON.stringify(config),
  );

  // Write the script
  const scriptPath = path.join(runDir, 'script.py');
  await fs.writeFile(scriptPath, code);

  // Execute
  const pythonPath = process.env.PYTHON_PATH || 'python';
  const timeout = parseInt(process.env.EXECUTION_TIMEOUT_MS || '30000', 10);
  const startTime = Date.now();
  console.log(`[Exec] Spawning: ${pythonPath} runner.py (timeout: ${timeout}ms)`);

  // Cap stdout/stderr to prevent OOM from chatty scripts
  const MAX_OUTPUT = 512 * 1024; // 512 KB

  return new Promise<ExecuteResponse>((resolve) => {
    const proc = spawn(pythonPath, [RUNNER_PATH, inputsDir, outputsDir, scriptPath]);
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    proc.on('error', (err) => {
      console.error(`[Exec] Process spawn error:`, err.message);
    });

    proc.stdout.on('data', (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) {
        stdout += d.toString();
        if (stdout.length > MAX_OUTPUT) {
          stdout = stdout.slice(0, MAX_OUTPUT) + '\n... [output truncated at 512 KB]';
        }
      }
    });
    proc.stderr.on('data', (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT) {
        stderr += d.toString();
        if (stderr.length > MAX_OUTPUT) {
          stderr = stderr.slice(0, MAX_OUTPUT) + '\n... [stderr truncated at 512 KB]';
        }
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`[Exec] Process timed out after ${timeout}ms, killing PID ${proc.pid}`);
      proc.kill();
    }, timeout);

    proc.on('close', async (exitCode) => {
      clearTimeout(timer);
      const executionTime = Date.now() - startTime;

      console.log(
        `[Exec] Process exited: code=${exitCode}, time=${executionTime}ms, timedOut=${timedOut}, stdout=${stdout.length} chars, stderr=${stderr.length} chars`,
      );
      logMemory('exec-process-done');

      // Read output files
      let outputFiles: string[] = [];
      try {
        outputFiles = await fs.readdir(outputsDir);
      } catch {
        // empty
      }

      // Read result.json
      let result: ExecuteResult | undefined;
      const resultPath = path.join(outputsDir, 'result.json');
      try {
        const stat = await fs.stat(resultPath);
        console.log(`[Exec] result.json size: ${(stat.size / 1024).toFixed(1)} KB`);

        if (stat.size > 50 * 1024 * 1024) {
          console.error(`[Exec] result.json is ${(stat.size / 1024 / 1024).toFixed(1)}MB — too large, skipping`);
        } else {
          const raw = await fs.readFile(resultPath, 'utf-8');
          result = JSON.parse(raw);
          if (result) result.stdout = stdout;
        }
      } catch {
        console.log(`[Exec] No result.json found`);
      }

      const success = exitCode === 0 && result !== undefined;
      console.log(
        `[Exec] Result: success=${success}, ctq_results=${result?.ctq_results?.length ?? 0}, overlays=${result?.overlays?.length ?? 0}`,
      );
      logMemory('exec-result-parsed');

      // Update session — keep only last 10 runs to avoid memory buildup
      const MAX_RUNS = 10;
      session.runs.push({
        id: runId,
        timestamp: new Date(),
        code,
        status: success ? 'success' : 'error',
        result: result || null,
      });
      if (session.runs.length > MAX_RUNS) {
        session.runs = session.runs.slice(-MAX_RUNS);
      }
      sessions.set(sessionId, session);

      resolve({
        success,
        result,
        error: success
          ? undefined
          : timedOut
            ? `Execution timed out after ${timeout}ms`
            : stderr || 'Execution failed',
        stderr: stderr || undefined,
        stdout: stdout || undefined,
        execution_time_ms: executionTime,
        run_id: runId,
        output_files: outputFiles,
      });
    });
  });
}
