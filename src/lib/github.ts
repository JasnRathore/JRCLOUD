import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";

const env = import.meta.env as Record<string, string | undefined>;

const GITHUB_CONTENT_AUTH_TOKEN =
  env.VITE_GITHUB_CONTENT_AUTH_TOKEN ?? env.GITHUB_CONTENT_AUTH_TOKEN ?? "";
const GITHUB_CONTENT_OWNER =
  env.VITE_GITHUB_CONTENT_OWNER ?? env.GITHUB_CONTENT_OWNER ?? "";
const GITHUB_CONTENT_REPO =
  env.VITE_GITHUB_CONTENT_REPO ?? env.GITHUB_CONTENT_REPO ?? "";
const GITHUB_CONTENT_BRANCH =
  env.VITE_GITHUB_CONTENT_BRANCH ?? env.GITHUB_CONTENT_BRANCH ?? "main";
const USER_FOLDER = env.VITE_USER_FOLDER ?? env.USER_FOLDER ?? "";

const contentOctokit = new Octokit({
  auth: GITHUB_CONTENT_AUTH_TOKEN || undefined,
});

export const GitInfo = {
  content_owner: GITHUB_CONTENT_OWNER,
  content_repo: GITHUB_CONTENT_REPO,
  content_branch: GITHUB_CONTENT_BRANCH,
  content_token: GITHUB_CONTENT_AUTH_TOKEN,
  user_folder: USER_FOLDER,
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const base64EncodeBytes = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const base64DecodeToBytes = (base64: string) => {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const base64EncodeString = (value: string) =>
  base64EncodeBytes(textEncoder.encode(value));

const base64DecodeToString = (value: string) =>
  textDecoder.decode(base64DecodeToBytes(value));

const fileToBase64 = async (file: File) => {
  const buffer = await file.arrayBuffer();
  return base64EncodeBytes(new Uint8Array(buffer));
};

const normalizePath = (path: string) => path.replace(/^\/+|\/+$/g, "");

interface GitData {
  owner: string;
  repo: string;
  path: string;
  message: string;
  content: string | object;
  branch?: string;
}

interface ImageUploadData {
  owner: string;
  repo: string;
  filePath: string;
  message: string;
  file: File;
  branch?: string;
}

export async function updateGitHubFile({
  owner,
  repo,
  path,
  message,
  content,
  branch = "main",
}: GitData) {
  let fileContentToSend: string;

  if (typeof content === "object") {
    try {
      fileContentToSend = JSON.stringify(content, null, 2);
    } catch {
      throw new Error(
        "Failed to stringify content. Ensure it's a valid JSON object."
      );
    }
  } else if (typeof content === "string") {
    fileContentToSend = content;
  } else {
    throw new Error("Invalid content type. Expected string or object.");
  }

  const base64Content = base64EncodeString(fileContentToSend);

  try {
    const response = await contentOctokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: base64Content,
      branch,
    });

    if (response.data.content && response.data.content.path) {
      return { success: true, path: response.data.content.path };
    }
    throw new Error("Failed to get content path from response.");
  } catch (error: unknown) {
    const status = (error as { status?: number }).status;
    if (status !== 422) {
      console.error(`Error creating or updating file '${path}':`, error);
      throw error;
    }

    const { data: fileData } = await contentOctokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    if (!Array.isArray(fileData) && "sha" in fileData && typeof fileData.sha === "string") {
      const retry = await contentOctokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content: base64Content,
        sha: fileData.sha,
        branch,
      });

      if (retry.data.content && retry.data.content.path) {
        return { success: true, path: retry.data.content.path };
      }
    }

    throw new Error(`Could not resolve sha for ${path}`);
  }
}

