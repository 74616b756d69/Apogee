// バックエンド API への薄いクライアント。

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.isConflict = status === 409
  }
}

export async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    let message = `${res.status}`
    try {
      const body = await res.json()
      if (body?.message) message = body.message
    } catch {
      // レスポンスが JSON でない場合はステータスだけで判断する
    }
    throw new ApiError(message, res.status)
  }
  if (res.status === 204) return null
  const text = await res.text()
  return text ? JSON.parse(text) : null
}
