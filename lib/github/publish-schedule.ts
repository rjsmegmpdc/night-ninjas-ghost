import 'server-only';

/**
 * Publishes a training schedule JSON file to the nightninja-report GitHub repo
 * via the GitHub Contents API (PUT /repos/{owner}/{repo}/contents/{path}).
 *
 * Requires a Personal Access Token with `contents: write` permission on the
 * mttSpierings/nightninja-report repository.
 *
 * The PAT is read from the OS keychain via lib/store/secrets — it is never
 * logged or included in error messages returned to the caller.
 */

const REPO_OWNER = 'mttSpierings';
const REPO_NAME = 'nightninja-report';
const GITHUB_API = 'https://api.github.com';

interface GitHubContentsResponse {
  sha?: string;
  content?: {
    html_url?: string;
  };
}

/**
 * Fetch the current SHA of a file in the repo, if it exists.
 * Returns undefined if the file does not yet exist (204/404 → new file).
 */
async function getCurrentFileSha(
  pat: string,
  path: string
): Promise<string | undefined> {
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (res.status === 404) return undefined;

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub GET ${path} failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as GitHubContentsResponse;
  return data.sha;
}

export async function publishScheduleToGitHub(opts: {
  pat: string;
  athleteId: string;
  content: string; // JSON string to publish
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { pat, athleteId, content } = opts;

  const path = `public/schedules/${athleteId}.json`;
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;

  let currentSha: string | undefined;
  try {
    currentSha = await getCurrentFileSha(pat, path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to check existing file: ${message}` };
  }

  const encodedContent = Buffer.from(content).toString('base64');

  const body: Record<string, string> = {
    message: `Update schedule for athlete ${athleteId}`,
    content: encodedContent,
  };
  if (currentSha !== undefined) {
    body.sha = currentSha;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Network error publishing to GitHub: ${message}` };
  }

  if (res.status === 200 || res.status === 201) {
    const data = (await res.json()) as { content?: { html_url?: string } };
    return { ok: true, url: data.content?.html_url };
  }

  // On failure, read the body for a message but never echo the PAT
  const errBody = await res.text().catch(() => '');
  let errMessage = `GitHub API returned ${res.status}`;
  try {
    const parsed = JSON.parse(errBody) as { message?: string };
    if (parsed.message) errMessage += `: ${parsed.message}`;
  } catch {
    // non-JSON body — include raw text if short
    if (errBody.length > 0 && errBody.length < 300) errMessage += `: ${errBody}`;
  }
  return { ok: false, error: errMessage };
}
