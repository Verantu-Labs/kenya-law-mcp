import type { CallToolResult } from "@modelcontextprotocol/server";

// Public retrieval needs a local burst boundary even without accounts. This
// budget is per process/isolate, not a distributed or per-user quota.
export class ToolCallLimiter {
  private starts: number[] = [];
  private active = 0;

  async run(operation: () => Promise<CallToolResult>): Promise<CallToolResult> {
    const now = Date.now();
    this.starts = this.starts.filter(start => now - start < 60000);
    if (this.active >= 4 || this.starts.length >= 60) {
      return {
        isError: true,
        content: [{ type: "text", text: "Retrieval capacity reached (4 concurrent tool calls, 60 starts per minute per process). Retry after active calls finish or the minute window expires." }],
      };
    }
    this.starts.push(now);
    this.active++;
    try {
      return await operation();
    } finally {
      this.active--;
    }
  }
}

export const toolCallLimiter = new ToolCallLimiter();
