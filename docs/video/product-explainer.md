# Product explainer

The public `/how-it-works` page and homepage share a native HTML video player. Playback is user initiated; the MP4 is not preloaded. English WebVTT captions and a page transcript are included.

## Assets

- `public/videos/grantscopilot-explainer.mp4`: 48 seconds, 1280×720, H.264/AAC.
- `public/videos/grantscopilot-explainer-poster.jpg`: dashboard scene.
- `public/videos/grantscopilot-explainer.vtt`: English captions.
- `remotion/grantscopilot-explainer.tsx`: editable motion composition.

The voice uses the existing project narration in `public/voiceover/grantscopilot-launch/narration.mp3`. The original autopilot slogan is omitted. The interface is an illustration, not a screen recording or a promise of funding.

## Re-render

```sh
npx remotion render GrantsCopilotExplainer public/videos/grantscopilot-explainer.mp4 --concurrency=2 --crf=26 --codec=h264 --audio-codec=aac --props=docs/video/explainer-props.json
ffmpeg -y -ss 7 -i public/videos/grantscopilot-explainer.mp4 -frames:v 1 -q:v 3 public/videos/grantscopilot-explainer-poster.jpg
```

The optional ambient background was generated with Higgsfield Marketing Studio (job `e8e90942-c479-4b8e-8a1b-2eef2c1d72ee`) for the original cut. Real product scenes now cover that sequence. The browser player needs no external AI service. If the source URL becomes unavailable, omit `--props` to render the branded motion graphics without that ambient scene. Only the final MP4 is needed in production.

Update captions and transcript together when changing narration. Review copy against current product behavior before publishing another cut.

## Real product footage (18 November revision)

`public/videos/explainer-media/` contains cropped, muted excerpts from the applicant-provided screen recording and a cropped deadline email screenshot. Inbox chrome, labels, browser tabs and desktop controls are excluded. The recording itself includes the real Opportunities page, which is used for the product sequences. Originals are not published in full.

`remotion/grantscopilot-real-product-scenes.tsx` overlays the real opportunities, daily digest and deadline reminder sequences. The live signed-in browser also supplied dashboard, business profile and Founder Pack screenshots. The Founder Pack view shows the workspace and available pack/export choices; it does not depict a new generation or submission. WhatsApp footage is not included in this revision.
