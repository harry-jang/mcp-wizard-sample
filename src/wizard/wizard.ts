import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  intro,
  outro,
  select,
  text,
  password,
  confirm,
  spinner,
  note,
  log,
  isCancel,
  cancel,
} from "@clack/prompts";
import { writeConfig, type LoadedConfig } from "../config.js";
import { NotionConnector } from "../providers/notion.js";
import { GoogleDriveConnector } from "../providers/googledrive.js";
import type { Connector, ProviderId } from "../providers/types.js";
import { getRefreshTokenViaLoopback } from "./google-oauth.js";

/** 배포된 npm 패키지 이름. 등록 명령/`.mcp.json`에서 사용한다. */
const PKG = "wizard-connector";

/** clack 프롬프트 취소(Ctrl+C) 처리. */
function check<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("설정을 취소했습니다.");
    process.exit(0);
  }
  return value as T;
}

export async function runWizard(): Promise<void> {
  intro(`Claude Code 커넥터 설치 마법사 (${PKG})`);

  // 1) provider 선택
  const provider = check(
    await select({
      message: "연동할 서비스를 선택하세요.",
      options: [
        { value: "notion", label: "Notion", hint: "integration 토큰만 있으면 됨 (간단)" },
        { value: "googledrive", label: "Google Drive", hint: "OAuth 브라우저 인증" },
      ],
    }),
  ) as ProviderId;

  // 2) 인증정보 입력 + 3) 연결 테스트 (성공할 때까지 반복)
  let resolved: { connector: Connector; config: LoadedConfig };
  for (;;) {
    resolved = provider === "notion" ? await collectNotion() : await collectGoogleDrive();

    const s = spinner();
    s.start("연결을 확인하는 중...");
    const result = await resolved.connector.verify();
    if (result.ok) {
      s.stop(`연결 성공: ${result.account ?? "(계정 확인됨)"}`);
      break;
    }
    s.stop(`연결 실패: ${result.error ?? "알 수 없는 오류"}`);
    const retry = check(await confirm({ message: "다시 입력하시겠어요?" }));
    if (!retry) {
      cancel("설정을 중단했습니다.");
      process.exit(1);
    }
  }

  // 4) 설정 저장 (홈 디렉토리 — 설치 위치와 무관, .gitignore 불필요)
  const savedPath = writeConfig(resolved.config);
  log.success(`인증정보를 ${savedPath} 에 저장했습니다.`);

  // 5) Claude Code 등록
  const userCmd = `claude mcp add -s user ${PKG} -- npx -y ${PKG}`;

  const registerHere = check(
    await confirm({
      message: `현재 폴더(${process.cwd()})에 .mcp.json으로 등록할까요?`,
      initialValue: false,
    }),
  );
  if (registerHere) {
    const mcpPath = writeProjectMcpJson();
    log.success(`이 프로젝트에 등록했습니다: ${mcpPath}`);
  }

  note(
    [
      "전역(user 스코프)으로 등록하려면 아래 명령을 실행하세요:",
      `  ${userCmd}`,
      "",
      "이미 npm에 게시했다면 npx가 패키지를 받아 실행합니다.",
      "게시 전 로컬 테스트는 `npm link` 후 위 명령을 사용하세요.",
      "",
      "비밀값은 설정 파일에만 있고 서버가 시작 시 직접 읽으므로, 명령/JSON에는 토큰이 없습니다.",
    ].join("\n"),
    "Claude Code 등록",
  );

  outro(`완료! Claude Code에서 \`/mcp\` 또는 \`claude mcp list\`로 확인하고 search/read/list tool을 사용해 보세요.`);
}

async function collectNotion(): Promise<{ connector: Connector; config: LoadedConfig }> {
  note(
    [
      "Notion 통합 토큰 발급:",
      "1. https://www.notion.so/my-integrations 에서 'New integration' 생성",
      "2. 'Internal Integration Secret'(ntn_... 또는 secret_...) 복사",
      "3. 연동할 페이지/DB의 '...' 메뉴 → 'Connections'에서 이 integration 연결",
    ].join("\n"),
    "사전 준비",
  );
  const token = check(
    await password({
      message: "Notion integration 토큰을 붙여넣으세요.",
      validate: (v) => (v && v.length > 10 ? undefined : "유효한 토큰을 입력하세요."),
    }),
  );
  return {
    connector: new NotionConnector({ token }),
    config: { provider: "notion", notion: { token } },
  };
}

async function collectGoogleDrive(): Promise<{ connector: Connector; config: LoadedConfig }> {
  note(
    [
      "Google OAuth 클라이언트 준비:",
      "1. https://console.cloud.google.com 에서 프로젝트 생성/선택",
      "2. 'Google Drive API' 사용 설정",
      "3. 'API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID' 생성 (유형: 데스크톱 앱)",
      "4. 생성된 Client ID / Client Secret 준비",
    ].join("\n"),
    "사전 준비",
  );

  const clientId = check(
    await text({
      message: "Google OAuth Client ID",
      validate: (v) => (v ? undefined : "Client ID를 입력하세요."),
    }),
  );
  const clientSecret = check(
    await password({
      message: "Google OAuth Client Secret",
      validate: (v) => (v ? undefined : "Client Secret을 입력하세요."),
    }),
  );

  const s = spinner();
  s.start("브라우저에서 Google 로그인/동의를 진행하세요...");
  let refreshToken: string;
  try {
    refreshToken = await getRefreshTokenViaLoopback(clientId, clientSecret, (url) => {
      s.message(`브라우저가 열리지 않으면 이 URL을 직접 여세요:\n${url}`);
    });
    s.stop("Google 인증 완료, refresh token 획득.");
  } catch (err) {
    s.stop(`OAuth 실패: ${err instanceof Error ? err.message : String(err)}`);
    refreshToken = check(
      await password({
        message: "수동으로 refresh token을 붙여넣으세요(있다면), 없으면 Ctrl+C.",
        validate: (v) => (v ? undefined : "refresh token을 입력하세요."),
      }),
    );
  }

  return {
    connector: new GoogleDriveConnector({ clientId, clientSecret, refreshToken }),
    config: { provider: "googledrive", googledrive: { clientId, clientSecret, refreshToken } },
  };
}

/** 현재 작업 폴더의 .mcp.json에 wizard-connector 항목을 병합한다(비밀값 없음). */
function writeProjectMcpJson(): string {
  const mcpPath = resolve(process.cwd(), ".mcp.json");
  let config: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(mcpPath)) {
    try {
      config = JSON.parse(readFileSync(mcpPath, "utf8"));
    } catch {
      config = {};
    }
  }
  config.mcpServers = {
    ...(config.mcpServers ?? {}),
    [PKG]: { command: "npx", args: ["-y", PKG] },
  };
  writeFileSync(mcpPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return mcpPath;
}
