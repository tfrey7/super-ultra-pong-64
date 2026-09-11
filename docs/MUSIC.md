# The music direction sheet

Tim, 2026-09-10, after hearing the game: *"and the music needs to be way more epic dude. and use the
instruments and themes that were en vogue at the time"* (item 1241).

The rule from item 1206 stands: **one original theme** (A minor, 132 bpm, eight bars of sixteen
steps, an A section that climbs and a B section that soars) arranged once per era, same bars and
same tempo everywhere, so an era change cross-fades on the beat and the tune never restarts. What
this sheet adds is the brief for every arrangement: it has to sound like **that year's biggest
records and that year's blockbuster game soundtrack**, and it has to be **big**: layered, building,
dramatic.

Everything is Web Audio synthesis on the page. No samples, no dependencies. The CD-era sounds come
from synthesis: FM, detuned unison saws (the supersaw), additive and wavetable voices, formant
band-pass filters for a choir, noise shaped into drums, and reverb impulses the page generates.

## How the engine reads this sheet

Each era is one file, `src/music/eraN-<name>.js`, and **an arrangement card edits only its own
era's file** (the same rule as `src/eras/`). The file is one object with the era's hardware and its
arrangement side by side:

| field | what it is |
| --- | --- |
| `year` | the year the rung stands for |
| `voices` | the chip's simultaneous notes: the engine plays at most this many at once and drops the rest, latest part first (unison layers of one voice count as one) |
| `kit` | the era's drum kit: `kick`, `snare`, `hat`, `open`, `crash`, `tom`, `clap` and, from the SNES on, `timpani` or `taiko`; each a voice (or a list of voices layered) |
| `chain` | the period's production over the whole era: `tone` (a low-pass: the speaker, the cartridge), `tape` (wow, flutter and saturation), `chorus`, and `hall` (a generated reverb with `gate` for the 1980s gated drum sound) |
| `parts`, `effects`, `swing`, `detune`, `drone` | the arrangement, as before (the vocabulary is at the head of `src/music.js`) |

A drum part names a kit piece instead of spelling out a voice: `{ play: 'drum', hit: 'snare',
pattern: '. . . . X ...' }`. **Any part may carry `from: 0..1`**, the intensity at which it joins.
Two voice fields exist for kits: `drop: { ratio, time }` makes a pitched hit fall (a tom, a
timpani, an 808 kick) and `bursts: n` gives n quick spikes before the decay (a hand clap).

**Intensity** is one number from 0 to 1 that the engine reads off the game every frame
(`PongMusic.intensityOf(game)`): the rally adds up to 0.45 over twelve hits, the score up to 0.35
over the match, **match point is 0.9 at least**, and the finale's announce and rewind hold it at 1.
It only ever **adds** parts: the loop underneath never swaps out, so the song keeps its place and
the build is heard as the same music getting bigger. On top of any arrangement, from the Atari up,
the engine adds the era's own `crash` on every bar's downbeat at 0.9 and a `tom` roll into each
section at 0.7, so match point is always the loudest the era gets.

**The section plan every era follows.** The eight-bar loop is already a small song: **A is the
build and B is the climax**, and B4's E major chord is the turnaround that throws it back to the
top. Intensity lays a second, longer plan over it:

| stage | intensity | what plays |
| --- | --- | --- |
| **intro** | 0 to 0.3: the serve, a short rally, an early score | the base loop: the tune, bass, the era's groove |
| **build** | 0.3 to 0.7: a long rally, the score climbing | counter-melody, the second rhythm layer, the pad doubling up |
| **climax** | 0.7 to 1: a very long rally, match point, the finale | everything: the full kit with crashes and rolls, choir or brass on the tune, the octave-up doubling |

A master limiter sits after everything (a hard compressor into a soft ceiling), so the climax can
stack every layer without the output ever clipping.

---

## Era 0: 1972, the arcade cabinet

- **On the radio.** Don McLean's *American Pie*, Gilbert O'Sullivan, Roberta Flack; and the one
  synthesiser hit of the year, Hot Butter's Moog *Popcorn*.
