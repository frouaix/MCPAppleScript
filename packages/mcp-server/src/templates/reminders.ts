import { esc } from "./escape.js";

export function build(
  templateId: string,
  bundleId: string,
  parameters: Record<string, unknown>
): string {
  switch (templateId) {
    case "reminders.list_lists":
      return buildListLists(bundleId);
    case "reminders.list_reminders":
      return buildListReminders(bundleId, parameters);
    case "reminders.get_reminder":
      return buildGetReminder(bundleId, parameters);
    case "reminders.search_reminders":
      return buildSearchReminders(bundleId, parameters);
    case "reminders.create_reminder":
      return buildCreateReminder(bundleId, parameters);
    case "reminders.update_reminder":
      return buildUpdateReminder(bundleId, parameters);
    case "reminders.delete_reminder":
      return buildDeleteReminder(bundleId, parameters);
    case "reminders.show":
      return buildShow(bundleId);
    case "reminders.complete":
      return buildComplete(bundleId, parameters);
    default:
      throw new Error(`Unknown reminders template: ${templateId}`);
  }
}

function buildListLists(bundleId: string): string {
  return `tell application id "${bundleId}"
    set listList to {}
    repeat with l in lists
        set end of listList to {listId:id of l, listName:name of l, listCount:(count of reminders of l)}
    end repeat
    set output to "["
    repeat with i from 1 to count of listList
        set l to item i of listList
        set output to output & "{\\"id\\":\\"" & my jsonEsc(listId of l) & "\\",\\"name\\":\\"" & my jsonEsc(listName of l) & "\\",\\"type\\":\\"list\\",\\"itemCount\\":" & (listCount of l as text) & "}"
        if i < (count of listList) then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildListReminders(bundleId: string, parameters: Record<string, unknown>): string {
  const listId = (parameters["listId"] as string | undefined) ?? "";
  const limit = (parameters["limit"] as number | undefined) ?? 50;
  const offset = (parameters["offset"] as number | undefined) ?? 0;

  const targetClause = listId
    ? `reminders of list id "${esc(listId)}"`
    : "reminders";

  return `tell application id "${bundleId}"
    set allReminders to ${targetClause}
    set totalCount to count of allReminders
    set startIdx to ${offset + 1}
    set endIdx to ${offset + limit}
    if endIdx > totalCount then set endIdx to totalCount
    set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
    if startIdx ≤ totalCount then
        repeat with i from startIdx to endIdx
            set r to item i of allReminders
            set rId to id of r
            set rName to name of r
            set rCompleted to completed of r
            set rDueDate to ""
            try
                set rDueDate to due date of r as «class isot» as string
            end try
            set output to output & "{\\"id\\":\\"" & my jsonEsc(rId) & "\\",\\"name\\":\\"" & my jsonEsc(rName) & "\\",\\"type\\":\\"reminder\\",\\"properties\\":{\\"completed\\":" & rCompleted & ",\\"dueDate\\":\\"" & my jsonEsc(rDueDate) & "\\"}}"
            if i < endIdx then set output to output & ","
        end repeat
    end if
    set output to output & "]}"
    return output
end tell`;
}

function buildGetReminder(bundleId: string, parameters: Record<string, unknown>): string {
  const reminderId = parameters["reminderId"] as string | undefined;
  if (!reminderId) throw new Error("reminders.get_reminder requires 'reminderId' parameter");
  return `tell application id "${bundleId}"
    set r to reminder id "${esc(reminderId)}"
    set rId to id of r
    set rName to name of r
    set rBody to body of r
    set rCompleted to completed of r
    set rPriority to priority of r
    set rFlagged to flagged of r
    set rCreated to creation date of r as «class isot» as string
    set rModified to modification date of r as «class isot» as string
    set cName to name of container of r
    set rDueDate to ""
    try
        set rDueDate to due date of r as «class isot» as string
    end try
    return "{\\"id\\":\\"" & my jsonEsc(rId) & "\\",\\"name\\":\\"" & my jsonEsc(rName) & "\\",\\"type\\":\\"reminder\\",\\"containerName\\":\\"" & my jsonEsc(cName) & "\\",\\"createdAt\\":\\"" & my jsonEsc(rCreated) & "\\",\\"modifiedAt\\":\\"" & my jsonEsc(rModified) & "\\",\\"properties\\":{\\"body\\":\\"" & my jsonEsc(rBody) & "\\",\\"completed\\":" & rCompleted & ",\\"priority\\":" & rPriority & ",\\"flagged\\":" & rFlagged & ",\\"dueDate\\":\\"" & my jsonEsc(rDueDate) & "\\"}}"
end tell`;
}

function buildSearchReminders(bundleId: string, parameters: Record<string, unknown>): string {
  const query = parameters["query"] as string | undefined;
  if (!query) throw new Error("reminders.search_reminders requires 'query' parameter");
  const limit = (parameters["limit"] as number | undefined) ?? 20;

  return `tell application id "${bundleId}"
    set matchingReminders to reminders whose name contains "${esc(query)}"
    set resultCount to count of matchingReminders
    if resultCount > ${limit} then set resultCount to ${limit}
    set output to "["
    repeat with i from 1 to resultCount
        set r to item i of matchingReminders
        set rId to id of r
        set rName to name of r
        set rCompleted to completed of r
        set output to output & "{\\"id\\":\\"" & my jsonEsc(rId) & "\\",\\"name\\":\\"" & my jsonEsc(rName) & "\\",\\"type\\":\\"reminder\\",\\"properties\\":{\\"completed\\":" & rCompleted & "}}"
        if i < resultCount then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildCreateReminder(bundleId: string, parameters: Record<string, unknown>): string {
  const name = parameters["name"] as string | undefined;
  if (!name) throw new Error("reminders.create_reminder requires 'name' parameter");
  const listName = (parameters["listName"] as string | undefined) ?? "";
  const body = esc((parameters["body"] as string | undefined) ?? "");
  const dueDate = (parameters["dueDate"] as string | undefined) ?? "";
  const priority = (parameters["priority"] as number | undefined) ?? 0;
  const flagged = (parameters["flagged"] as boolean | undefined) ?? false;

  let props = `name:"${esc(name)}"`;
  if (body) props += `, body:"${body}"`;
  if (priority > 0) props += `, priority:${priority}`;
  if (flagged) props += ", flagged:true";

  const targetClause = listName
    ? `at end of reminders of list "${esc(listName)}"`
    : "";

  const dueDateLine = dueDate
    ? `\n    set due date of newReminder to date "${esc(dueDate)}"`
    : "";

  return `tell application id "${bundleId}"
    set newReminder to make new reminder ${targetClause} with properties {${props}}${dueDateLine}
    set rId to id of newReminder
    return "{\\"id\\":\\"" & my jsonEsc(rId) & "\\",\\"name\\":\\"${esc(name)}\\",\\"type\\":\\"reminder\\"}"
end tell`;
}

function buildUpdateReminder(bundleId: string, parameters: Record<string, unknown>): string {
  const reminderId = parameters["reminderId"] as string | undefined;
  if (!reminderId) throw new Error("reminders.update_reminder requires 'reminderId' parameter");
  const setStatements: string[] = [];
  if (parameters["name"] !== undefined) {
    setStatements.push(`set name of r to "${esc(parameters["name"] as string)}"`);
  }
  if (parameters["body"] !== undefined) {
    setStatements.push(`set body of r to "${esc(parameters["body"] as string)}"`);
  }
  if (parameters["completed"] !== undefined) {
    setStatements.push(`set completed of r to ${parameters["completed"]}`);
  }
  if (parameters["priority"] !== undefined) {
    setStatements.push(`set priority of r to ${parameters["priority"]}`);
  }
  if (parameters["flagged"] !== undefined) {
    setStatements.push(`set flagged of r to ${parameters["flagged"]}`);
  }
  if (parameters["dueDate"] !== undefined) {
    setStatements.push(`set due date of r to date "${esc(parameters["dueDate"] as string)}"`);
  }
  if (setStatements.length === 0) {
    throw new Error("reminders.update_reminder requires at least one property to update");
  }
  return `tell application id "${bundleId}"
    set r to reminder id "${esc(reminderId)}"
    ${setStatements.join("\n    ")}
    return "{\\"id\\":\\"" & my jsonEsc(id of r) & "\\",\\"name\\":\\"" & my jsonEsc(name of r) & "\\",\\"type\\":\\"reminder\\"}"
end tell`;
}

function buildDeleteReminder(bundleId: string, parameters: Record<string, unknown>): string {
  const reminderId = parameters["reminderId"] as string | undefined;
  if (!reminderId) throw new Error("reminders.delete_reminder requires 'reminderId' parameter");
  return `tell application id "${bundleId}"
    set r to reminder id "${esc(reminderId)}"
    set rName to name of r
    delete r
    return "{\\"deleted\\":true,\\"name\\":\\"" & my jsonEsc(rName) & "\\"}"
end tell`;
}

function buildShow(bundleId: string): string {
  return `tell application id "${bundleId}"
    activate
    return "{\\"shown\\":true}"
end tell`;
}

function buildComplete(bundleId: string, parameters: Record<string, unknown>): string {
  const reminderId = parameters["reminderId"] as string | undefined;
  if (!reminderId) throw new Error("reminders.complete requires 'reminderId' parameter");
  return `tell application id "${bundleId}"
    set r to reminder id "${esc(reminderId)}"
    set completed of r to true
    return "{\\"id\\":\\"" & my jsonEsc(id of r) & "\\",\\"completed\\":true}"
end tell`;
}
