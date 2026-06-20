import { spawn } from "node:child_process";

/**
 * 멀티플랫폼(macOS/Windows/Linux) 보조 유틸.
 * OS별로 다른 명령을 추상화한다.
 */

/** 기본 브라우저로 URL을 연다. */
export function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;
  let args: string[];

  if (platform === "win32") {
    // start의 첫 인자는 창 제목이므로 빈 문자열을 넣어 URL이 제목으로 먹히지 않게 한다.
    command = "cmd";
    args = ["/c", "start", "", url];
  } else if (platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // 브라우저 자동 실행 실패는 치명적이지 않다 — 호출 측에서 URL을 직접 안내한다.
  }
}
