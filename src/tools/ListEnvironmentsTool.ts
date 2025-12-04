import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getEnvironmentManager } from "../config/EnvironmentManager.js";

export class ListEnvironmentsTool implements Tool {
  [key: string]: any;
  name = "list_environments";
  description =
    "Lists all configured database environments available for connection. " +
    "Shows environment names, descriptions, access levels, and policy restrictions. " +
    "Use this to discover which environments are available before running queries.";
  inputSchema = {
    type: "object",
    properties: {
      includeDetails: {
        type: "boolean",
        description: "Include full policy details (allowedTools, deniedSchemas, etc.). Default: false",
      },
    },
    required: [],
  } as any;

  async run(params: any) {
    const { includeDetails = false } = params ?? {};

    try {
      const envManager = getEnvironmentManager();
      const environments = envManager.listEnvironments();

      const environmentList = environments.map((env) => {
        // Basic info always included
        const basic = {
          name: env.name,
          description: env.description || null,
          server: env.server,
          database: env.database,
          accessLevel: env.accessLevel || "database",
          readonly: env.readonly ?? false,
          tier: env.tier || null,
        };

        if (!includeDetails) {
          return basic;
        }

        // Full details when requested
        return {
          ...basic,
          authMode: env.authMode,
          port: env.port || 1433,
          allowedTools: env.allowedTools || null,
          deniedTools: env.deniedTools || null,
          allowedDatabases: env.allowedDatabases || null,
          deniedDatabases: env.deniedDatabases || null,
          allowedSchemas: env.allowedSchemas || null,
          deniedSchemas: env.deniedSchemas || null,
          maxRowsDefault: env.maxRowsDefault || null,
          requireApproval: env.requireApproval ?? false,
        };
      });

      // Get default environment name
      const defaultEnv = environments.find((e) =>
        e.name === (envManager as any).defaultEnvironment
      );

      return {
        success: true,
        message: `Found ${environments.length} configured environment(s)`,
        defaultEnvironment: defaultEnv?.name || environments[0]?.name || null,
        environmentCount: environments.length,
        environments: environmentList,
      };
    } catch (error) {
      console.error("Error listing environments:", error);
      return {
        success: false,
        message: `Failed to list environments: ${error}`,
        error: "LIST_ENVIRONMENTS_FAILED",
      };
    }
  }
}
