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
