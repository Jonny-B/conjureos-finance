/**
 * Conjure Finance is a sealed app (ConjureOS Phase 62): the AI changes nothing
 * in it. The type is declared once, as `appType`. `editable: false` is the
 * mirror that clients and stores predating `appType` still read, so it stays
 * beside it. `editStyle` is not written: the store and the kernel write the
 * legacy keys themselves.
 */
import { describe, expect, it } from "vitest";
import pkg from "../../package.json";

const manifest = pkg.conjureos as Record<string, unknown>;

describe("Finance's ConjureOS manifest", () => {
  it("declares itself sealed", () => {
    expect(manifest.appType).toBe("sealed");
  });

  it("keeps the editable mirror false for clients that predate appType", () => {
    expect(manifest.editable).toBe(false);
  });

  it("does not declare editStyle", () => {
    expect("editStyle" in manifest).toBe(false);
  });
});
