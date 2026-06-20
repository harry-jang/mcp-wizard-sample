import http from "node:http";
import { AddressInfo } from "node:net";
import { google } from "googleapis";
import { GOOGLE_DRIVE_SCOPES } from "../providers/googledrive.js";
import { openBrowser } from "./platform.js";

/**
 * 로컬 loopback OAuth 흐름으로 Google refresh token을 발급받는다.
 *
 * "Desktop app" 유형의 OAuth 클라이언트는 http://127.0.0.1:<port> loopback 리다이렉트를
 * 자동 허용하므로, 임시 HTTP 서버를 띄워 동의 후의 authorization code를 받는다.
 * macOS/Windows/Linux 모두 동일하게 동작한다.
 */
export async function getRefreshTokenViaLoopback(
  clientId: string,
  clientSecret: string,
  onUrl: (url: string) => void,
): Promise<string> {
  return new Promise<string>((resolvePromise, rejectPromise) => {
    const server = http.createServer();

    server.on("error", rejectPromise);

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

      const authUrl = oauth2.generateAuthUrl({
        access_type: "offline", // refresh token 발급
        prompt: "consent", // 매번 refresh token을 확실히 받도록 동의 강제
        scope: GOOGLE_DRIVE_SCOPES,
      });

      server.on("request", async (req, res) => {
        try {
          const url = new URL(req.url ?? "/", redirectUri);
          if (url.pathname !== "/callback") {
            res.writeHead(404).end();
            return;
          }

          const error = url.searchParams.get("error");
          const code = url.searchParams.get("code");

          if (error || !code) {
            respond(res, `인증이 취소되었거나 실패했습니다: ${error ?? "code 없음"}`);
            cleanup();
            rejectPromise(new Error(error ?? "authorization code를 받지 못했습니다."));
            return;
          }

          const { tokens } = await oauth2.getToken(code);
          respond(res, "인증이 완료되었습니다. 이 창을 닫고 터미널로 돌아가세요.");
          cleanup();

          if (!tokens.refresh_token) {
            rejectPromise(
              new Error(
                "refresh token을 받지 못했습니다. Google 계정 권한에서 앱 접근을 제거한 뒤 다시 시도하세요.",
              ),
            );
            return;
          }
          resolvePromise(tokens.refresh_token);
        } catch (err) {
          respond(res, "토큰 교환 중 오류가 발생했습니다. 터미널을 확인하세요.");
          cleanup();
          rejectPromise(err instanceof Error ? err : new Error(String(err)));
        }
      });

      function cleanup() {
        server.close();
      }

      onUrl(authUrl);
      openBrowser(authUrl);
    });
  });
}

function respond(res: http.ServerResponse, message: string): void {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><html lang="ko"><meta charset="utf-8"><body style="font-family:sans-serif;padding:2rem">` +
      `<h2>wizard-connector</h2><p>${message}</p></body></html>`,
  );
}
