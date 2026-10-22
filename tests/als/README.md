# Ableton Live set fixtures

`techno-live-12.2.1.als` is the "Techno Live Set" from
[owenbush/ableton-inspector](https://github.com/owenbush/ableton-inspector)
(MIT), a set Live 12.2.1 saved: a DRUMS group of six audio tracks with
warped, looped arrangement clips (one transposed), seven MIDI tracks with
session clips only, two returns, plug-in devices on most tracks and the
master, at 124 bpm. Its owner's absolute sample paths were made generic
(`C:/Users/me/Music/Ableton/…`) before it was re-gzipped; nothing else
changed. `src/lib/utils/alsRead.test.ts` reads it: the corpus for the
Live set reader (docs/dawproject-plan.md, roadmap step 4). The set is
gzipped XML, as Live writes it; the tags and their meanings were learned
from this and other public sets and from DawVert's reader, not from
Ableton.
