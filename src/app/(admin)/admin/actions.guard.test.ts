import { describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/server/session", () => ({ getSession: async () => current.session }));
vi.mock("@/server/auth", () => ({ auth: { api: {} } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, updateTag: () => {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { getAdminAccess } from "@/server/admin";
import { refreshFxAction, saveFxSettingsAction } from "./fx/actions";
import { retryFulfillmentAction } from "./orders/actions";
import { createPromoAction, stopPromoAction } from "./promos/actions";
import { duplicatePlanAction, movePlanAction, savePlanAction, setEnabledAction, setPriceAction } from "./plans/actions";
import { hideActivityItemAction, saveActivitySettingsAction } from "./activity/actions";
import { saveModelMetaAction } from "./models/actions";
import { resetSiteAssetAction, saveAnnouncementAction, saveBrandAction, saveContactAction, saveDocsAction, saveLogoOptionsAction, uploadSiteAssetAction } from "./settings/actions";
import { confirmPasskeyAddAction, deletePasskeyAction, regenerateBackupCodesAction, resetTwoFactorAction } from "./security/actions";
import { adjustPoolAction, setThresholdAction } from "./pool/actions";
import { GET as exportLedger } from "./pool/export/route";

/** Every server action is a public endpoint, so each one must refuse on its own, before it reads the form. */
const actions = {
  adjustPoolAction,
  setThresholdAction,
  savePlanAction,
  setPriceAction,
  setEnabledAction,
  retryFulfillmentAction,
  saveFxSettingsAction,
  refreshFxAction,
  createPromoAction,
  stopPromoAction,
  saveActivitySettingsAction,
  hideActivityItemAction,
  saveModelMetaAction,
  saveBrandAction,
  saveLogoOptionsAction,
  saveContactAction,
  saveAnnouncementAction,
  saveDocsAction,
  uploadSiteAssetAction,
  resetSiteAssetAction,
  regenerateBackupCodesAction,
  resetTwoFactorAction,
  confirmPasskeyAddAction,
  deletePasskeyAction,
};
const plain = { duplicatePlanAction, movePlanAction };

const user = (u: Record<string, unknown>) => ({ user: { id: "u1", ...u } });

describe("admin server actions and route handlers enforce the guard themselves", () => {
  it.each(Object.entries(actions))("%s: non-admin gets 404, admin without 2FA is sent to /admin/security", async (_name, fn) => {
    current.session = user({ role: "user", twoFactorEnabled: true });
    await expect(fn({}, new FormData())).rejects.toThrow("NOT_FOUND");
    current.session = user({ role: "admin", twoFactorEnabled: false });
    await expect(fn({}, new FormData())).rejects.toThrow("REDIRECT /admin/security");
    current.session = null;
    await expect(fn({}, new FormData())).rejects.toThrow("REDIRECT /login");
  });

  it.each(Object.entries(plain))("%s: same", async (_name, fn) => {
    current.session = user({ role: "user" });
    await expect(fn(new FormData())).rejects.toThrow("NOT_FOUND");
    current.session = user({ role: "admin", twoFactorEnabled: false });
    await expect(fn(new FormData())).rejects.toThrow("REDIRECT /admin/security");
  });

  it("the CSV export answers a bare 404 to non-admins and to admins without 2FA", async () => {
    for (const session of [null, user({ role: "user", twoFactorEnabled: true }), user({ role: "admin", twoFactorEnabled: false })]) {
      current.session = session;
      const res = await exportLedger(new Request("https://aedoxy.test/admin/pool/export"));
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("");
    }
    current.session = user({ role: "admin", twoFactorEnabled: true });
    expect((await getAdminAccess()).kind).toBe("ok");
  });
});
