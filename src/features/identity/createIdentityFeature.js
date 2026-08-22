import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import {
  getInstallIdCreatedAtTs,
  getOrCreateInstallId,
} from "../../app/adapters/browserIdentity.js";

export function createIdentityFeature() {
  const store = createFeatureStore({
    deviceInstallId: getOrCreateInstallId(),
    installIdCreatedAtTs: getInstallIdCreatedAtTs(),
  });
  return Object.freeze({ start() {}, store });
}
