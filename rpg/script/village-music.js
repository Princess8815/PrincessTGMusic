// Willowfin Morning: original instrumental menu loop.
// MIDI pitches, one bar per entry, eight eighth-note slots per bar.
// A null slot is a rest. Chords are voiced for a soft plucked accompaniment.
export const VILLAGE_TEMPO = 96;
export const VILLAGE_BARS = [
  { chord: [48,55,60,64], melody: [72,null,76,79,77,76,74,null] },
  { chord: [45,52,57,60], melody: [72,76,81,null,79,76,74,72] },
  { chord: [41,48,53,57], melody: [69,null,72,77,76,72,69,null] },
  { chord: [43,50,55,59], melody: [71,74,79,null,77,74,72,71] },
  { chord: [48,55,60,64], melody: [72,76,79,84,81,79,76,null] },
  { chord: [40,47,52,55], melody: [79,null,76,74,71,74,76,null] },
  { chord: [41,48,53,57], melody: [77,76,72,null,69,72,76,77] },
  { chord: [43,50,55,59], melody: [79,null,74,71,74,77,79,null] },
  { chord: [45,52,57,60], melody: [81,null,84,79,76,79,81,null] },
  { chord: [40,47,52,55], melody: [79,76,71,null,74,76,79,null] },
  { chord: [41,48,53,57], melody: [77,null,81,84,81,77,76,null] },
  { chord: [48,55,60,64], melody: [79,76,72,null,76,79,84,null] },
  { chord: [50,57,62,65], melody: [81,77,74,null,77,81,77,74] },
  { chord: [43,50,55,59], melody: [71,74,79,null,81,79,77,74] },
  { chord: [41,48,53,57], melody: [77,null,76,72,69,72,74,76] },
  { chord: [43,50,55,59], melody: [79,77,74,71,74,null,71,null] }
];
