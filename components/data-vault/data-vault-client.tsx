"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Database, FileText, Loader2, Plus, Trash2, Upload, UserRound, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { removeDocument, saveTeamVault } from "@/app/(dashboard)/profile/actions";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_GROUPS } from "@/lib/document-categories";

type DocumentItem = {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  category?: string | null;
};

type DataVaultProfile = {
  id: string;
  businessName?: string | null;
  directorNames?: string | null;
  directorProfiles?: string | null;
  teamMembers?: string | null;
  boardMembers?: string | null;
  teamExpertise?: string | null;
  documents: DocumentItem[];
};

type PersonRow = {
  id: string;
  name: string;
  role: string;
  profile: string;
  linkedIn: string;
};

function newPerson(overrides?: Partial<PersonRow>): PersonRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    role: "",
    profile: "",
    linkedIn: "",
    ...overrides,
  };
}

function splitPersonLine(value: string): Omit<PersonRow, "id"> {
  const parts = value
    .split(/\s+-\s+|\s+–\s+|,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const linkedInIndex = parts.findIndex(
    (part) => /^linkedin:/i.test(part) || /^https?:\/\/(www\.)?linkedin\.com/i.test(part)
  );
  const linkedIn =
    linkedInIndex >= 0 ? parts.slice(linkedInIndex).join(" - ").replace(/^linkedin:\s*/i, "") : "";
  const usable = linkedInIndex >= 0 ? parts.slice(0, linkedInIndex) : parts;
  return {
    name: usable[0] ?? "",
    role: usable[1] ?? "",
    profile: usable.slice(2).join(" - "),
    linkedIn,
  };
}

function splitNameRole(value: string): { name: string; role: string } {
  const person = splitPersonLine(value);
  return { name: person.name, role: person.role };
}

function parsePeople(text: string | undefined | null): PersonRow[] {
  const lines = String(text ?? "")
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [newPerson()];
  return lines.map((line) => newPerson(splitPersonLine(line)));
}

function parseDirectors(names: string | undefined | null, profiles: string | undefined | null): PersonRow[] {
  const nameRows = String(names ?? "")
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitNameRole);
  const profileRows = String(profiles ?? "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const count = Math.max(nameRows.length, profileRows.length);
  if (count === 0) return [newPerson()];

  return Array.from({ length: count }, (_, index) => {
    const parsedProfile = splitPersonLine(profileRows[index] ?? "");
    const nameRow = nameRows[index] ?? { name: parsedProfile.name, role: parsedProfile.role };
    return newPerson({
      name: nameRow.name,
      role: nameRow.role,
      profile: parsedProfile.profile || profileRows[index] || "",
      linkedIn: parsedProfile.linkedIn,
    });
  });
}

function serializeNames(people: PersonRow[]): string {
  return people
    .map((person) => [person.name, person.role].filter(Boolean).join(" - ").trim())
    .filter(Boolean)
    .join("; ");
}

function serializeProfiles(people: PersonRow[]): string {
  return people
    .map((person) => {
      const header = [person.name, person.role].filter(Boolean).join(" - ").trim();
      const body = person.profile.trim();
      const linkedIn = person.linkedIn.trim() ? `LinkedIn: ${person.linkedIn.trim()}` : "";
      return [header, body, linkedIn].filter(Boolean).join(" - ");
    })
    .filter(Boolean)
    .join("\n");
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getCategoryLabel(value: string | null | undefined): string {
  if (!value) return "Document";
  return DOCUMENT_CATEGORIES.find((category) => category.value === value)?.label ?? value;
}

function hasPersonContent(person: PersonRow): boolean {
  return Boolean(
    person.name.trim() || person.role.trim() || person.profile.trim() || person.linkedIn.trim()
  );
}

function PersonEditor({
  title,
  description,
  addLabel,
  people,
  onChange,
}: {
  title: string;
  description: string;
  addLabel: string;
  people: PersonRow[];
  onChange: (people: PersonRow[]) => void;
}) {
  function updatePerson(index: number, patch: Partial<PersonRow>) {
    onChange(people.map((person, i) => (i === index ? { ...person, ...patch } : person)));
  }

  return (
    <section className="space-y-3 rounded-xl border border-[#d7e0ee] bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-black text-[#071a3a]">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-[#51627d]">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-2 sm:w-auto"
          onClick={() => onChange([...people, newPerson()])}
        >
          <Plus className="h-4 w-4" />
          {addLabel}
        </Button>
      </div>

      <div className="space-y-3">
        {people.map((person, index) => (
          <div key={person.id} className="rounded-lg border border-[#dce4f0] bg-[#f8fbff] p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={person.name}
                  onChange={(event) => updatePerson(index, { name: event.target.value })}
                  placeholder="e.g. Michael Orji"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Position / role</Label>
                <Input
                  value={person.role}
                  onChange={(event) => updatePerson(index, { role: event.target.value })}
                  placeholder="e.g. Technical founder / CEO"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Experience and document-prep notes</Label>
                <Textarea
                  value={person.profile}
                  onChange={(event) => updatePerson(index, { profile: event.target.value })}
                  placeholder="Responsibilities, qualifications, delivery role, certifications, awards, or domain expertise..."
                  rows={3}
                  className="resize-y"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>LinkedIn / profile URL</Label>
                <Input
                  value={person.linkedIn}
                  onChange={(event) => updatePerson(index, { linkedIn: event.target.value })}
                  placeholder="https://www.linkedin.com/in/..."
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2 text-destructive hover:text-destructive"
                disabled={people.length === 1 && !hasPersonContent(person)}
                onClick={() => onChange(people.length === 1 ? [newPerson()] : people.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DataVaultClient({ profile }: { profile: DataVaultProfile }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [documents, setDocuments] = useState<DocumentItem[]>(profile.documents ?? []);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [directors, setDirectors] = useState<PersonRow[]>(() =>
    parseDirectors(profile.directorNames, profile.directorProfiles)
  );
  const [teamMembers, setTeamMembers] = useState<PersonRow[]>(() => parsePeople(profile.teamMembers));
  const [boardMembers, setBoardMembers] = useState(profile.boardMembers ?? "");
  const [teamExpertise, setTeamExpertise] = useState(profile.teamExpertise ?? "");

  const filledPeopleCount = useMemo(
    () => [...directors, ...teamMembers].filter(hasPersonContent).length,
    [directors, teamMembers]
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const isVideo = (file.type || "").startsWith("video/");
      const maxSize = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error(isVideo ? "Video must be under 100MB" : "File must be under 10MB");
        return;
      }

      setUploading(true);
      try {
        const formData = new FormData();
        formData.set("file", file);
        if (uploadCategory) formData.set("category", uploadCategory);

        const response = await fetch("/api/profile/documents/upload", {
          method: "POST",
          body: formData,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          toast.error(data?.error ?? `Upload failed (${response.status})`);
          return;
        }
        if (data.document) {
          setDocuments((current) => [
            ...current,
            {
              id: data.document.id,
              name: data.document.name,
              url: data.document.url,
              type: data.document.type,
              size: data.document.size,
              category: data.document.category ?? null,
            },
          ]);
          toast.success("Document added to Data Vault");
          router.refresh();
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to upload document");
      } finally {
        setUploading(false);
        event.target.value = "";
      }
    },
    [router, uploadCategory]
  );

  function handleRemoveDocument(id: string) {
    setRemovingId(id);
    startTransition(async () => {
      try {
        await removeDocument(id);
        setDocuments((current) => current.filter((document) => document.id !== id));
        toast.success("Document removed");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not remove document");
      }
      setRemovingId(null);
    });
  }

  function handleSaveTeamVault() {
    startTransition(async () => {
      const result = await saveTeamVault({
        directorNames: serializeNames(directors),
        directorProfiles: serializeProfiles(directors),
        teamMembers: serializeProfiles(teamMembers),
        boardMembers,
        teamExpertise,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Business DNA team data saved");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[#d7e0ee] bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6b7890]">Documents</p>
          <p className="mt-2 text-2xl font-black text-[#071a3a]">{documents.length}</p>
        </div>
        <div className="rounded-xl border border-[#d7e0ee] bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6b7890]">Team records</p>
          <p className="mt-2 text-2xl font-black text-[#071a3a]">{filledPeopleCount}</p>
        </div>
        <div className="rounded-xl border border-[#d7e0ee] bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6b7890]">Business DNA</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-bold text-[#071a3a]">
            <CheckCircle2 className="h-4 w-4 text-[#16a34a]" />
            Used in prep documents
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="rounded-2xl bg-white p-5 shadow-[0_18px_45px_rgba(7,26,58,0.07)] sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-[#245b9f]">
                  <UserRound className="h-4 w-4" />
                  Team and leadership
                </div>
                <h1 className="mt-2 text-2xl font-black text-[#071a3a]">Business DNA team vault</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#51627d]">
                  Store directors, founders, staff, advisers, and delivery roles once so grant documents can reuse the right team details.
                </p>
              </div>
              <Button className="w-full sm:w-auto" onClick={handleSaveTeamVault} disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save team data
              </Button>
            </div>

            <div className="mt-5 space-y-4">
              <PersonEditor
                title="Directors / founders"
                description="Leadership, governance, and founder credibility details for funder questions."
                addLabel="Add director"
                people={directors}
                onChange={setDirectors}
              />
              <PersonEditor
                title="Team members / key staff"
                description="Add each employee, contractor, adviser, or project lead with their position and contribution."
                addLabel="Add team member"
                people={teamMembers}
                onChange={setTeamMembers}
              />
              <section className="space-y-3 rounded-xl border border-[#d7e0ee] bg-white p-4">
                <div>
                  <h2 className="text-base font-black text-[#071a3a]">Team capability summary</h2>
                  <p className="mt-1 text-sm leading-5 text-[#51627d]">
                    A short reusable summary for application sections that ask why the team can deliver.
                  </p>
                </div>
                <Textarea
                  value={teamExpertise}
                  onChange={(event) => setTeamExpertise(event.target.value)}
                  placeholder="e.g. Leadership experience, specialist skills, certifications, delivery track record, advisory expertise..."
                  rows={4}
                  className="resize-y"
                />
              </section>
              <section className="space-y-3 rounded-xl border border-[#d7e0ee] bg-white p-4">
                <div>
                  <h2 className="text-base font-black text-[#071a3a]">Board / advisers</h2>
                  <p className="mt-1 text-sm leading-5 text-[#51627d]">
                    Optional governance, trustee, advisory board, or specialist adviser details.
                  </p>
                </div>
                <Textarea
                  value={boardMembers}
                  onChange={(event) => setBoardMembers(event.target.value)}
                  placeholder="List board members, trustees, advisers, governance roles, and relevant expertise..."
                  rows={4}
                  className="resize-y"
                />
              </section>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-2xl bg-white p-5 shadow-[0_18px_45px_rgba(7,26,58,0.07)]">
            <div className="flex items-center gap-2 text-sm font-bold text-[#245b9f]">
              <Database className="h-4 w-4" />
              Evidence vault
            </div>
            <h2 className="mt-2 text-xl font-black text-[#071a3a]">Documents and media</h2>
            <p className="mt-2 text-sm leading-6 text-[#51627d]">
              Upload business plans, accounts, pitch decks, CVs, certificates, support letters, or short pitch videos.
            </p>

            <div className="mt-4 rounded-xl border border-dashed border-[#b8c6db] bg-[#f8fbff] p-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-[#51627d]">Document type</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={uploadCategory}
                  onChange={(event) => setUploadCategory(event.target.value)}
                  aria-label="Document type"
                >
                  <option value="">Choose a category</option>
                  {DOCUMENT_CATEGORY_GROUPS.map((group) => {
                    const items = DOCUMENT_CATEGORIES.filter((category) => category.group === group);
                    if (items.length === 0) return null;
                    if (group === "Other") {
                      return (
                        <option key="other" value="other">
                          Other
                        </option>
                      );
                    }
                    return (
                      <optgroup key={group} label={group}>
                        {items.map((category) => (
                          <option key={category.value} value={category.value}>
                            {category.label}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              <label className="mt-4 flex cursor-pointer flex-col items-center rounded-lg border border-[#d7e0ee] bg-white px-4 py-5 text-center">
                {uploading ? (
                  <Loader2 className="h-7 w-7 animate-spin text-[#2468e8]" />
                ) : (
                  <Upload className="h-7 w-7 text-[#2468e8]" />
                )}
                <span className="mt-2 text-sm font-bold text-[#071a3a]">
                  {uploading ? "Uploading..." : "Choose file"}
                </span>
                <span className="mt-1 text-xs text-[#6b7890]">Documents 10MB max. Videos 100MB max.</span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.doc,.xlsx,.xls,video/*,.mp4,.webm,.mov"
                  onChange={handleFileChange}
                  disabled={uploading}
                  aria-label="Upload document"
                />
              </label>
            </div>

            <div className="mt-4 space-y-3">
              {documents.length === 0 ? (
                <div className="rounded-xl border border-[#d7e0ee] bg-[#f8fbff] p-4 text-sm text-[#51627d]">
                  No documents uploaded yet.
                </div>
              ) : (
                documents.map((document) => (
                  <Card key={document.id} className="overflow-hidden rounded-xl">
                    <CardContent className="flex items-start justify-between gap-3 p-3">
                      <div className="flex min-w-0 gap-3">
                        {(document.type || "").startsWith("video/") ? (
                          <Video className="mt-0.5 h-5 w-5 shrink-0 text-[#51627d]" />
                        ) : (
                          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[#51627d]" />
                        )}
                        <div className="min-w-0">
                          <a
                            href={document.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-sm font-bold text-[#071a3a] hover:text-[#2468e8]"
                          >
                            {document.name}
                          </a>
                          <p className="mt-1 text-xs text-[#6b7890]">
                            {formatFileSize(document.size)} · {getCategoryLabel(document.category)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveDocument(document.id)}
                        disabled={removingId === document.id || isPending}
                        aria-label={`Remove ${document.name}`}
                      >
                        {removingId === document.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
