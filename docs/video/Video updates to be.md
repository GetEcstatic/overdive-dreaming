# Instructions 
I'll use this section to list updates and fixes over time. When called to check for updates in this md file, I want the agent to read the first request, create a new section with a suitable name, plan an implementation in that section, create a checklist in that section, and then start to implement the plan. Continue implementing without stopping unless a major decision gate is met, commiting with a suitable message after each major step, and finally push to main once complete. Once complete, remove the original request from the list and continue to the next request.

## Preserve First Speed Segment Acceleration

### Problem
The speed plot correctly shows the first segment as starting at 0 m/s and reaching the segment speed by 3m while the diver is before the first waypoint. Once the first waypoint is revealed, the graph switches to waypoint samples whose first sample is 0m at the sector average speed, so the historical 0-3m segment is redrawn at the wrong speed.

### Implementation Plan
Keep the first-segment acceleration shape in the canonical visible speed line, even after later waypoints are revealed. Apply the same rule in the browser HUD model and the Cloud Functions ASS renderer so playback and burned-in exports match.

### Checklist

- [x] Add a focused regression test for the first segment after the first waypoint is reached.
- [x] Update the browser speed plot line sampling to preserve the 0m/0 m/s -> 3m/sector speed anchor.
- [x] Update the server-side ASS speed plot sampling with the same behavior.
- [x] Run focused tests and function build checks.
- [x] Commit and push the completed fix.

1. Thumbnails for video recordings. When the dashboard feed loads, it takes a while before any video image is visible. Is it possible to ensure that the video is instantly preloaded either with the first few frames of video or with a thumbnail image? I feel like we had this before, but now it's been lost after updates.
2.  I'm still noticing a significant difference between the HUD designs that play in the app video player (And which are styled nicely) and what is appearing in the burnt-in HUD on downloaded videos. I'm confused because we went through a process of ensuring they were the same yesterday, and even rendered side-by-side comparisons which showed they were the same. But this hasn't shown up in the burnt-in videos. Likewise I requested a small 'Overdive.app' to be burn in to the bottom left corner as a water mark, but this hasn't been done.
3. 