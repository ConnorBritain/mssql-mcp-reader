import sql from "mssql";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getEnvironmentManager } from "../config/EnvironmentManager.js";

export class ExplainQueryTool implements Tool {
  [key: string]: any;
  name = "explain_query";
  description = "Generates an estimated execution plan (SHOWPLAN_XML) for a SQL query without executing it.";

  inputSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "SQL statement to analyze (typically SELECT/UPDATE/INSERT/DELETE).",
      },
      environment: {
        type: "string",
        description: "Optional environment name to target (prod, staging, etc).",
      },
      includePlanXml: {
        type: "boolean",
        description: "If true (default), returns the raw SHOWPLAN XML. Set false for summary only.",
      },
    },
    required: ["query"],
  } as any;

  async run(params: any) {
    const { query, includePlanXml = true, environment } = params ?? {};

    if (typeof query !== "string" || !query.trim()) {
      return {
        success: false,
        message: "explain_query requires a non-empty SQL string.",
        error: "INVALID_QUERY",
      };
    }

    const sanitizedQuery = query.trim();
    const envManager = getEnvironmentManager();
    const pool = await envManager.getConnection(environment);

    let showplanEnabled = false;
    try {
      const planRequest = new sql.Request(pool);
      await planRequest.batch("SET SHOWPLAN_XML ON;");
      showplanEnabled = true;

      const explainRequest = new sql.Request(pool);
      const result = await explainRequest.query(sanitizedQuery);

      const planOutput = result.recordset?.[0];
      const planXml = this.extractPlanXml(planOutput);

      const summary = {
        success: true,
        message: "Generated estimated execution plan.",
        hasPlanXml: Boolean(planXml),
      };

      if (includePlanXml && planXml) {
        return {
          ...summary,
          planXml,
        };
      }

      return summary;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to generate plan: ${errorMessage}`,
        error: "SHOWPLAN_FAILED",
      };
    } finally {
      if (showplanEnabled) {
        try {
          const resetRequest = new sql.Request(pool);
          await resetRequest.batch("SET SHOWPLAN_XML OFF;");
        } catch {
          // ignore
        }
      }
    }
  }

  private extractPlanXml(row: any): string | null {
    if (!row) {
      return null;
    }

    const knownColumns = [
      "ShowPlanXML",
      "Microsoft SQL Server 2005 XML Showplan",
      "Plan",
    ];

    for (const column of knownColumns) {
      if (row[column]) {
        return row[column];
      }
    }

    const firstXml = Object.values(row).find((value) =>
      typeof value === "string" && value.trim().startsWith("<?xml")
    );

    return (firstXml as string | undefined) ?? null;
  }
}
