# Video frame-readiness fixture

`frame-colors.webm` is a local 128×96 VP9 lossless YUV444 fixture with three
solid RGB source frames: red, green, blue, at 2 fps (1.5 seconds total).
It was encoded from literal PPM pixels with system FFmpeg. Samples at 0.25,
0.75 and 1.25 seconds are well inside their respective frames. RGB↔YUV
conversion permits a 3-byte interior-color tolerance; alpha stays 255.
No external media URL is used. Tests compare frame colors and independent
overlay regions, rather than using the preview canvas as their oracle.
