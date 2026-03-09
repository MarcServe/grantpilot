"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  notificationPreferencesSchema,
  type NotificationPreferencesData,
} from "@/lib/validations/profile";
import { updateNotificationPreferences } from "@/app/(dashboard)/profile/actions";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

interface NotificationPreferencesProps {
  defaultValues: {
    phoneNumber?: string | null;
    whatsappOptIn: boolean;
  };
}

export function NotificationPreferences({ defaultValues }: NotificationPreferencesProps) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<NotificationPreferencesData>({
    resolver: zodResolver(notificationPreferencesSchema),
    defaultValues: {
      phoneNumber: defaultValues.phoneNumber ?? "",
      whatsappOptIn: defaultValues.whatsappOptIn ?? false,
    },
  });

  function onSubmit(data: NotificationPreferencesData) {
    startTransition(async () => {
      const result = await updateNotificationPreferences(data);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Notification preferences saved");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification preferences</CardTitle>
        <CardDescription>
          Add your WhatsApp number to receive grant deadlines, review requests, and application
          updates on your phone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="+44 7123 456789"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="whatsappOptIn"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="font-normal cursor-pointer">
                      Receive notifications via WhatsApp
                    </FormLabel>
                    <p className="text-muted-foreground text-sm">
                      We&apos;ll send grant reminders and application updates to this number.
                    </p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Not receiving messages? If you use Twilio&apos;s WhatsApp Sandbox, send &quot;join
                      &lt;your-code&gt;&quot; to the Sandbox number in WhatsApp first. Check Twilio Console →
                      Messaging → Logs for delivery status.
                    </p>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save preferences
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
