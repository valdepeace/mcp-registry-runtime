import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';

const execAsync = promisify(exec);

export class GitService {
  async cloneRepo(repoUrl: string, serverName: string): Promise<string> {
    const reposDir = path.resolve(config.reposDir);
    if (!fs.existsSync(reposDir)) {
      fs.mkdirSync(reposDir, { recursive: true });
    }

    const sanitizedName = serverName.replace(/\//g, '__').replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetDir = path.join(reposDir, sanitizedName);

    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }

    console.log(`[Git] Cloning ${repoUrl} → ${targetDir}...`);

    try {
      const { stdout, stderr } = await execAsync(
        `git clone --depth 1 "${repoUrl}" "${targetDir}"`,
        { timeout: 120000 }
      );
      if (stderr) console.warn(`[Git] Clone stderr:`, stderr);
      console.log(`[Git] Clone complete:`, stdout?.trim() || 'ok');
    } catch (err: any) {
      console.error(`[Git] Clone failed:`, err.message);
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      throw new Error(`Git clone failed: ${err.message}`);
    }

    return targetDir;
  }
}

export const gitService = new GitService();
