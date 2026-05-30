# Bilibili Subtitle Downloader

Download subtitles for one Bilibili video as original JSON and ASS.

```powershell
node bin/download-bilibili-subtitle.js "https://www.bilibili.com/video/BV1Jh5d68Er3"
```

By default files are written to:

```text
downloads/
  BVxxxx/
    metadata.json
    subtitles/
      p01-zh-Hans.json
      p01-zh-Hans.ass
```

Use a custom output directory:

```powershell
node bin/download-bilibili-subtitle.js BV1Jh5d68Er3 --output downloads
```

Pass cookies for charged videos or videos that require login:

```powershell
node bin/download-bilibili-subtitle.js BVxxxx --cookie "SESSDATA=..."
node bin/download-bilibili-subtitle.js BVxxxx --cookie-file .\cookies.txt
```

The cookie file can be either a raw cookie header or a Netscape-format browser export. For Bilibili subtitles, `SESSDATA` is usually the important cookie.

If a video has no downloadable subtitle tracks, the tool prints `status=no-subtitles` and still writes `metadata.json`.
If Bilibili reports that subtitle metadata requires login or purchase access, the tool prints `status=auth-required`.

## Checks

```powershell
npm.cmd test
npm.cmd run check
```
