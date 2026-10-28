# Band management: shows, practices, set lists and the rest

Written 2026-10-27 from Kevin's brief: the features he has in mind are
"more like band management, with shows being a subset of that, and
probably the first phase", and "perhaps Set List is a good first thing to
build". He is not sure that tying shows to sessions is right. Nothing
here is built; the plan is for him to approve, change or reorder before
any code. Each phase is a release or two on its own, like
`docs/dashboard-plan.md`.

## What Kevin described

- **Members and contact info** for the band.
- **A show calendar**, upcoming and past. A show has a date, a location,
  a showtime, a load-in time, possibly a sound-check time; posters (PDF)
  to upload and download for promotion; pictures taken at the show;
  notes on the performance for posterity; ticket price and how many were
  sold; what each member got paid and/or the deal with the venue;
  attendance; a booking agent or promoter; video from the show; and,
  afterwards, one or more session recordings linked to it.
- **A public page for a show**: the poster, directions to the venue, the
  songs.
- **Set lists and posters as objects of their own**, searchable and
  listed apart from any show (on the dashboard, say). A set list is
  written and saved, browsed on a page of set lists, and has a **show
  view** that can be texted out and pulled up on a phone during the
  show.
- **Practices**, scheduled with a date, time and place, with session
  recordings linked to them.

## The central decision: events are not sessions

A session (`recording_session`) is a shelf of tapes: it comes into being
when someone records or uploads, it is named after its place and day, and
its one job is to hold recordings. A show or a practice is a **calendar
item**: it is created in advance by whoever books it, it has twenty
fields a tape shelf has no use for, it has a public face, and most of
them will never have a recording. Making one the other means every
session becomes a calendar entry and every show a tape shelf.

So the plan adds an **`event`** table (kind `show` or `practice`) and
leaves `recording_session` alone, with one link between them:
`recording_session.event_id` (nullable), "the show or practice these
tapes are of". That is exactly the after-the-fact link Kevin asked for,
it allows several sessions per event (a soundboard tape and a phone tape
uploaded separately), and the Sessions page keeps working unchanged. A
session's page gains an "Of the show …" line and the event's page lists
its sessions. The session's own `kind`, `place` and `startsOn` stay:
they are what the recorder knows at upload time, and they are how a
session is found with no event to hang on.

Everything else in the brief is either a column on `event`, a child
table of it, or an object of its own that an event can point at.

## The objects

Set lists first, as Kevin suggested, since a band needs one with or
without a show on the calendar.

### Set list (`set_list`, `set_list_item`)

**Built 2026-10-28 (v0.192.0)** as below, with the paste import and the
dashboard section left for v0.193.0; the schema is in docs/data-model.md.

An ordered list of what to play, the account's, named ("Spring tour",
"Acoustic set", "Tuesday rehearsal"), with notes. Items are either a
**song from the catalog** (`song_id`, so the item carries the song's
chart, lyrics, key and tempo for free, and the show view can open them)
or **free text** (a cover not in Stem Shovel, "break", "tune down",
"encore"), with a note per item (the key tonight, who counts in, a
segue). Items are reordered by drag, as songs are on the project page.
A set list is one body: a show with two sets attaches two set lists
("Set 1", "Set 2", "Encore"), which keeps a set reusable.

- **Write it** at `/[account]/set-lists/new` and `/[account]/set-lists/[id]`:
  a title, a search-and-add box over the account's songs (as the
  Credits picker does), a free-text add, drag to reorder, a note per
  row, and a "paste a list" import that matches lines to songs by title
  and keeps the rest as text. Duplicate as a new set list.
- **Browse them** at `/[account]/set-lists`: newest first, search by
  title, with the song count and the shows each is attached to.
- **Show view** at `/[account]/set-lists/[id]/show`: big type, high
  contrast, one song per row with its note, no chrome; a tap on a song
  opens its chart or lyrics in the same view; the screen stays awake
  (`navigator.wakeLock`, released on leave). A **share link** (the
  `share_link` table gains `set_list_id`) opens the show view without
  signing in, and a short link of it (`/x/<code>`, shvl.me) is what gets
  texted. The band's set list is the band's: the link is view-only and
  revocable like every share link.
- **Print / PDF**: the show view with a print stylesheet is enough for a
  sheet on the stage floor; a PDF rendition can come later if wanted.
- **Dashboard**: a "Your Set Lists" section in the content column
  (newest first, with the pin button), and a set list counts for Worth a look when
  a show on the calendar has none attached.
- Cascade: items go with the set list; a deleted song's items turn into
  free text with the song's title (the set list survives the catalog).
- Migration: `set_list` (id, account_id, title, notes, created_by,
  timestamps), `set_list_item` (id, set_list_id, sort_order, song_id
  nullable, title, note), `share_link.set_list_id`.

### Event (`event`)

A show or a practice, the account's. Columns, all optional but the kind
and the day:

- `kind` show | practice; `title` (a show's billing, "with The Night Shift";
  empty means the venue and day, as sessions do); `status` planned |
  confirmed | played | canceled (a canceled show stays on the record).
- When: `starts_on` (the day, `YYYY-MM-DD`), `starts_at`, `ends_at`,
  `load_in_at`, `sound_check_at` as local wall-clock `HH:MM` strings.
  **No time zones**: a band plays where it is, and a time on a poster is
  the venue's time. The ICS feed marks them floating for the same reason.
