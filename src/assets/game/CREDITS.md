# Game art credits

All images are by the project owner (TheJollyLaMa / DecentAgency). They come from the
"Mandelblum" Blender renders and the Ens Eth "Breathe" artwork. The game uses web-sized
copies only; the multi-megabyte originals and animated GIFs are not shipped.

| File | Source | Processing |
| --- | --- | --- |
| rock-1.png | BlenderBender/Mandelblum/output-onlinepngtools-2.png | resized to 192px (sips) |
| rock-2.png | BlenderBender/Mandelblum/output-onlinepngtools-4.png | resized to 192px |
| rock-3.png | BlenderBender/Mandelblum/output-onlinepngtools-5.png | resized to 192px |
| rock-4.png | BlenderBender/Mandelblum/output-onlinepngtools.png | resized to 192px |
| rock-5.png | BlenderBender/Mandelblum/Screenshot 2023-03-28 at 12.48.34 PM.png | black keyed to alpha (ffmpeg colorkey), 192px |
| rock-6.png | BlenderBender/Mandelblum/mandelblum_toroid9.png | black keyed to alpha, 192px |
| rock-7.png | BlenderBender/Mandelblum/mandelblum_toroid3.png | black keyed to alpha, 192px |
| rock-8.png | BlenderBender/Mandelblum/mandelblum_toroid7.png | black keyed to alpha, 192px |
| gate.png | BlenderBender/Mandelblum/mandelblum_gate1.png | black keyed to alpha, 320px |
| bg-galaxy.jpg | BlenderBender/Mandelblum/mandelblum2_with_galaxy.png | 960px wide JPEG, q72 |
| bg-royal.jpg | BlenderBender/Mandelblum/mandelblum_clear_royal.png | 960px wide JPEG, q72 |
| bg-2a.jpg | BlenderBender/Mandelblum/mandelblum2A.png | 960px wide JPEG, q72 |
| bg-tec.jpg | BlenderBender/Mandelblum/mandelblum_TEC.png | 960px wide JPEG, q72 |
| bg-zz.jpg | BlenderBender/Mandelblum/mandelblum_ZZpng.png | 960px wide JPEG, q72 |
| mars-domicile.jpg | BlenderBender/Mandelblum/Mandelblums_Mars_Domicile.png | 960px wide JPEG, q72 |
| breathe-sheet.png | DecentJukebox/public/assets/Ens_Eth_Breathe.gif | 8 frames (every 13th) extracted with ffmpeg, 96px each, tiled 768x96 |
| breathe-still.png | DecentHead/img/Ens_Eth_Breathe-still.png | resized to 96px |

The pixel-art ship, bullets, shield, HUD and effects are drawn in code (src/js/render/).
Sounds are synthesized at runtime with WebAudio (src/js/audio.js); there are no audio files.


## Decent Voyager v1 additions

All added files are optimized web copies. Supporter token images are sourced from
IPFS metadata URIs in the Decent Voyager v1 team contract; each metadata `image`
was fetched through IPFS gateways, converted to JPEG at 256px/quality 72 with
`sips`, and kept under 150KB. Mandelblum art is by TheJollyLaMa / DecentAgency.

| File | Source | Processing |
| --- | --- | --- |
| supporter-70.jpg | DecentHead v2.0.0 #70 metadata (`QmVGmpz63TS9XkTHMxf2sybHv5k9Vdoyr2Spi9QqZ4pzfj`) | IPFS image `QmcuhKLo46hwSdUQJm93VoHeB1YrpjhzeySg6Q7D9srabS`, 256px JPEG |
| supporter-71.jpg | DecentMarket v0.3.1 #71 metadata (`QmUR29d2NeRH94ceLDxHqDvDi4eNdSRTNM1wZ6UPDsvWqi`) | IPFS image `QmU7GmcRdWvJTvzkUKzEB6hsVrqX2jkFKyNq5sBusUR1wx`, 256px JPEG |
| supporter-75.jpg | DecentBusking v1.0.0 #75 metadata (`QmZroFCEhaKoctVqW682Uzv5i6WWiQtuWvTAYkQBYfH6TD`) | IPFS image `QmbMAoxqif263UUQmZPwNaaxaXycRKGCBf7rGe3kTAuzDe`, 256px JPEG |
| supporter-76.jpg | BigNuten_Vanilla v3.3.0 #76 metadata (`QmSrAwCU5p1ga3RzpuDHZxezsNjob76ZSFpRzCuG15yYqU`) | IPFS image `QmUxzh27UCCjWS4no76P2rHm6mTA4wK2YrhQz3avR3eBWb`, 256px JPEG |
| supporter-78.jpg | DecentPilgrimages v0.1.1 #78 metadata (`QmNe9SYSyrZYV66X29Wp4hBLbCDpQDjnJsAJLDdAytALEN`) | IPFS image `QmYtVkkDitdTnEabaZxPG8oquuenpWdVSzQ6b9VqbNrrVf`, 256px JPEG |
| supporter-79.jpg | DecentCanopy v0.1.0 #79 metadata (`QmQqQtuSeab78F3pdBcMbvSopYZLa51zJ4JxcodQ2ugy9d`) | IPFS image `QmSrWH6EcmXsPfjfTa99G3D2xCqgXWSyLK6o5B1m7Smu3A`, 256px JPEG |
| future-rock-1.jpg | BlenderBender/Mandelblum/mandelblum_toroid1.png | 256px PNG with black keyed to alpha (ffmpeg colorkey) |
| future-rock-2.jpg | BlenderBender/Mandelblum/mandelblum_toroid4.png | 256px PNG with black keyed to alpha (ffmpeg colorkey) |
| future-rock-3.jpg | BlenderBender/Mandelblum/mandelblum_toroid6.png | 256px PNG with black keyed to alpha (ffmpeg colorkey) |
| future-rock-4.jpg | BlenderBender/Mandelblum/mandelblum_toroid8.png | 256px PNG with black keyed to alpha (ffmpeg colorkey) |
| bg-sector2-lotus.jpg | BlenderBender/Mandelblum/White_Lotus_Clear.png | 960px JPEG, quality 65 |
| bg-sector2-mars.jpg | BlenderBender/Mandelblum/Mandelblums_Mars_Domicile_2.png | 960px JPEG, quality 65 |
| bg-sector2-top.jpg | BlenderBender/Mandelblum/mandelblum2_top.png | 960px JPEG, quality 65 |
| gate-sector2.jpg | BlenderBender/Mandelblum/mandelblum_gate2.png | 256px PNG with black keyed to alpha (ffmpeg colorkey) |
