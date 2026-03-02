/**
 * UK grant discovery: curated list of real UK government and public body grants.
 * Find a Grant (find-government-grants.service.gov.uk) has no public API, so we maintain
 * a list of known programmes and link to the portal. Optional: fetch from data.gov.uk CKAN.
 */

import type { GrantInput } from "@/lib/grants-ingest";

const FIND_A_GRANT_BASE = "https://find-government-grants.service.gov.uk/grants";

/**
 * Curated list of real UK grant programmes (name, funder). applicationUrl points to Find a Grant search.
 */
const UK_GRANTS_CURATED: { name: string; funder: string; eligibility?: string; amount?: number }[] = [
  { name: "Innovate UK Smart Grants", funder: "Innovate UK", eligibility: "UK registered businesses with innovative R&D projects.", amount: 500000 },
  { name: "Creative Scale Up Programme", funder: "Creative England", eligibility: "Creative businesses in England with growth potential.", amount: 150000 },
  { name: "Woodland Creation Planning Grant", funder: "Forestry Commission", eligibility: "Landowners and land managers in England.", amount: 30500 },
  { name: "Community and Environment Fund (CEF)", funder: "Department for Transport", eligibility: "Communities and organisations affected by HS2.", amount: null },
  { name: "Business and Local Economy Fund (BLEF)", funder: "Department for Transport", eligibility: "Businesses and local economies along HS2 route.", amount: null },
  { name: "Growth Hub Grant", funder: "Department for Business and Trade", eligibility: "Small businesses in England seeking advice and support.", amount: null },
  { name: "R&D Tax Relief", funder: "HMRC", eligibility: "UK companies undertaking R&D.", amount: null },
  { name: "Green Finance Institute Programmes", funder: "Green Finance Institute", eligibility: "Projects accelerating green finance.", amount: null },
  { name: "UK Shared Prosperity Fund", funder: "Department for Levelling Up", eligibility: "Local authorities and partners for local investment.", amount: null },
  { name: "Levelling Up Fund", funder: "Department for Levelling Up", eligibility: "Local infrastructure and regeneration projects.", amount: null },
  { name: "Community Ownership Fund", funder: "Department for Levelling Up", eligibility: "Community groups to take ownership of local assets.", amount: null },
  { name: "Places for Growth", funder: "Cabinet Office", eligibility: "Relocation of civil service roles across the UK.", amount: null },
  { name: "Export Support Service", funder: "Department for Business and Trade", eligibility: "UK businesses exporting or planning to export.", amount: null },
  { name: "Help to Grow: Management", funder: "Department for Business and Trade", eligibility: "Small business leaders in the UK.", amount: null },
  { name: "Help to Grow: Digital", funder: "Department for Business and Trade", eligibility: "Small businesses adopting digital technology.", amount: null },
  { name: "Start Up Loans", funder: "British Business Bank", eligibility: "UK residents starting or growing a business.", amount: 25000 },
  { name: "Recovery Loan Scheme", funder: "British Business Bank", eligibility: "UK businesses seeking finance.", amount: null },
  { name: "Northern Powerhouse Investment Fund", funder: "British Business Bank", eligibility: "SMEs in the North of England.", amount: null },
  { name: "Midlands Engine Investment Fund", funder: "British Business Bank", eligibility: "SMEs in the Midlands.", amount: null },
  { name: "Cornwall and Isles of Scilly Investment Fund", funder: "British Business Bank", eligibility: "Businesses in Cornwall and the Isles of Scilly.", amount: null },
  { name: "Enterprise Nation Grants", funder: "Enterprise Nation", eligibility: "Small businesses and startups.", amount: null },
  { name: "Prince's Trust Enterprise Programme", funder: "Prince's Trust", eligibility: "Young people aged 18-30 starting a business.", amount: null },
  { name: "National Lottery Heritage Fund", funder: "National Lottery Heritage Fund", eligibility: "Heritage projects across the UK.", amount: null },
  { name: "National Lottery Community Fund", funder: "National Lottery Community Fund", eligibility: "Community projects across the UK.", amount: null },
  { name: "Arts Council England Grants", funder: "Arts Council England", eligibility: "Arts and culture organisations and individuals.", amount: null },
  { name: "Sport England Funding", funder: "Sport England", eligibility: "Projects that get people active.", amount: null },
  { name: "Innovate UK BridgeAI", funder: "Innovate UK", eligibility: "AI adoption in key sectors.", amount: null },
  { name: "Innovate UK Launchpad", funder: "Innovate UK", eligibility: "Regional innovation ecosystems.", amount: null },
  { name: "Horizon Europe Guarantee", funder: "UK Research and Innovation", eligibility: "UK applicants to Horizon Europe.", amount: null },
  { name: "SBRI Competitions", funder: "Innovate UK", eligibility: "Innovators solving public sector challenges.", amount: null },
  { name: "Green Heat Network Fund", funder: "Department for Energy Security", eligibility: "New low-carbon heat networks in England.", amount: null },
  { name: "Boiler Upgrade Scheme", funder: "Department for Energy Security", eligibility: "Households and small non-domestic buildings in England and Wales.", amount: null },
  { name: "Farming Investment Fund", funder: "Defra", eligibility: "Farmers and land managers in England.", amount: null },
  { name: "Farming in Protected Landscapes", funder: "Defra", eligibility: "Farmers and land managers in AONBs and National Parks.", amount: null },
  { name: "UK Export Finance", funder: "UK Export Finance", eligibility: "UK exporters and overseas buyers.", amount: null },
  { name: "Get the Right Funding", funder: "British Business Bank", eligibility: "SMEs looking for finance.", amount: null },
  { name: "Innovate UK Knowledge Transfer Partnerships", funder: "Innovate UK", eligibility: "Businesses partnering with universities or research organisations.", amount: null },
  { name: "Innovate UK Collaborative R&D", funder: "Innovate UK", eligibility: "UK businesses in collaborative R&D projects.", amount: null },
  { name: "Innovate UK Future Flight Challenge", funder: "Innovate UK", eligibility: "Aviation and drone innovation projects.", amount: null },
  { name: "Innovate UK Net Zero Living", funder: "Innovate UK", eligibility: "Projects accelerating net zero at local level.", amount: null },
  { name: "Innovate UK Biomedical Catalyst", funder: "Innovate UK", eligibility: "Life sciences and medtech SMEs.", amount: null },
  { name: "Made Smarter Innovation", funder: "Innovate UK", eligibility: "Digital manufacturing innovation.", amount: null },
  { name: "Strength in Places Fund", funder: "UK Research and Innovation", eligibility: "Place-based R&D consortia.", amount: null },
  { name: "Industrial Strategy Challenge Fund", funder: "UK Research and Innovation", eligibility: "Business-led innovation in key sectors.", amount: null },
  { name: "Creative Industries Cluster Programme", funder: "UK Research and Innovation", eligibility: "Creative industries R&D clusters.", amount: null },
  { name: "Agricultural Transition Plan grants", funder: "Defra", eligibility: "Farmers in England for productivity and environmental schemes.", amount: null },
  { name: "Countryside Stewardship", funder: "Defra", eligibility: "Farmers and land managers in England.", amount: null },
  { name: "Sustainable Farming Incentive", funder: "Defra", eligibility: "Farmers in England for sustainable practices.", amount: null },
  { name: "Farming Resilience Fund", funder: "Defra", eligibility: "Farmers in England for business planning.", amount: null },
  { name: "Rural Development Programme England", funder: "Defra", eligibility: "Rural businesses and communities in England.", amount: null },
  { name: "Welsh Government Business Grants", funder: "Welsh Government", eligibility: "Businesses in Wales.", amount: null },
  { name: "Development Bank of Wales", funder: "Development Bank of Wales", eligibility: "SMEs in Wales.", amount: null },
  { name: "Scottish Enterprise Grants", funder: "Scottish Enterprise", eligibility: "Businesses in Scotland.", amount: null },
  { name: "High Growth Spinout Programme", funder: "Scottish Enterprise", eligibility: "University spinouts in Scotland.", amount: null },
  { name: "Invest Northern Ireland", funder: "Invest NI", eligibility: "Businesses in Northern Ireland.", amount: null },
  { name: "Northern Ireland Innovation Accreditation", funder: "Invest NI", eligibility: "Innovative companies in Northern Ireland.", amount: null },
  { name: "London Co-Investment Fund", funder: "British Business Bank", eligibility: "Early-stage companies in London.", amount: null },
  { name: "South West Investment Fund", funder: "British Business Bank", eligibility: "SMEs in the South West of England.", amount: null },
  { name: "Cultural Development Fund", funder: "Department for Culture, Media and Sport", eligibility: "Culture and heritage projects in England.", amount: null },
  { name: "Music Export Growth Scheme", funder: "Department for Culture, Media and Sport", eligibility: "UK music exporters.", amount: null },
  { name: "UK Global Talent Visa", funder: "UK Visas and Immigration", eligibility: "Leaders and potential leaders in digital technology, arts, research.", amount: null },
  { name: "Innovation Loans", funder: "Innovate UK", eligibility: "Late-stage R&D projects in UK companies.", amount: null },
  { name: "Smart Energy GB in Communities Fund", funder: "Smart Energy GB", eligibility: "Community groups promoting smart meters.", amount: null },
  { name: "Energy Company Obligation (ECO)", funder: "Ofgem", eligibility: "Households and landlords for energy efficiency.", amount: null },
  { name: "Heat Network Efficiency Scheme", funder: "Department for Energy Security", eligibility: "Heat network operators in England and Wales.", amount: null },
  { name: "Social Investment Tax Relief", funder: "HMRC", eligibility: "Investors in qualifying social enterprises.", amount: null },
  { name: "Enterprise Investment Scheme", funder: "HMRC", eligibility: "Investors in qualifying small companies.", amount: null },
  { name: "Seed Enterprise Investment Scheme", funder: "HMRC", eligibility: "Investors in early-stage companies.", amount: null },
  { name: "Film Tax Relief", funder: "HMRC", eligibility: "British film production companies.", amount: null },
  { name: "Video Games Tax Relief", funder: "HMRC", eligibility: "UK video games development companies.", amount: null },
  { name: "Theatre Tax Relief", funder: "HMRC", eligibility: "Theatre production companies.", amount: null },
  { name: "Orchestra Tax Relief", funder: "HMRC", eligibility: "Orchestra production companies.", amount: null },
  { name: "Museums and Galleries Exhibition Tax Relief", funder: "HMRC", eligibility: "Museums and galleries for touring exhibitions.", amount: null },
  { name: "UK Space Agency Grants", funder: "UK Space Agency", eligibility: "Space technology and capability projects.", amount: null },
  { name: "Active Travel Fund", funder: "Department for Transport", eligibility: "Local authorities for walking and cycling infrastructure.", amount: null },
  { name: "Zero Emission Bus Regional Areas", funder: "Department for Transport", eligibility: "Local transport authorities for zero emission buses.", amount: null },
  { name: "Adult Education Budget", funder: "Department for Education", eligibility: "Training providers and employers in England.", amount: null },
  { name: "Skills Bootcamps", funder: "Department for Education", eligibility: "Adults in England for technical training.", amount: null },
  { name: "Multiply Programme", funder: "Department for Education", eligibility: "Adults improving numeracy in the UK.", amount: null },
];

