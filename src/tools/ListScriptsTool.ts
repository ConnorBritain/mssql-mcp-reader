import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getScriptManager } from "../config/ScriptManager.js";

export class ListScriptsTool implements Tool {
  [key: string]: any;
  name = "list_scripts";
  description = "Lists available named SQL scripts. Scripts are pre-approved SQL templates that can be executed with parameters.";

  inputSchema = {
    type: "object",
    properties: {
      environment: {
        type: "string",
        description: "Filter scripts to those allowed in this environment (optional)",
      },
      tier: {
        type: "string",
        enum: ["reader", "writer", "admin"],
        description: "Filter scripts by minimum tier requirement (optional)",
      },
    },
    required: [],
  } as any;

  async run(params?: { environment?: string; tier?: string }) {
    const scriptManager = getScriptManager();

    if (!scriptManager.isConfigured()) {
      return {
        success: false,
        message: "Named scripts are not configured. Set scriptsPath in environments.json or SCRIPTS_PATH env var.",
        scriptsPath: null,
        scripts: [],
      };
    }

    const allScripts = scriptManager.listScripts();

    if (allScripts.length === 0) {
      return {
        success: true,
        message: "No scripts found in scripts directory.",
        scriptsPath: scriptManager.getScriptsPath(),
        scripts: [],
      };
    }

    // Filter by environment if specified
    let filteredScripts = allScripts;
    if (params?.environment) {
      filteredScripts = filteredScripts.filter((script) => {
        const check = scriptManager.canRunInEnvironment(script.name, params.environment!);
        return check.allowed;
      });
    }

    // Filter by tier if specified
    if (params?.tier) {
      const tierOrder = ["reader", "writer", "admin"];
      const requestedTierIndex = tierOrder.indexOf(params.tier);

      filteredScripts = filteredScripts.filter((script) => {
        if (!script.tier) return true; // No tier restriction
        const scriptTierIndex = tierOrder.indexOf(script.tier);
        return scriptTierIndex <= requestedTierIndex;
      });
    }

    // Map to output format (exclude SQL content for listing)
    const scriptsOutput = filteredScripts.map((script) => ({
      name: script.name,
      description: script.description,
      parameters: script.parameters?.map((p) => ({
        name: p.name,
        type: p.type,
        required: p.required ?? false,
        default: p.default,
        description: p.description,
      })),
      tier: script.tier,
      requiresApproval: script.requiresApproval,
      readonly: script.readonly,
      allowedEnvironments: script.allowedEnvironments,
      deniedEnvironments: script.deniedEnvironments,
    }));

    return {
      success: true,
      scriptsPath: scriptManager.getScriptsPath(),
      totalScripts: allScripts.length,
      filteredCount: scriptsOutput.length,
      scripts: scriptsOutput,
    };
  }
}
