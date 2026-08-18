import { describe, expect, it, vi, beforeEach } from "vitest";

// TAREA 1B: markAsSuperAdmin() must write is_super_admin AND platform_role
// atomically in the same UPDATE, and must fail loudly (throw) rather than
// silently leaving a half-promoted bootstrap account — this is the ONLY
// account-creation path that grants platform access at all, so a swallowed
// error here would mean signup reports success while the new owner cannot
// actually reach anything gated by requireSuperAdmin()/requirePlatformStaff().

const update = vi.fn();
const eq = vi.fn();
const select = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => ({ update }),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  update.mockReturnValue({ eq });
  eq.mockReturnValue({ select });
});

const { markAsSuperAdmin } = await import("./signup-gate");

const USER_ID = "22222222-2222-4222-8222-222222222222";

describe("markAsSuperAdmin", () => {
  it("writes is_super_admin AND platform_role atomically in a single UPDATE call", async () => {
    select.mockResolvedValue({ data: [{ id: USER_ID }], error: null });

    await markAsSuperAdmin(USER_ID);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ is_super_admin: true, platform_role: "super_admin" });
    expect(eq).toHaveBeenCalledWith("id", USER_ID);
  });

  it("throws explicitly when Supabase returns an error — never swallows it", async () => {
    select.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    await expect(markAsSuperAdmin(USER_ID)).rejects.toThrow(/connection reset/);
  });

  it("throws explicitly when no row matched (zero rows updated) even without an error object", async () => {
    select.mockResolvedValue({ data: [], error: null });

    await expect(markAsSuperAdmin(USER_ID)).rejects.toThrow(/no user row matched|promotion did not apply/i);
  });

  it("succeeds silently (resolves) when exactly one row was updated with no error", async () => {
    select.mockResolvedValue({ data: [{ id: USER_ID }], error: null });

    await expect(markAsSuperAdmin(USER_ID)).resolves.toBeUndefined();
  });
});
