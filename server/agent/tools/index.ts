export { calculateTool, evaluateExpression } from "./calculate";
export { currentTimeTool } from "./current-time";

import { calculateTool } from "./calculate";
import { currentTimeTool } from "./current-time";

export const builtInAgentTools = [currentTimeTool, calculateTool] as const;
