import * as fs from "fs";
import * as path from "path";
import { TierLevel } from "./EnvironmentManager.js";

export interface ScriptParameter {
  name: string;
  type: "string" | "number" | "boolean";
  required?: boolean;
  default?: string | number | boolean;
  description?: string;
}

export interface ScriptDefinition {
  name: string;
  description: string;
  file: string;
  parameters?: ScriptParameter[];
  allowedEnvironments?: string[];  // If set, script can only run in these environments
  deniedEnvironments?: string[];   // If set, script cannot run in these environments
  tier?: TierLevel;                // Minimum tier required to run this script
  requiresApproval?: boolean;      // Override environment's requireApproval setting
  readonly?: boolean;              // If true, script is read-only (SELECT only)
}

export interface ScriptsManifest {
  scripts: ScriptDefinition[];
}

export interface LoadedScript extends ScriptDefinition {
  sql: string;  // The actual SQL content
}

export class ScriptManager {
  private readonly scriptsPath: string | null;
  private readonly scripts: Map<string, LoadedScript> = new Map();
  private loaded: boolean = false;

  constructor(scriptsPath?: string) {
    if (scriptsPath) {
      this.scriptsPath = path.resolve(scriptsPath);
    } else if (process.env.SCRIPTS_PATH) {
      this.scriptsPath = path.resolve(process.env.SCRIPTS_PATH);
    } else {
      this.scriptsPath = null;
    }
  }

  /**
   * Load scripts from the configured path
   */
  private loadScripts(): void {
    if (this.loaded) return;
    this.loaded = true;

    if (!this.scriptsPath) {
      return;
    }

    if (!fs.existsSync(this.scriptsPath)) {
      console.warn(`Scripts path not found: ${this.scriptsPath}`);
      return;
    }

    const manifestPath = path.join(this.scriptsPath, "scripts.json");
    if (!fs.existsSync(manifestPath)) {
      console.warn(`Scripts manifest not found: ${manifestPath}`);
      return;
    }

    try {
      const manifestContent = fs.readFileSync(manifestPath, "utf-8");
      const manifest: ScriptsManifest = JSON.parse(manifestContent);

      for (const script of manifest.scripts) {
        const sqlPath = path.join(this.scriptsPath, script.file);
        if (!fs.existsSync(sqlPath)) {
          console.warn(`Script file not found: ${sqlPath}`);
          continue;
        }

        const sql = fs.readFileSync(sqlPath, "utf-8");
        this.scripts.set(script.name, {
          ...script,
          sql,
        });
      }

      console.log(`Loaded ${this.scripts.size} named script(s) from ${this.scriptsPath}`);
    } catch (error) {
      console.error(`Failed to load scripts manifest: ${error}`);
    }
  }

  /**
   * Get all available scripts
   */
  listScripts(): LoadedScript[] {
    this.loadScripts();
    return Array.from(this.scripts.values());
  }

  /**
   * Get a specific script by name
   */
  getScript(name: string): LoadedScript | undefined {
    this.loadScripts();
    return this.scripts.get(name);
  }

  /**
   * Check if a script can run in a given environment
   */
  canRunInEnvironment(scriptName: string, environmentName: string): { allowed: boolean; reason?: string } {
    const script = this.getScript(scriptName);
    if (!script) {
      return { allowed: false, reason: `Script '${scriptName}' not found` };
    }

    // Check denied environments first
    if (script.deniedEnvironments && script.deniedEnvironments.includes(environmentName)) {
      return {
        allowed: false,
        reason: `Script '${scriptName}' is not allowed in environment '${environmentName}'`
      };
    }

    // Check allowed environments if specified
    if (script.allowedEnvironments && script.allowedEnvironments.length > 0) {
      if (!script.allowedEnvironments.includes(environmentName)) {
        return {
          allowed: false,
          reason: `Script '${scriptName}' can only run in: ${script.allowedEnvironments.join(", ")}`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Resolve script parameters into the SQL template
   * Parameters in SQL use @paramName syntax
   */
  resolveParameters(
    script: LoadedScript,
    providedParams: Record<string, any>
  ): { sql: string; errors: string[] } {
    const errors: string[] = [];
    let sql = script.sql;

    // Build final parameter values with defaults
    const resolvedParams: Record<string, any> = {};

    for (const param of script.parameters || []) {
      if (providedParams[param.name] !== undefined) {
        resolvedParams[param.name] = providedParams[param.name];
      } else if (param.default !== undefined) {
        resolvedParams[param.name] = param.default;
      } else if (param.required) {
        errors.push(`Required parameter '${param.name}' not provided`);
      }
    }

    if (errors.length > 0) {
      return { sql, errors };
    }

    // Replace @paramName with actual values
    // Note: This is for preview purposes. Actual execution should use parameterized queries.
    for (const [name, value] of Object.entries(resolvedParams)) {
      const placeholder = new RegExp(`@${name}\\b`, "g");
      let replacement: string;

      if (typeof value === "string") {
        // Escape single quotes for SQL
        replacement = `'${value.replace(/'/g, "''")}'`;
      } else if (typeof value === "boolean") {
        replacement = value ? "1" : "0";
      } else if (value === null) {
        replacement = "NULL";
      } else {
        replacement = String(value);
      }

      sql = sql.replace(placeholder, replacement);
    }

    return { sql, errors: [] };
  }

  /**
   * Get the scripts path (for display/debugging)
   */
  getScriptsPath(): string | null {
    return this.scriptsPath;
  }

  /**
   * Check if scripts are configured
   */
  isConfigured(): boolean {
    return this.scriptsPath !== null;
  }
}

// Singleton instance
let scriptManagerInstance: ScriptManager | null = null;

export function getScriptManager(scriptsPath?: string): ScriptManager {
  if (!scriptManagerInstance) {
    scriptManagerInstance = new ScriptManager(scriptsPath);
  }
  return scriptManagerInstance;
}

export function initScriptManager(scriptsPath?: string): void {
  scriptManagerInstance = new ScriptManager(scriptsPath);
}
