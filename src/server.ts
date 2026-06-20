import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readConfig, ConfigError } from "./config.js";
import { createConnector } from "./providers/registry.js";
import { registerTools } from "./tools/register.js";

/** stdio MCP 서버 기동. Claude Code가 이 프로세스를 실행해 stdio로 연결한다. */
export async function runServer(): Promise<void> {
  let config;
  try {
    config = readConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      // stdout은 MCP 프로토콜 전용이므로 안내는 stderr로 출력한다.
      process.stderr.write(`[wizard-connector] 설정 오류: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const connector = createConnector(config);
  const server = new McpServer({ name: "wizard-connector", version: "0.1.0" });
  registerTools(server, connector);

  await server.connect(new StdioServerTransport());
  process.stderr.write(
    `[wizard-connector] '${config.provider}' provider로 stdio MCP 서버 시작\n`,
  );
}
