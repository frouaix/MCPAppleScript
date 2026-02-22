# Scenarios

Interesting ways to use MCP-AppleScript with an AI assistant (e.g. GitHub Copilot, Claude) in everyday life and at work.

## Everyday Life

### 1. Weekly meal-plan grocery list

> "Look at my Calendar events for next week that have 'dinner' in the title, then create a Reminders list called 'Groceries' with one reminder per ingredient I'll need."

The assistant reads Calendar events via `app.search`, extracts meal names, reasons about ingredients, and creates reminders via `app.create` — all without you leaving the chat.

### 2. Trip planning from emails

> "Find my latest flight confirmation email, pull out the dates and destination, then create Calendar events for the flights and a packing checklist in Reminders."

Uses `app.search` on Mail to find the confirmation, `app.create` on Calendar for flight events, and `app.create` on Reminders for the packing list.

### 3. Photo album organizer

> "Create a Photos album called 'Birthday Party 2026' and tell me how many photos I took last Saturday so I can decide which ones to import."

Uses `app.create` on Photos to make the album and `app.search` or `app.list` to count recent media items by date.

## Work

### 1. Meeting prep notes

> "Check my Calendar for tomorrow's meetings, then for each one create a Note with the event title, attendees, and a blank 'Action Items' section."

The assistant uses `app.list` on Calendar filtered by date, then `app.create` on Notes for each meeting — giving you a ready-made set of meeting notes before the day starts.

### 2. Email triage summary

> "Summarize my unread Mail in the Inbox: group messages by sender, flag anything that looks urgent, and list the subjects I haven't replied to."

Uses `app.search` on Mail to fetch unread messages, then the assistant analyzes and summarizes them in the chat. Follow up with `app.action` to flag or reply.

### 3. End-of-day standup draft

> "Look at today's Calendar events and my completed Reminders, then draft a standup update in Notes summarizing what I did and what's still open."

Combines `app.search` on Calendar and Reminders, then `app.create` on Notes with a formatted standup summary — ready to paste into Slack or Teams.
