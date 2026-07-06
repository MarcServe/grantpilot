import { inngest } from "./client";
import { runGrantPostprocess } from "@/lib/grant-postprocess";

export const grantPostprocessRequested = inngest.createFunction(
  { id: "grant-postprocess-requested", name: "Grant Postprocess Worker" },
  { event: "grant/postprocess.requested" },
  async ({ event }) =>
    runGrantPostprocess({
      grantId: String(event.data?.grantId ?? ""),
      applicationUrl: typeof event.data?.applicationUrl === "string" ? event.data.applicationUrl : null,
      context: event.data?.context && typeof event.data.context === "object" ? event.data.context : undefined,
    })
);
