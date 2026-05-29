import { renderReport } from "./report.js";
import { countRepository } from "./count.js";
import { scanRepository } from "./scan.js";
import type { RenderOptions, ScanOptions } from "./types.js";

export async function watchRepository(
  scanOptions: ScanOptions,
  renderOptions: RenderOptions,
  intervalMs: number
) {
  for (;;) {
    const scan = await scanRepository(scanOptions);
    const summary = await countRepository(scan, scanOptions.top);
    process.stdout.write("\u001bc");
    process.stdout.write(renderReport(summary, renderOptions));
    await sleep(intervalMs);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
