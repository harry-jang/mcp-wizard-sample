# wizard-connector

Claude Code용 **플러그형 커넥터 예제**입니다. 하나의 로컬 stdio MCP 서버가 **Notion** 또는 **Google Drive**를
연동하고, 대화형 **설치 마법사(wizard)**가 인증부터 등록까지 단계별로 안내합니다.
**npm으로 배포**해 `npx`로 설치/실행하며, macOS / Windows / Linux 를 모두 지원합니다.

## 노출하는 tool

MCP 서버는 provider-중립적인 tool 3종을 노출합니다. 어떤 서비스를 골라도 동일합니다.

| tool     | 설명                                          |
| -------- | --------------------------------------------- |
| `search` | 키워드로 문서/파일 검색                       |
| `read`   | 문서/파일 본문 텍스트 가져오기 (id로 지정)    |
| `list`   | 폴더/페이지 내용 나열 (parentId 없으면 루트)  |

## 사용 (git 소스 설치)

```bash
npx -y github:harry-jang/mcp-wizard-sample setup
```
마법사 마지막에 **등록 스코프를 직접 고릅니다**:

- **전역 (user 스코프)** — 모든 프로젝트에서 사용. 마법사가 `claude mcp add -s user`를 대신 실행합니다.
- **이 프로젝트 (.mcp.json)** — 현재 폴더에 기록해 git으로 팀과 공유.
- **지금 등록 안 함** — 나중에 수동 등록.

### 수동 등록 (선택)

마법사에서 "지금 등록 안 함"을 골랐을 경우 수동으로 등록하려면:

```bash
# 전역(user 스코프): 모든 프로젝트에서 사용
claude mcp add -s user wizard-connector -- npx -y github:harry-jang/mcp-wizard-sample
# 특정 프로젝트(project 스코프): 그 폴더 .mcp.json에 기록해 git으로 팀 공유
claude mcp add -s project wizard-connector -- npx -y github:harry-jang/mcp-wizard-sample
```

> **참고:** 이 repo는 MCP 서버 **소스**이지 소비 프로젝트가 아니므로 `.mcp.json`을 커밋하지 않습니다
> (`.gitignore` 처리). 등록 위치(project/user 스코프)는 **소비자가 직접 선택**합니다.

### 설정/비밀값 저장 위치

비밀값은 패키지 옆이 아니라 **사용자 홈 설정 디렉토리**에 저장됩니다 (npx 설치 위치와 무관하게 항상 동일).

| OS              | 경로                                            |
| --------------- | ----------------------------------------------- |
| Windows         | `%APPDATA%\wizard-connector\config.json`        |
| macOS / Linux   | `~/.config/wizard-connector/config.json` (600)  |

`WIZARD_CONNECTOR_CONFIG`(파일) 또는 `WIZARD_CONNECTOR_CONFIG_DIR`(디렉토리) 환경변수로 위치를 바꿀 수
있습니다. 비밀값이 등록 명령/`.mcp.json`에 들어가지 않으므로(셸을 거치지 않음) OS와 무관하게 안전합니다.

## 로컬 개발

```bash
npm install
npm run build       # dist/ 생성
npm run setup       # 마법사 (tsx로 소스 직접 실행)
npm run dev         # 서버를 소스에서 실행
npm run inspect     # 빌드 후 MCP Inspector로 점검
```

게시 전에 `npx -y wizard-connector ...` 흐름을 그대로 시험하려면 **`npm link`** 로 전역 심볼릭 링크를 만든 뒤
`wizard-connector setup` / `claude mcp add -s user wizard-connector -- wizard-connector` 를 사용하세요.

## npm에 배포하기

```bash
# 1) 패키지 이름을 고유하게 (예: 스코프드 이름)
#    package.json의 "name"을 "@your-scope/wizard-connector" 등으로 변경
# 2) 게시 (prepublishOnly가 자동으로 build 실행)
npm publish --access public
```

`files` 필드에 `dist`만 포함되므로 소스(.ts)는 게시되지 않고 컴파일된 JS만 배포됩니다.

## 아키텍처 ("플러그형")

```
src/
  cli.ts               # bin 진입점: setup ↔ 서버 분기
  server.ts            # MCP stdio 서버 (runServer)
  config.ts            # 홈 설정 파일 read/write + 검증
  paths.ts             # OS별 설정 경로
  providers/
    types.ts           # Connector 공통 인터페이스
    notion.ts          # Notion 구현
    googledrive.ts     # Google Drive 구현
    registry.ts        # provider 팩토리
  tools/
    register.ts        # search/read/list tool (Connector로 위임)
  wizard/
    wizard.ts          # 설치 마법사 (runWizard)
    google-oauth.ts    # 로컬 loopback OAuth 흐름
    platform.ts        # OS별 브라우저 열기
```

새 provider 추가: `providers/`에 `Connector` 구현 → `config.ts`·`registry.ts`에 한 갈래씩 추가 → 마법사에 입력
단계 추가. tool 코드(`tools/register.ts`)는 그대로입니다.

## 사전 준비

### Notion
1. https://www.notion.so/my-integrations 에서 integration 생성 → Internal Integration Secret 복사
2. 연동할 페이지/DB의 `...` → **Connections**에서 integration 연결 (연결된 것만 검색·조회됨)

### Google Drive
1. https://console.cloud.google.com 에서 프로젝트 생성
2. **Google Drive API** 사용 설정
3. **OAuth 클라이언트 ID** 생성 — 유형: **데스크톱 앱** (loopback 리다이렉트 자동 허용)

## 범위

읽기 위주(search/read/list) 예제입니다. 쓰기 기능은 `Connector` 인터페이스를 확장해 추가할 수 있습니다.
