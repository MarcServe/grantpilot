import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const grants = [
  {
    name: "Innovate UK Smart Grants",
    funder: "Innovate UK",
    amount: 500000,
    deadline: new Date("2026-06-30"),
    applicationUrl: "https://apply-for-innovation-funding.service.gov.uk/competition/search",
    eligibility: "UK registered businesses working on innovative projects with strong commercial potential. Must demonstrate a clear innovation, market opportunity, and ability to deliver the project.",
    sectors: ["Technology", "Manufacturing", "Healthcare", "Energy"],
    regions: ["England", "Wales", "Scotland", "Northern Ireland"],
  },
  {
    name: "Creative Scale Up Programme",
    funder: "Creative England",
    amount: 150000,
    deadline: new Date("2026-05-15"),
    applicationUrl: "https://www.creative-england.co.uk/programmes",
    eligibility: "Creative businesses with at least 2 years of trading history and minimum annual revenue of £250,000. Must be based in England and demonstrate scalability.",
    sectors: ["Creative Industries", "Digital Media", "Gaming", "Film"],
    regions: ["England"],
  },
  {
    name: "Green Business Grant",
    funder: "Department for Energy Security and Net Zero",
    amount: 50000,
    deadline: new Date("2026-09-30"),
    applicationUrl: "https://www.gov.uk/government/collections/green-business-grants",
    eligibility: "SMEs in England looking to reduce their environmental impact through energy efficiency measures, renewable energy installations, or sustainable business practices.",
    sectors: ["Energy", "Manufacturing", "Retail", "Agriculture"],
    regions: ["England"],
  },
  {
    name: "Scottish Enterprise R&D Grant",
    funder: "Scottish Enterprise",
    amount: 100000,
    deadline: new Date("2026-12-31"),
    applicationUrl: "https://www.scottish-enterprise.com/support-for-businesses/funding-and-grants",
    eligibility: "Scottish businesses engaged in research and development activities. Must be registered in Scotland with a clear R&D project plan and commercial application.",
    sectors: ["Technology", "Life Sciences", "Energy", "Manufacturing"],
    regions: ["Scotland"],
  },
  {
    name: "Wales Business Fund",
    funder: "Development Bank of Wales",
    amount: 250000,
    deadline: new Date("2026-08-31"),
    applicationUrl: "https://developmentbank.wales/business-finance",
    eligibility: "Welsh SMEs seeking growth finance. Must be based in Wales, trading for at least 12 months, and have a viable business plan showing growth potential.",
    sectors: ["Technology", "Manufacturing", "Tourism", "Food & Drink"],
    regions: ["Wales"],
  },
  {
    name: "Northern Powerhouse Investment Fund",
    funder: "British Business Bank",
    amount: 200000,
    deadline: new Date("2026-07-31"),
    applicationUrl: "https://www.npif.co.uk/",
    eligibility: "SMEs in the North of England seeking microfinance, business loans, or equity finance. Must be located in the North of England with clear growth objectives.",
    sectors: ["Technology", "Manufacturing", "Healthcare", "Creative Industries"],
    regions: ["England"],
  },
  {
    name: "Horizon Europe EIC Accelerator",
    funder: "European Innovation Council",
    amount: 2500000,
    deadline: new Date("2026-10-15"),
    applicationUrl: "https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en",
    eligibility: "Highly innovative SMEs and startups with breakthrough technology. UK association to Horizon Europe allows participation. Must demonstrate market-creating innovation.",
    sectors: ["Deep Tech", "Healthcare", "Energy", "Space"],
    regions: ["England", "Wales", "Scotland", "Northern Ireland"],
  },
  {
    name: "Growth Hub Business Support Grant",
    funder: "Local Enterprise Partnerships",
    amount: 25000,
    deadline: new Date("2026-04-30"),
    applicationUrl: "https://www.lepnetwork.net/local-growth-hub-contacts/",
    eligibility: "SMEs looking for business support and growth grants. Availability varies by region. Must be registered in the relevant LEP area and demonstrate growth potential.",
    sectors: ["All Sectors"],
    regions: ["England"],
  },
  {
    name: "Cyber Security Academic Startup Accelerator",
    funder: "Department for Science, Innovation and Technology",
    amount: 75000,
    deadline: new Date("2026-11-30"),
    applicationUrl: "https://www.gov.uk/government/publications/cyber-security-sectoral-analysis",
    eligibility: "UK startups and academic spinouts working on cybersecurity solutions. Must be developing novel cybersecurity technology with clear commercial applications.",
    sectors: ["Cybersecurity", "Technology", "Defence"],
    regions: ["England", "Wales", "Scotland", "Northern Ireland"],
  },
  {
    name: "Social Enterprise Growth Fund",
    funder: "Big Society Capital",
    amount: 150000,
    deadline: new Date("2026-06-15"),
    applicationUrl: "https://bigsocietycapital.com/",
    eligibility: "Social enterprises and community interest companies with at least 1 year of trading. Must demonstrate social impact alongside financial sustainability.",
    sectors: ["Social Enterprise", "Healthcare", "Education", "Community Development"],
    regions: ["England", "Wales", "Scotland", "Northern Ireland"],
  },
  {
    name: "Agri-Tech Innovation Grant",
    funder: "DEFRA",
    amount: 120000,
    deadline: new Date("2026-08-15"),
    applicationUrl: "https://www.gov.uk/guidance/funding-for-farmers",
    eligibility: "UK agricultural businesses and agri-tech startups developing innovative solutions for farming. Must demonstrate productivity, sustainability, or animal welfare improvements.",
    sectors: ["Agriculture", "AgriTech", "Food & Drink", "Environment"],
    regions: ["England"],
  },
  {
    name: "Digital Innovation Fund",
    funder: "Tech Nation",
    amount: 50000,
    deadline: new Date("2026-07-15"),
    applicationUrl: "https://technation.io/programmes/",
    eligibility: "UK digital technology companies with innovative products or services. Must be a UK-registered company less than 10 years old with a digital technology product.",
    sectors: ["Technology", "SaaS", "FinTech", "HealthTech"],
    regions: ["England", "Wales", "Scotland", "Northern Ireland"],
  },
];

async function main() {
  console.log("Seeding grants...");

  for (const grant of grants) {
    await prisma.grant.upsert({
      where: {
        id: grant.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-"),
      },
      update: grant,
      create: {
        id: grant.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-"),
        ...grant,
      },
    });
  }

  console.log(`Seeded ${grants.length} grants.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