- **In the games.** *Pong* itself had no music at all. Al Alcorn's three sounds came straight off
  the sync generator: a hit, a wall, a point. The Magnavox Odyssey had no sound.
- **The choice: honest near-silence, not a Moog take.** The whole ladder is about hearing the
  machine grow; a 1972 cabinet that plays a tune takes away the moment the Atari first *sings*. So
  era 0 stays the cabinet: the 60-cycle hum and its 120 Hz buzz, a fluorescent flicker, the room,
  and the theme's bones tapped as lonely beeps two a bar, the melody hinted and never stated.
- **Voices: 1.** One beeper. No kit.
- **Chain.** None: a bare speaker in a plywood box (a gentle low-pass at 5 kHz is all).
- **Epic devices.** Restraint. The build is the same blip coming faster, never a second note at
  once; the arcade has nothing else to give, and should not pretend to.
- **Plan.** Intro: hum and two taps a bar. Build: the wall blip answers on beats two and four, a tap
  every beat. Climax: a high tick on every off-beat eighth. Match point: two quick blips push into
  every bar.
- **Changed by item 1242.** The first draft had the hum swell and a room murmur rise at the climax.
  The engine's drones have no intensity (they run the whole time the era is on, and item 1242 does
  not touch the engine), so the build is carried by the taps alone, doubling twice and then racing.

## Era 1: 1977, the Atari 2600

- **On the radio.** Donna Summer and Giorgio Moroder's *I Feel Love*, the sequenced Moog bass that
  invented electronic dance music; the Bee Gees' disco four-on-the-floor; Fleetwood Mac's *Rumours*.
- **At the cinema.** John Williams' *Star Wars* main title: the brass fanfare in fourths and
  fifths, the snare roll, the triplet pickups. The fanfare is what 1977 sounds like.
- **In the games.** The VCS launched with *Combat*: no music, just engines and shots. The TIA gave
  two channels with a five-bit pitch divider, so every note lands off true.
- **Voices: 2.** Two channels, and the drum steals one.
- **Kit.** Kick: a low square thump falling fast. Snare: the TIA's white-noise mode, band-passed.
  Hat: the metallic noise mode, high-passed and short.
- **Chain.** Tape: a hint of wow and saturation, the television speaker's warmth.
- **Epic devices.** The Star Wars fanfare's pickup: three quick notes on E, a fourth under the A
  each section opens on, into each section; the disco octave bass *I Feel Love* made famous, in
  eighths, sour and wobbling, with the kick as its "oom"; a snare roll into each section.
- **Plan.** Intro: the tune, the octave bass and the kick on one and three. Build: the snare hiss
  on two and four (four on the floor) and the fanfare pickup. Climax: sixteenth hats on every
  off-sixteenth and a snare roll into every section.
- **Changed by item 1242.** Two things the first draft asked for do not fit two channels. *The lead
  doubling in octaves* needs a third voice: channel two is the bass and the whole kit, and a
  doubling there drops the bass, so it is left out. *The kick joining in the build* cannot be
  either: every drum steals the bass note under it for good (the steal is part of the loop, not of
  the intensity), so the kick is in from the serve and is what makes the octave bass "oom-pah".
  Every later layer sits on a sixteenth the bass never uses. The engine's own tom and crash never
  find a free channel on the Atari, which is true to a chip with two voices.

## Era 2: 1985, the NES

- **On the radio.** a-ha's *Take On Me* (the synth riff), Tears for Fears, Jan Hammer's *Miami
  Vice Theme* at number one, Phil Collins' gated drums everywhere.
- **In the games.** Koji Kondo's *Super Mario Bros.*; Konami's arcade *Gradius* the same year, the
  heroic minor-key anthem that the NES Konami sound (*Contra*, *Castlevania*) grew out of.
- **Voices: 5.** The 2A03: two pulses (12.5, 25 and 50 percent duty), a triangle, noise and the
  DPCM channel for a sampled kick and snare.
