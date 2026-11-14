# Image acceptance golden

`acceptance-rgba.json` is a complete 32 × 24 RGBA golden for IMG-103. Its
row strings expand through the literal palette; no application output is used
to generate it. Coordinates are zero-based and rectangle endpoints inclusive.

The 1-pixel pencil creates 12 red horizontal pixels and 7 additional vertical
pixels. The filled upper rectangle contains 17 × 13 = 221 opaque pixels.
Inverting #4080C0 gives #BF7F3F. Its rounded luminance is 139, so threshold
128 makes these pixels white. The added rectangle has no filled pixels of its
own: modifying RGB at zero alpha leaves them transparent. White in multiply
mode leaves the 5 underlying red pixels unchanged. Elsewhere its 50% opacity
produces white with alpha round(255 × 0.5) = 128.

Thus the composite contains exactly 19 opaque red pixels, 216 white pixels at
alpha 128, and 533 zero RGBA pixels. The fixture records the SHA-256 of all
3,072 expanded bytes. Both the CORE sequence and the production browser test
compare every byte against this same fixed artifact. Golden changes require
review against this derivation, never regeneration from the application.

This sequence contains no text or layer masks. IMG-104 additionally requires
the selection and layer parameters to survive native save/reopen; merely
matching the composite does not prove that requirement.


Independent review (2026-11-13): the consumer audit reproduced the coordinate
sets and complete expanded fixture with a separate Python oracle importing no
application code. It confirmed 19 red, 216 white-alpha-128, 533 zero pixels,
313 selected pixels, luminance 139, and SHA-256
`ccc6497cb5fa9e8739bb6198fc95279ec44afb7ebf31b7978cb666b5d791287e`.