- Where: `venue` (name), `address`, `city`, `map_url` (empty means a
  Google Maps search of the address, built at render time), `venue_notes`
  (parking, the back door, the house engineer's name).
- Money and the house: `ticket_price` (text: "$10 adv / $12 door"),
  `ticket_url`, `tickets_sold`, `attendance`, `deal` (text: "80/20 after
  the first $300"), `promoter` and `promoter_contact` (text until the
  contacts phase gives them a table).
- Words: `notes` (markdown, members only: the plan for the night, then
  how it went), `public_notes` (markdown, on the public page: the
  blurb).
- Public: `is_public` and `slug` for the public page; `created_by`;
  timestamps.
- Children: `event_set` (event_id, set_list_id, sort_order, label) for
  the sets; `event_payout` (event_id, user_id nullable, name, amount in
  cents, note) for who got paid what, with the account's currency a
  single `account.currency` (USD until someone needs another);
  `recording_session.event_id` for the tapes; the event's files (below).
- Pages: `/[account]/events` (the calendar: Upcoming and Past, list
  first, a month grid later; filters by kind), `/[account]/events/new`,
  `/[account]/events/[id]` (everything above in sections: When and
  where, Sets, Promotion, The night, The books, Tapes), an ICS feed per
  account (`/[account]/events.ics` behind a share-style token, so phones
  and shared calendars subscribe). Practices get the same page with the
  promotion and books sections hidden.
- Notifications: a new show or practice, and a change to its day or
  time, notify the members (inbox, email per their opt-ins); a
  day-before reminder rides the existing daily cron.
- Dashboard: an **Upcoming** block in the Latest column (the next few
  shows and practices, with countdown text), and past shows in Activity
  when their notes or books are written up.

### Posters, pictures and video (`event_file`)

Files of the account, each optionally attached to one event, with a
`kind`: `poster` (PDF or image, promotion, downloadable at full size),
`photo` (from the night), `video` (MP4/MOV/WebM, played back in the
page with `<video>`, the source served from Blob), `other`. Same
reserve → upload → ready lifecycle and quota accounting as
`song_file`, a thumbnail rendered in the uploader's browser (a PDF's
first page, a video's first frame), a permanent address `/f/<code>`
like today's files. Posters are an object of their own: browsed at
`/[account]/posters`, searched, pinned, and shown on the dashboard
("Your Posters"); a poster made for one show is reused for the next by
attaching it again (the file does not move, as with `attachFile`).
Video sizes: a phone's ten-minute clip is a gigabyte, so the limit is
the session recording's (2 GB) and the upload goes straight to Blob
from the browser, as session recordings do.

### The public show page

`/[account]/shows/[slug]`, on when the event is public: the band
(account name and image), the title, the poster, day and showtime, the
venue with its address and a "Directions" link, the ticket price and
link, the public blurb, and the songs when a set list is attached and
marked public on the event. After the show, the photos and videos the
band marks public. Indexable (it is promotion), so it joins
`isIndexablePath`, the sitemap and `audit:seo`; a canceled show says
so. Private events have no public page (404, like a private song).

### The band directory

What Kevin called members and contact info. Two existing things already
hold half of it: `account_member` (who is in the account, their role) and
the artist directory (`artist`, `artist_member`: the band as an act and
its people, with emails). The plan adds:

- **Member profile per account** (`account_member.phone`,
  `instruments`, `notes`), set by the member or an admin, shown on a
  members page at `/[account]/members` (today members are managed on
  the settings page). Members only; nothing of it is public.
- **Contacts** (`contact`): venues, promoters, booking agents, sound
  engineers, with name, role, phone, email, address, notes. An event's
  venue and promoter become contact references once this exists, with
  the text columns kept as the fallback for a one-off.
- The artist directory stays what it is (credits), and an account's
  `default_artist_id` is the band the public show page names.

## Phases

1. **Set lists** (v0.192–0.193). The tables, the editor, the browse page,
   the show view with its share link and short link, the dashboard
   section, the paste import. Migration: two tables and a column on
   `share_link`.
2. **Shows and practices** (v0.194–0.196). The `event` table and its
   children, the calendar pages, the event page with its sections, sets
   attached, sessions linked, the ICS feed, notifications and reminders,
   the dashboard's Upcoming block. Migration: `event`, `event_set`,
   `event_payout`, `recording_session.event_id`, `account.currency`.
3. **Posters, pictures and video, and the public show page** (v0.197–
   0.198). `event_file`, uploads and playback, the posters page, the
   public page with its indexability.
4. **The books** (v0.199). Tickets, attendance, the deal, payouts per
   member, and a per-show and per-year summary on the calendar page
   (shows played, tickets sold, take). Mostly the event page's fields
   from phase 2 getting their own section and totals.
5. **The directory** (v0.200). Member profiles, contacts, events pointing
   at contacts, the members page.

## Decisions for Kevin

1. **Events separate from sessions, linked by `recording_session.event_id`**
   (recommended above), or sessions grown into events.
2. **Set list items are catalog songs or free text**, and a show attaches
   one or more set lists rather than owning its songs.
3. **Times are local wall-clock strings with no time zone.**
4. **The public show page is indexable.**
5. **Navigation**: a **Band** menu in the header beside Music (Shows,
   Practices, Set lists, Posters, Members), with Artists moving there
   from Music, or everything under Music. The dashboard's Tools and More
   widgets gain the pages either way.
6. **Phase order**: set lists first, as Kevin proposed; or shows first if
   the calendar is the more pressing need.
7. **Money as cents in one currency per account**, USD by default.
