/**
 * Helpers for the mock's own tests (src/mock/*.test.ts): real axios calls through the installed
 * adapter, with the status and body of failures returned instead of thrown.
 */
import axios, { type AxiosRequestConfig } from 'axios'

export interface Answer<T = unknown> {
  status: number
  data: T
}

export async function call<T = unknown>(
  method: string,
  url: string,
  data?: unknown,
  config: AxiosRequestConfig = {},
): Promise<Answer<T>> {
  try {
    const response = await axios.request<T>({ method, url, data, ...config })
    return { status: response.status, data: response.data }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) return { status: error.response.status, data: error.response.data as T }
    throw error
  }
}

/** A File of `size` bytes with the given type. */
export function fakeFile(name: string, type: string, size = 2048): File {
  return new File([new Uint8Array(size)], name, { type })
}

export function form(field: string, file: Blob, name?: string): FormData {
  const body = new FormData()
  body.append(field, file, name)
  return body
}
