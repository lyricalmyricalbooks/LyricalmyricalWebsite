// Every storefront extra's feature.ts (see featureKit.ts), sorted by folder name so the lists never depend on file order.
import type { StorefrontFeature } from "./featureKit";

const files = import.meta.glob<StorefrontFeature>("./*/feature.ts", { eager: true, import: "default" });

export const STOREFRONT_FEATURES: StorefrontFeature[] = Object.keys(files).sort().map(path => files[path]);
