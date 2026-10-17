import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("../supabase", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
  },
}));
import { readCurrentTreasuryRole } from "./treasury-access";

afterEach(() => { mocks.getUser.mockReset(); mocks.maybeSingle.mockReset(); });

describe("Supabase role authorization for Royal Treasury", () => {
  it("denies anonymous users without selecting roles", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await readCurrentTreasuryRole()).toBe("denied");
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });
  it("denies API failures and privileged role read errors", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    expect(await readCurrentTreasuryRole()).toBe("denied");
  });
  it("requires an explicit superadmin row in canonical user_roles", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    for (const role of ["player", "tester", "admin", null]) {
      mocks.maybeSingle.mockResolvedValue({ data: role === null ? null : { role }, error: null });
      expect(await readCurrentTreasuryRole()).toBe("denied");
    }
    mocks.maybeSingle.mockResolvedValue({ data: { role: "superadmin" }, error: null });
    expect(await readCurrentTreasuryRole()).toBe("superadmin");
  });
});
