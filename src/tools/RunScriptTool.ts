import sql from "mssql";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getScriptManager, LoadedScript } from "../config/ScriptManager.js";
import { getEnvironmentManager } from "../config/EnvironmentManager.js";

export class RunScriptTool implements Tool {
  [key: string]: any;
  name = "run_script";
  description = "Executes a named SQL script with parameters. Scripts are pre-approved SQL templates. Use list_scripts to see available scripts.";

  inputSchema = {
    type: "object",
    properties: {
      scriptName: {
        type: "string",
        description: "Name of the script to execute (from list_scripts)",
      },
      parameters: {
        type: "object",
        description: "Parameter values for the script (key-value pairs)",
        additionalProperties: true,
      },
      preview: {
        type: "boolean",
        description: "If true, shows the resolved SQL without executing. Default: false",
      },
      confirm: {
        type: "boolean",
        description: "Required for scripts with requiresApproval or in environments with requireApproval. Set to true after reviewing preview.",
      },
      environment: {
        type: "string",
        description: "Target environment (optional, uses default if not specified)",
      },
    },
    required: ["scriptName"],
  } as any;

  async run(params: {
    scriptName: string;
    parameters?: Record<string, any>;
    preview?: boolean;
    confirm?: boolean;
    environment?: string;
    environmentPolicy?: any;
  }) {
    const { scriptName, parameters = {}, preview = false, confirm = false, environment } = params;

    const scriptManager = getScriptManager();
    const envManager = getEnvironmentManager();

    // Get the script
    const script = scriptManager.getScript(scriptName);
    if (!script) {
      const available = scriptManager.listScripts().map((s) => s.name);
      return {
        success: false,
        error: "SCRIPT_NOT_FOUND",
        message: `Script '${scriptName}' not found.`,
        availableScripts: available,
      };
    }

    // Get environment config
    const envConfig = envManager.getEnvironment(environment);
    const envName = envConfig.name;

    // Check if script can run in this environment
    const envCheck = scriptManager.canRunInEnvironment(scriptName, envName);
    if (!envCheck.allowed) {
      return {
        success: false,
        error: "SCRIPT_NOT_ALLOWED",
        message: envCheck.reason,
        script: scriptName,
        environment: envName,
      };
    }

    // Check tier compatibility
    if (script.tier) {
      const tierOrder = ["reader", "writer", "admin"];
      const scriptTierIndex = tierOrder.indexOf(script.tier);
      const envTierIndex = envConfig.tier ? tierOrder.indexOf(envConfig.tier) : 2; // default to admin

      if (envTierIndex < scriptTierIndex) {
        return {
          success: false,
          error: "INSUFFICIENT_TIER",
          message: `Script '${scriptName}' requires tier '${script.tier}' but environment '${envName}' is tier '${envConfig.tier}'.`,
          script: scriptName,
          requiredTier: script.tier,
          environmentTier: envConfig.tier,
        };
      }
    }

    // Check readonly constraints
    if (envConfig.readonly && !script.readonly) {
      return {
        success: false,
        error: "ENVIRONMENT_READONLY",
        message: `Environment '${envName}' is read-only. Script '${scriptName}' is not marked as readonly.`,
        hint: "Mark the script as readonly: true in scripts.json if it only performs SELECT operations.",
      };
    }

    // Resolve parameters
    const { sql: resolvedSql, errors } = scriptManager.resolveParameters(script, parameters);
    if (errors.length > 0) {
      return {
        success: false,
        error: "PARAMETER_ERROR",
        message: "Failed to resolve script parameters.",
        errors,
        script: scriptName,
        expectedParameters: script.parameters,
        providedParameters: parameters,
      };
    }

    // Preview mode - just return the resolved SQL
    if (preview) {
      return {
        success: true,
        preview: true,
        script: scriptName,
        description: script.description,
        environment: envName,
        resolvedSql,
        parameters: parameters,
        requiresApproval: script.requiresApproval || envConfig.requireApproval,
        hint: script.requiresApproval || envConfig.requireApproval
          ? "This script requires confirmation. Run again with confirm: true to execute."
          : "Run again with preview: false to execute.",
      };
    }

    // Check approval requirements
    const needsApproval = script.requiresApproval || envConfig.requireApproval;
    if (needsApproval && !confirm) {
      return {
        success: false,
        error: "APPROVAL_REQUIRED",
        requiresApproval: true,
        script: scriptName,
        environment: envName,
        resolvedSql,
        message: `Script '${scriptName}' requires explicit approval. Review the SQL and run again with confirm: true.`,
      };
    }

    // Execute the script
    try {
      const pool = await envManager.getConnection(envName);
      const request = pool.request();

      // For actual execution, we use parameterized queries for safety
      // Add parameters to the request
      for (const param of script.parameters || []) {
        const value = parameters[param.name] ?? param.default;
        if (value !== undefined) {
          // Map our types to SQL types
          switch (param.type) {
            case "number":
              request.input(param.name, sql.Float, value);
              break;
            case "boolean":
              request.input(param.name, sql.Bit, value);
              break;
            default:
              request.input(param.name, sql.NVarChar(sql.MAX), value);
          }
        }
      }

      const result = await request.query(script.sql);

      return {
        success: true,
        script: scriptName,
        environment: envName,
        rowsAffected: result.rowsAffected.reduce((a, b) => a + b, 0),
        recordCount: result.recordset?.length,
        data: result.recordset,
        message: `Script '${scriptName}' executed successfully.`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: "EXECUTION_ERROR",
        script: scriptName,
        environment: envName,
        message: `Script execution failed: ${error.message}`,
        sqlError: error.message,
      };
    }
  }
}
