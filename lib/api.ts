export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "/api"

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

type ApiFetchOptions = RequestInit & {
  token?: string | null
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { token, headers, ...rest } = options
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  })

  if (!response.ok) {
    let message = "Erro ao comunicar com o servidor."
    try {
      const data = await response.json()
      message = data?.message ?? message
    } catch {
      message = message
    }
    throw new ApiError(message, response.status)
  }

  return response.json() as Promise<T>
}
