# Reaper project fixtures

`reaper-7.82.RPP` is the project Reaper 7.82 (Linux) saved after
`bun run interop:reaper` imported Dawn's session bundle (four clips at
their BWF positions, the MIDI file with its tempo map and markers), with
the absolute media paths made relative. `src/lib/utils/rppRead.test.ts`
reads it: the corpus for the Reaper reader (docs/dawproject-plan.md,
roadmap step 3). Reaper's project format is plain text and documented
by its users (the SWS and DawVert sources, the Reaper forum); nothing
here is Cockos's own.
