-- Reaper reads a Dawn session bundle (docs/daw-interop-plan.md, tier B).
-- Run by scripts/interop/reaper.mjs under a virtual display:
--   reaper -nosplash -new scripts/interop/reaper.lua
-- with INTEROP_BUNDLE (the unzipped bundle) and INTEROP_OUT (a folder for
-- the saved project and result.json) in the environment. Each clip goes
-- on its own track, placed where Reaper's own reader of the BWF time
-- reference puts it (InsertMedia mode 4096: "move to source preferred
-- position"); the MIDI file goes in with its tempo map; then the project
-- is saved and what Reaper holds is written out for the runner to judge.
local bundle = os.getenv("INTEROP_BUNDLE")
local out = os.getenv("INTEROP_OUT")
local log = {}
local function note(s) log[#log + 1] = s end

local function json(v, indent)
  indent = indent or ""
  local t = type(v)
  if t == "table" then
    if #v > 0 or next(v) == nil then
      local parts = {}
      for _, x in ipairs(v) do parts[#parts + 1] = json(x, indent .. "  ") end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = k end
    table.sort(keys)
    local parts = {}
    for _, k in ipairs(keys) do parts[#parts + 1] = string.format("%q:%s", k, json(v[k], indent .. "  ")) end
    return "{" .. table.concat(parts, ",") .. "}"
  elseif t == "string" then
    return string.format("%q", v):gsub("\\\n", "\\n")
  elseif t == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "null" end
    return string.format("%.6f", v)
  elseif t == "boolean" then
    return tostring(v)
  end
  return "null"
end

local function files_in(dir)
  local list = {}
  local i = 0
  while true do
    local f = reaper.EnumerateFiles(dir, i)
    if not f then break end
    list[#list + 1] = f
    i = i + 1
  end
  table.sort(list)
  return list
end

local result = { app = reaper.GetAppVersion(), clips = {}, tracks = {}, tempos = {}, markers = {}, log = log }

-- Clips, each on a new track at its BWF position; the metadata Reaper reads from the file is recorded beside it.
local clipsDir = bundle .. "/clips"
for _, f in ipairs(files_in(clipsDir)) do
  local path = clipsDir .. "/" .. f
  reaper.SetEditCurPos(0, false, false)
  local before = reaper.CountMediaItems(0)
  local inserted = reaper.InsertMedia(path, 1 | 4096)
  local item = reaper.GetMediaItem(0, reaper.CountMediaItems(0) - 1)
  local entry = { file = f, inserted = inserted, position = nil, length = nil, bwf = nil, sampleRate = nil }
  if item and reaper.CountMediaItems(0) > before then
    local take = reaper.GetActiveTake(item)
    local src = take and reaper.GetMediaItemTake_Source(take)
    entry.position = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
    entry.length = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
    if src then
      entry.sampleRate = reaper.GetMediaSourceSampleRate(src)
      local ok, retval, meta = pcall(reaper.GetMediaFileMetadata, src, "BWF:TimeReference")
      if ok and retval then entry.bwf = meta else note("GetMediaFileMetadata: " .. tostring(retval)) end
      local ok2, retval2, desc = pcall(reaper.GetMediaFileMetadata, src, "BWF:Description")
      if ok2 and retval2 then entry.description = desc end
    end
    local tr = reaper.GetMediaItem_Track(item)
    local _, name = reaper.GetTrackName(tr)
    entry.track = name
  else
    note("no item for " .. f)
  end
  result.clips[#result.clips + 1] = entry
end

-- The MIDI file with its tempo map (the runner answers the import prompt when Reaper shows one).
local mid
for _, f in ipairs(files_in(bundle)) do if f:match("%.mid$") then mid = bundle .. "/" .. f end end
if mid then
  reaper.SetEditCurPos(0, false, false)
  local before = reaper.CountMediaItems(0)
  result.midiInserted = reaper.InsertMedia(mid, 1)
  result.midiItems = {}
  for i = before, reaper.CountMediaItems(0) - 1 do
    local item = reaper.GetMediaItem(0, i)
    local take = reaper.GetActiveTake(item)
    local tr = reaper.GetMediaItem_Track(item)
    local _, name = reaper.GetTrackName(tr)
    local notes = 0
    if take and reaper.TakeIsMIDI(take) then
      local _, n = reaper.MIDI_CountEvts(take)
      notes = n
    end
    local firstNote
    if take and reaper.TakeIsMIDI(take) and notes > 0 then
      local _, _, _, startppq, _, _, pitch = reaper.MIDI_GetNote(take, 0)
      firstNote = { pitch = pitch, at = reaper.MIDI_GetProjTimeFromPPQPos(take, startppq) }
    end
    result.midiItems[#result.midiItems + 1] = {
      track = name,
      position = reaper.GetMediaItemInfo_Value(item, "D_POSITION"),
      length = reaper.GetMediaItemInfo_Value(item, "D_LENGTH"),
      notes = notes,
      firstNote = firstNote,
    }
  end
else
  note("no .mid in the bundle")
end

-- What the project holds now.
for i = 0, reaper.CountTracks(0) - 1 do
  local _, name = reaper.GetTrackName(reaper.GetTrack(0, i))
  result.tracks[#result.tracks + 1] = name
end
for i = 0, reaper.CountTempoTimeSigMarkers(0) - 1 do
  local _, timepos, _, _, bpm, num, denom = reaper.GetTempoTimeSigMarker(0, i)
  result.tempos[#result.tempos + 1] = { at = timepos, bpm = bpm, numerator = num, denominator = denom }
end
local i = 0
while true do
  local retval, isrgn, pos, _, name = reaper.EnumProjectMarkers(i)
  if retval == 0 then break end
  if not isrgn then result.markers[#result.markers + 1] = { at = pos, name = name } end
  i = i + 1
end

reaper.Main_SaveProjectEx(0, out .. "/reaper.RPP", 0)
local f = io.open(out .. "/result.json", "w")
f:write(json(result))
f:close()
reaper.Main_OnCommand(40004, 0) -- File: Quit
