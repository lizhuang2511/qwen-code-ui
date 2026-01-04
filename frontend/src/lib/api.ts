import {
  DetailedConversation,
  DirEntry,
  EnrichedProject,
  ProjectsResponse,
  RecentChat,
  SearchFilters,
  SearchResult,
  webApi,
} from "./webApi";
import { ProcessStatus } from "@/types";
import { toast } from "sonner";
import { AxiosError } from "axios";

declare global {
  interface Window {
    pendingToolCallInput?: string;
  }
}

// Helper to wait for pywebview to be ready
const waitForPywebview = (timeout = 500): Promise<void> => {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as any;
  if (w.pywebview && w.pywebview.api) return Promise.resolve();

  return new Promise((resolve) => {
    let resolved = false;
    const onReady = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    window.addEventListener("pywebviewready", onReady, { once: true });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener("pywebviewready", onReady);
        resolve();
      }
    }, timeout);
  });
};

export interface API {
  check_cli_installed(): Promise<boolean>;
  start_session(params: {
    sessionId: string;
    workingDirectory?: string;
    model?: string;
    backend?: string;
    backendConfig?: {
      api_key: string;
      base_url: string;
      model: string;
      yolo?: boolean;
    };
    geminiAuth?: {
      method: string;
      api_key?: string;
      vertex_project?: string;
      vertex_location?: string;
      yolo?: boolean;
    };
    llxprtConfig?: {
      provider: string;
      api_key: string;
      model: string;
      base_url?: string;
    };
  }): Promise<void>;
  send_message(params: {
    sessionId: string;
    message: string;
    conversationHistory: string;
    model?: string;
    backendConfig?: {
      api_key: string;
      base_url: string;
      model: string;
      yolo?: boolean;
    };
  }): Promise<void>;
  get_process_statuses(): Promise<ProcessStatus[]>;
  kill_process(params: { conversationId: string }): Promise<void>;
  send_tool_call_confirmation_response(params: {
    sessionId: string;
    requestId: number;
    toolCallId: string;
    outcome: string;
  }): Promise<void>;
  execute_confirmed_command(params: { command: string }): Promise<string>;
  generate_conversation_title(params: {
    message: string;
    model?: string;
  }): Promise<string>;
  validate_directory(params: { path: string }): Promise<boolean>;
  is_home_directory(params: { path: string }): Promise<boolean>;
  get_home_directory(): Promise<string>;
  get_parent_directory(params: { path: string }): Promise<string | null>;
  list_directory_contents(params: { path: string }): Promise<DirEntry[]>;
  list_files_recursive(params: { path: string }): Promise<DirEntry[]>;
  list_volumes(): Promise<DirEntry[]>;
  get_recent_chats(): Promise<RecentChat[]>;
  get_detailed_conversation(params: {
    chatId: string;
  }): Promise<DetailedConversation>;
  delete_conversation(params: { chatId: string }): Promise<void>;
  get_canonical_path(params: { path: string }): Promise<string>;
  select_directory(): Promise<string | null>;
  set_title(params: { title: string }): Promise<void>;
  minimize_window(): Promise<void>;
  restore_window(): Promise<void>;
  toggle_fullscreen(): Promise<void>;
  quit_app(): Promise<void>;
  search_chats(params: {
    query: string;
    filters?: SearchFilters;
  }): Promise<SearchResult[]>;
  list_projects(params?: {
    limit?: number;
    offset?: number;
  }): Promise<ProjectsResponse>;
  get_project_discussions(params: { projectId: string }): Promise<
    {
      id: string;
      title: string;
      started_at_iso?: string;
      message_count?: number;
    }[]
  >;
  list_enriched_projects(): Promise<EnrichedProject[]>;
  get_project(params: {
    sha256: string;
    externalRootPath: string;
  }): Promise<EnrichedProject>;
  delete_project(params: { projectId: string }): Promise<void>;
  get_version_info(params: { path: string }): Promise<{
    is_initialized: boolean;
  } | null>;
  version_init(params: { path: string }): Promise<boolean>;
  version_create(params: { path: string; message: string; name?: string }): Promise<boolean>;
  version_list(params: { path: string; limit?: number }): Promise<{
    id: string;
    name?: string;
    message: string;
    date: string;
    size?: number;
    formatted_time?: string;
  }[]>;
  version_restore(params: {
    path: string;
    versionId: string;
  }): Promise<boolean>;
  version_delete(params: {
    path: string;
    versionId: string;
  }): Promise<boolean>;
  get_excluded_paths(params: { path: string }): Promise<string[]>;
  save_excluded_paths(params: {
    path: string;
    excluded: string[];
  }): Promise<boolean>;
  read_file_content(params: { path: string }): Promise<{
    path: string;
    content: string | null;
    size: number;
    modified: number | null;
    encoding: string;
    is_text: boolean;
    is_binary: boolean;
    error: string | null;
  }>;
  read_binary_file_as_base64(params: { path: string }): Promise<string>;
  read_file_content_with_options(params: {
    path: string;
    forceText: boolean;
  }): Promise<{
    path: string;
    content: string | null;
    size: number;
    modified: number | null;
    encoding: string;
    is_text: boolean;
    is_binary: boolean;
    error: string | null;
  }>;
  write_file_content(params: { path: string; content: string }): Promise<{
    path: string;
    content: string | null;
    size: number;
    modified: number | null;
    encoding: string;
    is_text: boolean;
    is_binary: boolean;
    error: string | null;
  }>;
  open_with_default_app(params: { path: string }): Promise<void>;
  copy_files(params: { paths: string[]; target: string }): Promise<string[]>;
  create_directory(params: { path: string }): Promise<boolean>;
  delete_path(params: { path: string }): Promise<boolean>;
  move_path(params: { oldPath: string; newPath: string }): Promise<boolean>;
  set_clipboard_content(params: {
    type: "files" | "text";
    content: string[] | string;
  }): Promise<boolean>;
  get_clipboard_content(): Promise<{
    type: "files" | "text" | "empty";
    content: string[] | string | null;
  }>;
  get_mcp_config(): Promise<any>;
  save_mcp_config(params: any): Promise<boolean>;
}

