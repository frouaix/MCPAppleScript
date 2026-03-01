import { esc } from "./escape.js";

export function build(
  templateId: string,
  bundleId: string,
  parameters: Record<string, unknown>
): string {
  switch (templateId) {
    case "contacts.list_groups":
      return buildListGroups(bundleId);
    case "contacts.list_people":
      return buildListPeople(bundleId, parameters);
    case "contacts.get_person":
      return buildGetPerson(bundleId, parameters);
    case "contacts.search_people":
      return buildSearchPeople(bundleId, parameters);
    case "contacts.create_person":
      return buildCreatePerson(bundleId, parameters);
    case "contacts.update_person":
      return buildUpdatePerson(bundleId, parameters);
    case "contacts.delete_person":
      return buildDeletePerson(bundleId, parameters);
    case "contacts.show":
      return buildShow(bundleId);
    default:
      throw new Error(`Unknown contacts template: ${templateId}`);
  }
}

function buildListGroups(bundleId: string): string {
  return `tell application id "${bundleId}"
    set groupList to {}
    repeat with g in groups
        set end of groupList to {groupId:id of g, groupName:name of g, personCount:(count of people of g)}
    end repeat
    set output to "["
    repeat with i from 1 to count of groupList
        set g to item i of groupList
        set output to output & "{\\"id\\":\\"" & my jsonEsc(groupId of g) & "\\",\\"name\\":\\"" & my jsonEsc(groupName of g) & "\\",\\"type\\":\\"group\\",\\"itemCount\\":" & (personCount of g as text) & "}"
        if i < (count of groupList) then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildListPeople(bundleId: string, parameters: Record<string, unknown>): string {
  const groupId = (parameters["groupId"] as string | undefined) ?? "";
  const limit = (parameters["limit"] as number | undefined) ?? 50;
  const offset = (parameters["offset"] as number | undefined) ?? 0;

  const targetClause = groupId
    ? `people of group id "${esc(groupId)}"`
    : "people";

  return `tell application id "${bundleId}"
    set allPeople to ${targetClause}
    set totalCount to count of allPeople
    set startIdx to ${offset + 1}
    set endIdx to ${offset + limit}
    if endIdx > totalCount then set endIdx to totalCount
    set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
    if startIdx ≤ totalCount then
        repeat with i from startIdx to endIdx
            set p to item i of allPeople
            set pId to id of p
            set pFirst to first name of p
            set pLast to last name of p
            set pName to pFirst & " " & pLast
            set output to output & "{\\"id\\":\\"" & my jsonEsc(pId) & "\\",\\"name\\":\\"" & my jsonEsc(pName) & "\\",\\"type\\":\\"person\\",\\"properties\\":{\\"firstName\\":\\"" & my jsonEsc(pFirst) & "\\",\\"lastName\\":\\"" & my jsonEsc(pLast) & "\\"}}"
            if i < endIdx then set output to output & ","
        end repeat
    end if
    set output to output & "]}"
    return output
end tell`;
}

function buildGetPerson(bundleId: string, parameters: Record<string, unknown>): string {
  const personId = parameters["personId"] as string | undefined;
  if (!personId) throw new Error("contacts.get_person requires 'personId' parameter");
  return `tell application id "${bundleId}"
    set p to person id "${esc(personId)}"
    set pId to id of p
    set pFirst to first name of p
    set pLast to last name of p
    set pOrg to organization of p
    set pTitle to job title of p
    set pNote to note of p
    set emailList to ""
    repeat with e in emails of p
        if emailList is not "" then set emailList to emailList & ", "
        set emailList to emailList & value of e
    end repeat
    set phoneList to ""
    repeat with ph in phones of p
        if phoneList is not "" then set phoneList to phoneList & ", "
        set phoneList to phoneList & value of ph
    end repeat
    return "{\\"id\\":\\"" & my jsonEsc(pId) & "\\",\\"name\\":\\"" & my jsonEsc(pFirst) & " " & my jsonEsc(pLast) & "\\",\\"type\\":\\"person\\",\\"properties\\":{\\"firstName\\":\\"" & my jsonEsc(pFirst) & "\\",\\"lastName\\":\\"" & my jsonEsc(pLast) & "\\",\\"organization\\":\\"" & my jsonEsc(pOrg) & "\\",\\"jobTitle\\":\\"" & my jsonEsc(pTitle) & "\\",\\"note\\":\\"" & my jsonEsc(pNote) & "\\",\\"emails\\":\\"" & my jsonEsc(emailList) & "\\",\\"phones\\":\\"" & my jsonEsc(phoneList) & "\\"}}"
end tell`;
}

function buildSearchPeople(bundleId: string, parameters: Record<string, unknown>): string {
  const query = parameters["query"] as string | undefined;
  if (!query) throw new Error("contacts.search_people requires 'query' parameter");
  const limit = (parameters["limit"] as number | undefined) ?? 20;

  return `tell application id "${bundleId}"
    set matchingPeople to people whose name contains "${esc(query)}"
    set resultCount to count of matchingPeople
    if resultCount > ${limit} then set resultCount to ${limit}
    set output to "["
    repeat with i from 1 to resultCount
        set p to item i of matchingPeople
        set pId to id of p
        set pFirst to first name of p
        set pLast to last name of p
        set output to output & "{\\"id\\":\\"" & my jsonEsc(pId) & "\\",\\"name\\":\\"" & my jsonEsc(pFirst) & " " & my jsonEsc(pLast) & "\\",\\"type\\":\\"person\\"}"
        if i < resultCount then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildCreatePerson(bundleId: string, parameters: Record<string, unknown>): string {
  const firstName = parameters["firstName"] as string | undefined;
  if (!firstName) throw new Error("contacts.create_person requires 'firstName' parameter");
  const lastName = esc((parameters["lastName"] as string | undefined) ?? "");
  const organization = esc((parameters["organization"] as string | undefined) ?? "");
  const email = (parameters["email"] as string | undefined) ?? "";
  const phone = (parameters["phone"] as string | undefined) ?? "";
  const groupId = (parameters["groupId"] as string | undefined) ?? "";

  const extraLines: string[] = [];
  if (email) {
    extraLines.push(
      `make new email at end of emails of newPerson with properties {label:"work", value:"${esc(email)}"}`
    );
  }
  if (phone) {
    extraLines.push(
      `make new phone at end of phones of newPerson with properties {label:"mobile", value:"${esc(phone)}"}`
    );
  }
  if (groupId) {
    extraLines.push(`add newPerson to group id "${esc(groupId)}"`);
  }

  let props = `first name:"${esc(firstName)}"`;
  if (lastName) props += `, last name:"${lastName}"`;
  if (organization) props += `, organization:"${organization}"`;

  return `tell application id "${bundleId}"
    set newPerson to make new person with properties {${props}}
    ${extraLines.join("\n    ")}
    save
    set pId to id of newPerson
    return "{\\"id\\":\\"" & my jsonEsc(pId) & "\\",\\"name\\":\\"${esc(firstName)} ${lastName}\\",\\"type\\":\\"person\\"}"
end tell`;
}

function buildUpdatePerson(bundleId: string, parameters: Record<string, unknown>): string {
  const personId = parameters["personId"] as string | undefined;
  if (!personId) throw new Error("contacts.update_person requires 'personId' parameter");
  const setStatements: string[] = [];
  if (parameters["firstName"] !== undefined) {
    setStatements.push(`set first name of p to "${esc(parameters["firstName"] as string)}"`);
  }
  if (parameters["lastName"] !== undefined) {
    setStatements.push(`set last name of p to "${esc(parameters["lastName"] as string)}"`);
  }
  if (parameters["organization"] !== undefined) {
    setStatements.push(`set organization of p to "${esc(parameters["organization"] as string)}"`);
  }
  if (parameters["jobTitle"] !== undefined) {
    setStatements.push(`set job title of p to "${esc(parameters["jobTitle"] as string)}"`);
  }
  if (parameters["note"] !== undefined) {
    setStatements.push(`set note of p to "${esc(parameters["note"] as string)}"`);
  }
  if (setStatements.length === 0) {
    throw new Error("contacts.update_person requires at least one property to update");
  }
  return `tell application id "${bundleId}"
    set p to person id "${esc(personId)}"
    ${setStatements.join("\n    ")}
    save
    return "{\\"id\\":\\"" & my jsonEsc(id of p) & "\\",\\"name\\":\\"" & my jsonEsc(first name of p) & " " & my jsonEsc(last name of p) & "\\",\\"type\\":\\"person\\"}"
end tell`;
}

function buildDeletePerson(bundleId: string, parameters: Record<string, unknown>): string {
  const personId = parameters["personId"] as string | undefined;
  if (!personId) throw new Error("contacts.delete_person requires 'personId' parameter");
  return `tell application id "${bundleId}"
    set p to person id "${esc(personId)}"
    set pName to first name of p & " " & last name of p
    delete p
    save
    return "{\\"deleted\\":true,\\"name\\":\\"" & my jsonEsc(pName) & "\\"}"
end tell`;
}

function buildShow(bundleId: string): string {
  return `tell application id "${bundleId}"
    activate
    return "{\\"shown\\":true}"
end tell`;
}
