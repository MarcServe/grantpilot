/**
 * EU grant discovery: curated list of EU / Horizon Europe programmes.
 * Funding & Tenders Portal has APIs that may require registration; we maintain
 * a list of known programmes and link to the portal. Optional: EU_GRANTS_FEED_URL for custom feed.
 */

import type { GrantInput } from "@/lib/grants-ingest";

const EU_PORTAL_SEARCH = "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities";

/**
 * Curated list of EU / Horizon Europe funding programmes.
 */
const EU_GRANTS_CURATED: { name: string; funder: string; eligibility?: string }[] = [
  { name: "Horizon Europe - Marie Skłodowska-Curie Actions", funder: "European Commission", eligibility: "Researchers and organisations in EU and associated countries." },
  { name: "Horizon Europe - Research Infrastructures", funder: "European Commission", eligibility: "Research infrastructure operators and users." },
  { name: "Horizon Europe - Health", funder: "European Commission", eligibility: "Research and innovation in health." },
  { name: "Horizon Europe - Culture, Creativity and Inclusive Society", funder: "European Commission", eligibility: "Cultural, creative and social innovation projects." },
  { name: "Horizon Europe - Civil Security for Society", funder: "European Commission", eligibility: "Security research and innovation." },
  { name: "Horizon Europe - Digital, Industry and Space", funder: "European Commission", eligibility: "Digital, industry and space research and innovation." },
  { name: "Horizon Europe - Climate, Energy and Mobility", funder: "European Commission", eligibility: "Climate, energy and mobility research and innovation." },
  { name: "Horizon Europe - Food, Bioeconomy, Natural Resources", funder: "European Commission", eligibility: "Food, bioeconomy and environment research." },
  { name: "Horizon Europe - European Innovation Ecosystems", funder: "European Commission", eligibility: "Innovation ecosystems and scale-ups." },
  { name: "Horizon Europe - Widening Participation", funder: "European Commission", eligibility: "Strengthening European Research Area in widening countries." },
  { name: "Horizon Europe - EU Missions", funder: "European Commission", eligibility: "Mission-driven research and innovation." },
  { name: "European Innovation Council (EIC) Accelerator", funder: "European Commission", eligibility: "Startups and SMEs with deep tech innovation." },
  { name: "European Innovation Council (EIC) Pathfinder", funder: "European Commission", eligibility: "Breakthrough innovation projects." },
  { name: "European Research Council (ERC) Grants", funder: "European Research Council", eligibility: "Researchers of any nationality and age." },
  { name: "European Institute of Innovation and Technology (EIT)", funder: "EIT", eligibility: "Innovation projects in knowledge and innovation communities." },
  { name: "European Defence Fund", funder: "European Commission", eligibility: "Defence research and development." },
  { name: "Digital Europe Programme", funder: "European Commission", eligibility: "Digital capacity and deployment across the EU." },
  { name: "LIFE Programme", funder: "European Commission", eligibility: "Environment and climate action projects." },
  { name: "Creative Europe", funder: "European Commission", eligibility: "Culture and media sector." },
  { name: "Erasmus+", funder: "European Commission", eligibility: "Education, training, youth and sport." },
  { name: "EU4Health", funder: "European Commission", eligibility: "Health programmes and preparedness." },
  { name: "Single Market Programme", funder: "European Commission", eligibility: "SME support, standards, consumer protection." },
  { name: "European Social Fund Plus (ESF+)", funder: "European Commission", eligibility: "Employment, education and social inclusion." },
  { name: "European Regional Development Fund (ERDF)", funder: "European Commission", eligibility: "Regional development and cohesion." },
  { name: "InvestEU", funder: "European Commission", eligibility: "Investment in sustainable infrastructure, research, SMEs." },
  { name: "Innovation Fund", funder: "European Commission", eligibility: "Low-carbon technologies and innovation." },
  { name: "Connecting Europe Facility", funder: "European Commission", eligibility: "Transport, energy and digital infrastructure." },
  { name: "CERV - Citizens, Equality, Rights and Values", funder: "European Commission", eligibility: "Citizens' engagement, equality, rights and values." },
  { name: "ERC Starting Grant", funder: "European Research Council", eligibility: "Early-career researchers (2-7 years after PhD)." },
  { name: "ERC Consolidator Grant", funder: "European Research Council", eligibility: "Researchers 7-12 years after PhD." },
  { name: "ERC Advanced Grant", funder: "European Research Council", eligibility: "Established research leaders." },
  { name: "ERC Synergy Grant", funder: "European Research Council", eligibility: "Groups of 2-4 principal investigators." },
  { name: "EIC Transition", funder: "European Commission", eligibility: "Mature technologies from research to market." },
  { name: "EIC Pathfinder Open", funder: "European Commission", eligibility: "Breakthrough innovation, any area." },
  { name: "EIC Pathfinder Challenges", funder: "European Commission", eligibility: "Strategic breakthrough innovation topics." },
  { name: "Marie Skłodowska-Curie Postdoctoral Fellowships", funder: "European Commission", eligibility: "Postdoctoral researchers in EU or associated countries." },
  { name: "Marie Skłodowska-Curie Doctoral Networks", funder: "European Commission", eligibility: "Doctoral training networks." },
  { name: "Marie Skłodowska-Curie Staff Exchanges", funder: "European Commission", eligibility: "International staff exchange for R&I." },
  { name: "EIT Digital", funder: "EIT Digital", eligibility: "Digital innovation and entrepreneurship." },
  { name: "EIT Climate-KIC", funder: "EIT Climate-KIC", eligibility: "Climate innovation and entrepreneurship." },
  { name: "EIT Health", funder: "EIT Health", eligibility: "Health innovation across Europe." },
  { name: "EIT Food", funder: "EIT Food", eligibility: "Food system innovation." },
  { name: "EIT Urban Mobility", funder: "EIT Urban Mobility", eligibility: "Urban mobility and transport innovation." },
  { name: "EIT Manufacturing", funder: "EIT Manufacturing", eligibility: "Manufacturing innovation." },
  { name: "EIT RawMaterials", funder: "EIT RawMaterials", eligibility: "Raw materials and circular economy." },
  { name: "EIT Culture & Creativity", funder: "EIT", eligibility: "Cultural and creative sectors innovation." },
  { name: "LIFE Nature and Biodiversity", funder: "European Commission", eligibility: "Nature conservation and biodiversity projects." },
  { name: "LIFE Climate Action", funder: "European Commission", eligibility: "Climate mitigation and adaptation." },
  { name: "LIFE Circular Economy", funder: "European Commission", eligibility: "Circular economy and waste projects." },
  { name: "LIFE Clean Energy Transition", funder: "European Commission", eligibility: "Energy efficiency and renewables." },
  { name: "Interreg Europe", funder: "European Commission", eligibility: "Interregional cooperation for policy improvement." },
  { name: "Interreg North-West Europe", funder: "European Commission", eligibility: "Projects in North-West Europe regions." },
  { name: "Interreg Mediterranean", funder: "European Commission", eligibility: "Cooperation in the Mediterranean." },
  { name: "Interreg Baltic Sea", funder: "European Commission", eligibility: "Baltic Sea region cooperation." },
  { name: "COSME", funder: "European Commission", eligibility: "SME competitiveness and access to finance." },
  { name: "European Maritime, Fisheries and Aquaculture Fund", funder: "European Commission", eligibility: "Maritime, fisheries and aquaculture sectors." },
  { name: "European Agricultural Fund for Rural Development", funder: "European Commission", eligibility: "Rural development in EU regions." },
  { name: "Just Transition Fund", funder: "European Commission", eligibility: "Regions transitioning to climate neutrality." },
  { name: "European Solidarity Corps", funder: "European Commission", eligibility: "Young people in volunteering and solidarity projects." },
  { name: "Europeana", funder: "European Commission", eligibility: "Digital cultural heritage projects." },
  { name: "Digital Innovation Hubs", funder: "European Commission", eligibility: "SMEs accessing digital innovation services." },
  { name: "European Partnership for Metrology", funder: "European Commission", eligibility: "Metrology research and innovation." },
  { name: "EU Mission: Adaptation to Climate Change", funder: "European Commission", eligibility: "Climate adaptation projects in EU regions." },
  { name: "EU Mission: Restore Ocean and Waters", funder: "European Commission", eligibility: "Ocean and freshwater restoration." },
  { name: "EU Mission: 100 Climate-Neutral Cities", funder: "European Commission", eligibility: "Cities working towards climate neutrality." },
  { name: "EU Mission: A Soil Deal for Europe", funder: "European Commission", eligibility: "Soil health research and deployment." },
  { name: "EU Mission: Cancer", funder: "European Commission", eligibility: "Cancer research and care improvement." },
  { name: "Widening Teaming", funder: "European Commission", eligibility: "Institutions in widening countries with leading partners." },
  { name: "Widening ERA Chairs", funder: "European Commission", eligibility: "Institutions in widening countries attracting research leaders." },
  { name: "Twinning", funder: "European Commission", eligibility: "Networking and capacity building in widening countries." },
  { name: "Horizon Europe Partnership - Clean Aviation", funder: "European Commission", eligibility: "Aviation research and innovation." },
  { name: "Horizon Europe Partnership - Clean Hydrogen", funder: "European Commission", eligibility: "Hydrogen research and deployment." },
  { name: "Horizon Europe Partnership - Key Digital Technologies", funder: "European Commission", eligibility: "Electronics and digital technologies." },
  { name: "Horizon Europe Partnership - Smart Networks and Services", funder: "European Commission", eligibility: "5G and beyond, edge cloud." },
  { name: "Euratom Research and Training Programme", funder: "European Commission", eligibility: "Nuclear research, safety and fusion." },
  { name: "EU Aid Volunteer", funder: "European Commission", eligibility: "Humanitarian aid volunteering." },
  { name: "European Youth Foundation", funder: "Council of Europe", eligibility: "Youth organisations and projects in Europe." },
];

