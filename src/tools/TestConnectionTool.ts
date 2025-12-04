import sql from "mssql";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getEnvironmentManager } from "../config/EnvironmentManager.js";

export class TestConnectionTool implements Tool {
  [key: string]: any;
  name = "test_connection";
  description = "Tests connectivity to a database environment and returns status, latency, and basic server info.";

  inputSchema = {
    type: "object",
    properties: {
      environment: {
        type: "string",
        description: "Optional environment name to test. If not provided, tests the default environment.",
      },
      verbose: {
        type: "boolean",
        description: "If true, returns additional server info (version, edition, etc.)",
      },
    },
    required: [],
  } as any;

  async run(params: any) {
    const startTime = Date.now();
    const environmentName = params?.environment;
    const verbose = params?.verbose ?? false;

    try {
      const envManager = getEnvironmentManager();
      const env = envManager.getEnvironment(environmentName);

      // Get connection
      const pool = await envManager.getConnection(environmentName);
      const connectionTime = Date.now() - startTime;

      // Run a simple query to verify connectivity
      const queryStart = Date.now();
      const request = new sql.Request(pool);
      const result = await request.query("SELECT 1 AS connected");
      const queryTime = Date.now() - queryStart;

      let serverInfo: any = {
        environment: env.name,
        server: env.server,
        database: env.database,
        authMode: env.authMode,
        readonly: env.readonly ?? false,
      };

      // Get detailed server info if verbose
      if (verbose) {
        try {
          const infoRequest = new sql.Request(pool);
          const infoResult = await infoRequest.query(`
            SELECT 
              SERVERPROPERTY('ProductVersion') AS version,
              SERVERPROPERTY('ProductLevel') AS productLevel,
              SERVERPROPERTY('Edition') AS edition,
              SERVERPROPERTY('EngineEdition') AS engineEdition,
              SERVERPROPERTY('MachineName') AS machineName,
              SERVERPROPERTY('ServerName') AS serverName,
              @@VERSION AS fullVersion
          `);

          if (infoResult.recordset.length > 0) {
            const info = infoResult.recordset[0];
            serverInfo = {
              ...serverInfo,
              version: info.version,
              productLevel: info.productLevel,
              edition: info.edition,
              engineEdition: this.getEngineEditionName(info.engineEdition),
              machineName: info.machineName,
              serverName: info.serverName,
            };
          }
        } catch (infoError) {
          // Non-fatal: some queries may not work on all SQL Server editions
          serverInfo.versionInfo = "Unable to retrieve (may require elevated permissions)";
        }
      }

      const totalTime = Date.now() - startTime;

      return {
        success: true,
        message: `Successfully connected to '${env.name}' (${env.server}/${env.database})`,
        connected: true,
        latency: {
          connectionMs: connectionTime,
          queryMs: queryTime,
          totalMs: totalTime,
        },
        serverInfo,
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        message: `Failed to connect: ${errorMessage}`,
        connected: false,
        latency: {
          totalMs: totalTime,
        },
        error: this.categorizeError(errorMessage),
      };
    }
  }

  private getEngineEditionName(edition: number): string {
    const editions: Record<number, string> = {
      1: "Personal/Desktop Engine",
      2: "Standard",
      3: "Enterprise",
      4: "Express",
      5: "Azure SQL Database",
      6: "Azure Synapse Analytics",
      8: "Azure SQL Managed Instance",
      9: "Azure SQL Edge",
      11: "Azure Synapse Serverless",
    };
    return editions[edition] || `Unknown (${edition})`;
  }

  private categorizeError(message: string): { code: string; suggestion: string } {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("login failed") || lowerMessage.includes("authentication")) {
      return {
        code: "AUTH_FAILED",
        suggestion: "Check username, password, and authentication mode. For AAD, ensure the browser auth completed.",
      };
    }

    if (lowerMessage.includes("network") || lowerMessage.includes("enotfound") || lowerMessage.includes("econnrefused")) {
      return {
        code: "NETWORK_ERROR",
        suggestion: "Check SERVER_NAME, SQL_PORT, and ensure the server is reachable. Verify firewall rules.",
      };
    }

    if (lowerMessage.includes("timeout")) {
      return {
        code: "TIMEOUT",
        suggestion: "Connection timed out. Check network latency and CONNECTION_TIMEOUT setting.",
      };
    }

    if (lowerMessage.includes("certificate") || lowerMessage.includes("ssl")) {
      return {
        code: "CERTIFICATE_ERROR",
        suggestion: "Set TRUST_SERVER_CERTIFICATE=true for self-signed certs, or verify the certificate chain.",
      };
    }

    if (lowerMessage.includes("database") && lowerMessage.includes("not exist")) {
      return {
        code: "DATABASE_NOT_FOUND",
        suggestion: "Check DATABASE_NAME. The specified database may not exist or the user lacks access.",
      };
    }

    return {
      code: "UNKNOWN",
      suggestion: "Check all connection parameters and server logs for more details.",
    };
  }
}
