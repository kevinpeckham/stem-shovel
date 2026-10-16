# Ember

**Ember** is Stem Shovel's practice amp (**Practice Amp** in the Tools menu, **Ember** in the footer): it turns the browser into a guitar or bass amplifier: plug an instrument into your computer or phone, directly or through an audio interface, and play through an amp with its pedals, in headphones or through the speakers. It works signed out; everything you set is remembered in your browser.

## Plugging in

The amp takes one of the shared inputs: the **line in** (an audio interface or a guitar-to-USB adapter) or the **microphone** input (an instrument straight into a computer's jack, or an acoustic instrument through the microphone itself). The **Input** menu picks the device and the channel: an instrument on channel 1 of a stereo interface wants Left only.

**Instrument** or **Line** says what is plugged in. An instrument straight into a microphone jack is quiet, so Instrument mode starts with 12 dB more trim; an interface's line input sits near unity. The browser cannot change what the jack is: a guitar's pickup wants a high-impedance instrument input, and a computer's microphone jack is not one, so the direct connection is quieter and a little duller than it would be through an interface or an adapter made for a guitar. Both work; the interface sounds better and is quieter.

Press **Set level** and play for three seconds: the trim is set so your loudest notes land with headroom to spare. The meter under the input shows the level and lights red on a peak at full scale.

## Trying the amp without an instrument

In the **Input** menu, choose **Chord player** instead of a jack: the chord player opens in a panel and whatever you play on it goes through the amp, dry, as if it were plugged in. Set its sound to **Electric Guitar (direct)**, a sampled Fender's raw pickup signal, for the guitar heads, or **Electric Bass** for the bass heads; the amp's Guitar / Bass switch follows the sound as the amp turns on. Nothing opens the microphone this way, so it works anywhere.

## The heads

Choose **Guitar** or **Bass** and a head:

- **Blackface Clean** (guitar): a 1960s American clean combo with a scooped tone stack, a Bright switch, spring reverb and tremolo, on a 2×12 open-back cabinet.
- **Tweed Crunch** (guitar): a 1950s tweed combo that breaks up early, with a fat midrange, on a single 12.
- **Fridge** (bass): an all-tube bass head on an 8×10, with the five-position mid selector and the Ultra Lo and Ultra Hi switches.
- **Solid State** (bass): a modern solid-state combo with a tweeter, clean and tight until it clips.

A **Cabinet** menu beside the head (guitar heads) swaps the modeled cabinet for a captured one: impulse responses of a Marshall 4×12 with Greenbacks and a 4×12 with Vintage 30, Rockdriver and DV-77 speakers, through an SM57 or an e606, from Jester Dyne Productions. The choice is part of a preset.

The knobs are an amp's, in groups: **Gain** (how hard the preamp is driven); **EQ** with **Bass**, **Mids** (and **Mid Hz** on the bass heads) and **Treble**; **Reverb** and **Tremolo** (Depth and Speed) on the heads that have them; then **Presence**, **Master** (how hard the output stage is pushed: sag and a softer clip) and **Output**, the level into the room. Switching heads sets the knobs to that head's own starting point; the pedals stay as they were.

## The pedals

The **Pedals** menu is the board, in the order the signal meets them. Before the amp: a **noise gate** (threshold, attack, hold and release), a **compressor**, an **overdrive** (gentle, keeps the lows tight), a **fuzz** and a **wah** (touch or sweep). After it: a **chorus**, a **phaser** or **flanger**, a **delay** (digital or analog), a **rotary speaker** and a **reverb** pedal (a room, with Level and Size) for the heads without a reverb of their own. The fuzz has a **Mids** slider: flat in the middle, the scooped sound below it, a lift above. **Reset all** takes every pedal off and the head back to its defaults.

The pedals know which instrument they are on. On a bass head the fuzz and the overdrive leave the lows clean and mix them back under the dirt, their Tone sliders cover a lower range, the wah sweeps lower, the chorus and the reverb leave the bottom dry, and a fresh rig's compressor starts slower and firmer so the pluck gets through. The board says "Voiced for bass" at its foot. Switch to a guitar head and the same pedals voice themselves for a guitar; your settings stay as they were.

## Presets

Under the knobs are six **preset** buttons for the instrument in force (guitar and bass keep their own). A preset is the whole rig: the head, its knobs and switches and every pedal; the master and the input stay as they are. Click a button to load its preset; it lights while the rig matches one. ⌘-click (Ctrl on Windows) or hold a button to save the rig there, or open the bookmarks menu beside the buttons: name the preset, pick a slot, and **Save**. Signed in, presets save to your account's library, where every member sees them (editors keep it; up to a hundred); signed out, a preset lives on the six buttons in this browser. The site's own presets fill any button you have not taken.

**Copy link** in the menu gives a link that opens the amp, on the page you are on, with the rig as it stands, or with any saved preset by its link icon, for a bandmate to load and save.

## Latency

What you hear comes back through the computer's input and output, which takes a moment: the amp's status line says how long. Under 15 ms feels direct; up to 30 is playable; beyond that the delay is in the way. Wired headphones or the interface's own headphone jack are the way to keep it short; Bluetooth adds well over a hundred milliseconds and the amp says so when it can tell. **Calibrate** in the Input menu measures the round trip with three clicks through the speakers and the microphone.

On a phone, opening the input turns the speaker down (the phone treats it as a call), so an interface with its own headphone jack is the setup that works best. A wired headset with a microphone makes that microphone the input.

## On, off and Mute

The amp turns on at the first touch of anything on it, a knob, a menu, an input, since that is what you came to do; the power switch turns it off again, which closes the input (the browser's recording light goes out). Off, the face dims and the readout says so. **Mute** beside the switch turns the output off while the input stays open and the meters keep moving, for talking over the band, swapping a cable or tuning in silence.

## Playing with the speakers

The built-in speakers work when the input is the line in or an interface. With the microphone input and the speakers on, the amp feeds back into the microphone: the amp comes up muted and says so; put headphones on, then unmute.

## The tuner, the metronome and the drums

All three open from the amp's toolbar. The tuner reads the amp's own input, so nothing else opens the microphone; the metronome clicks in the amp's audio, so the click and your playing arrive together; the drum machine plays a beat to practice to in the same audio. On the Looper and the Idea Recorder the tuner reads the amp's input too while the amp is on.

## Recording and playing along

The amp is a source on the **Idea Recorder** and the **Looper**, and an input in **Dawn**, the multitrack recorder: choose Amp as the source and what you hear is what lands on the take, pedals and all. On a song's page, the amp panel plays along with the stems: its header has Play, From the top and a **Count in** switch, a bar of the metronome before the song starts so you come in together.
