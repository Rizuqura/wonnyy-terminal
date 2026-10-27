import type { AgentAppearance } from "../../types/ai";
import type { CSSProperties } from "react";
export function bannerStyle(url?: string | null): CSSProperties | undefined {
  return url
    ? {
        backgroundImage: `linear-gradient(rgba(13,17,23,.66),rgba(13,17,23,.84)),url("${url}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;
}
export function wallpaperStyle(appearance?: AgentAppearance): CSSProperties {
  const base: CSSProperties = {
    "--chat-reading-size": `${appearance?.fontSize ?? 15}px`,
  } as CSSProperties;
  if (appearance?.wallpaperMode === "image" && appearance.wallpaperUrl) {
    const shade = appearance.dim / 100;
    return {
      ...base,
      backgroundImage: `linear-gradient(rgba(13,17,23,${shade}),rgba(13,17,23,${shade})),url("${appearance.wallpaperUrl}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (appearance?.wallpaperMode === "dots")
    return {
      ...base,
      backgroundImage:
        "radial-gradient(rgba(150,190,190,.17) 1px,transparent 1px)",
      backgroundSize: "24px 24px",
    };
  return base;
}
