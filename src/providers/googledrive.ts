import { google, type drive_v3 } from "googleapis";
import type {
  Connector,
  ConnectorDocument,
  ConnectorItem,
  VerifyResult,
} from "./types.js";

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** Drive 커넥터가 요구하는 OAuth 스코프 (읽기 전용). */
export const GOOGLE_DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

/**
 * Google Drive 커넥터.
 *
 * 인증: OAuth2 refresh token (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN).
 * 마법사가 로컬 loopback OAuth 흐름으로 refresh token을 발급해 준다.
 */
export class GoogleDriveConnector implements Connector {
  readonly id = "googledrive" as const;
  private readonly drive: drive_v3.Drive;

  constructor(config: GoogleDriveConfig) {
    const auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
    auth.setCredentials({ refresh_token: config.refreshToken });
    this.drive = google.drive({ version: "v3", auth });
  }

  async verify(): Promise<VerifyResult> {
    try {
      const res = await this.drive.about.get({ fields: "user(displayName,emailAddress)" });
      const user = res.data.user;
      return { ok: true, account: user?.emailAddress ?? user?.displayName ?? "Google Drive" };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  }

  async search(query: string, limit = 10): Promise<ConnectorItem[]> {
    const res = await this.drive.files.list({
      q: `name contains ${quote(query)} and trashed = false`,
      pageSize: limit,
      orderBy: "modifiedTime desc",
      fields: "files(id,name,mimeType,webViewLink,modifiedTime)",
      spaces: "drive",
    });
    return (res.data.files ?? []).map(toItem);
  }

  async list(parentId?: string): Promise<ConnectorItem[]> {
    const parent = parentId ?? "root";
    const res = await this.drive.files.list({
      q: `${quote(parent)} in parents and trashed = false`,
      pageSize: 100,
      orderBy: "folder,name",
      fields: "files(id,name,mimeType,webViewLink,modifiedTime)",
      spaces: "drive",
    });
    return (res.data.files ?? []).map(toItem);
  }

  async read(id: string): Promise<ConnectorDocument> {
    const meta = await this.drive.files.get({
      fileId: id,
      fields: "id,name,mimeType,webViewLink",
    });
    const name = meta.data.name ?? "Untitled";
    const mimeType = meta.data.mimeType ?? "";
    const url = meta.data.webViewLink ?? undefined;

    let text: string;
    if (mimeType.startsWith("application/vnd.google-apps.")) {
      // Google 문서(Docs/Sheets/Slides 등) → text/plain으로 export
      const exportMime = mimeType === "application/vnd.google-apps.spreadsheet" ? "text/csv" : "text/plain";
      const res = await this.drive.files.export(
        { fileId: id, mimeType: exportMime },
        { responseType: "text" },
      );
      text = String(res.data);
    } else if (mimeType.startsWith("text/") || mimeType === "application/json") {
      const res = await this.drive.files.get(
        { fileId: id, alt: "media" },
        { responseType: "text" },
      );
      text = String(res.data);
    } else {
      text = `[이 파일 형식(${mimeType})은 텍스트로 변환할 수 없습니다. 웹에서 열어보세요: ${url ?? "(링크 없음)"}]`;
    }

    return { title: name, text, url };
  }
}

// --- helpers ---

function toItem(file: drive_v3.Schema$File): ConnectorItem {
  const isFolder = file.mimeType === "application/vnd.google-apps.folder";
  return {
    id: file.id ?? "",
    title: file.name ?? "Untitled",
    type: isFolder ? "folder" : "file",
    url: file.webViewLink ?? undefined,
    modifiedAt: file.modifiedTime ?? undefined,
  };
}

/** Drive 쿼리 문자열 리터럴 이스케이프 (작은따옴표/역슬래시). */
function quote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