export async function uploadGitHubImage({
  owner,
  repo,
  filePath,
  message,
  file,
  branch = "main",
}: ImageUploadData) {
  let sha: string | undefined;

  const base64Content = await fileToBase64(file);

  try {
    const { data: fileData } = await contentOctokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch,
    });

    if (Array.isArray(fileData)) {
      throw new Error(
        `Path '${filePath}' is a directory, not a file. Cannot upload image.`
      );
    }

    if ("sha" in fileData && typeof fileData.sha === "string") {
      sha = fileData.sha;
    } else {
      throw new Error(
        `Could not retrieve SHA for file '${filePath}'. Unexpected content type.`
      );
    }
  } catch (error: unknown) {
    if (error instanceof RequestError && error.status === 404) {
      sha = undefined;
    } else {
      console.error(`Error fetching existing file content for '${filePath}':`, error);
      throw error;
    }
  }

  try {
    const response = await contentOctokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message,
      content: base64Content,
      sha,
      branch,
    });

    if (response.data.content && response.data.content.path) {
      return { success: true, path: response.data.content.path };
    }
    throw new Error("Failed to get content path from GitHub API response.");
  } catch (error: unknown) {
    console.error(`Error creating or updating image file '${filePath}' on GitHub:`, error);
    throw error;
  }
}

interface MultiImageUploadData {
  owner: string;
  repo: string;
  filePaths: string[];
  message: string;
  files: File[];
  branch?: string;
}

function isErrorResponseData(obj: unknown): obj is { message?: string } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "message" in obj &&
    typeof (obj as { message?: unknown }).message === "string"
  );
}

export async function uploadGitHubImages({
  owner,
  repo,
  filePaths,
  message,
  files,
  branch = "main",
}: MultiImageUploadData) {
  if (files.length !== filePaths.length) {
    throw new Error(
      "The number of files must match the number of file paths provided."
    );
  }

  try {
    const { data: refData } = await contentOctokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const latestCommitSha = refData.object.sha;

    const { data: commitData } = await contentOctokit.git.getCommit({
      owner,
      repo,
      commit_sha: latestCommitSha,
    });
    const baseTreeSha = commitData.tree.sha;

    const newTreeEntries: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
    const uploadedPaths: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = filePaths[i];

      const base64Content = await fileToBase64(file);

      const { data: blobData } = await contentOctokit.git.createBlob({
        owner,
        repo,
        content: base64Content,
        encoding: "base64",
      });
      const blobSha = blobData.sha;

      newTreeEntries.push({
        path: filePath,
        mode: "100644",
        type: "blob",
        sha: blobSha,
      });
      uploadedPaths.push(filePath);
    }

    const { data: newTreeData } = await contentOctokit.git.createTree({
      owner,
      repo,
      tree: newTreeEntries,
      base_tree: baseTreeSha,
    });
    const newTreeSha = newTreeData.sha;

    const { data: newCommitData } = await contentOctokit.git.createCommit({
      owner,
      repo,
      message,
      tree: newTreeSha,
      parents: [latestCommitSha],
    });
    const newCommitSha = newCommitData.sha;

    await contentOctokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommitSha,
    });

    return { success: true, paths: uploadedPaths };
  } catch (error: unknown) {
    console.error(`Error uploading multiple image files to GitHub:`, error);

    if (error instanceof RequestError && error.response) {
      let errorMessage = "Unknown error";

      if (isErrorResponseData(error.response.data) && error.response.data.message) {
        errorMessage = error.response.data.message;
      }

      throw new Error(`GitHub API Error: ${error.status} - ${errorMessage}`);
    }

    throw error;
  }
}

interface GitReadData {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
}

export async function readGitHubFile({
  owner,
  repo,
  path,
  branch = "main",
}: GitReadData): Promise<object | string> {
  try {
    const { data: fileData } = await contentOctokit.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    if (Array.isArray(fileData)) {
      throw new Error(`Path '${path}' is a directory, not a file. Cannot read content.`);
    }

    if (!("content" in fileData) || typeof fileData.content !== "string") {
      throw new Error(
        `Could not retrieve content for file '${path}'. Unexpected content structure.`
      );
    }

    const decodedContent = base64DecodeToString(fileData.content);

    try {
      return JSON.parse(decodedContent);
    } catch {
      console.warn(`File '${path}' is not valid JSON. Returning raw content.`);
      return decodedContent;
    }
  } catch (error: unknown) {
    if (error instanceof RequestError && error.status === 404) {
      throw new Error(`File not found at '${path}' on branch '${branch}'.`);
    }

    if (error instanceof RequestError && error.response) {
      let errorMessage = "Unknown GitHub API error";
      if (isErrorResponseData(error.response.data) && error.response.data.message) {
        errorMessage = error.response.data.message;
      }
      throw new Error(`GitHub API Error: ${error.status} - ${errorMessage}`);
    }

    console.error(`Error reading file '${path}' from GitHub:`, error);
    throw error;
  }
}

