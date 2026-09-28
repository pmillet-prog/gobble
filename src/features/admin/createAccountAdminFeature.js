import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import { accountAdminRequest } from "./accountAdminApi.js";

export function createAccountAdminFeature({ getKernel, scope }) {
  const store = createFeatureStore({ allowed: false, excluded: {} });
  let started = false, identity = null, request = null;
  function sync() {
    const auth = getKernel().getState().session.authState;
    const next = auth?.status === "authenticated" && !auth.user?.mustResetPassword ? auth.user?.id : null;
    if (identity === next) return;
    identity = next;
    request?.abort();
    store.patch({ allowed: false, excluded: {} });
    if (!next) return;
    const controller = new AbortController();
    request = controller;
    accountAdminRequest("capabilities", undefined, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted && identity === next) store.set("allowed", Boolean(result.accountAdmin && result.contentAdmin));
    }).catch(() => {});
  }
  return {
    store,
    start() {
      if (started) return;
      started = true;
      scope.add(getKernel().subscribe(sync));
      scope.add(() => request?.abort());
      sync();
    },
    async exclude(content) {
      const result = await accountAdminRequest("content/exclude", content);
      const key = content.reference || `${content.scope}:${content.word}`;
      store.set("excluded", value => ({ ...value, [key]: true }));
      return result;
    },
  };
}
