import type { ReactNode } from "react";
import { featureFlags, type FeatureFlagKey } from "../lib/feature-flags";
import { PlaceholderPage } from "../pages/placeholder-page";

type FeatureGateProps = {
  flag: FeatureFlagKey;
  title: string;
  children: ReactNode;
};

export function FeatureGate({ flag, title, children }: FeatureGateProps) {
  if (!featureFlags[flag]) {
    return <PlaceholderPage title={`${title} — Coming Soon`} />;
  }
  return <>{children}</>;
}