import { agentToolRegistry, type AgentToolRegistry } from "./registry";
import { builtInAgentTools } from "./tools";
import type { AgentToolDefinition } from "./types";

export const BUILT_IN_AGENT_TOOL_NAMES: string[] = builtInAgentTools.map((definition) => definition.name);

export function registerBuiltInAgentTools(registry: AgentToolRegistry = agentToolRegistry): AgentToolRegistry {
  for (const definition of builtInAgentTools) {
    if (!registry.get(definition.name)) {
      registry.register(definition as unknown as AgentToolDefinition<unknown, unknown>);
    }
  }
  return registry;
}
