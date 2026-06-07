import { Composition, Folder } from "remotion";
import { GrantsCopilotLaunchVideo, VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from "./grantscopilot-launch-video";
import { GrantsCopilotPoster } from "./grantscopilot-poster";

export const RemotionRoot = () => {
  return (
    <Folder name="GrantsCopilot">
      <Composition
        id="GrantsCopilotLaunch"
        component={GrantsCopilotLaunchVideo}
        durationInFrames={46 * VIDEO_FPS}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
      <Composition
        id="GrantsCopilotPoster"
        component={GrantsCopilotPoster}
        durationInFrames={1}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
    </Folder>
  );
};
