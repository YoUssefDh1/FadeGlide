# FadeGlide

A [Spicetify](https://spicetify.app) extension that smooths the transition between tracks in the Spotify desktop app by **fading the volume out at the end of a song and fading it back in on the next one**.

> ### ⚠️ This is NOT a real crossfade
>
> Spotify's built-in crossfade (a Premium feature) overlaps the end of one song with the start of the next. **FadeGlide cannot do that.** Spotify plays one audio stream at a time, and extensions have no access to the audio engine, so there is no way to overlap two tracks from here.
>
> What FadeGlide actually does is adjust the player volume: **fade out, brief silence while the next track loads, fade in.** You will hear a short dip between songs. It sounds smoother than a hard cut, but it is a different effect from crossfade, and it will not sound like Spotify's or Apple Music's.

## What it does

- Fades the last few seconds of each track out, then fades the next track in.
- Fade length is adjustable from 1 to 12 seconds.
- **Keep albums gapless**: skips the fade between consecutive tracks of the same album, so live albums and continuous mixes aren't chopped up.
- Never touches ads.
- If you move the volume slider mid-fade, FadeGlide steps aside and leaves your volume alone.

## Requirements

- Spotify **desktop** app (Windows, macOS or Linux). Does not work on mobile or the web player.
- [Spicetify](https://spicetify.app/docs/getting-started) installed and working.

## Installation

### Manual

1. Download `fadeglide.js`.
2. Put it in your Spicetify `Extensions` folder:
   - Windows: `%appdata%\spicetify\Extensions`
   - macOS / Linux: `~/.config/spicetify/Extensions`
3. Run:
   ```
   spicetify config extensions fadeglide.js
   spicetify apply
   ```

### Spicetify Marketplace

If you use the [Marketplace](https://github.com/spicetify/marketplace), search for **FadeGlide** under Extensions.

## Usage

Click the **FadeGlide** wave icon in the playbar (or open **FadeGlide settings** from the profile menu) to:

| Option | What it does |
| --- | --- |
| Enable FadeGlide | Turns the extension on or off |
| Fade length | How long the fade-out lasts (1 to 12 s). The fade-in is 60% of this |
| Keep albums gapless | No fade between consecutive tracks of the same album |

## Known limitations

- **It's a volume fade, not an overlap.** See the note at the top.
- There is still a short gap between tracks. A fade can't hide it.
- The player volume slider will visibly move during fades.
- It relies on Spicetify and Spotify internals that can change with any Spotify update. If something stops working after an update, please open an issue with your Spotify and Spicetify versions.
- Gapless detection needs Spotify's queue information. If it isn't available, FadeGlide will fade between every track, including album tracks.
- Don't run it alongside other extensions that skip tracks early or control volume. They will conflict.

## Uninstall

```
spicetify config extensions fadeglide.js-
spicetify apply
```

## Disclaimer

This is an unofficial community project. It is **not affiliated with, endorsed by, or supported by Spotify**. Spicetify modifies the Spotify client, which may not comply with Spotify's Terms of Service. Use it at your own risk.

FadeGlide does not unlock, bypass or enable any Premium feature, and it does not touch Spotify's audio streams. It only changes the player volume.

## Contributing

Issues and pull requests are welcome. If you report a bug, include your OS, Spotify version and Spicetify version.

## License

MIT. See [LICENSE](LICENSE).
