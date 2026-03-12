export type GitSettings = {
  authToken: string;
  owner: string;
  repo: string;
  branch: string;
  userFolder: string;
};

const STORAGE_KEY = "jrcloud.githubSettings.v1";
const env = import.meta.env as Record<string, string | undefined>;

const envSettings = (): GitSettings => ({
  authToken: env.VITE_GITHUB_CONTENT_AUTH_TOKEN ?? env.GITHUB_CONTENT_AUTH_TOKEN ?? "",
  owner: env.VITE_GITHUB_CONTENT_OWNER ?? env.GITHUB_CONTENT_OWNER ?? "",
  repo: env.VITE_GITHUB_CONTENT_REPO ?? env.GITHUB_CONTENT_REPO ?? "",
  branch: env.VITE_GITHUB_CONTENT_BRANCH ?? env.GITHUB_CONTENT_BRANCH ?? "main",
  userFolder: env.VITE_USER_FOLDER ?? env.USER_FOLDER ?? "",
});

const sanitize = (input: Partial<GitSettings>): GitSettings => ({
  authToken: typeof input.authToken === "string" ? input.authToken : "",
  owner: typeof input.owner === "string" ? input.owner : "",
  repo: typeof input.repo === "string" ? input.repo : "",
  branch:
    typeof input.branch === "string" && input.branch.trim()
      ? input.branch.trim()
      : "main",
  userFolder: typeof input.userFolder === "string" ? input.userFolder : "",
});

let cache: GitSettings | null = null;

export const getSettings = (): GitSettings => {
  if (cache) return cache;
  const base = envSettings();
  if (typeof window === "undefined") {
    cache = base;
    return cache;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = sanitize(JSON.parse(raw) as Partial<GitSettings>);
      cache = { ...base, ...parsed };
      return cache;
    }
  } catch {
    // Ignore malformed storage.
  }

  cache = base;
  return cache;
};

export const saveSettings = (next: GitSettings) => {
  const normalized = sanitize(next);
  cache = normalized;

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore storage failures.
    }
  }

  return normalized;
};

export const clearSettings = () => {
  cache = envSettings();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }
  return cache;
};
