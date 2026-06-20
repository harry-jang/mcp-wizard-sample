import { homedir } from "node:os";
import { join } from "node:path";

/**
 * 설정 파일 위치 결정 (멀티플랫폼).
 *
 * npx로 설치하면 패키지는 npm 캐시에 위치하므로, 비밀값은 패키지 옆이 아니라
 * 사용자 홈의 표준 설정 디렉토리에 저장한다. 설치 위치와 무관하게 항상 같은 곳을 읽는다.
 *
 * 우선순위:
 *  - WIZARD_CONNECTOR_CONFIG   : 설정 "파일" 경로 직접 지정 (테스트/고급)
 *  - WIZARD_CONNECTOR_CONFIG_DIR: 설정 "디렉토리" 지정
 *  - win32                     : %APPDATA%\wizard-connector
 *  - 그 외                     : $XDG_CONFIG_HOME/wizard-connector (기본 ~/.config)
 */
export function configDir(): string {
  const dirOverride = process.env.WIZARD_CONNECTOR_CONFIG_DIR;
  if (dirOverride) return dirOverride;

  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? homedir(), "wizard-connector");
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(xdg, "wizard-connector");
}

export function configFilePath(): string {
  return process.env.WIZARD_CONNECTOR_CONFIG ?? join(configDir(), "config.json");
}
