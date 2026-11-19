const innovateUkSmartGrants = {
  guidanceUrl: "https://www.ukri.org/councils/innovate-uk/guidance-for-applicants/guidance-for-specific-funds/",
  message: "Innovate UK says Smart Grants are closed to new applications.",
};

/** Match the generic programme listing. Named competition rounds have their own status. */
export function closedGrantProgramme(name?: string | null) {
  return /^innovate uk smart grants?$/i.test(name?.trim().replace(/\s+/g, " ") ?? "")
    ? innovateUkSmartGrants
    : null;
}
