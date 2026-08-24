import { fileURLToPath } from "node:url";

const defaultBaseUrl = "https://notary-protocol.notary-labs.workers.dev";
const defaultRepository = "Kosta1985/notary-protocol";

function rate(numerator, denominator) {
  return denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : null;
}

export function summarizeAdoption(stats = {}, repository = {}) {
  const totals = stats.totals ?? {};
  const pageViews = totals.page_view ?? 0;
  const attempts = totals.verification_started ?? 0;
  const valid = totals.verification_valid ?? 0;
  const invalid = totals.verification_invalid ?? 0;
  return {
    windowDays: stats.windowDays ?? 30,
    site: {
      pageViews,
      demosLoaded: totals.demo_loaded ?? 0,
      verificationAttempts: attempts,
      validReceipts: valid,
      invalidReceipts: invalid,
      agentVerificationAttempts: totals.a2a_started ?? 0,
      validAgentVerifications: totals.a2a_valid ?? 0,
      invalidAgentVerifications: totals.a2a_invalid ?? 0,
      receiptsRetrieved: totals.receipt_retrieved ?? 0,
      visitorToVerificationPercent: rate(attempts, pageViews),
      successfulVerificationPercent: rate(valid, attempts),
      agentSharePercent: rate(totals.a2a_started ?? 0, attempts)
    },
    github: {
      stars: repository.stargazers_count ?? 0,
      forks: repository.forks_count ?? 0,
      watchers: repository.subscribers_count ?? 0,
      openIssuesAndPullRequests: repository.open_issues_count ?? 0
    }
  };
}

export async function createAdoptionReport({ baseUrl = defaultBaseUrl, repository = defaultRepository, fetcher = fetch } = {}) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "notary-protocol-adoption-report" };
  const [statsResponse, repositoryResponse] = await Promise.all([
    fetcher(new URL("/v1/stats", baseUrl)),
    fetcher(`https://api.github.com/repos/${repository}`, { headers })
  ]);
  if (!statsResponse.ok) throw new Error(`Stats endpoint returned HTTP ${statsResponse.status}`);
  if (!repositoryResponse.ok) throw new Error(`GitHub API returned HTTP ${repositoryResponse.status}`);
  return {
    generatedAt: new Date().toISOString(),
    baseUrl: new URL(baseUrl).origin,
    repository,
    privacy: "Aggregate site events and public GitHub repository counts only.",
    ...summarizeAdoption(await statsResponse.json(), await repositoryResponse.json())
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createAdoptionReport({ baseUrl: process.env.NOTARY_BASE_URL ?? defaultBaseUrl, repository: process.env.GITHUB_REPOSITORY ?? defaultRepository })
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => { console.error(`Adoption report failed: ${error.message}`); process.exitCode = 1; });
}
