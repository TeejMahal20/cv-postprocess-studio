import { spawn } from 'child_process';
import path from 'path';
import url from 'url';
import fs from 'fs/promises';
import { getSessionDir, getInputsDir, getSession, sessions } from './fileService.js';
import type { CalibrationConfig, ExecuteResponse, ExecuteResult } from '../../../shared/types.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const RUNNER_PATH = path.resolve(__dirname, '../../scripts/runner.py');

export async function executeCode(
  sessionId: string,
  code: string,
  config: CalibrationConfig,
): Promise<ExecuteResponse> {
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

  return new Promise<ExecuteResponse>((resolve) => {
    const proc = spawn(pythonPath, [RUNNER_PATH, inputsDir, outputsDir, scriptPath]);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      proc.kill();
    }, timeout);

    proc.on('close', async (exitCode) => {
      clearTimeout(timer);
      const executionTime = Date.now() - startTime;

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
        const raw = await fs.readFile(resultPath, 'utf-8');
        result = JSON.parse(raw);
        if (result) result.stdout = stdout;
      } catch {
        // no result.json
      }

      const success = exitCode === 0 && result !== undefined;

      // Update session
      session.runs.push({
        id: runId,
        timestamp: new Date(),
        code,
        status: success ? 'success' : 'error',
        result: result || null,
      });
      sessions.set(sessionId, session);

      resolve({
        success,
        result,
        error: success ? undefined : stderr || 'Execution failed',
        stderr: stderr || undefined,
        stdout: stdout || undefined,
        execution_time_ms: executionTime,
        run_id: runId,
        output_files: outputFiles,
      });
    });
  });
}
