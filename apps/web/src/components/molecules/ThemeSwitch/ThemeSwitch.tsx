import type { ReactElement } from "react";
import type { ThemePreference } from "../../../lib/theme/theme.ts";
import { useTheme } from "../../../lib/theme/use-theme.ts";
import { SegmentedControl, type SegmentedOption } from "../SegmentedControl/SegmentedControl.tsx";
import "./ThemeSwitch.css";

const OPTIONS: readonly SegmentedOption<ThemePreference>[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

/**
 * Chooses the colour theme: light or dark. Until a choice is made it shows the theme the device asks
 * for as the chosen one, and the first click saves a choice. The choice is saved in the browser and
 * put on the page at once. On a narrow screen the words are left to screen readers and the pictures
 * show alone, to save room.
 */
export function ThemeSwitch(): ReactElement {
  const { theme, setPreference } = useTheme();
  return (
    <div className="theme-switch">
      <SegmentedControl
        legend="Colour theme"
        hideLegend
        options={OPTIONS}
        value={theme}
        onChange={setPreference}
      />
    </div>
  );
}
