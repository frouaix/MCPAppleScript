import { esc } from "./escape.js";

export function build(
  templateId: string,
  bundleId: string,
  parameters: Record<string, unknown>
): string {
  switch (templateId) {
    case "mail.list_mailboxes":
      return buildListMailboxes(bundleId);
    case "mail.list_messages":
      return buildListMessages(bundleId, parameters);
    case "mail.get_message":
      return buildGetMessage(bundleId, parameters);
    case "mail.search_messages":
      return buildSearchMessages(bundleId, parameters);
    case "mail.create_draft":
      return buildCreateDraft(bundleId, parameters);
    case "mail.update_message":
      return buildUpdateMessage(bundleId, parameters);
    case "mail.delete_message":
      return buildDeleteMessage(bundleId, parameters);
    case "mail.show":
      return buildShow(bundleId);
    case "mail.send":
      return buildSend(bundleId, parameters);
    default:
      throw new Error(`Unknown mail template: ${templateId}`);
  }
}

function buildListMailboxes(bundleId: string): string {
  return `tell application id "${bundleId}"
    set mboxList to {}
    repeat with acct in accounts
        repeat with mbox in mailboxes of acct
            set end of mboxList to {mboxName:name of mbox, acctName:name of acct, msgCount:count of messages of mbox}
        end repeat
    end repeat
    set output to "["
    repeat with i from 1 to count of mboxList
        set m to item i of mboxList
        set output to output & "{\\"id\\":\\"" & my jsonEsc(acctName of m) & "/" & my jsonEsc(mboxName of m) & "\\",\\"name\\":\\"" & my jsonEsc(mboxName of m) & "\\",\\"type\\":\\"mailbox\\",\\"itemCount\\":" & (msgCount of m as text) & ",\\"properties\\":{\\"account\\":\\"" & my jsonEsc(acctName of m) & "\\"}}"
        if i < (count of mboxList) then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildListMessages(bundleId: string, parameters: Record<string, unknown>): string {
  const mailboxName = (parameters["mailboxName"] as string | undefined) ?? "INBOX";
  const limit = (parameters["limit"] as number | undefined) ?? 50;
  const offset = (parameters["offset"] as number | undefined) ?? 0;

  return `tell application id "${bundleId}"
    set targetMailbox to mailbox "${esc(mailboxName)}"
    set allMessages to messages of targetMailbox
    set totalCount to count of allMessages
    set startIdx to ${offset + 1}
    set endIdx to ${offset + limit}
    if endIdx > totalCount then set endIdx to totalCount
    set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
    if startIdx ≤ totalCount then
        repeat with i from startIdx to endIdx
            set m to item i of allMessages
            set mId to id of m
            set mSubject to subject of m
            set mSender to sender of m
            set mDate to date received of m as «class isot» as string
            set mRead to read status of m
            set output to output & "{\\"id\\":" & mId & ",\\"name\\":\\"" & my jsonEsc(mSubject) & "\\",\\"type\\":\\"message\\",\\"properties\\":{\\"sender\\":\\"" & my jsonEsc(mSender) & "\\",\\"dateReceived\\":\\"" & my jsonEsc(mDate) & "\\",\\"read\\":" & mRead & "}}"
            if i < endIdx then set output to output & ","
        end repeat
    end if
    set output to output & "]}"
    return output
end tell`;
}

function buildGetMessage(bundleId: string, parameters: Record<string, unknown>): string {
  const messageId = parameters["messageId"] as string | undefined;
  if (!messageId) throw new Error("mail.get_message requires 'messageId' parameter");
  return `tell application id "${bundleId}"
    set m to first message of mailboxes whose id is ${esc(messageId)}
    set mId to id of m
    set mSubject to subject of m
    set mSender to sender of m
    set mDate to date received of m as «class isot» as string
    set mRead to read status of m
    set mContent to content of m
    set recipList to ""
    repeat with r in to recipients of m
        if recipList is not "" then set recipList to recipList & ", "
        set recipList to recipList & address of r
    end repeat
    return "{\\"id\\":" & mId & ",\\"name\\":\\"" & my jsonEsc(mSubject) & "\\",\\"type\\":\\"message\\",\\"properties\\":{\\"sender\\":\\"" & my jsonEsc(mSender) & "\\",\\"to\\":\\"" & my jsonEsc(recipList) & "\\",\\"dateReceived\\":\\"" & my jsonEsc(mDate) & "\\",\\"read\\":" & mRead & ",\\"body\\":\\"" & my jsonEsc(mContent) & "\\"}}"
end tell`;
}

function buildSearchMessages(bundleId: string, parameters: Record<string, unknown>): string {
  const query = parameters["query"] as string | undefined;
  if (!query) throw new Error("mail.search_messages requires 'query' parameter");
  const limit = (parameters["limit"] as number | undefined) ?? 20;

  return `tell application id "${bundleId}"
    set matchingMessages to {}
    repeat with acct in accounts
        repeat with mbox in mailboxes of acct
            repeat with m in (messages of mbox whose subject contains "${esc(query)}")
                set end of matchingMessages to m
                if (count of matchingMessages) ≥ ${limit} then exit repeat
            end repeat
            if (count of matchingMessages) ≥ ${limit} then exit repeat
        end repeat
        if (count of matchingMessages) ≥ ${limit} then exit repeat
    end repeat
    set resultCount to count of matchingMessages
    set output to "["
    repeat with i from 1 to resultCount
        set m to item i of matchingMessages
        set mId to id of m
        set mSubject to subject of m
        set mSender to sender of m
        set mDate to date received of m as «class isot» as string
        set output to output & "{\\"id\\":" & mId & ",\\"name\\":\\"" & my jsonEsc(mSubject) & "\\",\\"type\\":\\"message\\",\\"properties\\":{\\"sender\\":\\"" & my jsonEsc(mSender) & "\\",\\"dateReceived\\":\\"" & my jsonEsc(mDate) & "\\"}}"
        if i < resultCount then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildCreateDraft(bundleId: string, parameters: Record<string, unknown>): string {
  const to = parameters["to"] as string | undefined;
  if (!to) throw new Error("mail.create_draft requires 'to' parameter");
  const subject = esc((parameters["subject"] as string | undefined) ?? "");
  const body = esc((parameters["body"] as string | undefined) ?? "");

  return `tell application id "${bundleId}"
    set newMessage to make new outgoing message with properties {subject:"${subject}", content:"${body}", visible:true}
    tell newMessage
        make new to recipient at end of to recipients with properties {address:"${esc(to)}"}
    end tell
    return "{\\"id\\":\\"draft\\",\\"name\\":\\"" & my jsonEsc(subject of newMessage) & "\\",\\"type\\":\\"message\\"}"
end tell`;
}

function buildUpdateMessage(bundleId: string, parameters: Record<string, unknown>): string {
  const messageId = parameters["messageId"] as string | undefined;
  if (!messageId) throw new Error("mail.update_message requires 'messageId' parameter");
  const setStatements: string[] = [];
  if (parameters["read"] !== undefined) {
    setStatements.push(`set read status of m to ${parameters["read"]}`);
  }
  if (parameters["flagged"] !== undefined) {
    setStatements.push(`set flagged status of m to ${parameters["flagged"]}`);
  }
  if (setStatements.length === 0) {
    throw new Error("mail.update_message requires at least one property to update");
  }
  return `tell application id "${bundleId}"
    set m to first message of mailboxes whose id is ${esc(messageId)}
    ${setStatements.join("\n    ")}
    return "{\\"id\\":" & (id of m) & ",\\"name\\":\\"" & my jsonEsc(subject of m) & "\\",\\"type\\":\\"message\\"}"
end tell`;
}

function buildDeleteMessage(bundleId: string, parameters: Record<string, unknown>): string {
  const messageId = parameters["messageId"] as string | undefined;
  if (!messageId) throw new Error("mail.delete_message requires 'messageId' parameter");
  return `tell application id "${bundleId}"
    set m to first message of mailboxes whose id is ${esc(messageId)}
    set mSubject to subject of m
    delete m
    return "{\\"deleted\\":true,\\"name\\":\\"" & my jsonEsc(mSubject) & "\\"}"
end tell`;
}

function buildShow(bundleId: string): string {
  return `tell application id "${bundleId}"
    activate
    return "{\\"shown\\":true}"
end tell`;
}

function buildSend(bundleId: string, parameters: Record<string, unknown>): string {
  const to = parameters["to"] as string | undefined;
  if (!to) throw new Error("mail.send requires 'to' parameter");
  const subject = esc((parameters["subject"] as string | undefined) ?? "");
  const body = esc((parameters["body"] as string | undefined) ?? "");

  return `tell application id "${bundleId}"
    set newMessage to make new outgoing message with properties {subject:"${subject}", content:"${body}", visible:false}
    tell newMessage
        make new to recipient at end of to recipients with properties {address:"${esc(to)}"}
    end tell
    send newMessage
    return "{\\"sent\\":true,\\"to\\":\\"${esc(to)}\\"}"
end tell`;
}
