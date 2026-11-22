import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { buildTemplateScript, wrapScript, esc } from "../../src/templates/index.js";

function build(parameters: Record<string, unknown> = {}) {
  return wrapScript(
    buildTemplateScript("calendar.list_events", "com.apple.iCal", {
      startDate: "2026-03-08T08:00:00Z",
      endDate: "2026-03-09T07:00:00Z",
      timeZone: "America/Los_Angeles",
      ...parameters,
    })
  );
}

describe("Calendar event template", () => {
  it("filters overlaps within each selected calendar before sorting and pagination", () => {
    const script = build({ calendarId: 'cal"123', offset: 2, limit: 3 });
    assert.match(script, /every event of c whose start date < rangeEnd and end date > rangeStart/);
    assert.match(script, /set selectedCalendars to \(every calendar whose name is "cal\\"123"\)/);
    assert.match(
      script,
      /if \(count of selectedCalendars\) > 1 then error "Calendar name is ambiguous/
    );
    assert.ok(script.indexOf("set matchingEvents") < script.indexOf("sortUsingDescriptors"));
    assert.ok(script.indexOf("sortUsingDescriptors") < script.indexOf("subarrayWithRange"));
    assert.match(script, /set pageStart to 2/);
    assert.match(script, /if pageCount > 3 then set pageCount to 3/);
  });

  it("uses UTC ISO parsing instead of locale-dependent AppleScript date strings", () => {
    const script = build();
    assert.match(script, /NSISO8601DateFormatter/);
    assert.match(script, /dateFromString:"2026-03-08T08:00:00Z"/);
    assert.doesNotMatch(script, /date "2026/);
    assert.match(script, /stringFromDate:eventStart/);
  });

  it("iterates and flattens all calendars when none is selected", () => {
    const script = build();
    assert.match(script, /set selectedCalendars to calendars/);
    assert.match(script, /repeat with c in selectedCalendars/);
    assert.match(script, /eventRows's addObject:rowData/);
    assert.match(script, /Recurring events are not expanded/);
  });

  it("uses calendar names instead of broken Calendar identifier properties", () => {
    const script = buildTemplateScript("calendar.list_calendars", "com.apple.iCal", {});
    assert.match(script, /calName:name of c/);
    assert.doesNotMatch(script, /uid of c|calendarIdentifier of c/);
    assert.doesNotMatch(build(), /uid of c|calendarIdentifier of c/);
  });

  it("honors Notes folder selection and searches titles and body", () => {
    const script = buildTemplateScript("notes.search_notes", "com.apple.Notes", {
      folderId: 'folder"123',
      query: 'meeting"notes',
    });
    assert.match(script, /notes of folder id "folder\\"123" whose name contains/);
    assert.match(script, /or plaintext contains "meeting\\"notes"/);
  });
});

describe(
  "Calendar Foundation output without personal apps",
  { skip: process.platform !== "darwin" },
  () => {
    const rows = [
      {
        id: "late",
        name: 'Meeting "A"\nNext line',
        startDate: "2026-03-08T18:00:00Z",
        endDate: "2026-03-08T19:00:00Z",
        allDay: false,
      },
      {
        id: "early",
        name: "Morning",
        startDate: "2026-03-08T09:00:00Z",
        endDate: "2026-03-08T10:00:00Z",
        allDay: true,
      },
    ];

    function runPage(offset: number, limit: number) {
      // Replace the entire application-access block with synthetic rows, leaving
      // Foundation date parsing, sorting, pagination, and serialization unchanged.
      const fixture = `set fixtureData to (current application's NSString's stringWithString:"${esc(JSON.stringify(rows))}")'s dataUsingEncoding:(current application's NSUTF8StringEncoding)
set fixtureRows to current application's NSJSONSerialization's JSONObjectWithData:fixtureData options:0 |error|:(missing value)
eventRows's addObjectsFromArray:fixtureRows`;
      const script = build({ offset, limit }).replace(
        /tell application id "com\.apple\.iCal"[\s\S]*?\nend tell/,
        fixture
      );
      assert.doesNotMatch(script, /tell application/);
      return JSON.parse(
        execFileSync("osascript", ["-e", script], { encoding: "utf8", timeout: 10000 })
      );
    }

    it("returns chronological pages, booleans, metadata, and correctly escaped JSON", () => {
      const first = runPage(0, 1);
      assert.equal(first.total, 2);
      assert.equal(first.offset, 0);
      assert.equal(first.hasMore, true);
      assert.equal(first.timeZone, "America/Los_Angeles");
      assert.equal(first.items[0].id, "early");
      assert.equal(first.items[0].allDay, true);
      assert.match(first.limitations[0], /Recurring events/);
      const second = runPage(1, 1);
      assert.equal(second.hasMore, false);
      assert.equal(second.items[0].name, rows[0]?.name);
      assert.equal(second.items[0].allDay, false);
    });

    it("returns empty arrays past the final page", () => {
      const result = runPage(20, 2);
      assert.equal(result.total, 2);
      assert.equal(result.offset, 20);
      assert.equal(result.hasMore, false);
      assert.deepEqual(result.items, []);
    });

    it("round-trips explicit-offset dates across the spring DST transition", () => {
      const output = execFileSync(
        "osascript",
        [
          "-e",
          `use framework "Foundation"
use scripting additions
set formatter to current application's NSISO8601DateFormatter's alloc()'s init()
set startInstant to formatter's dateFromString:"2026-03-08T00:00:00-08:00"
set endInstant to formatter's dateFromString:"2026-03-09T00:00:00-07:00"
set startValue to startInstant as date
set endValue to endInstant as date
return ((endInstant's timeIntervalSinceDate:startInstant) as integer as text) & "|" & ((formatter's stringFromDate:startValue) as text) & "|" & ((formatter's stringFromDate:endValue) as text)`,
        ],
        {
          encoding: "utf8",
          timeout: 10000,
        }
      );
      assert.equal(output.trim(), "82800|2026-03-08T08:00:00Z|2026-03-09T07:00:00Z");
    });
  }
);
