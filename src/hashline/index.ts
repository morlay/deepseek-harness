export {
  computeLineHash,
  formatHashlineRegion,
  formatFileAsHashline,
  parseLineRef,
  stripHashline,
  applyEdits,
  formatHashlineStream,
  formatGrepAsHashline,
  formatGrepAsHashlineStream,
  lines,
  hashlines,
} from "./hashline.ts";
export type { EditOp, EditResult } from "./hashline.ts";
