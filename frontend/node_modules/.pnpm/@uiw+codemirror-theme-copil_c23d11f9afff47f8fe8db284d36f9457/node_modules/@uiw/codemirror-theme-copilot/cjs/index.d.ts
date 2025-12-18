import { type CreateThemeOptions } from '@uiw/codemirror-themes';
export declare const defaultSettingsCopilot: CreateThemeOptions['settings'];
export declare const copilotDarkStyle: CreateThemeOptions['styles'];
export declare const copilotInit: (options?: Partial<CreateThemeOptions>) => import("@codemirror/state").Extension;
export declare const copilot: import("@codemirror/state").Extension;
