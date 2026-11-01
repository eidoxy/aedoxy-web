import { z } from "zod";

/** Shape of GET /api/public/activity (F07). Parsed on the client: the response crosses a trust boundary. */
export const activityListSchema = z.array(
  z.object({
    label: z.string().max(40),
    plan: z.string().max(80),
    at: z.iso.datetime(),
  }),
);
