import { NextResponse } from "next/server";
import { getActiveOrg } from "@/lib/auth";
import { checkUsageLimit, recordUsage } from "@/lib/plan-check";
import { getOpenAIClient, cleanJsonResponse } from "@/lib/openai-client";
import { requirementImageRequestSchema, extractedRequirementsSchema, IMAGE_EXTRACTION_PROMPT } from "@/lib/image-requirements";
export const maxDuration = 100;
export async function POST(request: Request) {
  try {
    const { orgId } = await getActiveOrg();
    const body = await request.text();
    if (body.length > 3_300_000) return NextResponse.json({ error: "Images are too large. Use fewer screenshots." }, { status: 413 });
    const parsed = requirementImageRequestSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map(issue => issue.message).join(" ") }, { status: 400 });
    for (const image of parsed.data.images) {
      const [header, data] = image.split(",");
      const bytes = Buffer.from(data, "base64");
      const valid = header.includes("jpeg") ? bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) : header.includes("png") ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP";
      if (!valid) return NextResponse.json({ error: "One image is damaged or its file type is unsupported." }, { status: 400 });
    }
    const limit = await checkUsageLimit(orgId, "match");
    if (!limit.allowed) return NextResponse.json({ error: "Your AI reading allowance has been reached." }, { status: 402 });
    const result = await (await getOpenAIClient()).chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0, max_tokens: 12000, response_format: { type: "json_object" },
      messages: [{ role: "user", content: [{ type: "text", text: IMAGE_EXTRACTION_PROMPT }, ...parsed.data.images.map(url => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } }))] }],
    }, { timeout: 85000, maxRetries: 0 });
    const extracted = extractedRequirementsSchema.parse(JSON.parse(cleanJsonResponse(result.choices[0]?.message?.content ?? "{}")));
    await recordUsage(orgId, "match");
    return NextResponse.json(extracted, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The images could not be read reliably. Try clearer screenshots or paste the requirements as text." }, { status: 502 });
  }
}
