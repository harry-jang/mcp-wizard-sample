#!/usr/bin/env node
/**
 * 단일 진입점(bin: wizard-connector).
 *  - `wizard-connector setup` → 대화형 설치 마법사
 *  - `wizard-connector`       → stdio MCP 서버 (Claude Code가 실행)
 */
const command = process.argv[2];

if (command === "setup") {
  const { runWizard } = await import("./wizard/wizard.js");
  await runWizard();
} else {
  const { runServer } = await import("./server.js");
  await runServer().catch((err) => {
    process.stderr.write(`[wizard-connector] 치명적 오류: ${String(err)}\n`);
    process.exit(1);
  });
}
