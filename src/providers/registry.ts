import type { LoadedConfig } from "../config.js";
import { GoogleDriveConnector } from "./googledrive.js";
import { NotionConnector } from "./notion.js";
import type { Connector } from "./types.js";

/**
 * 검증된 설정으로부터 활성 Connector 인스턴스를 만든다.
 * provider를 추가하려면 여기 한 줄과 config.ts만 손보면 된다("플러그형").
 */
export function createConnector(config: LoadedConfig): Connector {
  switch (config.provider) {
    case "notion":
      return new NotionConnector(config.notion);
    case "googledrive":
      return new GoogleDriveConnector(config.googledrive);
  }
}