export async function getGitHubFileBlob({
  owner,
  repo,
  path,
  branch = "main",
}: GitReadData): Promise<{ blob: Blob; name: string }> {
  const { data } = await contentOctokit.repos.getContent({
    owner,
    repo,
    path,
    ref: branch,
  });

  if (Array.isArray(data)) {
    throw new Error(`Path '${path}' is a directory, not a file.`);
  }

  if (!("content" in data) || typeof data.content !== "string") {
    throw new Error(`Could not retrieve content for file '${path}'.`);
  }

  const bytes = base64DecodeToBytes(data.content);
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  return { blob, name: data.name ?? path.split("/").pop() ?? "download" };
}

export async function getGitHubRepoSize({
  owner,
  repo,
}: {
  owner: string;
  repo: string;
}): Promise<number> {
  const { data } = await contentOctokit.repos.get({ owner, repo });
  const sizeKb = data.size ?? 0;
  return sizeKb * 1024;
}

export async function uploadGitHubPDF({
  owner,
  repo,
  filePath,
  message,
  file,
  branch = "main",
}: ImageUploadData) {
  return uploadGitHubImage({ owner, repo, filePath, message, file, branch });
}

export type GitHubItem = {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  sha: string;
  download_url?: string | null;
};

interface GitListData {
  owner: string;
  repo: string;
  path?: string;
  branch?: string;
}

export async function listGitHubPath({
  owner,
  repo,
  path = "",
  branch = "main",
}: GitListData): Promise<GitHubItem[]> {
  const cleanedPath = normalizePath(path);
  let data: unknown;
  try {
    const resp = await contentOctokit.repos.getContent({
      owner,
      repo,
      path: cleanedPath || undefined,
      ref: branch,
      request: {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    });
    data = resp.data;
  } catch (error: unknown) {
    if (error instanceof RequestError && error.status === 404) {
      return [];
    }
    throw error;
  }

  if (!Array.isArray(data)) {
    throw new Error(`Path '${cleanedPath}' is not a directory.`);
  }

  return data
    .filter((item) => item.name !== ".keep")
    .map((item) => ({
      name: item.name,
      path: item.path,
      type: item.type === "dir" ? "dir" : "file",
      size: "size" in item ? item.size ?? 0 : 0,
      sha: item.sha,
      download_url: item.download_url ?? null,
    }));
}

interface GitCreateFolderData {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
  message?: string;
}

export async function createGitHubFolder({
  owner,
  repo,
  path,
  branch = "main",
  message,
}: GitCreateFolderData) {
  const cleanedPath = normalizePath(path);
  const keepPath = cleanedPath ? `${cleanedPath}/.keep` : ".keep";
  return updateGitHubFile({
    owner,
    repo,
    path: keepPath,
    message: message ?? `Create folder ${cleanedPath || "/"}`,
    content: "",
    branch,
  });
}

interface GitUploadFileData {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
  message?: string;
  file: File;
}

export async function uploadGitHubFile({
  owner,
  repo,
  path,
  branch = "main",
  message,
  file,
}: GitUploadFileData) {
  const cleanedPath = normalizePath(path);

  const base64Content = await fileToBase64(file);

  try {
    return await contentOctokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: cleanedPath,
      message: message ?? `Upload ${file.name}`,
      content: base64Content,
      branch,
    });
  } catch (error: unknown) {
    if (!(error instanceof RequestError) || error.status !== 422) {
      throw error;
    }

    const { data: fileData } = await contentOctokit.repos.getContent({
      owner,
      repo,
      path: cleanedPath,
      ref: branch,
    });

    if (!Array.isArray(fileData) && "sha" in fileData && typeof fileData.sha === "string") {
      return contentOctokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: cleanedPath,
        message: message ?? `Update ${file.name}`,
        content: base64Content,
        sha: fileData.sha,
        branch,
      });
    }

    throw new Error(`Could not resolve sha for ${cleanedPath}`);
  }
}

interface GitDeleteData {
  owner: string;
  repo: string;
  path: string;
  branch?: string;
  message?: string;
  sha?: string;
  isDir?: boolean;
}

