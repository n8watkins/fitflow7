# Friends (proposal, not built)

Status: future proposal.
The owner reviewed the design and UI preview on 2026-11-03 and chose to skip friends for now.
Nothing below exists in the app.

## Principles

Private by default.
You add friends only with an invite link you send yourself.
Friends see that you worked out, never your weight, body stats or full history.

## Profiles

Profiles are opt-in.
A profile is a display name (the GitHub name by default, editable, at most 30 characters) and an initials avatar.
There are no public profile pages, no search and no directory.

## Adding a friend

You create a single-use invite link with a random 10-character code that expires after 7 days, with at most 5 open at once.
Your friend opens it while signed in and accepts.
Friendship is mutual, and there is no way to find or request strangers.

## What friends see

Friends see a finished workout (its name, minutes, and the time of day rounded to morning, afternoon or evening), your current streak and your minutes this week.
They never see weight, body stats, the contents of your routines, or history older than 7 days.
Each shared item can be turned off.

## Interaction

The only interaction is one fixed reaction, a cheer.
There are no free-text messages, so there is no text to moderate.

## Blocking and reporting

Removing a friend is silent.
Blocking stops them from inviting you again and voids open invite codes from them.
Reporting a display name sends it to the owner's admin view, and three reports hide the name until it is reviewed.

## Data model

- `profiles` (user_id, display_name, share_workouts, share_streak)
- `friend_invites` (code, from_user, expires_at, used_by)
- `friendships` (user_a, user_b, created_at), stored with user_a < user_b
- `blocks` (blocker, blocked)
- `cheers` (from_user, to_user, session_id, created_at)

The feed reads friends' recent sessions through a new endpoint that returns only the shared fields.
`/api/sync` stays private to its own user.

## Abuse risks and mitigations

- Harassment through display names: no free text, block, report, and limits on name length and characters.
- Guessing invite codes: 10 random characters, rate-limited redemption and a 7-day expiry.
- Inferring location or routine from workout times: times are rounded to the part of the day.
- A stranger or a minor seeing activity: friendships are mutual and invite-only.
- Spam: rate limits on invites and cheers.

## Effort

About 4 to 5 days.

- Schema and endpoints with tests: 1.5 days.
- Invite flow: 1 day.
- Friends page and feed: 1 day.
- Privacy settings, block and report: 1 day.
- Review and abuse tests: 0.5 days.

The UI preview screenshots from the review are in the owner's audit report.