function toGrantInput(
  item: { name: string; funder: string; eligibility?: string; amount?: number | null },
  index: number
): GrantInput {
  const searchUrl = `${FIND_A_GRANT_BASE}?searchTerm=${encodeURIComponent(item.name)}`;
  return {
    externalId: `uk-${item.name.replace(/\s+/g, "-").toLowerCase().slice(0, 50)}-${index}`,
    name: item.name,
    funder: item.funder,
    amount: item.amount ?? null,
    deadline: null,
    applicationUrl: searchUrl,
    eligibility: item.eligibility ?? "Check Find a Grant for eligibility and how to apply.",
    sectors: [],
    regions: ["England", "Wales", "Scotland", "Northern Ireland"],
    funderLocations: ["UK"],
  };
}

/**
 * Return curated UK grants (Find a Grant has no public API).
 */
export function getCuratedUKGrants(): GrantInput[] {
  return UK_GRANTS_CURATED.map((item, i) => toGrantInput(item, i));
}

const MAX_UK_GRANTS_DAILY = 500;

/**
 * Fetch UK grants: up to 500 from 360Giving API (live, daily-updated) when available; otherwise curated list.
 */
export async function fetchGrantsFromUK(): Promise<GrantInput[]> {
  try {
    const { fetchGrantsFrom360Giving } = await import("@/lib/grants-uk-360");
    const from360 = await fetchGrantsFrom360Giving(MAX_UK_GRANTS_DAILY);
    if (from360.length > 0) return from360;
  } catch {
    // fallback to curated
  }
  return getCuratedUKGrants();
}
