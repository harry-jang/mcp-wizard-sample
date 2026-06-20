import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { configFilePath } from "./paths.js";
import type { ProviderId } from "./providers/types.js";

/**
 * 사용자 홈의 설정 파일(config.json)에서 활성 provider와 인증정보를 읽고/쓴다.
 * 마법사가 writeConfig로 저장하고, 서버가 readConfig로 읽는다.
 * 비밀값이 셸/명령행을 거치지 않으므로 OS와 무관하게 안전하다.
 */

export type LoadedConfig =
  | { provider: "notion"; notion: { token: string } }
  | {
      provider: "googledrive";
      googledrive: { clientId: string; clientSecret: string; refreshToken: string };
    };

class ConfigError extends Error {}

export function readConfig(): LoadedConfig {
  const path = configFilePath();
  if (!existsSync(path)) {
    throw new ConfigError(
      `설정 파일이 없습니다(${path}). 먼저 \`npx -y wizard-connector setup\`을 실행하세요.`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new ConfigError(`설정 파일을 읽을 수 없습니다: ${path}`);
  }
  return validate(raw, path);
}

export function writeConfig(config: LoadedConfig): string {
  const path = configFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  // POSIX에서는 비밀값 파일 권한을 소유자 전용(600)으로 제한.
  if (process.platform !== "win32") {
    try {
      chmodSync(path, 0o600);
    } catch {
      /* 권한 설정 실패는 치명적이지 않음 */
    }
  }
  return path;
}

function validate(raw: unknown, path: string): LoadedConfig {
  const data = (raw ?? {}) as Record<string, any>;
  const provider = data.provider as ProviderId | undefined;

  if (provider === "notion") {
    const token = data.notion?.token;
    if (!token) throw new ConfigError(`설정에 notion.token이 없습니다: ${path}`);
    return { provider, notion: { token } };
  }

  if (provider === "googledrive") {
    const g = data.googledrive ?? {};
    if (!g.clientId || !g.clientSecret || !g.refreshToken) {
      throw new ConfigError(`설정에 googledrive 인증정보가 부족합니다: ${path}`);
    }
    return {
      provider,
      googledrive: {
        clientId: g.clientId,
        clientSecret: g.clientSecret,
        refreshToken: g.refreshToken,
      },
    };
  }

  throw new ConfigError(
    `알 수 없는 provider="${String(provider)}" (${path}). \`npx -y wizard-connector setup\`을 다시 실행하세요.`,
  );
}

export { ConfigError };
