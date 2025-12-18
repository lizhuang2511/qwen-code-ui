import type { API } from "./api"

function getPyApi(): any {
  const w = window as any
  return w.pywebview && w.pywebview.api ? w.pywebview.api : null
}

export const pywebviewApi = new Proxy(
  {} as API,
  {
    get(_target, prop: string) {
      return async (args: any) => {
        const api = getPyApi()
        if (!api || typeof api[prop] !== "function") {
          throw new Error(`pywebview api method not available: ${prop}`)
        }
        const fn = api[prop] as (params?: any) => Promise<any>
        return args === undefined || args === null ? await fn() : await fn(args)
      }
    },
  }
)
