import { esc } from "./escape.js";

export function build(
  templateId: string,
  bundleId: string,
  parameters: Record<string, unknown>
): string {
  switch (templateId) {
    case "messages.list_chats":
      return buildListChats(bundleId);
    case "messages.list_messages":
      return buildListMessages(bundleId, parameters);
    case "messages.get_chat":
      return buildGetChat(bundleId, parameters);
    case "messages.search_chats":
      return buildSearchChats(bundleId, parameters);
    case "messages.send":
      return buildSend(bundleId, parameters);
    case "messages.show":
      return buildShow(bundleId);
    default:
      throw new Error(`Unknown messages template: ${templateId}`);
  }
}

function buildListChats(bundleId: string): string {
  return `tell application id "${bundleId}"
    set chatList to {}
    repeat with c in chats
        set participantNames to ""
        repeat with p in participants of c
            if participantNames is not "" then set participantNames to participantNames & ", "
            set participantNames to participantNames & name of p
        end repeat
        set end of chatList to {chatId:id of c, chatName:name of c, chatParticipants:participantNames}
    end repeat
    set output to "["
    repeat with i from 1 to count of chatList
        set c to item i of chatList
        set output to output & "{\\"id\\":\\"" & my jsonEsc(chatId of c) & "\\",\\"name\\":\\"" & my jsonEsc(chatName of c) & "\\",\\"type\\":\\"chat\\",\\"properties\\":{\\"participants\\":\\"" & my jsonEsc(chatParticipants of c) & "\\"}}"
        if i < (count of chatList) then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildListMessages(bundleId: string, parameters: Record<string, unknown>): string {
  const chatId = (parameters["chatId"] as string | undefined) ?? "";
  const limit = (parameters["limit"] as number | undefined) ?? 50;

  const targetClause = chatId
    ? `messages of chat id "${esc(chatId)}"`
    : "messages";

  return `tell application id "${bundleId}"
    set allMessages to ${targetClause}
    set totalCount to count of allMessages
    set resultCount to totalCount
    if resultCount > ${limit} then set resultCount to ${limit}
    set output to "{\\"total\\":" & (totalCount as text) & ",\\"items\\":["
    repeat with i from 1 to resultCount
        set m to item i of allMessages
        set mId to id of m
        set mSender to ""
        try
            set mSender to name of sender of m
        end try
        set mDate to date of m as «class isot» as string
        set output to output & "{\\"id\\":" & mId & ",\\"name\\":\\"message\\",\\"type\\":\\"message\\",\\"properties\\":{\\"sender\\":\\"" & my jsonEsc(mSender) & "\\",\\"date\\":\\"" & my jsonEsc(mDate) & "\\"}}"
        if i < resultCount then set output to output & ","
    end repeat
    set output to output & "]}"
    return output
end tell`;
}

function buildGetChat(bundleId: string, parameters: Record<string, unknown>): string {
  const chatId = parameters["chatId"] as string | undefined;
  if (!chatId) throw new Error("messages.get_chat requires 'chatId' parameter");
  return `tell application id "${bundleId}"
    set c to chat id "${esc(chatId)}"
    set cId to id of c
    set cName to name of c
    set participantNames to ""
    repeat with p in participants of c
        if participantNames is not "" then set participantNames to participantNames & ", "
        set participantNames to participantNames & name of p
    end repeat
    set msgCount to count of messages of c
    return "{\\"id\\":\\"" & my jsonEsc(cId) & "\\",\\"name\\":\\"" & my jsonEsc(cName) & "\\",\\"type\\":\\"chat\\",\\"properties\\":{\\"participants\\":\\"" & my jsonEsc(participantNames) & "\\",\\"messageCount\\":" & (msgCount as text) & "}}"
end tell`;
}

function buildSearchChats(bundleId: string, parameters: Record<string, unknown>): string {
  const query = parameters["query"] as string | undefined;
  if (!query) throw new Error("messages.search_chats requires 'query' parameter");
  const limit = (parameters["limit"] as number | undefined) ?? 20;

  return `tell application id "${bundleId}"
    set matchingChats to chats whose name contains "${esc(query)}"
    set resultCount to count of matchingChats
    if resultCount > ${limit} then set resultCount to ${limit}
    set output to "["
    repeat with i from 1 to resultCount
        set c to item i of matchingChats
        set cId to id of c
        set cName to name of c
        set output to output & "{\\"id\\":\\"" & my jsonEsc(cId) & "\\",\\"name\\":\\"" & my jsonEsc(cName) & "\\",\\"type\\":\\"chat\\"}"
        if i < resultCount then set output to output & ","
    end repeat
    set output to output & "]"
    return output
end tell`;
}

function buildSend(bundleId: string, parameters: Record<string, unknown>): string {
  const to = parameters["to"] as string | undefined;
  if (!to) throw new Error("messages.send requires 'to' parameter (phone number or email)");
  const message = parameters["message"] as string | undefined;
  if (!message) throw new Error("messages.send requires 'message' parameter");
  const service = esc((parameters["service"] as string | undefined) ?? "iMessage");

  return `tell application id "${bundleId}"
    set targetService to 1st service whose service type = ${service === "SMS" ? "SMS" : "iMessage"}
    set targetBuddy to buddy "${esc(to)}" of targetService
    send "${esc(message)}" to targetBuddy
    return "{\\"sent\\":true,\\"to\\":\\"${esc(to)}\\"}"
end tell`;
}

function buildShow(bundleId: string): string {
  return `tell application id "${bundleId}"
    activate
    return "{\\"shown\\":true}"
end tell`;
}
