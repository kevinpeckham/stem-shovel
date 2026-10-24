-- Reaper opens a project Dawn wrote (docs/dawproject-plan.md, roadmap step 3).
-- Run by scripts/interop/rpp.ts under a virtual display:
--   reaper -nosplash -new scripts/interop/rpp.lua
-- with INTEROP_RPP (the project file) and INTEROP_OUT (a folder for the
-- re-saved project and result.json) in the environment. What Reaper holds
-- after opening it is written out for the runner to judge: the tracks with
-- their levels, pans, mutes, solos, colors, folder depths, receives and
-- envelope points, the items with their positions, lengths, offsets,
-- volumes, fades and sources (a MIDI take's notes in project time), the
-- tempo and time-signature markers and the markers; then the project is
-- saved again under the output folder, so the reader can be checked on
-- Reaper's own rendering of it.
local rpp = os.getenv("INTEROP_RPP")
local out = os.getenv("INTEROP_OUT")
local log = {}
local function note(s) log[#log + 1] = s end

local function json(v)
  local t = type(v)
  if t == "table" then
    if #v > 0 or next(v) == nil then
      local parts = {}
      for _, x in ipairs(v) do parts[#parts + 1] = json(x) end
      return "[" .. table.concat(parts, ",") .. "]"
    end
    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = k end
    table.sort(keys)
    local parts = {}
    for _, k in ipairs(keys) do parts[#parts + 1] = string.format("%q:%s", k, json(v[k])) end
    return "{" .. table.concat(parts, ",") .. "}"
  elseif t == "string" then
    local escaped = v:gsub('[%c"\\]', function(c)
      if c == '"' then return '\\"' end
      if c == "\\" then return "\\\\" end
      if c == "\n" then return "\\n" end
      if c == "\r" then return "\\r" end
      if c == "\t" then return "\\t" end
      return string.format("\\u%04x", c:byte())
    end)
    return '"' .. escaped .. '"'
  elseif t == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "null" end
    return string.format("%.6f", v)
  elseif t == "boolean" then
    return tostring(v)
  end
  return "null"
end

reaper.Main_openProject("noprompt:" .. rpp)
local result = { app = reaper.GetAppVersion(), tracks = {}, tempos = {}, markers = {}, log = log }

local function pointsOf(env)
  if not env then return nil end
  local points = {}
  for i = 0, reaper.CountEnvelopePoints(env) - 1 do
    local _, time, value, shape = reaper.GetEnvelopePoint(env, i)
    points[#points + 1] = { at = time, value = value, shape = shape }
  end
  return points
end
local function envelopePoints(tr, name)
  return pointsOf(reaper.GetTrackEnvelopeByName(tr, name))
end
-- The master's envelopes by their chunk names: GetTrackEnvelopeByName(master, "Volume") finds nothing (FINDINGS.md).
local function masterEnvelope(name)
  local master = reaper.GetMasterTrack(0)
  for i = 0, reaper.CountTrackEnvelopes(master) - 1 do
    local env = reaper.GetTrackEnvelope(master, i)
    local _, chunk = reaper.GetEnvelopeStateChunk(env, "", false)
    if chunk:sub(1, #name + 1) == "<" .. name then return pointsOf(env) end
  end
  return nil
end

for i = 0, reaper.CountTracks(0) - 1 do
  local tr = reaper.GetTrack(0, i)
  local _, name = reaper.GetTrackName(tr)
  local r, g, b = reaper.ColorFromNative(reaper.GetTrackColor(tr))
  local entry = {
    name = name,
    volume = reaper.GetMediaTrackInfo_Value(tr, "D_VOL"),
    pan = reaper.GetMediaTrackInfo_Value(tr, "D_PAN"),
    muted = reaper.GetMediaTrackInfo_Value(tr, "B_MUTE") ~= 0,
    solo = reaper.GetMediaTrackInfo_Value(tr, "I_SOLO") ~= 0,
    folderDepth = reaper.GetMediaTrackInfo_Value(tr, "I_FOLDERDEPTH"),
    color = (reaper.GetTrackColor(tr) ~= 0) and { r = r, g = g, b = b } or nil,
    receives = {},
    items = {},
    volumeEnvelope = envelopePoints(tr, "Volume"),
    panEnvelope = envelopePoints(tr, "Pan"),
    muteEnvelope = envelopePoints(tr, "Mute"),
  }
  for s = 0, reaper.GetTrackNumSends(tr, -1) - 1 do
    local src = reaper.GetTrackSendInfo_Value(tr, -1, s, "P_SRCTRACK")
    local _, srcName = reaper.GetTrackName(src)
    entry.receives[#entry.receives + 1] = {
      from = srcName,
      volume = reaper.GetTrackSendInfo_Value(tr, -1, s, "D_VOL"),
      mode = reaper.GetTrackSendInfo_Value(tr, -1, s, "I_SENDMODE"),
      volumeEnvelope = pointsOf(reaper.GetTrackSendInfo_Value(tr, -1, s, "P_ENV:<VOLENV")),
    }
  end
  for j = 0, reaper.CountTrackMediaItems(tr) - 1 do
    local item = reaper.GetTrackMediaItem(tr, j)
    local take = reaper.GetActiveTake(item)
    local it = {
      position = reaper.GetMediaItemInfo_Value(item, "D_POSITION"),
      length = reaper.GetMediaItemInfo_Value(item, "D_LENGTH"),
      volume = reaper.GetMediaItemInfo_Value(item, "D_VOL"),
      fadeIn = reaper.GetMediaItemInfo_Value(item, "D_FADEINLEN"),
      fadeOut = reaper.GetMediaItemInfo_Value(item, "D_FADEOUTLEN"),
    }
    it.takes = reaper.CountTakes(item)
    if take then
      local _, takeName = reaper.GetSetMediaItemTakeInfo_String(take, "P_NAME", "", false)
      it.name = takeName
      it.offset = reaper.GetMediaItemTakeInfo_Value(take, "D_STARTOFFS")
      it.takeVolume = reaper.GetMediaItemTakeInfo_Value(take, "D_VOL")
      it.playrate = reaper.GetMediaItemTakeInfo_Value(take, "D_PLAYRATE")
      it.preservePitch = reaper.GetMediaItemTakeInfo_Value(take, "B_PPITCH")
      -- The take's stretch markers: a position in take time against a source position.
      it.stretchMarkers = {}
      for m = 0, reaper.GetTakeNumStretchMarkers(take) - 1 do
        local _, pos, srcpos = reaper.GetTakeStretchMarker(take, m)
        it.stretchMarkers[#it.stretchMarkers + 1] = { pos = pos, src = srcpos }
      end
      if reaper.TakeIsMIDI(take) then
        local _, n = reaper.MIDI_CountEvts(take)
        it.notes = {}
        for k = 0, n - 1 do
          local _, _, _, startppq, endppq, _, pitch, vel = reaper.MIDI_GetNote(take, k)
          it.notes[#it.notes + 1] = {
            at = reaper.MIDI_GetProjTimeFromPPQPos(take, startppq),
            ends = reaper.MIDI_GetProjTimeFromPPQPos(take, endppq),
            pitch = pitch,
            velocity = vel,
          }
        end
      else
        local src = reaper.GetMediaItemTake_Source(take)
        if src then
          it.file = reaper.GetMediaSourceFileName(src, "")
          it.sampleRate = reaper.GetMediaSourceSampleRate(src)
          it.sourceLength = reaper.GetMediaSourceLength(src)
        end
      end
    end
    entry.items[#entry.items + 1] = it
  end
  result.tracks[#result.tracks + 1] = entry
end
for i = 0, reaper.CountTempoTimeSigMarkers(0) - 1 do
  local _, timepos, _, _, bpm, num, den, linear = reaper.GetTempoTimeSigMarker(0, i)
  result.tempos[#result.tempos + 1] = { at = timepos, bpm = bpm, numerator = num, denominator = den, linear = linear }
end
local _, nMarkers, nRegions = reaper.CountProjectMarkers(0)
for i = 0, nMarkers + nRegions - 1 do
  local _, isRegion, pos, rgnend, name = reaper.EnumProjectMarkers(i)
  result.markers[#result.markers + 1] = { at = pos, name = name, region = isRegion }
end
result.sampleRate = reaper.GetSetProjectInfo(0, "PROJECT_SRATE", 0, false)
result.sampleRateUsed = reaper.GetSetProjectInfo(0, "PROJECT_SRATE_USE", 0, false)
result.notes = reaper.GetSetProjectNotes(0, false, "")
result.masterVolume = reaper.GetMediaTrackInfo_Value(reaper.GetMasterTrack(0), "D_VOL")
-- The tempo ramp: Reaper's own tempo halfway down it, and its beat count at its end.
result.bpmAt14 = reaper.TimeMap2_GetDividedBpmAtTime(0, 14)
result.beatsAt20 = reaper.TimeMap2_timeToQN(0, 20)
result.beatsAt8 = reaper.TimeMap2_timeToQN(0, 8)
result.masterVolumeEnvelope = masterEnvelope("MASTERVOLENV")

-- Which way the pan envelope runs: the Bass track alone, in automation read mode so its envelope drives the pan,
-- rendered over two seconds; the louder channel of the file says where the envelope put it.
local bass
for i = 0, reaper.CountTracks(0) - 1 do
  local tr = reaper.GetTrack(0, i)
  local _, name = reaper.GetTrackName(tr)
  if name == "Bass" then bass = tr end
end
if bass then
  reaper.SetMediaTrackInfo_Value(bass, "I_AUTOMODE", 1)
  reaper.SetMediaTrackInfo_Value(bass, "I_SOLO", 1)
  reaper.GetSetProjectInfo(0, "RENDER_SETTINGS", 0, true)
  reaper.GetSetProjectInfo(0, "RENDER_BOUNDSFLAG", 0, true)
  reaper.GetSetProjectInfo(0, "RENDER_STARTPOS", 2, true)
  reaper.GetSetProjectInfo(0, "RENDER_ENDPOS", 4, true)
  reaper.GetSetProjectInfo(0, "RENDER_CHANNELS", 2, true)
  reaper.GetSetProjectInfo(0, "RENDER_SRATE", 48000, true)
  reaper.GetSetProjectInfo(0, "RENDER_ADDTOPROJ", 0, true)
  reaper.GetSetProjectInfo_String(0, "RENDER_FILE", out, true)
  reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", "bass-pan", true)
  reaper.GetSetProjectInfo_String(0, "RENDER_FORMAT", "ZXZhdxgAAQ==", true)
  reaper.Main_OnCommand(42230, 0) -- File: Render project, using the most recent render settings, auto-close render dialog
  reaper.SetMediaTrackInfo_Value(bass, "I_SOLO", 0)
  reaper.SetMediaTrackInfo_Value(bass, "I_AUTOMODE", 0)
  result.render = out .. "/bass-pan.wav"
end
-- The whole mix from 5 to 7 s, the master in read mode: its volume envelope, 0 from 6 s, should silence the second half.
reaper.SetMediaTrackInfo_Value(reaper.GetMasterTrack(0), "I_AUTOMODE", 1)
reaper.GetSetProjectInfo(0, "RENDER_STARTPOS", 5, true)
reaper.GetSetProjectInfo(0, "RENDER_ENDPOS", 7, true)
reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", "mix-master-volume", true)
reaper.Main_OnCommand(42230, 0)
reaper.SetMediaTrackInfo_Value(reaper.GetMasterTrack(0), "I_AUTOMODE", 0)
result.mixRender = out .. "/mix-master-volume.wav"

reaper.Main_SaveProjectEx(0, out .. "/reaper-saved.RPP", 0)
local f = io.open(out .. "/result.json", "w")
f:write(json(result))
f:close()
reaper.Main_OnCommand(40004, 0) -- File: Quit
