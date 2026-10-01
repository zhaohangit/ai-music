import fs from "node:fs/promises";
import type { PlatformConfig } from "../config.js";
import { ResourceStateConflictError } from "../repository.js";
export class MvProvider {
  readonly baseUrl: string;
  readonly enabled: boolean;
  private key: string | null = null;
  constructor(
    private readonly config: PlatformConfig,
    private readonly env: NodeJS.ProcessEnv,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = (
      env.MV_API_BASE_URL ||
      env.SUNO_API_BASE_URL ||
      "https://open.mxapi.org"
    ).replace(/\/+$/, "");
    this.enabled =
      config.nodeEnv !== "production" &&
      config.authMode === "development" &&
      env.MV_LOCAL_LIVE_ENABLED === "true";
  }
  async configured(): Promise<boolean> {
    return this.enabled && Boolean(await this.credential());
  }
  private async credential(): Promise<string> {
    if (this.key !== null) return this.key;
    this.key = this.env.MV_API_KEY_FILE
      ? (await fs.readFile(this.env.MV_API_KEY_FILE, "utf8")).trim()
      : (this.env.MV_API_KEY || this.env.SUNO_API_KEY || "").trim();
    return this.key;
  }
  async request(
    path: string,
    body?: Record<string, unknown> | FormData,
    idempotencyKey?: string,
  ): Promise<Record<string, any>> {
    if (!(await this.configured()))
      throw new ResourceStateConflictError(
        "MV 生成尚未配置。请在服务端启用本地视频服务。",
      );
    const key = await this.credential();
    const form = body instanceof FormData;
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body && !form ? { "Content-Type": "application/json" } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: body ? (form ? body : JSON.stringify(body)) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    if (text.length > 4 * 1024 * 1024) throw new Error("视频服务响应过大");
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`视频服务返回无效结果 (${res.status})`);
    }
    if (!res.ok || (payload.code !== undefined && payload.code !== 200)) {
      const error = new Error(
        `视频服务请求失败 (${res.status}/${payload.code ?? "-"})：${String(
          payload.message ?? "请求未成功",
        )
          .replaceAll(key, "[redacted]")
          .slice(0, 250)}`,
      ) as Error & { status?: number };
      error.status = res.status >= 400 ? res.status : Number(payload.code);
      throw error;
    }
    return payload.data ?? payload;
  }
  private probeCache: {
    until: number;
    authenticated: boolean;
    remainingPoints: number | null;
    checkedAt: string;
    error: string | null;
  } | null = null;
  async probe(force = false) {
    if (!force && this.probeCache && this.probeCache.until > Date.now())
      return this.probeCache;
    const state = {
      until: Date.now() + 30_000,
      authenticated: false,
      remainingPoints: null as number | null,
      checkedAt: new Date().toISOString(),
      error: null as string | null,
    };
    try {
      const data = await this.request("/api/v2/points/balance");
      state.authenticated = true;
      state.remainingPoints =
        typeof data.remaining_points === "number"
          ? data.remaining_points
          : null;
    } catch (e) {
      state.error = e instanceof Error ? e.message : "视频账户暂不可用";
    }
    this.probeCache = state;
    return state;
  }
  async uploadImage(bytes: Buffer, mime: string): Promise<string> {
    const form = new FormData();
    form.append(
      "image",
      new Blob([new Uint8Array(bytes)], { type: mime }),
      mime === "image/png" ? "reference.png" : "reference.jpg",
    );
    const result = await this.request("/api/v2/upload/temp-image", form);
    if (typeof result.url !== "string") throw new Error("参考图上传未返回地址");
    return new URL(result.url, this.baseUrl).href;
  }
}
