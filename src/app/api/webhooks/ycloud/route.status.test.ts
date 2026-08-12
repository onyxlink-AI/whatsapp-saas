// @vitest-environment node
import { describe, expect, it } from "vitest";
import { handleStatusUpdate } from "./route";

type MessageRow = {
  id: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed" | null;
  wamid: string | null;
  meta: Record<string, unknown> | null;
};

function statusStore(rowByYCloudId: MessageRow | null, rowByWamid: MessageRow | null = null) {
  const lookups: Array<[string, unknown]> = [];
  const updates: Array<{ patch: Record<string, unknown>; id?: unknown }> = [];

  const client = {
    from(table: string) {
      if (table !== "messages") throw new Error(`Unexpected table: ${table}`);
      let filter: [string, unknown] | undefined;
      let updateRecord: { patch: Record<string, unknown>; id?: unknown } | undefined;

      const chain = {
        select() {
          return chain;
        },
        eq(column: string, value: unknown) {
          if (updateRecord) {
            updateRecord.id = value;
          } else {
            filter = [column, value];
            lookups.push(filter);
          }
          return chain;
        },
        async maybeSingle() {
          return {
            data: filter?.[0] === "wamid" ? rowByWamid : rowByYCloudId,
            error: null,
          };
        },
        update(patch: Record<string, unknown>) {
          updateRecord = { patch };
          updates.push(updateRecord);
          return chain;
        },
      };

      return chain;
    },
  };

  return { client, lookups, updates };
}

describe("YCloud outbound status correlation", () => {
  it("finds an enqueued message by meta.ycloud_id and backfills its wamid", async () => {
    const store = statusStore({
      id: "out-1",
      status: "sent",
      wamid: null,
      meta: { ycloud_id: "yc-1" },
    });

    await handleStatusUpdate(store.client as never, {
      id: "yc-1",
      wamid: "wamid-1",
      status: "delivered",
    });

    expect(store.lookups).toEqual([
      ["wamid", "wamid-1"],
      ["meta->>ycloud_id", "yc-1"],
    ]);
    expect(store.updates).toEqual([
      { patch: { wamid: "wamid-1", status: "delivered" }, id: "out-1" },
    ]);
  });

  it("persists YCloud's failure details for diagnosis", async () => {
    const store = statusStore({
      id: "out-2",
      status: "sent",
      wamid: null,
      meta: { ycloud_id: "yc-2" },
    });

    await handleStatusUpdate(store.client as never, {
      id: "yc-2",
      wamid: "wamid-2",
      status: "failed",
      errorCode: "131026",
      errorMessage: "Message undeliverable",
    });

    expect(store.updates[0]).toEqual({
      id: "out-2",
      patch: {
        wamid: "wamid-2",
        status: "failed",
        meta: {
          ycloud_id: "yc-2",
          ycloud_error_code: "131026",
          ycloud_error_message: "Message undeliverable",
        },
      },
    });
  });
});
