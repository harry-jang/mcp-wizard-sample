import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Connector, ConnectorItem } from "../providers/types.js";

/**
 * provider-중립적인 tool 3종(search/read/list)을 등록한다.
 * 실제 동작은 주입된 Connector로 위임하므로, 어떤 provider든 동일한 tool이 노출된다.
 */
export function registerTools(server: McpServer, connector: Connector): void {
  server.registerTool(
    "search",
    {
      title: "Search",
      description: `${connector.id}에서 키워드로 문서/파일을 검색합니다.`,
      inputSchema: {
        query: z.string().describe("검색 키워드"),
        limit: z.number().int().min(1).max(50).optional().describe("최대 결과 수 (기본 10)"),
      },
    },
    async ({ query, limit }) => {
      const items = await connector.search(query, limit);
      return textResult(formatItems(items, `"${query}" 검색 결과`));
    },
  );

  server.registerTool(
    "read",
    {
      title: "Read",
      description: `${connector.id}의 문서/파일 본문 텍스트를 가져옵니다. id는 search/list 결과의 id를 사용하세요.`,
      inputSchema: {
        id: z.string().describe("문서/파일 id (search 또는 list 결과의 id)"),
      },
    },
    async ({ id }) => {
      const doc = await connector.read(id);
      const header = doc.url ? `# ${doc.title}\n<${doc.url}>\n` : `# ${doc.title}\n`;
      return textResult(`${header}\n${doc.text}`);
    },
  );

  server.registerTool(
    "list",
    {
      title: "List",
      description: `${connector.id}의 폴더/페이지 내용을 나열합니다. parentId가 없으면 루트를 나열합니다.`,
      inputSchema: {
        parentId: z.string().optional().describe("폴더/페이지 id (없으면 루트)"),
      },
    },
    async ({ parentId }) => {
      const items = await connector.list(parentId);
      const where = parentId ? `"${parentId}" 하위 항목` : "루트 항목";
      return textResult(formatItems(items, where));
    },
  );
}

function formatItems(items: ConnectorItem[], heading: string): string {
  if (items.length === 0) return `${heading}: (없음)`;
  const lines = items.map((it) => {
    const url = it.url ? `  <${it.url}>` : "";
    return `- [${it.type}] ${it.title}\n  id: ${it.id}${url ? `\n${url}` : ""}`;
  });
  return `${heading} (${items.length}개):\n${lines.join("\n")}`;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
