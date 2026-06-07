import { getActiveOrg } from "@/lib/auth";
import { ContactFeedbackForm } from "@/components/feedback/contact-feedback-form";

export default async function FeedbackPage() {
  const { user } = await getActiveOrg();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Contact us</h1>
        <p className="mt-1 text-muted-foreground">
          Send product feedback, feature requests, bug reports, or useful ideas for the roadmap.
        </p>
      </div>
      <ContactFeedbackForm defaultEmail={typeof user.email === "string" ? user.email : null} />
    </div>
  );
}
