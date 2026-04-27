import { useEffect, useState } from "react";

export type Tier = "full" | "medium" | "compact";

/** Design-spec §2.3 responsive tiers. */
export function useTier(): Tier {
  const [tier, setTier] = useState<Tier>(() => compute(typeof window === "undefined" ? 1400 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setTier(compute(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return tier;
}

function compute(w: number): Tier {
  if (w >= 1280) return "full";
  if (w >= 900) return "medium";
  return "compact";
}
