# Looper

**Looper** in the Tools menu (and the footer) is a loop station: a loop of one to eight bars at a tempo plays round and round while you record layers onto it one pass at a time, from the microphone, the piano or the drum machine. Lay down a beat, add a bass line on the piano, sing over it, and save the whole thing to the Idea Recorder as a take with each layer as its own stem.

## The loop

Set the **tempo** (the slider, or **Tap** it in beside it), the **bars** (1, 2, 4 or 8) and the **beats per bar** (4 or 3) in the panel on the right before the first layer; once a layer exists they are fixed until you **Clear** the loop. The tempo is shared with the drum machine and the metronome: change it on either, or load a drum preset or a generated beat with a tempo of its own, and the loop follows; once the loop has layers, the drum machine is held to the loop's tempo instead. **Count in a bar before the first pass** gives you a bar of clicks before recording starts; the **click** can sound on the count-in only, through the loop, or not at all.

**Play** runs the loop (an empty loop runs its transport so you can record the first layer against the click); **Stop** halts everything. The space bar plays and stops the loop unless the drum machine or the piano panel was the last thing you touched, in which case it works that instrument.

## Recording a layer

Choose the source under **Record from**: the **microphone** (it asks for permission the first time), the **piano** or the **drums**, each with its own level meter. Press **Record**: from the next bar 1 (after the count-in when the loop was stopped) every full pass of the loop becomes a layer, until you press **Finish layer**, which lets the pass under way complete; **Cancel** drops the pass under way. A layer appears when its pass ends, so with the default two-bar loop and a count-in the first one lands at the end of the third bar after you press Record; the status line counts it down. Recording the drums starts the drum machine's beat on bar 1 (after the count-in when the loop was stopped) at the loop's tempo, restarting it in step if it was already playing; open the drum machine from the toolbar to choose the beat first. The piano records whatever you play on its panel, keys or MIDI. A loop holds up to 16 layers.

Each layer has a level, a mute and a solo, a waveform with the playhead, and a delete button; **Undo** removes the last layer.

## The microphone's latency

A sung or played layer reaches the computer a little late (the microphone's and the speakers' round trip, usually 10 to 60 ms, more over Bluetooth), which would make it sit behind the beat. The looper shifts microphone layers earlier by the **Latency** setting. Press **Calibrate** with the speakers on: three clicks play and the microphone measures how late they arrive; the result is remembered in this browser, and the slider nudges it. The drum machine's beat runs on the loop's own clock and needs none. The piano is different: what you play by hand is timed against the loop as you hear it, which your audio output delays a little (the **Output** section shows how much your device reports; Bluetooth adds a lot), so piano layers are shifted earlier by that amount unless you untick **Shift piano layers by the output latency**. **Hear the microphone through the speakers** is off by default, since a laptop's speakers would feed back into its microphone; use headphones if you turn it on.

## Saving

**Save as take** renders the layers' mix (one, two or four passes long, your choice) and saves it to the Idea Recorder as a new idea's take, with each layer as one of the take's sources, named for what it was. In the recorder, the take's menu then offers **Add N stems to song…** to put the layers on a song as separate stems, and **Add as demo…** adds the mix. The loop's tempo, length and layer settings are kept with the idea. New ideas are filed under the account you are currently working in.
