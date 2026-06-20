/**
 * 모든 커넥터(provider)가 구현해야 하는 공통 계약.
 *
 * MCP 서버가 노출하는 tool(search/read/list)은 이 인터페이스에만 의존하므로,
 * Notion·Google Drive 등 어떤 provider를 끼워도 tool 코드는 바뀌지 않는다("플러그형").
 */

export type ProviderId = "notion" | "googledrive";

export interface ConnectorItem {
  /** provider 내부 식별자 (read()에 그대로 넘길 수 있는 값) */
  id: string;
  title: string;
  type: "document" | "file" | "folder" | "page";
  /** 사람이 열어볼 수 있는 웹 URL (있으면) */
  url?: string;
  /** ISO 8601 수정 시각 (있으면) */
  modifiedAt?: string;
}

export interface ConnectorDocument {
  title: string;
  /** 평탄화된 본문 텍스트 */
  text: string;
  url?: string;
}

export interface VerifyResult {
  ok: boolean;
  /** 연결된 계정/워크스페이스 표시명 (성공 시) */
  account?: string;
  /** 실패 사유 (실패 시) */
  error?: string;
}

export interface Connector {
  readonly id: ProviderId;

  /** 키워드로 항목 검색 */
  search(query: string, limit?: number): Promise<ConnectorItem[]>;

  /** 단일 문서/파일의 텍스트 내용 가져오기 */
  read(id: string): Promise<ConnectorDocument>;

  /** 폴더/워크스페이스 탐색 (parentId 없으면 루트) */
  list(parentId?: string): Promise<ConnectorItem[]>;

  /** 연결 검증용 가벼운 호출 — wizard의 "연결 테스트"에서 사용 */
  verify(): Promise<VerifyResult>;
}
