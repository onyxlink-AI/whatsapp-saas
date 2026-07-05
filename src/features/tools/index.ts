import { registry } from "./registry";
import { echoTool } from "./tools/echo";
import { scheduleLinkTool } from "./tools/schedule-link";
import { scheduleHighLevelTool } from "./tools/schedule-highlevel";
import { checkAvailabilityTool } from "./tools/check-availability";
import { customWebhookTool } from "./tools/custom-webhook";
import { checkAvailabilityGoogleTool } from "./tools/check-availability-google";
import { scheduleGoogleTool } from "./tools/schedule-google";

registry.register(echoTool);
registry.register(scheduleLinkTool);
registry.register(scheduleHighLevelTool);
registry.register(checkAvailabilityTool);
registry.register(customWebhookTool);
registry.register(checkAvailabilityGoogleTool);
registry.register(scheduleGoogleTool);

export { registry };
export type {
  Tool,
  ToolContext,
  ToolResult,
  ToolSensitivity,
} from "./core/tool";