- **Kit.** Kick: a DPCM thud, a triangle dropping an octave in a few milliseconds. Snare: noise
  plus a short pitched body. Hat: the short noise mode, very high.
- **Chain.** Hall with a gate: the 1985 gated reverb, big for a quarter of a second and then cut,
  over the snare.
- **Epic devices.** The Konami anthem: melody in the 25 percent pulse with vibrato, narrowing to
  12.5 percent for the B section, the second pulse answering the tune in the B section, chords only
  as whirring arpeggios (four notes a step), the triangle leaping octaves, a DPCM snare fill before
  each section. The kit is shared out as a sound driver would: the hats and the snare hiss take
  turns on the noise channel, the kick, the sampled snare and the fill on the DPCM, and the noise
  channel leaves each downbeat free so the engine's match-point crash lands.
- **Plan.** Intro: lead, arpeggio, triangle, ticking hats. Build: the second pulse answers the tune
  and the DPCM kit enters under a noise snare on two and four. Climax: the hats double to
  sixteenths and the DPCM fill rolls in.
- **Changed by item 1242.** The arrangement is one loop that only ever adds parts, and five channels
  have to hold the whole climax at once: so the duty change rides the sections (12.5 percent in
  the B section, the loop's own climax) and the arpeggio whirs at full speed from the start, rather
  than either swapping at an intensity. The second pulse answers the tune (a dotted eighth late,
  the engine's `echo`) rather than a third below: the vocabulary has no "a third below" rule.

## Era 3: 1989, the Sega Genesis

- **On the radio.** New jack swing (Bobby Brown, Teddy Riley's swung drum machines), house
  (Technotronic's *Pump Up the Jam*, Black Box's *Ride on Time*), Madonna's *Like a Prayer*; the
  DX7 electric piano on every ballad.
- **In the games.** Yuzo Koshiro's *The Revenge of Shinobi*: club music on a cartridge, the FM slap
  bass and a sampled-sounding kit that led to *Streets of Rage*.
- **Voices: 10.** The YM2612's six four-operator FM channels (one can play samples) and the PSG's
  three squares and noise.
- **Kit.** Kick: the 909-style FM thump (sine, fast pitch drop). Snare: noise with a tuned body and
  a clap layered on it. Hat: PSG noise, ticking sixteenths. Clap: three noise bursts in a row.
- **Chain.** Chorus on the keys, a plate reverb, and the chip's slightly crunchy output (grit).
- **Epic devices.** The FM slap bass in sixteenths, a DX7 tine piano (FM ratio 1 and 14 bell)
  stabbing house chords on the off-beats, new jack swing on the hats, an FM brass lead, and the
  PSG square doubling the tune an octave up for the climax.
- **Plan.** Intro: slap bass, the brass lead on the tune, the kick on every beat and ticking hats.
  Build: the house piano, the snare-and-clap on two and four, the open hat on every "and".
  Climax: the octave square and a snare roll into each section.
- **Changed by item 1242.** The brass lead is on the tune from the serve, because every era's base
  loop carries the tune (the section plan above); the clap is a layer of the snare (one sample, one
  voice), so the loop never needs more than nine of the ten voices and the engine's tom and crash
  always have one.

## Era 4: 1991, the Super Nintendo

- **On the radio.** Bryan Adams' *(Everything I Do) I Do It for You*, Nirvana's *Smells Like Teen
  Spirit*; at the cinema, Brad Fiedel's *Terminator 2* anvil percussion and Hans Zimmer's
  *Backdraft*.
- **In the games.** Nobuo Uematsu's *Final Fantasy IV* and Koji Kondo's *A Link to the Past*: the
  sampled orchestra, brass fanfares, pizzicato strings, timpani and choir aahs, all in the echo.
- **Voices: 8.** The S-DSP's eight sampled channels, Gaussian-interpolated (soft on top), and the
  echo with its FIR filter.
- **Kit.** Kick: a soft sampled orchestral bass drum. Snare: a military snare, noise with a tight
  body. Crash: a long, dark cymbal. Timpani: a sine with a slow pitch settle and a long decay.
- **Chain.** The SNES echo (already on the loop) and a warm low-pass.
- **Epic devices.** The Uematsu manner: the melody on a warm brass, strings holding the chords, a
  harp or marimba climbing them, timpani rolls into each section, choir aahs (a sawtooth through
  two formant band-passes for "ah") swelling in the B section, a brass fanfare on the turnaround.
- **Plan.** Intro: pizzicato bass, strings and the melody on flute. Build: the brass takes the tune
  and the timpani enters. Climax: the choir, a cymbal on the downbeat and a timpani roll.
- **As item 1242 built it.** The brass is horns an octave under the flute (the flute keeps
  playing: a part only ever joins), a harp climbs the chords from the build, the timpani lands on
  every downbeat, and at the climax a military snare roll joins the timpani roll. The choir is one
  formant ("ah") rather than two, so the loop fits eight channels and still leaves one free on each
  downbeat for the engine's cymbal. There is no separate fanfare on the turnaround: the horns'
  B-G#-E-B descent on the E major bar is it.

## Era 5: 1994, the PlayStation

- **On the radio.** Jungle and drum-and-bass (Goldie's *Inner City Life*), the Prodigy's *Music for
  the Jilted Generation*, Ace of Base's *The Sign*.
- **In the games.** *Ridge Racer*'s rave, and a year later *wipEout* with Orbital, Leftfield and
  the Chemical Brothers: a game soundtrack that sounded like the club.
- **Voices: 24.** The SPU's 24 ADPCM voices and its hardware reverb.
- **Kit.** Kick: a 909, deep and punchy. Snare: a chopped breakbeat snare, bright. Hat: 909 open and
  closed. Clap. The *orchestra hit*: a stacked minor chord, saw and noise, very short.
- **Chain.** The SPU reverb, a resonant filter sweep over the mix, a light crush (the ADPCM grain).
- **Epic devices.** The techno build: a snare roll doubling from quarters to sixteenths over the
  last bar, the filter opening, the orchestra hit on the downbeat of the B section, a rolling
  Reese bass (two detuned saws) and a jungle break at double time for the climax.
- **Plan.** Intro: pad, stabs and a soft four-on-the-floor. Build: the 909 hats open and the
  roll. Climax: the jungle break, the orchestra hit and the lead doubled.

## Era 6: 1996, the Nintendo 64

- **On the radio.** Big beat: the Chemical Brothers' *Setting Sun*, the Prodigy's *Firestarter*;
  the Spice Girls and the *Macarena*; at the cinema, David Arnold's *Independence Day*.
- **In the games.** *Super Mario 64*, then *Star Fox 64*'s military brass and snare, and
  *GoldenEye 007*'s spy synth and surf-guitar menace (both 1997, both the N64's sound).
- **Voices: 24.** Samples mixed in software on the RSP, squeezed onto a cartridge: muffled on top.
- **Kit.** Kick: a big-beat breakbeat kick. Snare: a marching snare with a roll. Crash. Timpani.
  Hat: dusty and loose.
- **Chain.** The whole mix rolled off above about 9 kHz, and a big hall reverb.
- **Epic devices.** Star Fox brass: the theme's head as a horn fanfare over marching snare
  ostinatos; a GoldenEye spy line (a minor-key surf guitar, a saw through a light drive and spring
  reverb) as the counter-melody; big-beat drums under the climax.
- **Plan.** Intro: strings and flute. Build: the marching snare and the spy line. Climax: the
  horns, the timpani and a crash every bar.

## Era 7: 1999, the Dreamcast

- **On the radio.** Trance (ATB's *9 PM*, Darude's *Sandstorm*), Eiffel 65, Santana's *Smooth*,
  Cher's *Believe*.
- **In the games.** *Soulcalibur*'s full orchestra, *Sonic Adventure*'s rock guitars (Jun Senoue),
  and the next year Hideki Naganuma's funk and electro for *Jet Set Radio*.
- **Voices: 64.** The AICA's 64 channels at CD quality, with its own effects DSP.
- **Kit.** A funk breakbeat kit: kick, ghost-note snare, a sizzling ride as the hat, a real crash,
  a clap for the trance build.
- **Chain.** A clean, bright hall and a chorus: full-band, nothing muffled.
- **Epic devices.** The trance build: a supersaw lead on the tune, a sidechained pad, a snare roll
  rising in pitch, then the drop; a rock guitar doubling the B section; orchestral strings under it
  all in the Soulcalibur manner.
- **Plan.** Intro: electric piano and the funky bass. Build: the breakbeat and the vibraphone.
  Climax: the supersaw, the guitars and the strings, and a crash on every bar.

## Era 8: 2000, the PlayStation 2

- **On the radio.** Nu-metal: Linkin Park's *Hybrid Theory*, Papa Roach, Limp Bizkit; at the
  cinema, Hans Zimmer and Lisa Gerrard's *Gladiator*.
- **In the games.** The *Metal Gear Solid 2* trailer of E3 2000 and Harry Gregson-Williams' score:
  a Hollywood orchestra over an electronic pulse.
- **Voices: 48.** The SPU2's 48 voices, streamed.
- **Kit.** Taiko, a deep hybrid kick (sine sweep and a noise click), a tight metal snare, crash,
  and the electronic pulse's hat.
- **Chain.** A long, dark hall and a gentle tape warmth.
- **Epic devices.** Low strings in an ostinato (the Zimmer pulse), a dark drone, the melody on
  wide slow strings, a nu-metal drop-tuned riff joining for the climax, taiko hits on the
  turnaround.
- **Plan.** Intro: the drone, the pulse and the strings. Build: the ostinato and the taiko. Climax:
  the riff, the brass on the tune and the full kit.

## Era 9: 2001, the Xbox

- **On the radio.** Linkin Park's *In the End*, Daft Punk's *Discovery*, Gorillaz; at the cinema,
  Howard Shore's *The Fellowship of the Ring*.
- **In the games.** *Halo*: Marty O'Donnell and Michael Salvatori's monk chant, the string
  ostinato, the war drums and the rock guitar; *Project Gotham Racing*'s electronica.
- **Voices: 64** mixed in hardware (the MCPX), with 5.1 surround.
- **Kit.** War drums (taiko), a rock kit (heavy kick, cracking snare), crash, a tom roll.
- **Chain.** A cathedral hall for the choir, and a little tape saturation on the guitars.
- **Epic devices.** The monk choir (formant "oo" and "ah" on a low unison) singing the A section
  slowly; the string ostinato in sixteenths driving the B section; war drums; a guitar doubling
  the tune in the climax, the way Halo turns from chant to rock.
- **Plan.** Intro: the choir alone on the tune. Build: the string ostinato and the war drums.
  Climax: the guitars, the full kit and the choir an octave up.

## Era 10: 2005, the Xbox 360, the top

- **On the radio.** Gorillaz's *Feel Good Inc.*, Kanye West's *Gold Digger*, Green Day; at the
  cinema, *Batman Begins*' ostinato strings and low brass.
- **In the games.** *Halo 2*'s choir and guitars carried into the new generation; the trailer
  orchestra of *Gears of War* and *Kameo*; and the new sound of 2005, the achievement sting.
- **Voices: 256.** Software mixing on a three-core machine: effectively unlimited.
- **Kit.** Epic trailer percussion: taiko ensemble, a huge hybrid kick, a snare with a long
  gated tail, toms, crash, and a reversed cymbal swell into each section.
- **Chain.** A huge hall, and nothing else: the modern, clean, loud master.
- **Epic devices.** The trailer build: string ostinato, low brass on the tune, choir on the B
  section, taiko on every beat, a riser into each section, and the achievement sting (a bright
  two-note chime) when a point moves the machine up; the big-room drop from the current loop stays
  as the climax's pulse.
- **Plan.** Intro: the ostinato and the pulse. Build: brass and taiko. Climax: the choir, the full
  trailer percussion, the supersaw and every crash the engine has.
