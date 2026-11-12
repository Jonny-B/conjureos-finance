/**
 * The shipped app runs on in-memory demo data and nothing is synced, so no
 * screen may claim the data is end-to-end encrypted or that the server holds
 * only ciphertext. (The dormant synced mode's own Settings line is the one
 * place the phrase may appear, behind an API_MODE check.)
 */
import layout from "../components/Layout.tsx?raw";
import more from "../components/More.tsx?raw";
import settings from "../components/Settings.tsx?raw";
import { describe, expect, it } from "vitest";

const read = (f: string) => ({ "Layout.tsx": layout, "More.tsx": more, "Settings.tsx": settings })[f]!;

describe("privacy copy tells the truth", () => {
  it("the sidebar and More do not claim end-to-end encryption", () => {
    expect(read("Layout.tsx")).not.toMatch(/end-to-end/i);
    expect(read("More.tsx")).not.toMatch(/end-to-end/i);
  });

  it("Settings does not claim ciphertext-only storage or that transactions are encrypted before sync", () => {
    const s = read("Settings.tsx");
    expect(s).not.toMatch(/ciphertext/i);
    expect(s).not.toMatch(/encrypted in your browser/i);
    expect(s).not.toMatch(/encryption key is still derived/i);
  });
});