function toGrantInput(item: { name: string; funder: string; eligibility?: string }, index: number): GrantInput {
  const searchUrl = `${EU_PORTAL_SEARCH}?keywords=${encodeURIComponent(item.name.slice(0, 40))}`;
  return {
    externalId: `eu-${item.name.replace(/\s+/g, "-").toLowerCase().slice(0, 45)}-${index}`,
    name: item.name,
    funder: item.funder,
    amount: null,
    deadline: null,
    applicationUrl: searchUrl,
    eligibility: item.eligibility ?? "Check the Funding & Tenders Portal for eligibility and deadlines.",
    sectors: [],
    regions: ["European Union", "EU Member States", "Associated countries"],
    funderLocations: ["EU"],
  };
}

/**
 * Return curated EU grants.
 */
export function getCuratedEUGrants(): GrantInput[] {
  return EU_GRANTS_CURATED.map((item, i) => toGrantInput(item, i));
}

const MAX_EU_GRANTS_DAILY = 500;

/**
 * Fetch EU grants: up to 500 from EU_GRANTS_FEED_URL when set (new opportunities daily), else curated list.
 */
export async function fetchGrantsFromEU(): Promise<GrantInput[]> {
  const feedUrl = process.env.EU_GRANTS_FEED_URL?.trim();
  if (feedUrl) {
    try {
      const res = await fetch(feedUrl, { next: { revalidate: 0 } });
      if (res.ok) {
        const raw = await res.json();
        const list = Array.isArray(raw) ? raw : (raw as { grants?: unknown[] }).grants ?? [];
        const { parseGrantRow } = await import("@/lib/grants-ingest");
        const out: GrantInput[] = [];
        for (const row of list.slice(0, MAX_EU_GRANTS_DAILY)) {
          const g = parseGrantRow(row);
          if (g) {
            if (!g.funderLocations?.length) g.funderLocations = ["EU"];
            out.push(g);
          }
        }
        if (out.length > 0) return out.slice(0, MAX_EU_GRANTS_DAILY);
      }
    } catch {
      // fallback to curated
    }
  }
  return getCuratedEUGrants();
}
