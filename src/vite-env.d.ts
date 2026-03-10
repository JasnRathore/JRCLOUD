/// <reference types="vite/client" />

type OptionalString = string | undefined;

interface ImportMetaEnv {
  readonly VITE_GITHUB_CONTENT_AUTH_TOKEN?: OptionalString;
  readonly VITE_GITHUB_CONTENT_OWNER?: OptionalString;
  readonly VITE_GITHUB_CONTENT_REPO?: OptionalString;
  readonly VITE_GITHUB_CONTENT_BRANCH?: OptionalString;
  readonly VITE_USER_FOLDER?: OptionalString;
  readonly GITHUB_CONTENT_AUTH_TOKEN?: OptionalString;
  readonly GITHUB_CONTENT_OWNER?: OptionalString;
  readonly GITHUB_CONTENT_REPO?: OptionalString;
  readonly GITHUB_CONTENT_BRANCH?: OptionalString;
  readonly USER_FOLDER?: OptionalString;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