export type APICommand = keyof API;

type APIMethod<T extends APICommand> = API[T];
type APIParameters<T extends APICommand> = API[T] extends (
  ...args: infer P
) => ReturnType<APIMethod<T>>
  ? P
  : never;
type APIReturnType<T extends APICommand> = API[T] extends (
  ...args: APIParameters<T>
) => ReturnType<APIMethod<T>>
  ? ReturnType<APIMethod<T>>
  : never;

export const api = new Proxy(
  {} as {
    [K in APICommand]: (...args: APIParameters<K>) => APIReturnType<K>;
  },
  {
    get<T extends APICommand>(_target: unknown, prop: T) {
      return async (args: APIParameters<T>) => {
        try {
          if (!__WEB__) {
            await waitForPywebview();
          }
          const w: any = typeof window !== "undefined" ? window : {};
          if (w.pywebview && w.pywebview.api) {
            const { pywebviewApi } = await import("./pywebviewApi")
            const fn = pywebviewApi[prop] as (
              args: APIParameters<T>
            ) => APIReturnType<T>
            return await fn(args)
          }
          {
            const fn = webApi[prop] as (
              args: APIParameters<T>
            ) => APIReturnType<T>
            return await fn(args)
          }
        } catch (error) {
          console.error(
            `Error while calling ${prop} with arguments ${args}:`,
            error
          );

          let errorString: string | null = null;

          // With the web version, we're using a server.  So the errors are going to be returned
          // as AxiosError objects.
          if (__WEB__) {
            if (error instanceof AxiosError) {
              // If it has a `response` property, great; we can display a more detailed error.
              if (error.response && error.response.data.error) {
                if (typeof error.response.data.error === "string") {
                  // If it's a `{ error: "<error message>" }`, then it's returned from our server.
                  errorString = error.response.data.error;
                }
                // Otherwise, if it's `{ error: { description: "<error message>" } }`, then it's
                // either a browser or Axios error.
                else if (error.response.data.error.description) {
                  errorString = error.response.data.error.description;
                }
                // Else, we have an error, and we don't know its structure, but we know it's more
                // informative than just the whole error object.
                else {
                  errorString = `${error.response.data.error}`;
                }
              }
              // If it's an AxiosError but has no `response` property, it's a browser error.
              else {
                errorString = error.message;
              }
            }
          }

          // Otherwise, we're running Tauri commands, so whatever we return from the commands
          // will be the error.
          if (!errorString) {
            errorString = `${error}`;
          }

          if (String(prop) === "get_process_statuses") {
            return [] as unknown as APIReturnType<T>;
          }
          else {
            toast.error(errorString);
            throw error;
          }
        }
      };
    },
  }
);