export async function deleteGitHubPath({
  owner,
  repo,
  path,
  branch = "main",
  message,
  sha,
  isDir,
}: GitDeleteData) {
  const cleanedPath = normalizePath(path);

  if (isDir) {
    const { data } = await contentOctokit.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: "true",
    });

    const prefix = cleanedPath ? `${cleanedPath}/` : "";
    const entries = data.tree.filter(
      (entry) => entry.type === "blob" && entry.path?.startsWith(prefix)
    );

    for (const entry of entries) {
      if (!entry.path || !entry.sha) continue;
      await contentOctokit.repos.deleteFile({
        owner,
        repo,
        path: entry.path,
        message: message ?? `Delete ${entry.path}`,
        sha: entry.sha,
        branch,
      });
    }
    return;
  }

  if (!sha) {
    const { data: fileData } = await contentOctokit.repos.getContent({
      owner,
      repo,
      path: cleanedPath,
      ref: branch,
    });
    if (!Array.isArray(fileData) && "sha" in fileData && typeof fileData.sha === "string") {
      sha = fileData.sha;
    }
  }

  if (!sha) {
    throw new Error(`Could not resolve sha for ${cleanedPath}`);
  }

  await contentOctokit.repos.deleteFile({
    owner,
    repo,
    path: cleanedPath,
    message: message ?? `Delete ${cleanedPath}`,
    sha,
    branch,
  });
}

interface GitMoveData {
  owner: string;
  repo: string;
  from: string;
  to: string;
  branch?: string;
  isDir?: boolean;
}

export async function moveGitHubPath({
  owner,
  repo,
  from,
  to,
  branch = "main",
  isDir,
}: GitMoveData) {
  const fromPath = normalizePath(from);
  const toPath = normalizePath(to);

  if (isDir) {
    const { data } = await contentOctokit.git.getTree({
      owner,
      repo,
      tree_sha: branch,
      recursive: "true",
    });

    const prefix = fromPath ? `${fromPath}/` : "";
    const entries = data.tree.filter(
      (entry) => entry.type === "blob" && entry.path?.startsWith(prefix)
    );

    for (const entry of entries) {
      if (!entry.path) continue;
      const relative = entry.path.slice(prefix.length);
      const targetPath = toPath ? `${toPath}/${relative}` : relative;
      const { data: fileData } = await contentOctokit.repos.getContent({
        owner,
        repo,
        path: entry.path,
        ref: branch,
      });
      if (Array.isArray(fileData) || !("content" in fileData)) continue;

      await contentOctokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: targetPath,
        message: `Move ${entry.path} to ${targetPath}`,
        content: fileData.content,
        branch,
      });

      if (entry.sha) {
        await contentOctokit.repos.deleteFile({
          owner,
          repo,
          path: entry.path,
          message: `Remove ${entry.path}`,
          sha: entry.sha,
          branch,
        });
      }
    }

    return;
  }

  const { data: fileData } = await contentOctokit.repos.getContent({
    owner,
    repo,
    path: fromPath,
    ref: branch,
  });

  if (Array.isArray(fileData) || !("content" in fileData)) {
    throw new Error(`'${fromPath}' is not a file.`);
  }

  try {
    await contentOctokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: toPath,
      message: `Move ${fromPath} to ${toPath}`,
      content: fileData.content,
      branch,
    });
  } catch (error: unknown) {
    const status = (error as { status?: number }).status;
    if (status !== 422) throw error;

    const { data: targetData } = await contentOctokit.repos.getContent({
      owner,
      repo,
      path: toPath,
      ref: branch,
    });

    if (!Array.isArray(targetData) && "sha" in targetData && typeof targetData.sha === "string") {
      await contentOctokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: toPath,
        message: `Move ${fromPath} to ${toPath}`,
        content: fileData.content,
        sha: targetData.sha,
        branch,
      });
    } else {
      throw new Error(`Could not resolve sha for ${toPath}`);
    }
  }

  if ("sha" in fileData && typeof fileData.sha === "string") {
    await contentOctokit.repos.deleteFile({
      owner,
      repo,
      path: fromPath,
      message: `Remove ${fromPath}`,
      sha: fileData.sha,
      branch,
    });
  }
}
