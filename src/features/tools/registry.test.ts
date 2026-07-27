import { describe, expect, it, vi, beforeEach } from "vitest";
import { registry } from "./index";
import { scheduleGoogleTool } from "./tools/schedule-google";
import { customWebhookTool } from "./tools/custom-webhook";
import { checkAvailabilityTool } from "./tools/check-availability";

// Regression coverage for the agent test playground's safety gate: a test
// conversation must NEVER book a real appointment, hit a real webhook, or
// call a real external calendar API — no matter the tool's sensitivity
// (read/write/sensitive). Before this fix, ToolRunOptions had no `simulate`
// flag and the registry always called the real Tool.run().

const CTX = { workspaceId: "ws-1", conversationId: "", contactId: "" };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("registry.run — simulate mode never calls the real tool", () => {
  it("short-circuits a write-sensitivity tool (schedule_google) before Tool.run()", async () => {
    const runSpy = vi.spyOn(scheduleGoogleTool, "run");

    const result = await registry.run(
      "schedule_google",
      { datetime_iso: "2026-06-12T10:00:00-06:00" },
      CTX,
      { simulate: true },
    );

    expect(runSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      simulated: true,
      message: scheduleGoogleTool.simulationMessage,
    });
  });

  it("short-circuits a sensitive tool (custom_webhook) before Tool.run(), same as a write tool", async () => {
    const runSpy = vi.spyOn(customWebhookTool, "run");

    const result = await registry.run(
      "custom_webhook",
      { note: "prueba" },
      CTX,
      { simulate: true },
    );

    expect(runSpy).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.output).toEqual({
      simulated: true,
      message: customWebhookTool.simulationMessage,
    });
  });

  it("short-circuits a read-sensitivity tool (check_availability) so it never hits the real calendar API", async () => {
    const runSpy = vi.spyOn(checkAvailabilityTool, "run");

    const result = await registry.run(
      "check_availability",
      { date_from: "2026-06-12", date_to: "2026-06-19" },
      CTX,
      { simulate: true },
    );

    expect(runSpy).not.toHaveBeenCalled();
    expect(result.output).toEqual({
      simulated: true,
      message: checkAvailabilityTool.simulationMessage,
    });
  });

  it("still validates args against the tool schema before simulating", async () => {
    const result = await registry.run(
      "schedule_google",
      { datetime_iso: 12345 }, // wrong type — should fail schema parsing
      CTX,
      { simulate: true },
    );
    expect(result.ok).toBe(false);
    expect(result.output).toBeNull();
  });

  it("without simulate, a sensitive tool still takes the pre-existing requiresConfirmation path (unchanged behavior)", async () => {
    const runSpy = vi.spyOn(customWebhookTool, "run");
    const result = await registry.run(
      "custom_webhook",
      { note: "prueba" },
      CTX,
    );
    expect(runSpy).not.toHaveBeenCalled();
    expect(result.requiresConfirmation).toBe(true);
  });
});
