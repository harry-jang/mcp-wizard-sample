import { Client, isFullPage, isFullBlock } from "@notionhq/client";
import type {
  Connector,
  ConnectorDocument,
  ConnectorItem,
  VerifyResult,
} from "./types.js";

export interface NotionConfig {
  token: string;
}

/**
 * Notion 커넥터.
 *
 * 인증: 내부 integration 토큰 (NOTION_TOKEN).
 * integration이 "연결"된 페이지/DB만 검색·조회된다.
 */
export class NotionConnector implements Connector {
  readonly id = "notion" as const;
  private readonly client: Client;

  constructor(config: NotionConfig) {
    this.client = new Client({ auth: config.token });
  }

  async verify(): Promise<VerifyResult> {
    try {
      const me = await this.client.users.me({});
      const account =
        me.type === "bot" ? me.bot?.workspace_name ?? me.name ?? "Notion" : me.name ?? "Notion";
      return { ok: true, account: account ?? "Notion" };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  }

  async search(query: string, limit = 10): Promise<ConnectorItem[]> {
    const res = await this.client.search({
      query,
      page_size: limit,
      sort: { direction: "descending", timestamp: "last_edited_time" },
    });
    return res.results.map((r) => this.toItem(r)).filter((x): x is ConnectorItem => x !== null);
  }

  async list(parentId?: string): Promise<ConnectorItem[]> {
    // parentId가 없으면 integration에 연결된 전체 항목을 나열(빈 검색).
    if (!parentId) {
      const res = await this.client.search({
        page_size: 50,
        sort: { direction: "descending", timestamp: "last_edited_time" },
      });
      return res.results.map((r) => this.toItem(r)).filter((x): x is ConnectorItem => x !== null);
    }
    // parentId가 있으면 해당 페이지의 자식 블록을 나열.
    const items: ConnectorItem[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.client.blocks.children.list({
        block_id: parentId,
        start_cursor: cursor,
        page_size: 100,
      });
      for (const block of res.results) {
        if (!isFullBlock(block)) continue;
        if (block.has_children || block.type === "child_page" || block.type === "child_database") {
          items.push({
            id: block.id,
            title: blockTitle(block),
            type: block.type === "child_database" ? "document" : "page",
          });
        }
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return items;
  }

  async read(id: string): Promise<ConnectorDocument> {
    const page = await this.client.pages.retrieve({ page_id: id });
    const title = isFullPage(page) ? pageTitle(page) : "Untitled";
    const url = isFullPage(page) ? page.url : undefined;

    const lines: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.client.blocks.children.list({
        block_id: id,
        start_cursor: cursor,
        page_size: 100,
      });
      for (const block of res.results) {
        if (!isFullBlock(block)) continue;
        const line = blockToText(block);
        if (line) lines.push(line);
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);

    return { title, text: lines.join("\n"), url };
  }

  private toItem(result: unknown): ConnectorItem | null {
    const r = result as Record<string, any>;
    if (r.object === "page") {
      return {
        id: r.id,
        title: pageTitle(r),
        type: "page",
        url: r.url,
        modifiedAt: r.last_edited_time,
      };
    }
    if (r.object === "database") {
      const title = plainText(r.title);
      return {
        id: r.id,
        title: title || "Untitled database",
        type: "document",
        url: r.url,
        modifiedAt: r.last_edited_time,
      };
    }
    return null;
  }
}

// --- helpers ---

function pageTitle(page: Record<string, any>): string {
  const props = page.properties ?? {};
  for (const value of Object.values<any>(props)) {
    if (value?.type === "title") {
      const t = plainText(value.title);
      if (t) return t;
    }
  }
  return "Untitled";
}

function blockTitle(block: Record<string, any>): string {
  if (block.type === "child_page") return block.child_page?.title ?? "Untitled page";
  if (block.type === "child_database") return block.child_database?.title ?? "Untitled database";
  return blockToText(block) || "Untitled";
}

function blockToText(block: Record<string, any>): string {
  const data = block[block.type];
  if (data?.rich_text) return plainText(data.rich_text);
  if (block.type === "child_page") return `# ${data?.title ?? ""}`;
  return "";
}

function plainText(rich: Array<{ plain_text?: string }> | undefined): string {
  if (!Array.isArray(rich)) return "";
  return rich.map((r) => r.plain_text ?? "").join("");
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
