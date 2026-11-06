import { describe, expect, it } from "bun:test";
import { nextIncidentId } from "../src/lib/incidents";

describe("incident identifiers", () => {
  it("starts at INC-00001 for an empty incident history", () => {
    expect(nextIncidentId([])).toBe("INC-00001");
  });

  it("increments from the highest stored numeric incident ID", () => {
    const records = [
      { id: "INC-00012" },
      { id: "INC-00003" },
      { id: "legacy-record" },
    ] as Parameters<typeof nextIncidentId>[0];
    expect(nextIncidentId(records)).toBe("INC-00013");
  });
});
